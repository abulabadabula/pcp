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
    if (ur < 0) {
        /* 负利用率没有物理意义（通常意味着失稳或公式误用），直接判为失败 */
        return { status: 'FAIL', pass: false, warning: true };
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
'shear' = base reaction coefficient for uniform load (V = k w L).
=========================================================================== */
const SUPPORT_MOMENT_FACTORS = {
    'Pinned-Pinned': { mid: 1 / 8, base: 0, shear: 1 / 2, frequency: 2 / Math.PI },
    'Fixed-Free': { mid: 1 / 8, base: 1 / 2, shear: 1, frequency: (2 * Math.PI) / Math.pow(1.875, 2) },
    'Fixed-Fixed': { mid: 1 / 24, base: 1 / 12, shear: 1 / 2, frequency: (2 * Math.PI) / Math.pow(4.73, 2) },
    'Fixed-Pinned': { mid: 9 / 128, base: 1 / 8, shear: 5 / 8, frequency: (2 * Math.PI) / Math.pow(3.926, 2) }
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
NZS 3101:2006 assumptions: Cl 7.4.2.7 rectangular stress block.
Rev 0.8:
  - beta1 reduced for fc > 30 MPa (0.85 - 0.008(fc-30), min 0.65)
  - section solved at Pn = Nstar/phi (design point on the nominal surface)
  - P0 deducts steel area: alpha1 fc (Ag - Ast) + Ast fy
  - distributed bars excluded from boundary zones to avoid double counting
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
    /* NZS 3101:2006 Cl 7.4.2.7: beta1 = 0.85 for fc <= 30, reduced 0.008/MPa, min 0.65 */
    const beta1 = Math.max(0.85 - 0.008 * Math.max(fc - 30, 0), 0.65);
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
    const hasBoundary = boundaryBarCount > 0 && boundaryBarDia > 0 && boundaryWidth > 0;
    if (VbarDia > 0 && VbarSpace > 0 && L > 0) {
        /* 若存在边界元，分布筋避开两端边界元范围，防止钢筋重复计入 */
        const xStart = hasBoundary ? Math.min(cover + boundaryWidth, L / 2) : cover;
        const xEnd = hasBoundary ? Math.max(L - cover - boundaryWidth, L / 2) : L - cover;
        if (xEnd > xStart) {
            const nBars = Math.max(2, Math.floor((xEnd - xStart) / VbarSpace) + 1);
            for (let i = 0; i < nBars; i++) {
                const x = nBars === 1 ? L / 2 : xStart + i * ((xEnd - xStart) / (nBars - 1));
                bars.push({ x, As: AsDistributedBar, type: 'distributed' });
            }
        }
    }

    if (hasBoundary) {
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

    /* 设计点位于 φ 交互面上：在名义曲面上解 Pn = Nstar/φ，再比较 Mstar 与 φMn */
    const Ntarget = Nstar * 1000 / Math.max(phiFlexure, 1e-6);
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

    /* P0 扣除钢筋面积（NZS 3101 Cl 10.3.4.2 形式） */
    const P0 = alpha1 * fc * Math.max(Ag - AsTotal, 0) + AsTotal * fy;
    const phiPn = phiFlexure * P0 / 1000;
    const axialRatio = phiPn > 0 ? Nstar / phiPn : 0;

    const interactionRatio = momentRatio;

    const grossConcreteCapacity = fc * Ag;
    const lowAxialRatio = grossConcreteCapacity > 0 ? (Nstar * 1000) / grossConcreteCapacity : 0;

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
Section: hc = boundaryWidth, bc = boundaryThickness. Compression positive.
Rev 0.8: phi 默认值改为 NZS 3101:2006 Table 2.3.2.2(c) 的弯曲值 0.85
（NZS 3101 没有 ACI 式 φ(N) 过渡，插值机制保留供用户自定义）。
A2/A3 对单层配筋墙平面内受弯的 φ=0.7 规定不适用于带约束边界元的双层配筋
截面；如项目采用单层配筋墙，请通过输入显式指定。
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
    const phiC = positive(input.phiCompression, 0.85);
    const phiF = positive(input.phiFlexure, 0.85);
    const epsCU = 0.003;
    const beta1 = Math.max(0.85 - 0.008 * Math.max(fc - 30, 0), 0.65);
    const hc = boundaryWidth * 1000;
    const bc = boundaryThick * 1000;
    const Agc = bc * hc;
    const AsTotal = nBars * areaBar(barDia);
    const AsLayer = AsTotal / 2;
    const cover = positive(input.cover);
    const tieDia = positive(input.boundaryTieDiameter);
    const dPrime = cover + tieDia + barDia / 2;
    const d = Math.max(hc - dPrime, 1);
    /* Pure compression nominal capacity P0 */
    const P0 = 0.85 * fc * Math.max(Agc - AsTotal, 0) + fy * AsTotal;
    const phiP0 = phiC * P0 / 1000;
    /* Balanced neutral axis */
    const cb = (epsCU / (epsCU + fy / Math.max(Es, 1))) * d;
    const sectionForce = (cRaw) => {
        const c = Math.max(cRaw, 0.001);
        const a = Math.min(beta1 * c, hc);
        const Cc = 0.85 * fc * bc * a;
        const steelStress = depth => clamp(Es * epsCU * (depth - c) / c, -fy, fy);
        const Fs1 = steelStress(dPrime) * AsLayer;
        const Fs2 = steelStress(d) * AsLayer;
        const Nn = Cc - Fs1 - Fs2;
        const Mn = Cc * (hc / 2 - a / 2) - Fs1 * (hc / 2 - dPrime) - Fs2 * (hc / 2 - d);
        return { N: Nn / 1000, M: Math.abs(Mn) / 1e6 };
    };
    /* ---- Log-spaced neutral-axis sweep → nominal curve ---- */
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
    const phiAt = (N) => {
        if (!(Nb > 0)) return phiF;
        const ratio = clamp((Nb - N) / Nb, 0, 1);
        return phiC + (phiF - phiC) * ratio;
    };
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
    const momentCapacityAt = (Nd) => {
        if (!Number.isFinite(Nd) || curveDesign.length === 0) { return 0; }
        if (Nd > curveDesign[0].N + 1e-9) { return 0; }
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
    /* lintelEcc 由调用方统一传入"自墙形心"的偏心距 */
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
    /* 统一约定：输入偏心距自"墙面"起算；对内一律换算为自墙形心的偏心距 */
    const lintelEccFromFace = finite(input.lintelEccentricity);
    const lintelEcc = lintelEccFromFace + bwall / 2;
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
    if (aspectRatio < 1) { wallClassification = 'Squat wall'; } else if (aspectRatio > 2) { wallClassification = 'Slender wall'; }
    /* ------------------------------------------------------------------------
    Reinforcement.
    ----------------------------------------------------------------------- */
    const VbarDia = positive(input.VbarDia);
    const VbarSpace = positive(input.VbarSpace);
    const HbarDia = positive(input.HbarDia);
    const HbarSpace = positive(input.HbarSpace);

    const vBarArea = areaBar(VbarDia);
    const hBarArea = areaBar(HbarDia);

    /* NZS 3101 Cl 11.3.3：墙厚 > 200 mm 必须双层配筋（地下室 250 mm）。
       twall 单位为 m，修正原代码 "米与 200 比较" 的错误。 */
    const numLayers = input.BarLayers ?
        positive(input.BarLayers) :
        (twall > 0.2 ? 2 : 1);

    const nVerticalBars = VbarSpace > 0 ? Math.floor(bmm / VbarSpace) + 1 : 0;
    const AsDistributed = nVerticalBars * vBarArea;
    const rhoVertical = Ag > 0 ? AsDistributed / Ag : 0;
    const AsHorizontalPerM = HbarSpace > 0 ? (hBarArea * numLayers) * 1000 / HbarSpace : 0;
    /* ρh = 每米高度水平筋面积 / (1000 × t) */
    const rhoHorizontal = (tmm * 1000) > 0 ? AsHorizontalPerM / (tmm * 1000) : 0;

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
    ----------------------------------------------------------------------- */
    const Z = positive(input.hazardFactor);
    const Ru = positive(input.returnPeriodFactor, 1);
    const mu = Math.max(positive(input.ductility, 1), 1);
    /* NZS 1170.5:2004 C4.4 / Table C8.3：Sp = max(0.7, 1.3 − 0.3μ) */
    const Sp = positive(input.structuralPerformanceFactor, Math.max(0.7, 1.3 - 0.3 * mu));
    const Ch = positive(input.spectralShapeFactor);
    const Nt = positive(input.nearFaultFactor, 1);
    const NFP = positive(input.period);
    const kmu = NFP >= 0.7 ? mu : (mu - 1) * NFP / 0.7 + 1;
    const CT1 = Ch * Z * Ru * Nt;
    const Cd = CT1 * Sp / kmu;
    /* Diaphragm forces: act at wall top, produce moment = F × h */
    const VdiaphragmWind = diaphragmWindForce;
    const VdiaphragmSeismic = diaphragmSeismicForce;
    const MdiaphragmWind = VdiaphragmWind * hwall;
    const MdiaphragmSeismic = VdiaphragmSeismic * hwall;
    /* Gravity + seismic */
    const psiE = positive(input.psiE, 0.30);
    const Gi = Gwall + GlineTotal;
    const seismicGravity = Gi + psiE * QlineTotal;
    /* BRANZ 指南算例：屋面/线荷载惯性力作用于墙顶，墙体自重惯性力沿高度分布
       （合力作用于半高）。总剪力仍为 Cd×W，弯矩按分布修正。 */
    const FseismicTop = Cd * (GlineTotal + psiE * QlineTotal);
    const FseismicWall = Cd * Gwall;
    const Vseismic = FseismicTop + FseismicWall;
    const Mseismic = FseismicTop * hwall + FseismicWall * hwall / 2;
    const NseismicCompression = seismicGravity + lintelReaction;
    const NseismicTension = seismicGravity - lintelReaction;
    /* 屋面/墙顶连接设计剪力：按 μ=1 系数与设计系数之比放大（指南 §8.2.1(ix)、§10.1） */
    const roofConnectionAmplification = Cd > 0 ? CT1 / Cd : 1;
    const roofConnectionShear = FseismicTop * roofConnectionAmplification;
    /* Lintel eccentricity（偏心距统一取自墙形心） */
    const Mlintel = lintelReaction * lintelEcc;
    /* Total actions: seismic + diaphragm + lintel */
    const Mtotal = Mseismic + Math.max(MdiaphragmWind, MdiaphragmSeismic) + Mlintel;
    const Vtotal = Vseismic + Math.max(VdiaphragmWind, VdiaphragmSeismic);
    /* ------------------------------------------------------------------------
    Elastic section stresses (ULS, for information).
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
    Serviceability (unfactored) compression stress check.
    ULS 内力近似折回 SLS（M 除以 1.5），避免极限状态混用。
    ----------------------------------------------------------------------- */
    const Nservice = Gwall + GlineTotal + lintelReaction + QlineTotal;
    const Mservice = Mtotal / 1.5;
    const sigmaN_service = Ag > 0 ? kNToN(Nservice) / Ag : 0;
    const sigmaM_service = Zg > 0 ? kNmToNmm(Mservice) / Zg : 0;
    const sigmaMax_service = sigmaN_service + sigmaM_service;
    /* ------------------------------------------------------------------------
    Lintel bearing.
    ----------------------------------------------------------------------- */
    const bearingArea = (positive(input.bearingWidth) / 1000) * (positive(input.bearingLength) / 1000);
    const bearingStress = bearingArea > 0 ? kNToN(lintelReaction) / (bearingArea * 1e6) : 0;
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
    const phiPn = boundaryNM.available ? boundaryNM.keyPoints.phiP0 : 0;
    const phiMn = boundaryNM.available ? boundaryNM.keyPoints.phiM0 : 0;
    const axialRatio = phiPn > 0 ? NseismicCompression / phiPn : boundaryNM.available ? Infinity : 0;
    const momentRatio = phiMn > 0 ? Mtotal / phiMn : boundaryNM.available ? Infinity : 0;
    const interactionRatio = boundaryNM.available ? boundaryNM.checks.governingUR : 0;

    /* ------------------------------------------------------------------------
    IN-PLANE SHEAR DESIGN — NZS 3101:2006 Cl 11.3.10 (Eq 11-12 ~ 11-19)
    ----------------------------------------------------------------------- */
    const dv = 0.8 * bmm;            /* d = 0.8Lw (Cl 11.3.10.3.3) */
    const Acv = dv * tmm;            /* Acv = d × t（BRANZ 算例同） */
    const phiShear = positive(input.phiShear, 0.75);

    const Ag_mm2 = bmm * tmm;
    const Nstar_N = Ngravity * 1000; /* N，压为正 */
    const nu = Nstar_N / Ag_mm2;     /* MPa */
    const sqrtFc = Math.sqrt(Math.max(fc, 0));

    /* 简化法 (Cl 11.3.10.3.4)：仅当 ρl > 0.003 且任一方向间距 ≤ 300 mm 时可用。
       vc 取 Eq 11-12 与 Eq 11-13 的较小值。 */
    const simplifiedOK = rhoVertical > 0.003 && Math.max(VbarSpace, HbarSpace) <= 300;
    const vc_1112 = 0.17 * sqrtFc;
    const vc_1113 = 0.17 * (sqrtFc + nu);
    const vcSimplified = Math.max(Math.min(vc_1112, vc_1113), 0);

    /* 详细法 (Cl 11.3.10.3.5)：Eq 11-14 与 Eq 11-15 的较小值。
       Eq 11-15 仅在 (Mstar/Vstar − Lw/2) > 0 时适用。 */
    const vc_1114 = 0.27 * sqrtFc + nu / 4;
    const Mstar_Nmm = Mtotal * 1e6;
    const Vstar_N = Vtotal * 1000;
    const shearMomentTerm = Vstar_N > 0 ? (Mstar_Nmm / Vstar_N - bmm / 2) : 0;
    const vc_1115 = shearMomentTerm > 0 ?
        0.05 * sqrtFc + (0.1 * sqrtFc + 0.2 * nu) * (bmm / shearMomentTerm) :
        vc_1114;
    const vcDetailed = Math.max(Math.min(vc_1114, vc_1115), 0);

    const vc = simplifiedOK ? vcSimplified : vcDetailed;
    const vcMethod = simplifiedOK ? 'simplified (Eq 11-12/11-13)' : 'detailed (Eq 11-14/11-15)';
    const Vc = vc * Acv / 1000;      /* kN */
    const phiVc = phiShear * Vc;

    /* 截面抗剪上限：vn ≤ 0.2f'c 且不大于 8 MPa (Cl 11.3.10.3.2 + 7.5.2) */
    const vmax_MPa = Math.min(0.2 * fc, 8);
    const Vn_max = vmax_MPa * Acv / 1000;
    const sectionSizeOK = Vtotal <= phiShear * Vn_max + 1e-9;

    /* 钢筋抗剪 Vs = Av fyt d / s2 (Eq 11-18)，水平筋，计入层数 */
    const VsProvided = HbarSpace > 0 ?
        (hBarArea * numLayers / HbarSpace) * fy * dv / 1000 :
        0;

    const Vn = Vc + VsProvided;
    const phiVn = phiShear * Vn;
    const shearCapacity = Math.min(phiVn, phiShear * Vn_max);
    const shearRatio = shearCapacity > 0 ? Vtotal / shearCapacity : Vtotal > 0 ? Infinity : 0;
    const VsRequiredUnfactored = max0(Vtotal / Math.max(phiShear, 1e-9) - Vc);

    /* 最小水平筋 Ash ≥ 0.7 bw s2 / fyt (Eq 11-19)，Av 为间距 s2 内全部层数之和 */
    const Ash_required = 0.7 * tmm * HbarSpace / fy;
    const Ash_actual = hBarArea * numLayers;
    const minSteelOK = Ash_actual >= Ash_required - 1e-9;

    /* 间距限值 (Cl 11.3.10.3.8(c)/(e)) */
    const maxSpacingH = Math.min(bmm / 5, 3 * tmm, 450);
    const maxSpacingV = Math.min(bmm / 3, 3 * tmm, 450);
    const spacingOK = HbarSpace <= maxSpacingH + 1e-9 && VbarSpace <= maxSpacingV + 1e-9;

    /* 竖向配筋率 ≥ 0.7/fyn (Cl 11.3.10.3.8(d)) */
    const rhoV_min_shear = 0.7 / Math.max(fy, 1);
    const verticalRatioOK = rhoVertical >= rhoV_min_shear - 1e-9;

    /* ------------------------------------------------------------------------
    Base / foundation actions.
    ----------------------------------------------------------------------- */
    const foundationShear = Vtotal;
    const foundationMoment = Mtotal;
    /* 拉拔需求取 ULS 弹性应力法中的净拉力（考虑倾覆效应），原式仅重力相减不合理 */
    const tensionDemand = max0(-Ntension);
    const stressCompressionPass = sigmaMax_service <= 0.6 * fc;
    const bearingPass = Number.isFinite(bearingRatio) && bearingRatio <= 1;
    const interactionPass = boundaryNM.available ? boundaryNM.checks.pass : true;
    const shearPass = Number.isFinite(shearRatio) && shearRatio <= 1;
    const tensionPass = boundarySteelTensionCapacity >= tensionDemand;
    const slendernessWarning = outOfPlaneSlenderness > 25;

    /* ------------------------------------------------------------------------
    Section Checks (Strain Compatibility)
    NZS 3101:2006 Table 2.3.2.2(c) 弯曲 φ=0.85；A2/A3 及 SESOC 2013 临时建议
    将单层配筋墙平面内受弯降为 φ=0.7（BRANZ 2007 算例仍用 0.85，注意版本）。
    ----------------------------------------------------------------------- */
    const phiFlexureInPlane = numLayers <= 1 ?
        positive(input.phiFlexureSinglyReinforced, 0.70) :
        positive(input.phiFlexure, 0.85);
    const sectionChecks = calculateInPlaneSectionChecks(
        { ...input, phiFlexure: phiFlexureInPlane },
        {
            geometry: { bwall, hwall, twall, Ag, I, Zg },
            gravity: { Ngravity },
            sectionActions: { Mtotal, Vtotal },
            elasticStress: { sigmaN, sigmaM, sigmaMax, sigmaMin, eccentricity }
        }
    );

    return {
        geometry: { bwall, hwall, twall, Ag, I, Zg },
        reinforcement: {
            nVerticalBars,
            vBarArea,
            hBarArea,
            AsDistributed,
            rhoVertical,
            AsHorizontalPerM,
            rhoHorizontal,
            AsBoundary,
            boundaryArea,
            rhoBoundary,
            boundarySteelTensionCapacity,
            numLayers,
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
            lintelReaction
        },
        seismic: {
            CT1,
            Cd,
            Sp,
            kmu,
            FseismicTop,
            FseismicWall,
            seismicGravity,
            Vseismic,
            Mseismic,
            psiE,
            Z,
            Ru,
            mu,
            Ch,
            Nt,
            Gi,
            roofConnectionAmplification,
            roofConnectionShear
        },
        diaphragm: { VdiaphragmWind, VdiaphragmSeismic, MdiaphragmWind, MdiaphragmSeismic },
        sectionActions: {
            seismicGravity,
            NseismicCompression,
            NseismicTension,
            lintelEcc,
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
            Ntension,
            Nservice,
            Mservice,
            sigmaN_service,
            sigmaM_service,
            sigmaMax_service
        },
        slenderness: { aspectRatio, outOfPlaneSlenderness, wallClassification },
        bearing: { bearingArea, bearingStress, bearingCapacity, bearingRatio },
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
            interactionRatio,
            phiFlexureInPlane
        },
        shear: {
            bw: tmm,
            dv,
            Acv,
            nu,
            simplifiedOK,
            vcMethod,
            vc_1112,
            vc_1113,
            vc_1114,
            vc_1115,
            vcSimplified,
            vcDetailed,
            vc,
            Vc,
            phiVc,
            vmax_MPa,
            Vn_max,
            Vn_required: Vtotal / Math.max(phiShear, 1e-9),
            VsProvided,
            Vn,
            phiVn,
            shearCapacity,
            shearRatio,
            VsRequiredUnfactored,
            Ash_required,
            Ash_actual,
            minSteelOK,
            maxSpacingH,
            maxSpacingV,
            spacingOK,
            rhoV_min_shear,
            verticalRatioOK,
            sectionSizeOK
        },
        foundation: { foundationShear, foundationMoment, tensionDemand },
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
            sectionSizeOK,
            minSteelOK,
            spacingOK,
            verticalRatioOK
        }
    };
}

/* ============================================================================
OUT-OF-PLANE DESIGN
Rev 0.8 主要修正：
  - numLayers 变量名错误（twall → tw）及墙厚单位错误
  - Ec 改用 NZS 3101:2006 Cl 5.2.3：Ec = (3320√fc+6900)(ρ/2300)^1.5
  - 重力项单位错误（tf/ts/ds mm→m），墙自重 / 基础 / 板 / 土重分离：
      P-Δ 轴力 = 屋面轴力 + 中点以上墙重（指南 §4.6）
      基础/板/土重仅用于抗倾覆
  - P-Δ 按 NZS 3101 Cl 11.3.5.1.2（Eq 11-1~11-7）：0.75 刚度折减、
    Ase=(Nstar+Asfy)/fy、0.05t 最小偏心、适用条件（两端支承、Nstar/Ag<0.06fc）
  - 平面外剪切按 Cl 11.3.10.2 → Cl 12.7：vc = kd·ka·vb
  - 稳定性四项检查（指南 §8.4：H/t、kH/t、Euler、Vlasov）+ k 系数表
  - 附加集中荷载按影响线精确公式
  - 火灾工况 φ=1.0（Table 2.3.2.2(j)）；xt/hs/fireSpan 单位修正
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
    /* NZS 3101:2006 Cl 5.2.3：Ec = (3320√f'c + 6900)(ρ/2300)^1.5 MPa。
       γc [kN/m³] 换算质量密度 ρ ≈ γc×1000/9.81 [kg/m³]。 */
    const rhoConcrete = gammaConcrete * 1000 / 9.81;
    const Ec = (3320 * Math.sqrt(Math.max(fc, 0)) + 6900) * Math.pow(rhoConcrete / 2300, 1.5);
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
    const wsBaseAdjust = wsFactors.base / (1 / 2);
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
    One-metre strip: Ag = t, I = t³/12, Z = t²/6
    */
    const Ag = tw * 1000;
    const Ig = 1000 * Math.pow(tw * 1000, 3) / 12;
    const Iw = Lw * Ig;
    const ZperM = tw > 0 ? Math.pow(tw, 2) / 6 : 0;
    const Z = Lw * ZperM;
    const AWV = areaBar(Vbar) * 1000 / Vspace;
    const AWS = Lw * AWV;
    const AWH = areaBar(Hbar) * 1000 / Hspace;
    const AWF = areaBar(Fbar) * 1000 / Fspace;
    const Tmesh = AsMesh * fyMesh / 1000;
    /* NZS 3101 Cl 11.3.3：t > 200 mm 必须双层（tw 单位 m） */
    const numLayers = input.BarLayers ?
        positive(input.BarLayers) :
        (tw > 0.2 ? 2 : 1);
    /* 配筋率：ρ = As[mm²/m] / (1000 × t_mm)，无量纲 */
    const rhoV = tw > 0 ? AWV / (tw * 1e6) : 0;
    const rhoH = tw > 0 ? AWH / (tw * 1e6) : 0;
    /* ------------------------------------------------------------------------
    Gravity actions per metre of wall（单位已修正：tf/ts/ds 为 mm）。
    P-Δ 轴力 = 外部轴力 + 中点以上墙重（BRANZ 指南 §4.6）；
    基础梁/板/土重只作为抗倾覆的稳定重量。
    ----------------------------------------------------------------------- */
    const Wd_line = wd;
    const Wq_line = wq;
    const wallHeightAboveFooting = Math.max(Hw - tf / 1000, 0);
    const NSW = tw * wallHeightAboveFooting * gammaConcrete / 2;   /* 中点以上墙重（P-Δ 用） */
    const NSW_full = tw * wallHeightAboveFooting * gammaConcrete;  /* 全墙重（抗倾覆用） */
    const NFF = Math.max(Lf, 0) * (tf / 1000) * gammaConcrete;     /* 基础梁重（仅稳定） */
    const slabWidth = Math.max(Lf + 2 * fo, 0);
    const NSF = slabWidth * (ts / 1000) * gammaConcrete;           /* 板重（仅稳定） */
    const NHF = slabWidth * (ds / 1000) * gammaSoil;               /* 土重（仅稳定） */
    const N_GE = Wd_line + NSW;                                    /* 面板中轴力（kN/m） */
    const N_stab = NFF + NSF + NHF;                                /* 稳定重量（kN/m） */
    const Nmax = Math.max(1.35 * N_GE, 1.2 * N_GE + 1.5 * Wq_line);
    /* ------------------------------------------------------------------------
    Part/component seismic action. AS/NZS 1170.5:2004 Clause 8.3.2
    ----------------------------------------------------------------------- */
    const partDuctility = positive(input.partDuctilityFactorMu, 1);
    const partCh0 = positive(input.partSpectralShapeFactorT0, 1.33);
    const partC0 = partCh0 * positive(input.hazardFactor, 1) * positive(input.returnPeriodFactor, 1) * positive(input.nearFaultFactor, 1);
    const partRp = positive(input.partRiskFactor, 1);

    /* 高度放大系数 Chi（AS/NZS 1170.5:2004 §8.4.2.2，Eq 8.3(1)~(3)） */
    const partHx = positive(input.partHeightHx);
    const partHn = positive(input.buildingHeightHn);
    const CHi = (() => {
        if (partHn <= 0) return 1.0;
        const candidates = [];
        if (partHx < 12) {
            candidates.push(1 + partHx / 6);
        }
        if (partHx < 0.2 * partHn) {
            candidates.push(1 + 10 * (partHx / partHn));
        } else {
            candidates.push(3.0);
        }
        return candidates.length > 0 ? Math.min(...candidates) : 1.0;
    })();
    /* ------------------------------------------------------------------------
    Part frequency。注意：指南算例采用折减（开裂）刚度，面板周期约 1.0~1.1 s、
    Ci≈1.3~1.4；本处默认用未开裂 Ig（偏保守）。可用输入
    partPeriodStiffnessFactor（≈0.1）按指南方法折减。
    另注意：NZS 1170.5 Supp1 C8.2 认为"地面支承部件不受动力放大"，
    对单层面板属解释争议（SESOC 2024），评估项目需说明立场。
    ----------------------------------------------------------------------- */
    const C_coeff = wsFactors.frequency;
    const rho = gammaConcrete * 1000 / 9.81;           /* kg/m³ */
    const A_strip = tw * 1;                            /* m² (per metre width) */
    const Ec_Pa = Ec * 1e6;                            /* Pa */
    const Ig_m4 = Math.pow(tw, 3) / 12;                /* m⁴ (per metre width) */
    const partStiffnessFactor = positive(input.partPeriodStiffnessFactor, 1);
    const partPeriod = C_coeff * Math.pow(hroof, 2)
        * Math.sqrt(rho * A_strip / (Ec_Pa * Ig_m4 * partStiffnessFactor));

    /* 部件谱形系数（AS/NZS 1170.5 Eq 8.4(1)~(3)，拐点 0.75 s） */
    const partCiTp = (() => {
        if (partPeriod <= 0.75) return 2.0;
        if (partPeriod < 1.5) return 2 * (1.75 - partPeriod);
        return 0.5;
    })();

    const partCpTp = partC0 * CHi * partCiTp;

    const partCph = (() => {
        if (partDuctility === 1) return 1.0;
        if (partDuctility === 1.25) return 0.85;
        if (partDuctility === 2.0) return 0.55;
        if (partDuctility >= 3.0) return 0.45;
        return 0.45;
    })();

    const Wp_panel = gammaConcrete * tw;
    /* §8.3.2 上限 3.6Wp（请与正文核对），下限也请核对 */
    const Fp_panel = Math.min(partCpTp * partCph * partRp, 3.6) * Wp_panel;

    /* ------------------------------------------------------------------------
    有效高度系数 k（BRANZ 指南 Table 5 / NZS 3101 Table 11.1）
    ----------------------------------------------------------------------- */
    const kWallDefault = {
        'Pinned-Pinned': 1.0,
        'Fixed-Pinned': 1.0,
        'Fixed-Fixed': 0.7,
        'Fixed-Free': 2.0  /* 纯悬臂：有效高度 2H（指南 §4.6） */
    }[supportWS] || 1.0;
    const kWall = input.wallKFactor > 0 ? finite(input.wallKFactor) : kWallDefault;

    /* ------------------------------------------------------------------------
    稳定性四项检查（BRANZ 指南 §8.4 / NZS 3101 Cl 11.3.4）
    ----------------------------------------------------------------------- */
    const H_stab_mm = Hw * 1000;
    const t_stab_mm = tw * 1000;
    const L_stab_mm = Lw * 1000;
    const Ht_ratio = t_stab_mm > 0 ? H_stab_mm / t_stab_mm : Infinity;
    const kHt_ratio = kWall * Ht_ratio;
    const cond1_Ht = Ht_ratio <= 75;
    const cond2_kHt = kHt_ratio <= 65;

    /* (3) Euler 屈曲：由指南式 B2 推导（E=900fc、EIeff=0.25Ig、π²×75/4=185）：
       (kH/t)² = 185 / λe，λe = (P+0.5W)/(fc'Ag) + 0.4ρt·fy/fc' */
    const P_stab_N = Wd_line * 1000;                    /* 屋面重力（每米宽，N） */
    const W_stab_N = tw * Hw * gammaConcrete * 1000;    /* 墙自重（每米宽，N） */
    const Ag_stab_mm2 = t_stab_mm * 1000;               /* 每米宽截面面积 */
    const lambda_euler = fc > 0 ?
        (P_stab_N + 0.5 * W_stab_N) / (fc * Ag_stab_mm2) + 0.4 * rhoV * fy / fc :
        Infinity;
    const kHt_eulerCapacity = lambda_euler > 0 && Number.isFinite(lambda_euler) ?
        Math.sqrt(185 / lambda_euler) :
        Infinity;
    const cond3_euler = kHt_ratio <= kHt_eulerCapacity;

    /* (4) Vlasov/Timoshenko 弯扭屈曲（指南式 B4/B5）：
       Mcrit = 0.6·(900fc)·t³·L/(kH)；Mdemand = 0.5(P+0.5W+Ast·fy)·L */
    const E_dyn = 900 * fc; /* MPa（指南取动态模量 900fc） */
    const Ast_stab_mm2 = AWS; /* 全墙竖向筋面积 */
    const Mcrit_vlasov = kWall * H_stab_mm > 0 ?
        0.6 * E_dyn * Math.pow(t_stab_mm, 3) * L_stab_mm / (kWall * H_stab_mm) :
        0; /* N·mm */
    const Mdemand_vlasov = 0.5 * (P_stab_N * Lw + 0.5 * W_stab_N * Lw + Ast_stab_mm2 * fy) * L_stab_mm; /* N·mm */
    const cond4_vlasov = Mcrit_vlasov > 0 && Mdemand_vlasov <= Mcrit_vlasov;
    const lambda_vlasov_a = fc > 0 ?
        (P_stab_N + 0.5 * W_stab_N) / (fc * Ag_stab_mm2) + 0.5 * rhoV * fy / fc :
        Infinity;
    const stabilityAllOK = cond1_Ht && cond2_kHt && cond3_euler && cond4_vlasov;

    /*
    Correct simply-supported / fixed-support beam moments.
    Mmid = k_mid w L²；Mbase = k_base w L²。
    */
    const Lspan = Math.max(hroof, 0);
    const x_m = Lspan / 2;
    const ME = Fp_panel * Lspan * Lspan * wsFactors.mid;
    const MW = wwf * Lspan * Lspan * wsFactors.mid;
    let Ma = Math.max(ME, MW);
    const Na = N_GE;
    const hroof_mm = Lspan * 1000;

    /* ------------------------------------------------------------------------
    附加集中荷载/力矩 —— 按支承条件的影响线精确公式（修正原 |h−L/2| 写法）
    ----------------------------------------------------------------------- */
    const a_f = clamp(h_force, 0, Lspan);
    let M_add_mid_F = 0;
    let M_add_base_F = 0;
    let V_add_base_F = 0;
    if (supportWS === 'Pinned-Pinned') {
        M_add_mid_F = F_add * Math.min(a_f, Lspan - a_f) / 2;
        M_add_base_F = 0;
        V_add_base_F = Lspan > 0 ? F_add * (Lspan - a_f) / Lspan : 0;
    } else if (supportWS === 'Fixed-Free') {
        M_add_mid_F = a_f >= Lspan / 2 ? F_add * (a_f - Lspan / 2) : 0;
        M_add_base_F = F_add * a_f;
        V_add_base_F = F_add;
    } else if (supportWS === 'Fixed-Pinned') {
        const L = Math.max(Lspan, 1e-9);
        const R_top = F_add * a_f * a_f * (3 * L - a_f) / (2 * L * L * L);
        M_add_base_F = Math.max(F_add * a_f - R_top * L, 0);
        V_add_base_F = F_add - R_top;
        const M0_mid = F_add * Math.min(a_f, L - a_f) / 2;
        M_add_mid_F = Math.max(M0_mid - M_add_base_F / 2, 0);
    } else if (supportWS === 'Fixed-Fixed') {
        const L = Math.max(Lspan, 1e-9);
        const b = Math.max(L - a_f, 0);
        const M_A = F_add * a_f * b * b / (L * L);
        const M_B = F_add * a_f * a_f * b / (L * L);
        const M0_mid = F_add * Math.min(a_f, b) / 2;
        M_add_base_F = M_A;
        M_add_mid_F = Math.max(M0_mid - (M_A + M_B) / 2, 0);
        V_add_base_F = F_add;
    }
    const M_add_mid_M = Math.abs(M_add);
    const M_add_base_M = Math.abs(M_add);
    Ma += M_add_mid_F + M_add_mid_M;
    let MbE = Fp_panel * Lspan * Lspan * wsFactors.base;
    let MbW = wwf * Lspan * Lspan * wsFactors.base;
    MbE += M_add_base_F + M_add_base_M;
    MbW += M_add_base_F + M_add_base_M;

    /* ------------------------------------------------------------------------
    Flexural capacity of one-metre wall strip（竖向筋为平面外受弯筋）。
    φ = 0.85（NZS 3101 Table 2.3.2.2(c)）。
    钢筋有效深度：单层居中钢筋 → 受压边缘至钢筋形心 = t/2（BRANZ 指南算例
    取 d = 75 = t/2，不另扣保护层）；双层 → 取靠受拉面一层。
    ----------------------------------------------------------------------- */
    const depthRebar = numLayers >= 2 ?
        Math.max(tw * 1000 - cover - Vbar / 2, 1) :
        Math.max(Math.max(tw * 1000 / 2, cover + Vbar / 2), 1);
    /* 一米条带受弯：钢筋面积取每米条带面积 AWV（原代码误用整板 AWS） */
    const Ts = AWV * fy / 1000;
    const aDen = 0.85 * fc * 1000;
    const a = aDen > 0 ? Ts * 1000 / aDen : 0;
    const beta1_oop = Math.max(0.85 - 0.008 * Math.max(fc - 30, 0), 0.65);
    const c = a / beta1_oop;
    const k = depthRebar > 0 ? a / (beta1_oop * depthRebar) : 0;
    const phiMn = 0.85 * AWV * fy * Math.max(depthRebar - a / 2, 0) / 1e6;
    /* 单层配筋墙弱轴受弯：c < 0.75cb（NZS 3101 Cl 11.3.11.3） */
    const cb_oop = (0.003 / (0.003 + fy / Math.max(Es, 1))) * depthRebar;
    const neutralAxisOK = c < 0.75 * cb_oop;

    /* 配筋构造限值（指南 §4.4 / NZS 3101 Cl 11.3.11） */
    const rhoV_min_code = Math.sqrt(Math.max(fc, 0)) / (4 * Math.max(fy, 1));
    const rhoV_max_code = 16 / Math.max(fy, 1);
    const rhoV_limitsOK = rhoV >= rhoV_min_code - 1e-9 && rhoV <= rhoV_max_code + 1e-9;
    const barDiaMaxOK = Vbar <= t_stab_mm / 7;
    const barDiaMinOK = Vbar >= 10;
    const tiesRequired = rhoV >= 0.01;

    /*
    NZS 3101 Cl 11.3.5.1.2 P-delta（Eq 11-1 ~ 11-7）：
      Δu = 5 M* Ln² / (0.75×48 Ec Icr)
      M* = Ma* / (1 − 5 N* Ln² / (0.75×48 Ec Icr))
      Icr = n Ase (d−kd)² + b kd³/3，Ase = (N* + As fy)/fy
    简化法仅适用于两端支承（不适用于悬臂），且要求中部轴应力 < 0.06fc。
    */
    const N_design_kN = Nmax;
    const N_design_N = N_design_kN * 1000;
    const nuMid = N_design_N / (1000 * t_stab_mm); /* MPa，每米宽 */
    const slenderMethodApplicable = supportWS !== 'Fixed-Free' && nuMid < 0.06 * fc;

    const As_pdelta = AWV + N_design_N / Math.max(fy, 1); /* Ase = As + Nstar/fy (Eq 11-7) */
    /* Icr 计算深度：BRANZ 指南 §12.1 算例取 d = 0.8t（可用输入覆盖）。
       如严格按 Eq 11-5 用钢筋实际深度，可设 pDeltaDepthFactor = null。 */
    const pDeltaDepthFactor = input.pDeltaDepthFactor === null ?
        0 :
        finite(input.pDeltaDepthFactor, 0.8);
    const d_icr = pDeltaDepthFactor > 0 ?
        pDeltaDepthFactor * tw * 1000 :
        depthRebar;
    const b_strip = 1000;
    const A_quad = b_strip / 2;
    const B_quad = n * As_pdelta;
    const C_quad = -n * As_pdelta * d_icr;
    const discriminant = B_quad * B_quad - 4 * A_quad * C_quad;
    const kd = discriminant >= 0 ? Math.max((-B_quad + Math.sqrt(discriminant)) / (2 * A_quad), 0) : 0;
    const Icr = (b_strip * Math.pow(kd, 3) / 3) + (n * As_pdelta * Math.pow(d_icr - kd, 2));

    let k_pdelta = 9.6; /* 简支：48/5 */
    if (supportWS === 'Fixed-Free') {
        k_pdelta = 2.0;
    } else if (supportWS === 'Fixed-Fixed') {
        k_pdelta = 39.5;
    } else if (supportWS === 'Fixed-Pinned') {
        k_pdelta = 20.2;
    }

    /* 0.75 刚度折减（NZS 3101 Cl 11.3.4.2 / Eq 11-3 分母） */
    const pDeltaFactor = (Ec * Icr) > 0 ?
        (N_design_N * Math.pow(hroof_mm, 2)) / (k_pdelta * 0.75 * Ec * Icr) :
        0;
    const pDeltaStable = pDeltaFactor < 0.95;
    const pDeltaDenominator = 1 - pDeltaFactor;

    /* 最小偏心距（NZS 3101 Cl 11.3.1.2）：M* ≥ N*×0.05t */
    const Mmin_ecc = N_design_kN * 0.05 * tw; /* kNm/m */
    const Ma_eff = Math.max(Math.abs(Ma), Mmin_ecc);

    const M_prime = pDeltaDenominator > 1e-9 ? Ma_eff / pDeltaDenominator : Infinity;
    const delta_u = Number.isFinite(M_prime) && (Ec * Icr) > 0 ?
        (5 * (M_prime * 1e6) * Math.pow(hroof_mm, 2)) / (0.75 * 48 * Ec * Icr) :
        Infinity; /* mm */

    const UR1 = phiMn > 0 ? Math.max(M_prime, 0) / phiMn : Infinity;
    const UR2 = phiMn > 0 ? Math.max(MbE, MbW) / phiMn : Infinity;

    /* ------------------------------------------------------------------------
    平面外剪切（NZS 3101 Cl 11.3.10.2 → Cl 12.7 板式）：
    vc = kd·ka·vb；vb = min((0.07+10ρ)√fc, 0.2√fc)；kd = (400/d)^0.25；ka = 1.0
    需求 = 底部支座剪力 = w·Lspan·k_shear + 附加力
    ----------------------------------------------------------------------- */
    const d_oop = depthRebar;
    const rho_oop = (1000 * d_oop) > 0 ? AWV / (1000 * d_oop) : 0;
    const kd_oop = Math.pow(400 / Math.max(d_oop, 1), 0.25);
    const sqrtFc_oop = Math.sqrt(Math.max(fc, 0));
    const vb_oop = Math.min((0.07 + 10 * rho_oop) * sqrtFc_oop, 0.2 * sqrtFc_oop);
    const vc_oop = kd_oop * vb_oop;
    const Vc_oop = vc_oop * 1000 * d_oop / 1000; /* kN/m */
    const Vs_oop = Hspace > 0 ? (areaBar(Hbar) * numLayers / Hspace) * fy * d_oop / 1000 : 0;
    const phiShear = positive(input.phiShear, 0.75);
    const phiVn_oop = phiShear * (Vc_oop + Vs_oop);

    const shearCoeff = wsFactors.shear;
    const VE = Fp_panel * Lspan * shearCoeff + V_add_base_F;
    const Vw = wwf * Lspan * shearCoeff + V_add_base_F;
    const Vprime = Math.max(VE, Vw);
    const UR4 = phiVn_oop > 0 ? Vprime / phiVn_oop : (Vprime > 0 ? Infinity : 0);

    /* ------------------------------------------------------------------------
    Fire（φ = 1.0，NZS 3101 Table 2.3.2.2(j)；xt/hs 单位已修正）。
    η 公式出自指南引文 [52] 的火灾研究，使用时请注明出处；
    连接设计另需满足 NZS 3101 Cl 4.8（0.5 kPa、30% 屈服、680°C 材性）。
    ----------------------------------------------------------------------- */
    const hs = Math.max(Hw - (tf + ds + ts) / 1000, 0);
    const xt = Math.max(tw / 2 - Vbar / 2000 - Hbar / 1000, 0.001);
    const etax = 0.16 * Math.log(Math.max(th, 0.001) * Math.pow(xt, -2)) - 0.65;
    const etaw = 1 - 0.162 * Math.pow(Math.max(th, 0.001), -0.6);
    const Tf = 660;
    const Tfs = etax * etaw * Tf;
    const fyt = Math.min(Math.max(((720 - Tfs) / 470) * fy, 0), fy);
    const Ts_fire = AWV * fyt / 1000; /* 一米条带 */
    const a_fireDen = 0.85 * fc * 1000;
    const a_fire = a_fireDen > 0 ? Ts_fire * 1000 / a_fireDen : 0;
    const phiMn_fire = 1.0 * AWV * fyt * Math.max(depthRebar - a_fire / 2, 0) / 1e6;
    const fireSpan = Math.max(Hw - tf / 1000, 0);
    const Mbf = wf * fireSpan * fireSpan * fireFactors.base;
    const UR3 = phiMn_fire > 0 ? Mbf / phiMn_fire : Infinity;

    /* ------------------------------------------------------------------------
    Foundation for OOP overturning（稳定重量 = 全墙重+基础+板+土+屋面+活载）。
    ----------------------------------------------------------------------- */
    const Wsum = Math.max(Wd_line + NSW_full + N_stab + Wq_line, 0.001);
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
    const foot_d = Math.max(tf / 1000 - cover / 1000 - Fbar / 2000, 0.001) * 1000;
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
            ur >= 0 &&
            ur <= 1
    ) &&
        hroofValid &&
        pDeltaStable &&
        stabilityAllOK &&
        neutralAxisOK &&
        rhoV_limitsOK &&
        barDiaMaxOK &&
        barDiaMinOK;
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
        numLayers,
        Wd_line,
        Wq_line,
        NSW,
        NSW_full,
        NFF,
        NSF,
        NHF,
        N_GE,
        N_stab,
        Nmax,
        x_m,
        ME,
        MW,
        wwf,
        Ma,
        Ma_eff,
        Mmin_ecc,
        Na,
        Ts,
        a,
        c,
        k,
        phiMn,
        cb_oop,
        neutralAxisOK,
        rhoV_min_code,
        rhoV_max_code,
        rhoV_limitsOK,
        barDiaMaxOK,
        barDiaMinOK,
        tiesRequired,
        kWall,
        stability: {
            kWall,
            Ht_ratio,
            kHt_ratio,
            cond1_Ht,
            cond2_kHt,
            lambda_euler,
            kHt_eulerCapacity,
            cond3_euler,
            lambda_vlasov_a,
            Mdemand_vlasov,
            Mcrit_vlasov,
            cond4_vlasov,
            allOK: stabilityAllOK
        },
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
        vc1: vc_oop,
        Vc: Vc_oop,
        Vs: Vs_oop,
        phiVw: phiVn_oop,
        Vprime,
        UR4,
        oopShear: {
            d_oop,
            rho_oop,
            kd_oop,
            vb_oop,
            vc_oop,
            Vc_oop,
            Vs_oop,
            phiVn_oop,
            shearCoeff
        },
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
            As_pdelta,
            d_icr,
            kd,
            pDeltaFactor,
            pDeltaStable,
            pDeltaDenominator,
            M_prime,
            delta_u,
            k_pdelta,
            nuMid,
            slenderMethodApplicable
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
            Fp_panel,
            partStiffnessFactor
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
            M_add_base_M,
            V_add_base_F
        }
    };
}

