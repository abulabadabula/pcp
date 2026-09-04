/* ============================================================================
NUMERICAL HELPERS
=========================================================================== */
const finite = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const positive = (value, fallback = 0) => Math.max(0, finite(value, fallback));
const clamp = (value, min, max) => Math.min(Math.max(finite(value), min), max);
const sq = (value) => value * value;
const areaBar = (diameter) => Math.PI * sq(positive(diameter)) / 4;
const kNToN = (value) => finite(value) * 1000;
const kNmToNmm = (value) => finite(value) * 1e6;
const max0 = (value) => Math.max(0, finite(value));

/* ============================================================================
STATUS
=========================================================================== */
export const statusFromUR = (ur, warning = 0.90) => {
    if (!Number.isFinite(ur)) {
        return { status: 'NOT CHECKED', pass: false, warning: true };
    }
    if (ur <= warning) {
        return { status: 'PASS', pass: true, warning: false };
    }
    if (ur <= 1.0) {
        return { status: 'PASS - HIGH UTILISATION', pass: true, warning: true };
    }
    return { status: 'FAIL', pass: false, warning: true };
};

/* ============================================================================
SUPPORT CONDITIONS
Coefficients are coefficients in M = k w L².
=========================================================================== */
const SUPPORT_MOMENT_FACTORS = {
    'Pinned-Pinned': { mid: 1 / 8, base: 0, frequency: 2 / Math.PI},
    'Fixed-Free': { mid: 1 / 8, base: 1 / 2, frequency: (2 * Math.PI) / Math.pow(1.875, 2) },
    'Fixed-Fixed': { mid: 1 / 24, base: 1 / 12, frequency: (2 * Math.PI) / Math.pow(4.73, 2) },
    'Fixed-Pinned': { mid: 9 / 128, base: 1 / 8, frequency: (2 * Math.PI) / Math.pow(3.926, 2) }
};
const getSupportFactors = (condition) =>
    SUPPORT_MOMENT_FACTORS[condition] || SUPPORT_MOMENT_FACTORS['Pinned-Pinned'];

/* ============================================================================
HROOF VALIDATION
=========================================================================== */
export function validateHroof(input = {}) {
    const wallHeight = positive(input.wallHeight);
    const tf = positive(input.tf);
    const ds = positive(input.ds);
    const ts = positive(input.ts);
    const hroofInput = positive(input.hroof);
    const hroofMax = Math.max(wallHeight - tf / 1000 - ds / 1000 - ts / 1000, 0);
    return {
        hroofEffective: Math.min(hroofInput, hroofMax),
        hroofMax,
        hroofValid: hroofInput <= hroofMax + 1e-9
    };
}

/* ============================================================================
IN-PLANE SECTION CHECKS (STRAIN COMPATIBILITY)
=========================================================================== */
export function calculateInPlaneSectionChecks(input = {}, inPlane = {}) {
    const geo = inPlane.geometry || {};
    const gravity = inPlane.gravity || {};
    const sectionactions = inPlane.sectionActions || {};
    const es = inPlane.elasticStress || {};

    const lw = positive(geo.bwall || input.wallWidth);
    const tw = positive(geo.twall || input.wallThickness);
    const L = lw * 1000;
    const t = tw * 1000;

    const Nstar = positive(sectionactions.Ntotal || gravity.Ngravity);
    const Mstar = positive(sectionactions.Mtotal);
    const Vstar = positive(sectionactions.Vtotal);

    const fc = positive(input.fc);
    const fy = positive(input.fy);
    const Es = positive(input.Es, 200000);
    const epsCu = 0.003;
    const alpha1 = 0.85;
    const beta1 = 0.85;
    const phiFlexure = positive(input.phiFlexure, 0.85);

    const Ag = geo.Ag;
    const Zg = geo.Zg;
    const Ig = geo.I;
    const eccentricity = es.eccentricity;
    const kernLimit = lw / 6;
    const cracked = eccentricity > kernLimit;
    const sigmaN = es.sigmaN;
    const sigmaM = es.sigmaM;
    const sigmaMax = es.sigmaMax;
    const sigmaMin = es.sigmaMin;

    const cover = positive(input.cover);
    const VbarDia = positive(input.VbarDia);
    const VbarSpace = positive(input.VbarSpace);
    const boundaryBarCount = Math.round(positive(input.boundaryBarCount));
    const boundaryBarDia = positive(input.boundaryBarDiameter);
    const boundaryWidth = positive(input.boundaryWidth) * 1000;

    const AsDistributedBar = Math.PI * Math.pow(VbarDia, 2) / 4;
    const AsBoundaryBar = Math.PI * Math.pow(boundaryBarDia, 2) / 4;

    const bars = [];
    if (VbarDia > 0 && VbarSpace > 0 && L > 0) {
        const nBars = Math.max(2, Math.floor((L - 2 * cover) / VbarSpace) + 1);
        for (let i = 0; i < nBars; i++) {
            const x = nBars === 1 ? L / 2 : cover + i * ((L - 2 * cover) / (nBars - 1));
            bars.push({ x, As: AsDistributedBar, type: 'distributed' });
        }
    }

    if (boundaryBarCount > 0 && boundaryBarDia > 0) {
        const nLeft = Math.ceil(boundaryBarCount / 2);
        const nRight = Math.floor(boundaryBarCount / 2);
        const availableBoundaryWidth = Math.max(boundaryWidth - 2 * cover, boundaryBarDia);

        for (let i = 0; i < nLeft; i++) {
            const spacing = nLeft > 1 ? availableBoundaryWidth / (nLeft - 1) : 0;
            const x = Math.min(cover + i * spacing, L - cover);
            bars.push({ x, As: AsBoundaryBar, type: 'boundary-left' });
        }

        for (let i = 0; i < nRight; i++) {
            const spacing = nRight > 1 ? availableBoundaryWidth / (nRight - 1) : 0;
            const x = Math.max(cover, L - cover - i * spacing);
            bars.push({ x, As: AsBoundaryBar, type: 'boundary-right' });
        }
    }

    const AsTotal = bars.reduce((sum, bar) => sum + bar.As, 0);

    function evaluateSection(c) {
        const a = Math.min(beta1 * c, L);
        const Cc = alpha1 * fc * t * a;
        const xCc = a / 2;
        let steelAxial = 0;
        let steelMomentAboutEdge = 0;
        const steelResults = [];

        bars.forEach(bar => {
            const strain = epsCu * (1 - bar.x / c);
            let stress = Es * strain;
            stress = Math.max(-fy, Math.min(fy, stress));
            const force = bar.As * stress;
            steelAxial += force;
            steelMomentAboutEdge += force * bar.x;
            steelResults.push({
                ...bar,
                strain,
                stress,
                force,
                forcekN: force / 1000
            });
        });

        const Pn = Cc + steelAxial;
        const momentAboutEdge = Cc * xCc + steelMomentAboutEdge;
        const centroid = L / 2;
        const Mn = Math.abs(momentAboutEdge - Pn * centroid);

        const compressionSteel = steelResults.filter(item => item.force > 0).reduce((sum, item) => sum + item.force, 0);
        const tensionSteel = steelResults.filter(item => item.force < 0).reduce((sum, item) => sum + Math.abs(item.force), 0);

        return {
            c,
            a,
            Cc,
            steelAxial,
            Pn,
            Mn,
            steelResults,
            compressionSteel,
            tensionSteel
        };
    }

    const Ntarget = Nstar * 1000;
    let cLow = Math.max(0.1, L * 0.0001);
    let cHigh = Math.max(L * 20, 1000);
    let sectionResult = null;

    let lowResult = evaluateSection(cLow);
    let highResult = evaluateSection(cHigh);

    let expandCount = 0;
    while ((lowResult.Pn - Ntarget) * (highResult.Pn - Ntarget) > 0 && expandCount < 20) {
        cHigh *= 2;
        highResult = evaluateSection(cHigh);
        expandCount++;
    }

    for (let i = 0; i < 120; i++) {
        const cMid = (cLow + cHigh) / 2;
        const result = evaluateSection(cMid);
        const error = result.Pn - Ntarget;
        sectionResult = result;

        if (Math.abs(error) < Math.max(10, Math.abs(Ntarget) * 1e-6)) {
            break;
        }

        const lowError = lowResult.Pn - Ntarget;
        if (lowError * error <= 0) {
            cHigh = cMid;
            highResult = result;
        } else {
            cLow = cMid;
            lowResult = result;
        }
    }

    if (!sectionResult) { sectionResult = evaluateSection(L / 2); }

    const neutralAxis = sectionResult.c;
    const compressionBlockDepth = sectionResult.a;
    const concreteCompression = sectionResult.Cc;
    const nominalAxial = sectionResult.Pn / 1000;
    const nominalMoment = sectionResult.Mn / 1e6;
    const phiMn = phiFlexure * nominalMoment;
    const momentRatio = phiMn > 0 ? Mstar / phiMn : Infinity;

    const P0 = alpha1 * fc * Ag + AsTotal * fy;
    const phiPn = phiFlexure * P0 / 1000;
    const axialRatio = phiPn > 0 ? Nstar / phiPn : 0;

    const interactionRatio = momentRatio;

    const grossConcreteCapacity = fc * Ag;
    const lowAxialRatio = grossConcreteCapacity > 0 ? Ntarget / grossConcreteCapacity : 0;

    const steelResults = sectionResult.steelResults || [];
    const compressionSteelForce = sectionResult.compressionSteel || 0;
    const tensionSteelForce = sectionResult.tensionSteel || 0;
    const yieldedBars = steelResults.filter(item => Math.abs(item.stress) >= fy * 0.999).length;
    const compressionBars = steelResults.filter(item => item.force > 0).length;
    const tensionBars = steelResults.filter(item => item.force < 0).length;

    return {
        lw,
        tw,
        L,
        t,
        Nstar,
        Mstar,
        Vstar,
        fc,
        fy,
        Es,
        epsCu,
        alpha1,
        beta1,
        phiFlexure,
        Ag,
        Zg,
        Ig,
        eccentricity,
        kernLimit,
        cracked,
        sigmaN,
        sigmaM,
        sigmaMax,
        sigmaMin,
        cover,
        VbarDia,
        VbarSpace,
        boundaryBarCount,
        boundaryBarDia,
        boundaryWidth,
        AsDistributedBar,
        AsBoundaryBar,
        bars,
        AsTotal,
        neutralAxis,
        compressionBlockDepth,
        concreteCompression,
        nominalAxial,
        nominalMoment,
        phiMn,
        momentRatio,
        P0,
        phiPn,
        axialRatio,
        interactionRatio,
        grossConcreteCapacity,
        lowAxialRatio,
        steelResults,
        compressionSteelForce,
        tensionSteelForce,
        yieldedBars,
        compressionBars,
        tensionBars
    };
}