/* ============================================================================
CONNECTION DESIGN
Rev 0.8：
  - 剪切摩擦按 NZS 3101 Cl 7.7：Vn = μ(Avf·fy + N*)，φ = 0.75；
    μ = 1.0 仅在接触面有意粗糙化（幅值 ≥ 2 mm）时可用。
  - 保留 dowel 钢材剪切与灌浆粘结作为附加校核。
  - 新增锚固长度校核（BRANZ 指南 §9.2 / Table 6，NZS 3101 Cl 8.6.3，
    非接触搭接净距 > 3db 时 +1.5×净距，Cl 8.7.2.5）。
  - 局部承压改为 NZS 3101 体系：φ×0.85f'c（Cl 16.3.3 + Table 2.3.2.2(e)）。
  - 受拉 φ = 0.85。
=========================================================================== */
export function calculateConnectionDesign(
    input = {},
    inPlane = {},
    outOfPlane = {}
) {
    const fy = positive(input.fy);
    const fgrout = positive(input.groutStrength, 40);
    const phiConn = positive(input.phiConnection, 0.75);
    const phiTension = positive(input.phiTension, 0.85);
    /* μ：0.6 = 未粗糙化的硬化混凝土面；1.0 需有意粗糙化（≥2 mm） */
    const muFriction = positive(input.frictionCoefficient, 0.6);
    const roughened = Boolean(input.shearPlaneRoughened);
    const muUsed = roughened ? Math.max(muFriction, 1.0) : Math.min(muFriction, 0.6);
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

    /* Dowel 钢材剪切与灌浆粘结（附加校核） */
    const VdowelSteel = nDowel * 0.6 * Ad * fy / 1000;
    const bondArea = nDowel * Math.PI * dDowel * embedment;
    const tauBond = 0.35 * Math.sqrt(Math.max(fgrout, 0));
    const VgroutBond = bondArea * tauBond / 1000;
    const Vdowel = Math.min(VdowelSteel, VgroutBond);

    /* NZS 3101 Cl 7.7 剪切摩擦：Vn = μ(Avf·fy + N*) */
    const Avf = nDowel * Ad;
    const VshearKey = shearKey ? 0.15 * VdowelSteel : 0;
    const Vsf = muUsed * (Avf * fy / 1000 + Nstar) + VshearKey;
    const phiVsf = 0.75 * Vsf;

    /* 粘结传力需覆盖摩擦未承担的剪力 */
    const VbondDemand = Math.max(Vstar - muUsed * Nstar, 0);
    const bondRatio = VgroutBond > 0 ?
        VbondDemand / (phiConn * VgroutBond) :
        VbondDemand > 0 ? Infinity : 0;

    const shearRatio = phiVsf > 0 ? Vstar / phiVsf : (Vstar > 0 ? Infinity : 0);

    const Tn = nDowel * Ad * fy / 1000;
    const phiTconn = phiTension * Tn;
    const tensionRatio = phiTconn > 0 ?
        Tstar / phiTconn :
        Tstar > 0 ? Infinity : 0;

    const Abearing = b * 1000 * t * 1000;
    const sigmaBearing = Abearing > 0 ?
        Nstar * 1000 / Abearing :
        0;
    /* 局部承压：φ×0.85f'c（无约束，NZS 3101 Cl 16.3.3 + Table 2.3.2.2(e)） */
    const bearingCapacity = 0.65 * 0.85 * fgrout;
    const bearingRatio = bearingCapacity > 0 ?
        sigmaBearing / bearingCapacity :
        sigmaBearing > 0 ? Infinity : 0;

    /* 锚固长度校核（指南 §9.2 / Table 6） */
    const devTable = { 300: [34, 27, 24, 21, 18], 500: [56, 46, 40, 35, 30] };
    const fcKeys = [20, 30, 40, 50, 70];
    const ldbMultiple = (() => {
        const row = devTable[fy <= 400 ? 300 : 500];
        const x = clamp(fgrout, 20, 70);
        for (let i = 0; i + 1 < fcKeys.length; i++) {
            if (x >= fcKeys[i] && x <= fcKeys[i + 1]) {
                const frac = (x - fcKeys[i]) / (fcKeys[i + 1] - fcKeys[i]);
                return row[i] + frac * (row[i + 1] - row[i]);
            }
        }
        return row[row.length - 1];
    })();
    const ld_basic = ldbMultiple * dDowel;
    const lapClearance = positive(input.dowelLapClearance, 50);
    const nonContact = input.dowelNonContactLap !== false;
    const ld_required = ld_basic + (nonContact ? 1.5 * lapClearance : 0);
    const developmentOK = embedment >= ld_required - 1e-9;

    const shearPass = Number.isFinite(shearRatio) && shearRatio <= 1 &&
        Number.isFinite(bondRatio) && bondRatio <= 1;
    const tensionPass = Number.isFinite(tensionRatio) && tensionRatio <= 1;
    const bearingPass = Number.isFinite(bearingRatio) && bearingRatio <= 1;
    const overallPass = shearPass && tensionPass && bearingPass && developmentOK;
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
            Avf,
            VdowelSteel,
            bondArea,
            tauBond,
            VgroutBond,
            Vdowel,
            ld_basic,
            ld_required,
            developmentOK
        },
        friction: {
            muFriction,
            muUsed,
            roughened,
            Vsf,
            phiVsf,
            shearKey,
            shearKeyDepth,
            VshearKey
        },
        capacity: {
            Vsf,
            phiVsf,
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
            bondRatio,
            tensionRatio,
            bearingRatio
        },
        checks: {
            shearPass,
            tensionPass,
            bearingPass,
            developmentOK,
            overallPass
        },
        phiConn
    };
}