/* ============================================================================
BOUNDARY ELEMENT N-M
The UI parameters are unchanged.
Section:
hc = boundaryWidth
bc = boundaryThickness
Compression positive. Moment is returned as positive magnitude.
=========================================================================== */
export function calculateBoundaryElementNM(input = {}, ctx = {}) {
    const hasBoundary = input.hasBoundaryElement !== false;
    const boundaryWidth = positive(input.boundaryWidth);
    const boundaryThick = positive(input.boundaryThickness, positive(input.wallThickness));
    const nBars = positive(input.boundaryBarCount);
    const barDia = positive(input.boundaryBarDiameter);
    if (!hasBoundary || boundaryWidth <= 0 || boundaryThick <= 0 || nBars <= 0 || barDia <= 0) {
        return {
            available: false,
            section: { bw: boundaryWidth, bt: boundaryThick, AsTotal: 0 },
            keyPoints: {},
            curveNominal: [],
            curveDesign: [],
            gravityShare: { r: 0, Gb: 0, Qb: 0, psiE: 0 },
            demands: [],
            governing: { key: '-', label: 'not applicable', N: 0, M: 0, Mcap: 0, UR: 0 },
            checks: { axialOK: true, pass: true, governingUR: 0 }
        };
    }
    /* ---- Material & section ---- */
    const fc = positive(input.fc);
    const fy = positive(input.fy);
    const Es = positive(input.Es, 200000);
    const phiC = positive(input.phiCompression, 0.75);
    const phiF = positive(input.phiFlexure, 0.80);
    const epsCU = 0.003;
    const beta1 = Math.max(0.85 - 0.008 * Math.max(fc - 30, 0), 0.65);
    const hc = boundaryWidth * 1000; // mm（弯曲方向高度）
    const bc = boundaryThick * 1000; // mm（截面宽度）
    const Agc = bc * hc; // mm²
    const AsTotal = nBars * areaBar(barDia); // mm²
    const AsLayer = AsTotal / 2; // 两层对称近似
    const cover = positive(input.cover);
    const tieDia = positive(input.boundaryTieDiameter);
    const dPrime = cover + tieDia + barDia / 2;
    const d = Math.max(hc - dPrime, 1);
    /* Pure compression nominal capacity（纯压承载力 P0）. */
    const P0 = 0.85 * fc * Math.max(Agc - AsTotal, 0) + fy * AsTotal; // N
    const phiP0 = phiC * P0 / 1000;
    /* Balanced neutral axis. */
    const cb = (epsCU / (epsCU + fy / Math.max(Es, 1))) * d;
    /*
    Section force from strain compatibility.
    Concrete: rectangular stress block.给定中性轴深度 c → (N [kN], M [kN·m])
    Steel: elastic-perfectly-plastic.轴力以压为正；钢筋应力按平截面应变 × Es，限幅 ±fy
    */
    const sectionForce = (cRaw) => {
        const c = Math.max(cRaw, 0.001);
        const a = Math.min(beta1 * c, hc); // 等效应力块高度
        const Cc = 0.85 * fc * bc * a; // N（混凝土压力）
        const steelStress = depth => clamp(Es * epsCU * (depth - c) / c, -fy, fy);
        const Fs1 = steelStress(dPrime) * AsLayer; // N（拉为正）
        const Fs2 = steelStress(d) * AsLayer; // N（拉为正）
        const Nn = Cc - Fs1 - Fs2; // N（压为正）
        const Mn = Cc * (hc / 2 - a / 2) - Fs1 * (hc / 2 - dPrime) - Fs2 * (hc / 2 - d); // N·mm（对形心取矩）
        return { N: Nn / 1000, M: Math.abs(Mn) / 1e6 };
    };
    /* ---- Log-spaced neutral-axis sweep → 名义曲线 ---- */
    const sweep = [];
    const nSteps = 96;
    const cMin = 0.005 * hc;
    const cMax = 10 * hc;
    for (let i = 0; i < nSteps; i += 1) {
        const c = cMin * Math.pow(cMax / cMin, i / (nSteps - 1));
        sweep.push(sectionForce(c));
    }
    const bal = sectionForce(cb);
    const Nb = bal.N;
    /* ---- ϕ(N)：受压控制区 ϕc，自 Nb 线性过渡至 ϕf（N → 0） ---- */
    const phiAt = (N) => {
        if (!(Nb > 0)) return phiF;
        const ratio = clamp((Nb - N) / Nb, 0, 1);
        return phiC + (phiF - phiC) * ratio;
    };
    /* ---- Assemble curves（按 N 降序排列，便于内插） ---- */
    const nominalRaw = [{ N: P0 / 1000, M: 0 }, ...sweep];
    const designRaw = [
        { N: phiP0, M: 0 },
        ...sweep.map((p) => {
            const phi = phiAt(p.N);
            return {
                N: phi * p.N,
                M: phi * p.M
            };
        })
    ];
    const sortByN = (arr) =>
        [...arr].sort((p, q) => q.N - p.N);
    /* 在 N = 0 处内插补入纯弯点（曲线与 M 轴的交点） */
    const appendZeroPoint = (curve) => {
        for (let i = 0; i + 1 < curve.length; i += 1) {
            const p1 = curve[i];
            const p2 = curve[i + 1];
            if (
                p1.N >= 0 &&
                p2.N <= 0 &&
                Math.abs(p1.N - p2.N) > 1e-9
            ) {
                const ratio = p1.N / (p1.N - p2.N);
                curve.push({
                    N: 0,
                    M: p1.M + ratio * (p2.M - p1.M)
                });
                break;
            }
        }
        return curve;
    };
    const curveNominal = appendZeroPoint(sortByN(nominalRaw));
    const curveDesign = appendZeroPoint(sortByN(designRaw));
    /*
    Interpolate design moment capacity at specified design axial force.
    Do not silently return a positive capacity for N outside the curve.
    */
    const momentCapacityAt = (Nd) => {
        if (!Number.isFinite(Nd) || curveDesign.length === 0) { return 0 }
        if (Nd > curveDesign[0].N + 1e-9) { return 0 }
        for (let i = 0; i + 1 < curveDesign.length; i += 1) {
            const p1 = curveDesign[i];
            const p2 = curveDesign[i + 1];
            if (Nd <= p1.N && Nd >= p2.N) {
                const denominator = p1.N - p2.N;
                if (Math.abs(denominator) < 1e-9) {
                    return Math.min(p1.M, p2.M);
                }
                const ratio = (p1.N - Nd) / denominator;
                return p1.M + ratio * (p2.M - p1.M);
            }
        }
        return 0;
    };
    const lintelReaction = positive(ctx.lintelReaction);
    const lintelEcc = Math.abs(finite(ctx.lintelEcc));
    const psiE = positive(ctx.psiE, 0.30);
    const Ag_m2 = positive(input.wallWidth) * positive(input.wallThickness);
    const Ab_m2 = boundaryWidth * boundaryThick;
    const r = Ag_m2 > 0 ? Math.min(Ab_m2 / Ag_m2, 1) : 0;
    const Gb = r * (finite(ctx.Gwall) + finite(ctx.GlineTotal));
    const Qb = r * finite(ctx.QlineTotal);
    const demandCases = [{
        key: 'D0',
        label: '1.35G (permanent)',
        N: 1.35 * (Gb + lintelReaction),
        M: 1.35 * lintelReaction * lintelEcc
    }, {
        key: 'D1',
        label: '1.2G + 1.5Q (gravity)',
        N: 1.2 * Gb + 1.5 * Qb + 1.5 * lintelReaction,
        M: 1.5 * lintelReaction * lintelEcc
    }, {
        key: 'D2',
        label: 'G + ψeQ + R (seismic)',
        N: Gb + psiE * Qb + lintelReaction,
        M: lintelReaction * lintelEcc
    }];
    const demands = demandCases.map(pt => {
        const Mcap = momentCapacityAt(pt.N);
        const UR = Mcap > 1e-9 ? pt.M / Mcap : (pt.M > 1e-9 ? Infinity : 0);
        return { ...pt, Mcap, UR };
    });
    const governing = demands.length > 0 ? demands.reduce((acc, p) => p.UR > acc.UR ? p : acc, demands[0]) :
        { key: '-', label: '-', N: 0, M: 0, Mcap: 0, UR: 0 };
    const axialOK = demands.every((p) => p.N <= phiP0 + 1e-6);
    const pass = axialOK && Number.isFinite(governing.UR) && governing.UR <= 1;
    const M0 = curveNominal.length > 0 ? curveNominal[curveNominal.length - 1].M : 0;
    const phiM0 = curveDesign.length > 0 ? curveDesign[curveDesign.length - 1].M : 0;
    return {
        available: true,
        section: { bw: boundaryWidth, bt: boundaryThick, bc, hc, Agc, AsTotal, AsLayer, nBars, barDia, dPrime, d, beta1 },
        keyPoints: {
            P0: P0 / 1000,
            phiP0,
            cb,
            Nb,
            Mb: bal.M,
            phiNb: phiC * Nb,
            phiMb: phiC * bal.M,
            M0,
            phiM0
        },
        curveNominal,
        curveDesign,
        gravityShare: { r, Gb, Qb, psiE },
        demands,
        governing,
        checks: { axialOK, pass, governingUR: governing.UR }
    };
}

/* ============================================================================
IN-PLANE WALL DESIGN
=========================================================================== */
export function calculateInPlaneDesign(input = {}) {
    const bwall = positive(input.wallWidth);
    const hwall = positive(input.wallHeight);
    const twall = positive(input.wallThickness);
    const densityConcrete = positive(input.concreteDensity, 24);
    const fc = positive(input.fc);
    const fy = positive(input.fy);
    const Sr = positive(input.Sr, 1);
    const gPressure = positive(input.gUniform);
    const qPressure = positive(input.qUniform);
    const gLineLoad = gPressure * Sr;
    const qLineLoad = qPressure * Sr;
    const lintelReaction = positive(input.lintelReaction);
    const lintelEcc = finite(input.lintelEccentricity);
    const diaphragmWindForce = positive(input.diaphragmWindForce);
    const diaphragmSeismicForce = positive(input.diaphragmSeismicForce);
    /*
    Wall in-plane section.
    */
    const bmm = bwall * 1000;
    const tmm = twall * 1000;
    const Ag = bmm * tmm;
    const I = tmm * Math.pow(bmm, 3) / 12;
    const Zg = tmm * Math.pow(bmm, 2) / 6;
    /* ------------------------------------------------------------------------
    Geometry classification. Slenderness
    ----------------------------------------------------------------------- */
    const aspectRatio = bwall > 0 ? hwall / bwall : 0;
    const outOfPlaneSlenderness = twall > 0 ? hwall / twall : 0;
    let wallClassification = 'Intermediate wall';
    if (aspectRatio < 1) { wallClassification = 'Squat wall'; } else if (aspectRatio > 2) { wallClassification = 'Slender wall' }
    /* ------------------------------------------------------------------------
    Reinforcement.
    ----------------------------------------------------------------------- */
    const VbarDia = positive(input.VbarDia);
    const VbarSpace = positive(input.VbarSpace);
    const HbarDia = positive(input.HbarDia);
    const HbarSpace = positive(input.HbarSpace);

    const vBarArea = areaBar(VbarDia);
    const hBarArea = areaBar(HbarDia);

    // 根据 NZS 3101 Clause 11.7.2，墙厚 > 200mm 强制/通常为双层，≤ 200mm 为单层。
    // 优先读取 UI 传入的层数，若无则根据墙厚(twall)自动推断。
    const numLayers = input.BarLayers 
        ? positive(input.BarLayers) 
        : (twall > 200 ? 2 : 1);

    const nVerticalBars = VbarSpace > 0 ? Math.floor(bmm / VbarSpace) + 1 : 0;
    const AsDistributed = nVerticalBars * vBarArea;
    const rhoVertical = Ag > 0 ? AsDistributed / Ag : 0;
    const AsHorizontalPerM = HbarSpace > 0 ? (hBarArea * numLayers) * 1000 / HbarSpace : 0;
    const rhoHorizontal = Ag > 0 ? (AsHorizontalPerM * tmm / 1000) / Ag : 0;

    const AsBoundary = positive(input.boundaryBarCount) * areaBar(positive(input.boundaryBarDiameter));
    const boundaryArea = positive(input.boundaryWidth) * 1000 * positive(input.boundaryThickness, twall) * 1000;
    const rhoBoundary = boundaryArea > 0 ? AsBoundary / boundaryArea : 0;
    const boundarySteelTensionCapacity = AsBoundary * fy / 1000;
    /* Self weight */
    const Gwall = densityConcrete * twall * hwall * bwall;
    const GwallPerM = bwall > 0 ? Gwall / bwall : 0;
    const GlineTotal = gLineLoad * bwall;
    const QlineTotal = qLineLoad * bwall;
    /* Gravity-only ULS */
    const Ngravity = 1.2 * (Gwall + GlineTotal + lintelReaction) + 1.5 * QlineTotal;
    /* ------------------------------------------------------------------------
    In-plane seismic action.
    Existing UI parameters are retained.
    ----------------------------------------------------------------------- */
    const Z = positive(input.hazardFactor);
    const Ru = positive(input.returnPeriodFactor, 1);
    const mu = Math.max(positive(input.ductility, 1), 1);
    const Sp = finite(input.structuralPerformanceFactor, 1.3 - 0.3 * mu);
    const Ch = positive(input.spectralShapeFactor);
    const Nt = positive(input.nearFaultFactor, 1);
    // const Wt = positive(input.seismicWeight);
    const NFP = positive(input.period);
    const kmu = NFP >= 0.7 ? mu : (mu - 1) * NFP / 0.7 + 1
    const CT1 = Ch * Z * Ru * Nt;
    const Cd = CT1 * Sp / kmu;
    console.log("CT1, CdT1:", CT1, Cd)
    /* Diaphragm forces: act at wall top, produce moment = F × h */
    const VdiaphragmWind = diaphragmWindForce;
    const VdiaphragmSeismic = diaphragmSeismicForce;
    const MdiaphragmWind = VdiaphragmWind * hwall;
    const MdiaphragmSeismic = VdiaphragmSeismic * hwall;
    /* Gravity + seismic */
    const psiE = positive(input.psiE, 0.30);
    const Gi = Gwall + GlineTotal;
    const seismicGravity = Gi + psiE * QlineTotal;
    const Vseismic = Cd * seismicGravity;
    const Mseismic = Vseismic * hwall;
    const NseismicCompression = seismicGravity + lintelReaction;
    const NseismicTension = seismicGravity - lintelReaction;
    /* Lintel eccentricity */
    const Mlintel = lintelReaction * (lintelEcc + bwall / 2);
    /* Total actions: seismic + diaphragm + lintel */
    const Mtotal = Mseismic + Math.max(MdiaphragmWind, MdiaphragmSeismic) + Mlintel;
    const Vtotal = Vseismic + Math.max(VdiaphragmWind, VdiaphragmSeismic);
    /* ------------------------------------------------------------------------
    Elastic section stresses.
    ----------------------------------------------------------------------- */
    const sigmaN = Ag > 0 ? kNToN(Ngravity) / Ag : 0;
    const sigmaM = Zg > 0 ? kNmToNmm(Mtotal) / Zg : 0;
    const sigmaMax = sigmaN + sigmaM;
    const sigmaMin = sigmaN - sigmaM;
    const eccentricity = Ngravity > 0 ? Mtotal / Ngravity : 0;
    const kern = bwall / 6;
    const compareEcc = Math.abs(eccentricity) <= kern ? 'within kern' : 'outside kern';
    const leverArm = bwall / 3 * 2;
    const Ncompression = Ngravity / 2 + Mtotal / leverArm;
    const Ntension = Ngravity / 2 - Mtotal / leverArm;
    /* ------------------------------------------------------------------------
    Lintel bearing.
    ----------------------------------------------------------------------- */
    const bearingArea = (positive(input.bearingWidth) / 1000) * (positive(input.bearingLength) / 1000);
    const bearingStress = bearingArea > 0 ? kNToN(lintelReaction) / (bearingArea * 1e6) : 0;
    /*
    Kept as an existing simplified bearing check.
    Project-specific NZS 3101 bearing/contact provisions should be checked
    separately where concentrated lintel reactions are significant.
    */
    const bearingCapacity = 0.6 * Math.sqrt(Math.max(fc, 0));
    const bearingRatio = bearingCapacity > 0 ? bearingStress / bearingCapacity : lintelReaction > 0 ? Infinity : 0;
    /* ------------------------------------------------------------------------
    Boundary element N-M.
    ----------------------------------------------------------------------- */
    const boundaryNM = calculateBoundaryElementNM(input, {
        Gwall,
        GlineTotal,
        QlineTotal,
        Ngravity,
        seismicGravity,
        psiE,
        lintelReaction,
        lintelEcc
    });
    /*
    Keep the legacy interaction fields for UI compatibility, but use the
    actual boundary-element N-M result as the governing interaction result
    when a boundary element exists.
    */
    const phiPn = boundaryNM.available ? boundaryNM.keyPoints.phiP0 : 0;
    const phiMn = boundaryNM.available ? boundaryNM.keyPoints.phiM0 : 0;
    const axialRatio = phiPn > 0 ? NseismicCompression / phiPn : boundaryNM.available ? Infinity : 0;
    const momentRatio = phiMn > 0 ? Mtotal / phiMn : boundaryNM.available ? Infinity : 0;
    const interactionRatio = boundaryNM.available ? boundaryNM.checks.governingUR : 0;

    /* ------------------------------------------------------------------------
    IN-PLANE SHEAR DESIGN (REVISED PER NZS 3101)
    ----------------------------------------------------------------------- */
    const dv = 0.8 * bmm; // 有效抗剪高度 (近似取 0.8 * 墙长 Lw)
    const Acv = bmm * tmm; // 混凝土抗剪截面面积 (墙长 * 墙厚)
    const phiShear = positive(input.phiShear, 0.75); // 抗剪折减系数

    // 1. 混凝土抗剪 Vc (NZS 3101 Cl 13.2.5 / 11.2.7)
    // 考虑轴向力 Ngravity (kN) 的影响
    const Ag_mm2 = bmm * tmm;
    const Nstar_N = Ngravity * 1000; // 转换为 N
    const nu = Nstar_N / Ag_mm2; // 轴向应力 (MPa)，压力为正，拉力为负

    let vc_MPa = 0;
    // NZS 3101 简化公式：Vc = (0.1 + 0.15 * nu) * sqrt(fc) * Acv
    // 注意：如果 nu 为负（拉力），Vc 会降低；如果 nu 很大，Vc 会提高。
    vc_MPa = (0.1 + 0.15 * (nu / 1000)) * Math.sqrt(Math.max(fc, 0)); // nu 需转换为 MPa 参与计算，若 N 为 kN，则 nu = N*1000 / Ag_mm2
    // 修正：nu 已经是 MPa (N / mm^2)
    vc_MPa = (0.1 + 0.15 * nu) * Math.sqrt(Math.max(fc, 0)); 

    vc_MPa = Math.max(vc_MPa, 0); // 混凝土不能承受负剪力
    vc_MPa = Math.min(vc_MPa, 0.33 * Math.sqrt(Math.max(fc, 0))); // 规范上限
    const vc = vc_MPa * Acv / 1000; // 转换为 kN
    const phiVc = phiShear * vc; 

    // 2. 截面抗剪上限 Vn,max (防斜压破坏, NZS 3101 Cl 11.2.3)
    const Vn_max_MPa = 0.33 * Math.sqrt(Math.max(fc, 0)); 
    const Vn_max = Vn_max_MPa * Acv / 1000; // kN
    const Vn_required = Vtotal / phiShear; // 需要的名义抗剪承载力
    const sectionSizeOK = Vn_required <= Vn_max; // 截面尺寸是否满足要求

    // 3. 钢筋抗剪 Vs (必须使用水平钢筋 Hbar!)
    // NZS 3101 Cl 11.2.8: Vs = (Ash * fy * d) / sh
    const As_h = hBarArea; // 单根水平钢筋面积 (mm2)
    const sh = HbarSpace; // 水平钢筋间距 (mm)
    let VsProvided = 0;
    if (sh > 0 && As_h > 0) {
        VsProvided = (As_h * numLayers / sh) * fy * dv / 1000; // kN, 注意考虑钢筋层数 numLayers
        console.log("VsProvided,As_h,sh,fy,dv:", VsProvided, As_h, sh, fy, dv);
    }

    // 4. 总抗剪承载力与利用率
    const Vn = vc + VsProvided;
    const phiVn = phiShear * Vn;
    const shearCapacity = phiVn; 
    const shearRatio = shearCapacity > 0 ? Vtotal / shearCapacity : Vtotal > 0 ? Infinity : 0;

    // 5. 未折减的剪力 (用于基础等其他验算)
    const VsRequiredUnfactored = max0(Vtotal / Math.max(phiShear, 1e-9) - vc);
    /* ------------------------------------------------------------------------
    Base / foundation actions.
    ----------------------------------------------------------------------- */
    const foundationShear = Vtotal;
    const foundationMoment = Mtotal;
    const tensionDemand = max0(-NseismicTension);
    const stressCompressionPass = sigmaMax <= 0.6 * fc;
    const bearingPass = Number.isFinite(bearingRatio) && bearingRatio <= 1;
    const interactionPass = boundaryNM.available ? boundaryNM.checks.pass : true;
    const shearPass = Number.isFinite(shearRatio) && shearRatio <= 1;
    const tensionPass = boundarySteelTensionCapacity >= tensionDemand;
    const slendernessWarning = outOfPlaneSlenderness > 25;

    /* ------------------------------------------------------------------------
    Section Checks (Strain Compatibility)
    ----------------------------------------------------------------------- */
    const sectionChecks = calculateInPlaneSectionChecks(input, {
        geometry: { bwall, hwall, twall, Ag, I, Zg },
        gravity: { Ngravity },
        sectionActions: { Mtotal, Vtotal },
        elasticStress: { sigmaN, sigmaM, sigmaMax, sigmaMin, eccentricity }
    });

    return {
        geometry: { bwall, hwall, twall, Ag, I, Zg },
        reinforcement: {
            nVerticalBars,
            vBarArea,
            hBarArea,
            AsDistributed,
            rhoVertical,
            AsHorizontalPerM,
            AsBoundary,
            boundaryArea,
            rhoBoundary,
            boundarySteelTensionCapacity,
            d: boundaryNM.available ?
                boundaryNM.section.d :
                0
        },
        gravity: {
            Gwall,
            GwallPerM,
            GlineTotal,
            QlineTotal,
            Ngravity,
            gPressure,
            qPressure,
            Sr,
            gLineLoad,
            qLineLoad,
            lintelReaction,
        },
        seismic: {
            CT1,
            Cd,
            seismicGravity,
            Vseismic,
            Mseismic,
            psiE,
            Z,
            Ru,
            Sp,
            mu,
            Ch,
            Nt,
            Gi,
        },
        diaphragm: {VdiaphragmWind,VdiaphragmSeismic,MdiaphragmWind,MdiaphragmSeismic },
        sectionActions: {
            seismicGravity,
            NseismicCompression,
            NseismicTension,
            Mlintel,
            Mtotal,
            Vtotal
        },
        elasticStress: {
            sigmaN,
            sigmaM,
            sigmaMax,
            sigmaMin,
            eccentricity,
            kern,
            compareEcc,
            leverArm,
            Ncompression,
            Ntension
        },
        slenderness: { aspectRatio, outOfPlaneSlenderness, wallClassification },
        bearing: { bearingArea, bearingStress, bearingCapacity, bearingRatio},
        interaction: {
            compressionConcrete: boundaryNM.available ?
                boundaryNM.keyPoints.P0 * 1000 :
                0,
            steelCompression: AsBoundary * fy,
            phiPn,
            MnApprox: boundaryNM.available ?
                boundaryNM.keyPoints.M0 :
                0,
            phiMn,
            axialRatio,
            momentRatio,
            interactionRatio
        },
        shear: { bw: tmm, dv, Acv, vc, phiVc, Vn_required, VsRequiredUnfactored,
             VsProvided, shearCapacity, shearRatio, Vn_max, sectionSizeOK }, 
        foundation: { foundationShear, foundationMoment, tensionDemand},
        boundaryNM,
        sectionChecks,
        checks: {
            stressCompressionPass,
            bearingPass,
            interactionPass,
            shearPass,
            tensionPass,
            slendernessWarning,
            boundaryNMPass: boundaryNM.checks.pass,
            sectionSizeOK: sectionSizeOK
        }
    };
}