/* ============================================================================
FOUNDATION DESIGN
Rev 0.8：平面内倾覆弯矩使基底反力沿"墙长方向"变化：
  Z = B·L²/6
其中 footingLength = 沿墙长度方向尺寸，footingWidth = 垂直墙面方向尺寸。
（原代码 Z = L·B²/6 方向反了。）
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
    /* 压力沿墙长方向变化：Z = B·L²/6 */
    const Zfoot = footingWidth > 0 && footingLength > 0 ?
        footingWidth * footingLength * footingLength / 6 :
        0;
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
        inPlane.checks.boundaryNMPass !== false,
        inPlane.checks.sectionSizeOK !== false,
        inPlane.checks.minSteelOK !== false,
        inPlane.checks.spacingOK !== false,
        inPlane.checks.verticalRatioOK !== false
    ].every(Boolean);
    const oopChecks = outOfPlane.overallOK;
    const connectionChecks = connection?.checks?.overallPass ?? true;
    const foundationChecks = foundation?.checks?.overallPass ?? true;
    const slendernessWarning = inPlane.checks.slendernessWarning;
    const hroofWarning = !outOfPlane.hroofValidation.hroofValid;
    const pDeltaWarning = outOfPlane.pDeltaStable === false;
    const stabilityWarning = outOfPlane.stability && outOfPlane.stability.allOK === false;
    const slenderMethodWarning = outOfPlane.pDelta && outOfPlane.pDelta.slenderMethodApplicable === false;
    /* h/t > 25 提示：对按 BRANZ 指南设计的细长墙板，h/t ≤ 75 且稳定性四项
       检查（stability.allOK）才是正式判据，此处仅作信息性警告，不阻断通过。 */
    const overallPass =
        inPlaneChecks &&
        oopChecks &&
        connectionChecks &&
        foundationChecks &&
        !hroofWarning &&
        !pDeltaWarning &&
        !stabilityWarning;
    return {
        inPlanePass: inPlaneChecks,
        outOfPlanePass: oopChecks,
        connectionPass: connectionChecks,
        foundationPass: foundationChecks,
        slendernessWarning,
        hroofWarning,
        pDeltaWarning,
        stabilityWarning,
        slenderMethodWarning,
        overallPass,
        warnings: [
            slendernessWarning ?
                'Wall h/t exceeds 25 (non-slender limit). Slender panel design relies on the BRANZ guide §8.4 stability checks (H/t ≤ 75, kH/t ≤ 65, Euler, Vlasov) — refer to outOfPlane.stability.' :
                null,
            hroofWarning ?
                `hroof exceeds maximum allowed value (${outOfPlane.hroofValidation.hroofMax.toFixed(2)} m). Value has been clamped.` :
                null,
            pDeltaWarning ?
                'OOP P-Delta amplification has reached the stability limit; the finite elastic result is not valid.' :
                null,
            stabilityWarning ?
                'Panel stability checks (H/t ≤ 75, kH/t ≤ 65, Euler, Vlasov) per BRANZ guide §8.4 are NOT all satisfied.' :
                null,
            slenderMethodWarning ?
                'NZS 3101 Cl 11.3.5.1.2 simplified P-delta method is outside its scope (cantilever or N*/Ag ≥ 0.06fc); use rational analysis (Cl 11.3.4.2).' :
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
            version: '0.8.0-nzs3101-branz-alignment',
            status: 'Unified In-Plane + Out-of-Plane + Connection + Foundation framework',
            note: 'Rev 0.8: fixed OOP crash (twall) and mm/m unit errors; Sp ≥ 0.7; P-delta per NZS 3101 Cl 11.3.5.1.2 (0.75 factor, Ase=N*+Asfy/fy, 0.05t ecc, applicability limits); Ec per Cl 5.2.3; in-plane shear per Cl 11.3.10 (Eq 11-12~11-19, vmax=0.2fc≤8MPa); OOP shear per Cl 12.7; stability checks (H/t, kH/t, Euler, Vlasov) per BRANZ guide §8.4; phi per Table 2.3.2.2 (fire=1.0, singly-reinforced in-plane=0.7); foundation Z=B·L²/6; connection shear friction per Cl 7.7 + development length per Cl 8.6.3/8.7.2.5.'
        }
    };
}
export default calculatePrecastPanelDesign;