/* ============================================================================
OUT-OF-PLANE DESIGN
=========================================================================== */
export function calculateOutOfPlaneDesign(input = {}) {
    /* 读入输入数据 */
    const Hw = positive(input.wallHeight);
    const Lw = positive(input.wallWidth);
    const tw = positive(input.wallThickness);
    const tf = positive(input.tf);
    const Lf = positive(input.Lf);
    const ts = positive(input.ts);
    const fo = positive(input.fo);
    const ds = positive(input.ds);
    /* hroof validation */
    const { hroofEffective, hroofMax, hroofValid } = validateHroof(input);
    const hroof = hroofEffective;
    
    const gammaSoil = positive(input.gs, 18);
    const gammaConcrete = positive(input.concreteDensity, 24);
    const fy = positive(input.fy);
    const fyMesh = positive(input.fyMesh);
    const fc = positive(input.fc);
    const Es = positive(input.Es, 200000);
    const Ec = 4700*Math.sqrt(Math.max(fc, 0))*(gammaConcrete/23)**1.5; // MPa
    const n = Ec > 0 ? Es / Ec : 0;

    /* Unified reinforcement */
    const Vbar = positive(input.VbarDia);
    const Vspace = Math.max(positive(input.VbarSpace), 0.001);
    const Hbar = positive(input.HbarDia);
    const Hspace = Math.max(positive(input.HbarSpace), 0.001);
    const Fbar = positive(input.FootBarDia);
    const Fspace = Math.max(positive(input.FootBarSpace), 0.001);
    const cover = positive(input.cover);
    const AsMesh = positive(input.MeshArea);
    /* Support conditions（两套独立支承：风/震 与 火灾） */
    const supportWS = input.supportWindSeismic || input.outOfPlaneSupportCondition || 'Pinned-Pinned';
    const supportFire = input.supportFire || 'Fixed-Free';
    const wsFactors = getSupportFactors(supportWS);
    const fireFactors = getSupportFactors(supportFire);
    /* Retain legacy adjustment fields. */
    const wsMidAdjust = wsFactors.mid / (1 / 8);
    const wsBaseAdjust = wsFactors.base / (1 / 8);
    const fireAdjust = fireFactors.base / (1 / 2);
    /* Unified gravity loads: pressures × Sr = line loads */
    const Sr = positive(input.Sr, 1);
    const gPressure = positive(input.gUniform);
    const qPressure = positive(input.qUniform);
    const wwdPressure = positive(input.wwd);
    const wd = gPressure * Sr;
    const wq = qPressure * Sr;
    const wwdLine = wwdPressure * Sr;
    /* OOP specific loads */
    const wwf = positive(input.wwf);
    const qU = positive(input.qU);
    const wf = positive(input.wf);
    const th = positive(input.th);
    /* OOP additional point loads */
    const F_add = positive(input.additionalForce);
    const h_force = positive(input.additionalForceHeight);
    const M_add = finite(input.additionalMoment);
    const h_moment = positive(input.additionalMomentHeight);

    /*
    One-metre strip:一米宽条带计算
    Ag = t
    I  = t³/12
    Z  = t²/6
    */
    const Ag = tw * 1000;
    // 为啥墙厚取一半？
    const depthRebar = Math.max(tw * 1000 / 2 - cover - Vbar / 2, 1);
    const Ig = 1000 * Math.pow(tw * 1000, 3) / 12;
    const Iw = Lw * Ig;
    const ZperM = tw > 0 ? Math.pow(tw, 2) / 6 : 0;
    const Z = Lw * ZperM;
    const AWV = areaBar(Vbar) / Vspace;
    const AWS = Lw * AWV;
    const AWH = areaBar(Hbar) / Hspace;
    const AWF = areaBar(Fbar) / Fspace;
    const Tmesh = AsMesh * fyMesh / 1000;
    const rhoV = tw > 0 ? AWV / tw : 0;
    const rhoH = tw > 0 ? AWH / tw : 0;
    /* ------------------------------------------------------------------------
    Gravity actions per metre of wall.
    Existing variable names are retained, but the wall self-weight now uses
    full wall height rather than half-height as an axial force.
    ----------------------------------------------------------------------- */
    const Wd_line = wd;
    const Wq_line = wq;
    const wallHeightAboveFooting = Math.max(Hw - tf * 1, 0);
    const NSW = tw * wallHeightAboveFooting * gammaConcrete / 2;
    const NFF = Math.max(Lf, 0) * tf * gammaConcrete;
    const slabWidth = Math.max(Lf + 2 * fo, 0);
    const NSF = slabWidth * ts * gammaConcrete;
    const NHF = slabWidth * ds * gammaSoil;
    const N_GE = NSW + NFF + NSF + NHF + Wd_line;
    const Nmax = Math.max(1.35 * N_GE, 1.2 * N_GE + 1.5 * Wq_line);
    console.log("wd,wq,wallheighabovefooting,NSW,NFF,NSF,NHF", wd, wq, wallHeightAboveFooting, NSW, NFF, NSF, NHF)
    /* ------------------------------------------------------------------------
    Part/component seismic action.AS/NZS 1170.5:2004 Clause 8.3.2
    ----------------------------------------------------------------------- */
    const partDuctility = positive(input.partDuctilityFactorMu, 1);
    const partCh0 = positive(input.partSpectralShapeFactorT0, 1.33);
    const partC0 = partCh0 * positive(input.hazardFactor, 1) * positive(input.returnPeriodFactor, 1) * positive(input.nearFaultFactor, 1);
    const partRp = positive(input.partRiskFactor)

    /* ------------------------------------------------------------------------
    Part height amplification factor Chi (AS/NZS 1170.5:2004 §8.4.2.2)
    根据 hi (part高度) 和 hn (建筑总高) 进行三个判断：
    ----------------------------------------------------------------------- */
    const partHx = positive(input.partHeightHx);
    const partHn = positive(input.buildingHeightHn);
    const CHi = (() => {
        if (partHn <= 0) return 1.0; // 防止除以 0
        
        const candidates = [];
        
        // 公式 8.3(1): 适用于 hi < 12m
        if (partHx < 12) {
            candidates.push(1 + partHx / 6);
        }
        
        // 公式 8.3(2) 和 8.3(3)
        if (partHx < 0.2 * partHn) {
            candidates.push(1 + 10 * (partHx / partHn));
        } else {
            candidates.push(3.0);
        }
        
        // 规范规定：取适用公式中的较小值
        return Math.min(...candidates);
    })();
    /* ------------------------------------------------------------------------
    Part frequency
     ----------------------------------------------------------------------- */
    const C_coeff = wsFactors.frequency;
    const rho = gammaConcrete * 1000 / 9.81;           // kg/m³
    const A_strip = tw * 1;                            // m² (per metre width)
    const Ec_Pa = Ec * 1e6;                            // Pa
    const Ig_m4 = Math.pow(tw, 3) / 12;                // m⁴ (per metre width)
    const partPeriod = C_coeff * Math.pow(hroof, 2) 
                    * Math.sqrt(rho * A_strip / (Ec_Pa * Ig_m4));
    
    const partCiTp = (() => {
        if (partPeriod <=0.7) return 2.0;
        if (partPeriod < 1.5) return 2*(1.75 - partPeriod);
        return 0.5;
    })();

    const partCpTp = partC0 * CHi * partCiTp;

    const partCph = (() => {
        if (partDuctility == 1) return 1.0;
        if (partDuctility == 1.25) return 0.85;
        if (partDuctility == 2.0) return 0.55;
        if (partDuctility >= 3.0) return 0.45;
        return 0.45;
    })();

    const Wp_panel = gammaConcrete * tw;
    const Fp_panel = Math.min(partCpTp * partCph * partRp, 3.6) * Wp_panel;
    console.log("part Period:", partPeriod, "Cp:", partCiTp, "Hx:", partHx, "Hn:", partHn, "Fp_factor:",partCpTp * partCph * partRp);

    /*
    Correct simply-supported / fixed-support beam moments.
    Mmid = k_mid w L²
    Mbase = k_base w L²
    The pressure is applied over hroof.
    */
    const Lspan = Math.max(hroof, 0);
    const x_m = Lspan / 2;
    const ME = Fp_panel * Lspan * Lspan * wsFactors.mid;
    const MW = wwf * Lspan * Lspan * wsFactors.mid;
    let Ma = Math.max(ME, MW);
    const Na = N_GE;
    const hroof_mm = Lspan * 1000;
    console.log("风压, 跨度", wwf, Lspan)
    console.log("wsFactors", wsFactors.mid, wsFactors.base)
    /*
    Additional force:
    mid-height effect is taken as F × remaining lever arm from load point
    to the selected mid-height section.
    base section uses F × h.
    待检查！！！！！！！！！！！！
    */
    const M_add_mid_F = F_add * Math.abs(h_force - x_m);
    const M_add_mid_M = M_add;
    Ma += M_add_mid_F + M_add_mid_M;
    let MbE = Fp_panel * Lspan * Lspan * wsFactors.base;
    let MbW = wwf * Lspan * Lspan * wsFactors.base;
    const M_add_base_F = F_add * h_force;
    const M_add_base_M = M_add;
    MbE += M_add_base_F + M_add_base_M;
    MbW += M_add_base_F + M_add_base_M;
    console.log("平面外的支撑条件和弯矩", Ma, MbE, MbW)
    /* ------------------------------------------------------------------------
    Flexural capacity of one-metre wall strip.
    Vertical reinforcement is the reinforcement active in OOP bending.
    ----------------------------------------------------------------------- */
    const Ts = AWS * fy / 1000;
    const aDen = 0.85 * fc * 1000;
    const a = aDen > 0 ? Ts * 1000 / aDen : 0;
    const c = a / 0.85;
    const k = depthRebar > 0 ? a / (0.85 * depthRebar) : 0;
    const phiMn = 0.85 * AWV * fy * Math.max(depthRebar - a / 2, 0) / 1e6;
    console.log("phiMn:", phiMn, AWV, fy, depthRebar, a)
    /*
    NZS 3101-style approximate cracked inertia:
    Icr = n Ase (d-kd)^2 + b(kd)^3/3
    For a 1 m strip, b = 1000 mm.
    */
    const b_strip = 1000; // 1米宽条带, mm
    const d = depthRebar; // mm
    const As = AWV;       // 竖向钢筋面积, mm2
    
    // 求解中和轴高度 x (即 kd): 1000 * x^2 / 2 + n * As * x - n * As * d = 0
    const A_quad = 500;
    const B_quad = n * As;
    const C_quad = -n * As * d;
    const discriminant = B_quad * B_quad - 4 * A_quad * C_quad;
    const kd = discriminant >= 0 ? Math.max((-B_quad + Math.sqrt(discriminant)) / (2 * A_quad), 0) : 0;
    
    // 计算 Icr
    const Icr = (b_strip * Math.pow(kd, 3) / 3) + (n * As * Math.pow(d - kd, 2));
    /*
    Once the P-Delta denominator becomes zero/negative, the elastic
    amplification model has reached instability and the result is not a
    valid finite capacity calculation.
    */
    // 1. 必须使用设计轴力 Nmax (kN)，而不是未乘系数的 N_GE
    const N_design_kN = Nmax; 
    const N_design_N = N_design_kN * 1000; // 转换为 N，匹配 Ec(MPa) 和 Icr(mm4)

    // 2. 根据支撑条件确定 P-Delta 临界力系数 k_pdelta
    // 简支均布荷载等效临界力系数为 48/5 = 9.6 (或 pi^2 ≈ 9.87)
    // 悬臂 (Fixed-Free) 均布荷载等效临界力系数约为 2.0
    let k_pdelta = 9.6; 
    if (supportWS === 'Fixed-Free') {
        k_pdelta = 2.0; 
    } else if (supportWS === 'Fixed-Fixed') {
        k_pdelta = 39.5; // 4 * pi^2
    } else if (supportWS === 'Fixed-Pinned') {
        k_pdelta = 20.2; // 2 * pi^2
    }

    // 3. 计算 P-Delta 放大因子 (N* / N_cr)
    // N_cr = k_pdelta * Ec * Icr / L^2
    const pDeltaFactor = (Ec * Icr) > 0 ? (N_design_N * Math.pow(hroof_mm, 2)) / (k_pdelta * Ec * Icr) : 0;
    
    // 4. 稳定性判断与弯矩放大
    const pDeltaStable = pDeltaFactor < 0.95; 
    const pDeltaDenominator = 1 - pDeltaFactor;
    
    // 放大后的跨中弯矩
    const M_prime = Math.abs(pDeltaDenominator) > 1e-9 ? Ma / pDeltaDenominator : Infinity;
    const delta_u = pDeltaDenominator > 0 ? (5 * M_prime * Math.pow(hroof_mm, 2)) / pDeltaDen : Infinity;
    
    const UR1 = phiMn > 0 ? M_prime / phiMn : Infinity;
    const UR2 = phiMn > 0 ? Math.max(MbE, MbW) / phiMn : Infinity;
    console.log("phiMn, M_prime/phiMn:", phiMn, M_prime / phiMn)
    console.log("UR1, UR2", UR1, UR2)





    /* ------------------------------------------------------------------------
    Fire.
    ----------------------------------------------------------------------- */
    const hs = Math.max((Hw - tf * 1 - ds * 1 - ts * 1) / 1000, 0);
    const xt = Math.max(tw / 2 - Vbar / 2 - Hbar, 0.001);
    const etax = 0.16 * Math.log(Math.max(th, 0.001) * Math.pow(xt / 1000, -2)) - 0.65;
    const etaw = 1 - 0.162 * Math.pow(Math.max(th, 0.001), -0.6);
    const Tf = 660;
    const Tfs = etax * etaw * Tf;
    const fyt = Math.min(Math.max(((720 - Tfs) / 470) * fy, 0), fy);
    const Ts_fire = AWS * fyt / 1000;
    const a_fireDen = 0.85 * fc * 1000;
    const a_fire = a_fireDen > 0 ? Ts_fire * 1000 / a_fireDen : 0;
    const phiMn_fire = 0.85 * AWV * fyt * Math.max(depthRebar - a_fire / 2, 0) / 1e6;
    const fireSpan = Math.max((Hw - tf) / 1000, 0);
    const Mbf = wf * fireSpan * fireSpan * fireFactors.base;
    const UR3 = phiMn_fire > 0 ? Mbf / phiMn_fire : Infinity;
    /* ------------------------------------------------------------------------
    OOP shear.
    Vc is based on the 1 m strip area.
    Horizontal reinforcement crosses the vertical shear plane and therefore
    remains the reinforcement used for this OOP shear contribution.
    ----------------------------------------------------------------------- */

    const VE = Fp_panel + F_add;
    const Vw = (5 / 8) * wwf * fireSpan + F_add;
    const vc1 = 0.25 * Math.sqrt(Math.max(fc, 0)) + (Ag > 0 ? Na / (4 * Ag) : 0);
    const Vc = vc1 * depthRebar / 1000;
    const Vs = AWH * fy * depthRebar / Hspace / 1000;
    const phiVw = 0.75 * (Vc + Vs);
    const Vprime = Math.max(VE, Vw);
    const UR4 = phiVw > 0 ? Vprime / phiVw : Vprime > 0 ? Infinity : 0;
    /* ------------------------------------------------------------------------
    Foundation for OOP overturning.
    ----------------------------------------------------------------------- */
    const Wsum = Math.max(N_GE + Wq_line, 0.001);
    const lateralResultant = Math.max(Ma, 0);
    const Mo = lateralResultant * Math.max(hroof, 0);
    const footingWidth = Math.max(Lf + 2 * fo, 0.001);
    const foundationLeverArm = footingWidth / 2;
    const MR_weight = Wsum * foundationLeverArm;
    const X = Wsum > 0 ?
        (MR_weight - Mo) /
        Wsum *
        1000 :
        0;
    const Xclamped = Math.max(0, Math.min(footingWidth * 1000, X));
    const LBR = Math.max(2 * Math.min(Xclamped, footingWidth * 1000 / 2), 1);
    const qd = Wsum / (LBR / 1000);
    const qD = 0.5 * qU;
    const UR5 = qD > 0 ?
        qd / qD :
        Infinity;
    const foot_d = Math.max(tf - cover - Fbar / 2, 1);
    const footCompressionBlock = AWF * fy / (2 * Math.max(0.85 * fc * 1000, 1));
    const phiMn_foot = 0.85 * AWF * fy * Math.max(foot_d - footCompressionBlock, 0) / 1e6;
    const foundationMoment = Mo;
    const UR6 = phiMn_foot > 0 ?
        foundationMoment / phiMn_foot :
        foundationMoment > 0 ?
        Infinity :
        0;
    const overallOK = [UR1, UR2, UR3, UR4, UR5, UR6].every(
        (ur) =>
        Number.isFinite(ur) &&
        ur <= 1
    ) &&
        hroofValid &&
        pDeltaStable;
    return {
        Ec,
        n,
        Ag,
        d: depthRebar,
        Ig,
        Iw,
        Z,
        ZperM,
        AWV,
        AWS,
        AWH,
        AWF,
        Tmesh,
        rhoV,
        rhoH,
        Wd_line,
        Wq_line,
        NSW,
        NFF,
        NSF,
        NHF,
        N_GE,
        Nmax,
        x_m,
        ME,
        MW,
        wwf,
        Ma,
        Na,
        Ts,
        a,
        c,
        k,
        phiMn,
        As,


        UR1,
        MbE,
        MbW,
        UR2,
        hs,
        xt,
        etax,
        etaw,
        Tfs,
        fyt,
        Ts_fire,
        a_fire,
        phiMn_fire,
        Mbf,
        UR3,
        VE,
        Vw,
        vc1,
        Vc,
        Vs,
        phiVw,
        Vprime,
        UR4,
        Mo,
        Wsum,
        MR_weight,
        footingWidth,
        X: Xclamped,
        LBR,
        qd,
        qD,
        UR5,
        foot_d,
        foundationMoment,
        phiMn_foot,
        UR6,
        overallOK,
        pDelta: {
            Icr,
            pDeltaFactor,
            pDeltaStable,
            M_prime,
            delta_u,
            k_pdelta,
        },
        partSeismic: {
            partRp,
            CHi,
            partCiTp,
            partPeriod,
            partCph,
            partC0,
            partCpTp,
            Wp_panel,
            Fp: Fp_panel,
        },
        hroofValidation: {
            hroofEffective,
            hroofMax,
            hroofValid
        },
        supportConditions: {
            windSeismic: supportWS,
            fire: supportFire,
            windSeismicFactors: wsFactors,
            fireFactors,
            wsMidAdjust,
            wsBaseAdjust,
            fireAdjust
        },
        additionalLoads: {
            F_add,
            h_force,
            M_add,
            h_moment,
            M_add_mid_F,
            M_add_mid_M,
            M_add_base_F,
            M_add_base_M
        }
    };
}

/* ============================================================================
CONNECTION DESIGN
=========================================================================== */
export function calculateConnectionDesign(
    input = {},
    inPlane = {},
    outOfPlane = {}
) {
    const fy = positive(input.fy);
    const fgrout = positive(input.groutStrength, 40);
    const phiConn = positive(input.phiConnection, 0.75);
    const muFriction = positive(input.frictionCoefficient, 0.5);
    const nDowel = positive(input.baseDowelCount, 0);
    const dDowel = positive(input.baseDowelDiameter, 16);
    const embedment = positive(input.baseDowelEmbedment, 0);
    const shearKey = Boolean(input.shearKey);
    const shearKeyDepth = positive(input.shearKeyDepth);
    const b = positive(input.wallWidth);
    const t = positive(input.wallThickness);
    const Ad = areaBar(dDowel);
    const VinPlane = positive(inPlane?.sectionActions?.Vtotal);
    const VoutPerM = positive(outOfPlane?.Vprime);
    const VoutTotal = VoutPerM * b;
    const Vstar = Math.max(VinPlane, VoutTotal);
    const Nstar = positive(inPlane?.sectionActions?.NseismicCompression);
    const Tstar = positive(inPlane?.foundation?.tensionDemand);
    const VdowelSteel = nDowel * 0.6 * Ad * fy / 1000;
    const bondArea = nDowel * Math.PI * dDowel * embedment;
    const tauBond = 0.35 * Math.sqrt(Math.max(fgrout, 0));
    const VgroutBond = bondArea * tauBond / 1000;
    const Vdowel = Math.min(VdowelSteel, VgroutBond);
    const Vfriction = muFriction * Nstar;
    const VshearKey = shearKey ? 0.15 * VdowelSteel : 0;
    const Vn = Vdowel + Vfriction + VshearKey;
    const phiVconn = phiConn * Vn;
    const shearRatio = phiVconn > 0 ?
        Vstar / phiVconn :
        Vstar > 0 ?
        Infinity :
        0;
    const Tn = nDowel * Ad * fy / 1000;
    const phiTconn = phiConn * Tn;
    const tensionRatio = phiTconn > 0 ?
        Tstar / phiTconn :
        Tstar > 0 ?
        Infinity :
        0;
    const Abearing = b * 1000 * t * 1000;
    const sigmaBearing = Abearing > 0 ?
        Nstar * 1000 / Abearing :
        0;
    const bearingCapacity = 0.6 * Math.sqrt(Math.max(fgrout, 0));
    const bearingRatio = bearingCapacity > 0 ?
        sigmaBearing / bearingCapacity :
        sigmaBearing > 0 ?
        Infinity :
        0;
    const shearPass = Number.isFinite(shearRatio) && shearRatio <= 1;
    const tensionPass = Number.isFinite(tensionRatio) && tensionRatio <= 1;
    const bearingPass = Number.isFinite(bearingRatio) && bearingRatio <= 1;
    const overallPass = shearPass && tensionPass && bearingPass;
    return {
        demand: {
            VinPlane,
            VoutPerM,
            VoutTotal,
            Vstar,
            Nstar,
            Tstar
        },
        dowel: {
            Ad,
            nDowel,
            dDowel,
            embedment,
            VdowelSteel,
            bondArea,
            tauBond,
            VgroutBond,
            Vdowel
        },
        friction: {
            muFriction,
            Vfriction,
            shearKey,
            shearKeyDepth,
            VshearKey
        },
        capacity: {
            Vn,
            phiVconn,
            Tn,
            phiTconn
        },
        bearing: {
            Abearing,
            sigmaBearing,
            bearingCapacity,
            bearingRatio
        },
        ratios: {
            shearRatio,
            tensionRatio,
            bearingRatio
        },
        checks: {
            shearPass,
            tensionPass,
            bearingPass,
            overallPass
        },
        phiConn
    };
}

/* ============================================================================
FOUNDATION DESIGN
For an in-plane wall overturning moment, pressure varies across the footing
width B (perpendicular to the wall). Therefore:
Z = L B² / 6
not B L² / 6.
=========================================================================== */
export function calculateFoundationDesign(input = {}, inPlane = {}) {
    const footingWidth = positive(input.footingWidth);
    const footingLength = positive(input.footingLength);
    const footingThick = positive(input.footingThickness);
    const qAllow = positive(input.allowableBearingPressure, 150);
    const mu = positive(input.frictionCoefficient, 0.5);
    const densityConcrete = positive(input.concreteDensity, 24);
    const Nstar = positive(inPlane?.sectionActions?.NseismicCompression);
    const Mstar = positive(inPlane?.sectionActions?.Mtotal);
    const Vstar = positive(inPlane?.sectionActions?.Vtotal);
    const Gfooting = densityConcrete * footingWidth * footingLength * footingThick;
    const Ntotal = Nstar + Gfooting;
    const A = footingWidth * footingLength;
    /*
    Pressure varies across B.
    Z = L B² / 6.
    */
    const Zfoot = footingWidth > 0 && footingLength > 0 ? footingLength * footingWidth * footingWidth / 6 : 0;
    const qN = A > 0 ? Ntotal / A : 0;
    const qM = Zfoot > 0 ? Mstar / Zfoot : 0;
    const qMax = qN + qM;
    const qMin = qN - qM;
    const bearingRatio = qAllow > 0 ? qMax / qAllow : qMax > 0 ? Infinity : 0;
    const slidingResistance = mu * Ntotal;
    const slidingRatio = slidingResistance > 0 ? Vstar / slidingResistance :
        Vstar > 0 ? Infinity : 0;
    const bearingPass = Number.isFinite(bearingRatio) && bearingRatio <= 1;
    const slidingPass = Number.isFinite(slidingRatio) && slidingRatio <= 1;
    const noUplift = qMin >= -1e-9;
    const overallPass = bearingPass && slidingPass && noUplift;
    return {
        B: footingWidth,
        L: footingLength,
        tf: footingThick,
        qAllow,
        mu,
        Gfooting,
        Ntotal,
        A,
        Z: Zfoot,
        qMax,
        qMin,
        bearingRatio,
        slidingResistance,
        slidingRatio,
        checks: {
            bearingPass,
            slidingPass,
            noUplift,
            overallPass
        }
    };
}

/* ============================================================================
SUMMARY
=========================================================================== */
export function buildDesignSummary(inPlane, outOfPlane, connection, foundation) {
    const inPlaneChecks = [
        inPlane.checks.stressCompressionPass,
        inPlane.checks.bearingPass,
        inPlane.checks.interactionPass,
        inPlane.checks.shearPass,
        inPlane.checks.tensionPass,
        inPlane.checks.boundaryNMPass !== false
    ].every(Boolean);
    const oopChecks = outOfPlane.overallOK;
    const connectionChecks = connection?.checks?.overallPass ?? true;
    const foundationChecks = foundation?.checks?.overallPass ?? true;
    const slendernessWarning = inPlane.checks.slendernessWarning;
    const hroofWarning = !outOfPlane.hroofValidation.hroofValid;
    const pDeltaWarning = outOfPlane.pDeltaStable === false;
    const overallPass =
        inPlaneChecks &&
        oopChecks &&
        connectionChecks &&
        foundationChecks &&
        !slendernessWarning &&
        !hroofWarning &&
        !pDeltaWarning;
    return {
        inPlanePass: inPlaneChecks,
        outOfPlanePass: oopChecks,
        connectionPass: connectionChecks,
        foundationPass: foundationChecks,
        slendernessWarning,
        hroofWarning,
        pDeltaWarning,
        overallPass,
        warnings: [
            slendernessWarning ?
                'Wall h/t exceeds 25; explicit slenderness and stability verification is required.' :
                null,
            hroofWarning ?
                `hroof exceeds maximum allowed value (${outOfPlane.hroofValidation.hroofMax.toFixed(2)} m). Value has been clamped.` :
                null,
            pDeltaWarning ?
                'OOP P-Delta amplification has reached the stability limit; the finite elastic result is not valid.' :
                null,
            !inPlaneChecks ?
                'One or more in-plane checks failed.' :
                null,
            !oopChecks ?
                'One or more out-of-plane checks failed.' :
                null,
            !connectionChecks ?
                'One or more base connection checks failed.' :
                null,
            !foundationChecks ?
                'One or more in-plane foundation checks failed.' :
                null,
            inPlane.checks.boundaryNMPass === false ?
                'Boundary element local N-M check failed.' :
                null
        ].filter(Boolean)
    };
}

/* ============================================================================
MAIN PUBLIC API
=========================================================================== */
export function calculatePrecastPanelDesign(rawInput = {}) {
    const input = { ...rawInput };
    const inPlane = calculateInPlaneDesign(input);
    const outOfPlane = calculateOutOfPlaneDesign(input);
    const connection = calculateConnectionDesign(input, inPlane, outOfPlane);
    const foundation = calculateFoundationDesign(input, inPlane);
    const summary = buildDesignSummary(inPlane, outOfPlane, connection, foundation);
    return {
        input,
        inPlane,
        outOfPlane,
        connection,
        foundation,
        summary,
        meta: {
            engine: 'PrecastPanelCalculation',
            version: '0.7.0-corrected-section-and-actions',
            status: 'Unified In-Plane + Out-of-Plane + Connection + Foundation framework',
            note: 'Corrected wall section properties, OOP support moment coefficients, in-plane wall shear geometry, and in-plane foundation section modulus. Existing public API and UI input names are preserved.'
        }
    };
}
export default calculatePrecastPanelDesign;