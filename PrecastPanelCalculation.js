/* ============================================================================
PrecastPanelCalculation.js
Unified calculation engine for In-Plane + Out-of-Plane design.

v0.5.0 —— 与两个参考引擎核对后的修正与扩展：
参考基准：
  PanelWallInPlaneDesign.jsx  （平面内参考引擎）
  PrecastPanelOOPDesign.jsx   （平面外参考引擎）
修正：
  OOP 支承条件弯矩系数原先“计算了但未代入”。现以参考实现的
  Pinned–Pinned wL²/8（中部/底部）、Fixed–Free wL²/2（火灾悬臂）
  为基准，引入 wsMidAdjust / wsBaseAdjust / fireAdjust 调整系数，
  乘入 Ma、MbE、MbW、Mbf。默认支承条件下结果与参考实现完全一致。
  OOP 返回值新增 supportConditions 对象，供界面显示所选系数。
新增 calculateConnectionDesign —— 底部连接（锚筋+灌浆+摩擦+剪力键）。
新增 calculateFoundationDesign —— 平面内基础（基底承压+抗滑移）。
buildDesignSummary 扩展为包含连接与基础检查。
说明：
  参考 OOP 文件中 Vs = AWH·fy·d / Vspace 误用竖向间距，
  本引擎按正确做法使用 Hspace（水平筋间距）。
  OOP 自重项（NSW/NFF/NSF/NHF）单位处理完全保留参考实现的公式形式，
  不做单位“修正”，以保证与参考引擎结果一致。

v0.6.0 —— OOP 地震作用改按 AS/NZS 1170.5:2004 第 8 章（Parts and components）：
  移除直接输入的 OOP 地震系数 CdT1 / CdTE。
  新增 part 参数输入：partResponseCoefficient（Cp，Table 8.1）、
  partHeightHx（hx）、buildingHeightHn（hn）。
  引擎内计算：
    H  = 1 + 2(hx/hn)                      （§8.4.2.3 高度放大系数）
    Wp = γc × tw × hroof                   （每延米墙板重量，kN/m）
    Fp = Cp × H × Wp                       （§8.4.2.2，kN/m）
    WE = Fp / hroof = Cp × H × γc × tw     （沿 hroof 均布的压力，kPa）
  其余 OOP 弯矩 / 剪力 / 火灾 / 基础公式保持不变。

v0.6.2 —— 新增边缘构件局部 N-M 交互验算（Lintel 反力作用于墙边）：
  calculateBoundaryElementNM：
  · 边缘构件截面：弯曲方向高度 hc = boundaryWidth，宽度 bc = boundaryThickness
    （绕墙厚方向轴受弯，与平面内整体弯矩同轴），纵筋近似两层对称布置。
  · 平截面假定 + 等效矩形应力块（εcu = 0.003，β1 = max[0.85-0.008(f'c-30), 0.65]），
    对中性轴深度 c 作对数扫描生成名义 N-M 曲线。
  · 设计包络 ϕ(N)：受压控制区取 ϕc（phiCompression），自平衡点 Nb 以下
    线性过渡至 ϕf（phiFlexure）（N → 0）。
  · 需求包络（重力按边缘构件面积占比 r = A_b/A_g 分配，含 Lintel 偏心弯矩 R·e）：
      D0: 1.35(G_b + R)          —— 永久荷载控制
      D1: 1.2G_b + 1.5Q_b + 1.5R —— 重力 ULS
      D2: G_b + ψe·Q_b + R       —— 地震组合
  · UR = M* / φMn(N*)（设计曲线等轴力内插），并校核 N* ≤ φP0。
  · 结果挂入 inPlane.boundaryNM，纳入 buildDesignSummary 与利用率汇总。
  其余模块与公式保持不变。

Earlier version notes:
  hroof is constrained: hroof ≤ wallHeight - tf/1000 - ds/1000 - ts/1000
  In-plane specific loads are diaphragm forces (wind + seismic), not wind pressure
  Seismic parameters unified (in-plane + OOP in one set)
  wwd (roof wind pressure) moved to gravity loads; Sr = tributary range
  qU (bearing capacity) moved to foundation section
========================================================================== */

/* ============================================================================
NUMERICAL HELPERS
========================================================================== */
const finite = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const positive = (value, fallback = 0) => Math.max(0, finite(value, fallback));

const clamp = (value, min, max) => Math.min(Math.max(finite(value), min), max);

const sq = value => value * value;

const areaBar = diameter => Math.PI * sq(positive(diameter)) / 4;

const kNToN = value => finite(value) * 1000;

const kNmToNmm = value => finite(value) * 1e6;

const max0 = value => Math.max(0, finite(value));

/* ============================================================================
SUPPORT CONDITION MOMENT COEFFICIENTS
For uniformly distributed load w over span L:
  M = coefficient × w × L²
========================================================================== */
const SUPPORT_MOMENT_FACTORS = {
  'Pinned-Pinned': { mid: 1 / 8, base: 1 / 8 },
  'Fixed-Free':    { mid: 1 / 8, base: 1 / 2 },
  'Fixed-Fixed':   { mid: 1 / 24, base: 1 / 12 },
  'Fixed-Pinned':  { mid: 9 / 128, base: 1 / 8 }
};

const getSupportFactors = (condition) =>
  SUPPORT_MOMENT_FACTORS[condition] || SUPPORT_MOMENT_FACTORS['Pinned-Pinned'];

/* ============================================================================
STATUS HELPERS
========================================================================== */
export const statusFromUR = (ur, warning = 0.90) => {
  if (!Number.isFinite(ur)) {
    return { status: 'NOT CHECKED', pass: false, warning: true };
  }
  if (ur <= warning) return { status: 'PASS', pass: true, warning: false };
  if (ur <= 1.0) return { status: 'PASS - HIGH UTILISATION', pass: true, warning: true };
  return { status: 'FAIL', pass: false, warning: true };
};

/* ============================================================================
HROOF VALIDATION
hroof must be ≤ wallHeight - tf/1000 - ds/1000 - ts/1000
Returns { hroofEffective, hroofMax, hroofValid }
========================================================================== */
export function validateHroof(input) {
  const wallHeight = positive(input.wallHeight);
  const tf = positive(input.tf);
  const ds = positive(input.ds);
  const ts = positive(input.ts);
  const hroofInput = positive(input.hroof);
  const hroofMax = Math.max(wallHeight - tf / 1000 - ds / 1000 - ts / 1000, 0);
  const hroofEffective = Math.min(hroofInput, hroofMax);
  const hroofValid = hroofInput <= hroofMax;
  return { hroofEffective, hroofMax, hroofValid };
}

/* ============================================================================
BOUNDARY ELEMENT LOCAL N-M INTERACTION（v0.6.2 新增）
----------------------------------------------------------------------------
Lintel 反力作用于墙边（边缘构件）时的压弯验算：
  · 截面：bc = boundaryThickness（宽），hc = boundaryWidth（弯曲方向高度），
    绕墙厚方向轴受弯，与平面内整体弯矩同轴。
  · 纵筋 boundaryBarCount-φ 近似按两层对称布置（每层 As/2），
    d' = cover + 箍筋直径 + 纵筋半径，d = hc - d'。
  · 承载力曲线按平截面假定 + 等效矩形应力块生成：
      εcu = 0.003；β1 = max[0.85 - 0.008(f'c - 30), 0.65]
      对中性轴深度 c 作对数扫描（cMin = 0.02hc → cMax = 8hc），逐点求 (Nn, Mn)。
  · 设计包络 ϕ(N)：N ≥ Nb（平衡点）时 ϕ = ϕc；Nb 以下线性过渡至 ϕf（N → 0）。
  · 需求点（三种组合，均含 Lintel 反力 R 与偏心 e 产生的局部弯矩 R·e）：
      D0: 1.35(G_b + R)
      D1: 1.2G_b + 1.5Q_b + 1.5R
      D2: G_b + ψe·Q_b + R
    其中 G_b / Q_b 为按面积占比 r = A_b / A_g 分配的墙体自重与屋面重力。
  · UR = M* / φMn(N*)（设计曲线在 N* 处内插），并校核 N* ≤ φP0。
ctx 参数由 calculateInPlaneDesign 传入：
  { Gwall, GlineTotal, QlineTotal, Ngravity, seismicGravity, psiE,
    lintelReaction, lintelEcc }
========================================================================== */
export function calculateBoundaryElementNM(input, ctx = {}) {
  /* ---- Availability guard（无边缘构件或参数缺失时跳过，视为通过） ---- */
  const hasBoundary = input.hasBoundaryElement !== false;
  const bw = positive(input.boundaryWidth);                                  // m（弯曲方向高度）
  const bt = positive(input.boundaryThickness, positive(input.wallThickness)); // m（截面宽度）
  const nBars = positive(input.boundaryBarCount);
  const barDia = positive(input.boundaryBarDiameter);

  if (!hasBoundary || !(bw > 0) || !(bt > 0) || !(nBars > 0) || !(barDia > 0)) {
    return {
      available: false,
      section: { bw, bt, AsTotal: 0 },
      keyPoints: {}, curveNominal: [], curveDesign: [],
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

  const hc = bw * 1000;                                    // mm（弯曲方向高度）
  const bc = bt * 1000;                                    // mm（截面宽度）
  const Agc = bc * hc;                                     // mm²
  const AsTotal = nBars * areaBar(barDia);                 // mm²
  const AsLayer = AsTotal / 2;                             // 两层对称近似
  const dPrime = positive(input.cover) + positive(input.boundaryTieDiameter) + barDia / 2;
  const d = Math.max(hc - dPrime, 1);                      // mm

  /* ---- Pure compression（纯压承载力 P0） ---- */
  const P0 = 0.85 * fc * Math.max(Agc - AsTotal, 0) + fy * AsTotal;   // N
  const phiP0 = phiC * P0 / 1000;                                     // kN

  /* ---- Balanced point（平衡点中性轴深度） ---- */
  const cb = (epsCU / (epsCU + fy / Math.max(Es, 1))) * d;

  /* ---- Section analysis: 给定中性轴深度 c → (N [kN], M [kN·m])
         轴力以压为正；钢筋应力按平截面应变 × Es，限幅 ±fy ---- */
  const sectionForce = (cRaw) => {
    const c = Math.max(cRaw, 0.001);
    const a = Math.min(beta1 * c, hc);                              // 等效应力块高度
    const Cc = 0.85 * fc * bc * a;                                  // N（混凝土压力）
    const steelStress = depth => clamp(Es * epsCU * (depth - c) / c, -fy, fy);
    const Fs1 = steelStress(dPrime) * AsLayer;                      // N（拉为正）
    const Fs2 = steelStress(d) * AsLayer;                           // N（拉为正）
    const Nn = Cc - Fs1 - Fs2;                                      // N（压为正）
    const Mn = Cc * (hc / 2 - a / 2)
      + (-Fs1) * (hc / 2 - dPrime)
      + (-Fs2) * (hc / 2 - d);                                      // N·mm（对形心取矩）
    return { N: Nn / 1000, M: Math.abs(Mn) / 1e6 };
  };

  /* ---- Log-spaced neutral-axis sweep → 名义曲线 ---- */
  const sweep = [];
  const nSteps = 64;
  const cMin = 0.02 * hc;
  const cMax = 8.0 * hc;
  for (let i = 0; i < nSteps; i++) {
    const c = cMin * Math.pow(cMax / cMin, i / (nSteps - 1));
    sweep.push(sectionForce(c));
  }
  const bal = sectionForce(cb);
  const Nb = bal.N;                                                 // kN（平衡点轴力）

  /* ---- ϕ(N)：受压控制区 ϕc，自 Nb 线性过渡至 ϕf（N → 0） ---- */
  const phiAt = (N) => {
    if (!(Nb > 0)) return phiC;
    const tRatio = clamp((Nb - N) / Nb, 0, 1);
    return phiC + (phiF - phiC) * tRatio;
  };

  /* ---- Assemble curves（按 N 降序排列，便于内插） ---- */
  const nominalRaw = [{ N: P0 / 1000, M: 0 }, ...sweep];
  const designRaw = [
    { N: phiP0, M: 0 },
    ...sweep.map(p => { const phi = phiAt(p.N); return { N: phi * p.N, M: phi * p.M }; })
  ];
  const sortByN = arr => [...arr].sort((p, q) => q.N - p.N);

  /* 在 N = 0 处内插补入纯弯点（曲线与 M 轴的交点） */
  const appendZeroPoint = (curve) => {
    for (let i = 0; i + 1 < curve.length; i++) {
      const p1 = curve[i];
      const p2 = curve[i + 1];
      if (p1.N >= 0 && p2.N <= 0 && (p1.N - p2.N) > 1e-9) {
        const t = p1.N / (p1.N - p2.N);
        curve.push({ N: 0, M: p1.M + t * (p2.M - p1.M) });
        return curve;
      }
    }
    return curve;
  };

  const curveNominal = appendZeroPoint(sortByN(nominalRaw));
  const curveDesign = appendZeroPoint(sortByN(designRaw));
  const M0 = curveNominal.length ? curveNominal[curveNominal.length - 1].M : 0;
  const phiM0 = curveDesign.length ? curveDesign[curveDesign.length - 1].M : 0;

  /* ---- Moment capacity at given N（设计曲线等轴力线性内插） ---- */
  const momentCapacityAt = (Nd) => {
    const curve = curveDesign;
    if (!Number.isFinite(Nd) || curve.length === 0) return 0;
    if (Nd > curve[0].N) return 0;                                  // 超出 φP0
    for (let i = 0; i + 1 < curve.length; i++) {
      const p1 = curve[i];
      const p2 = curve[i + 1];
      if (Nd <= p1.N && Nd >= p2.N) {
        const t = (p1.N - Nd) / Math.max(p1.N - p2.N, 1e-9);
        return p1.M + t * (p2.M - p1.M);
      }
    }
    return curve[curve.length - 1].M;
  };

  /* ---- Demand envelope（需求包络）
         Lintel 反力 R 作用于墙边边缘构件，偏心 e → 局部弯矩 R·e；
         重力按边缘构件面积占比 r = A_b / A_g 分配。三种组合取包络。 ---- */
  const lintelReaction = positive(ctx.lintelReaction);
  const lintelEcc = finite(ctx.lintelEcc);
  const psiE = positive(ctx.psiE, 0.30);
  const Ag_m2 = positive(input.wallWidth) * positive(input.wallThickness);
  const Ab_m2 = bw * bt;
  const r = Ag_m2 > 0 ? Ab_m2 / Ag_m2 : 0;
  const Gb = r * (finite(ctx.Gwall) + finite(ctx.GlineTotal));      // kN
  const Qb = r * finite(ctx.QlineTotal);                            // kN
  const eAbs = Math.abs(lintelEcc);                                 // m

  const demandCases = [
    { key: 'D0', label: '1.35G (permanent)',       N: 1.35 * (Gb + lintelReaction),                  M: 1.35 * lintelReaction * eAbs },
    { key: 'D1', label: '1.2G + 1.5Q (gravity)',   N: 1.2 * Gb + 1.5 * Qb + 1.5 * lintelReaction,    M: 1.5 * lintelReaction * eAbs },
    { key: 'D2', label: 'G + ψeQ + R (seismic)',   N: Gb + psiE * Qb + lintelReaction,               M: lintelReaction * eAbs }
  ];
  const demands = demandCases.map(pt => {
    const Mcap = momentCapacityAt(pt.N);
    const UR = Mcap > 1e-9 ? pt.M / Mcap : (pt.M > 1e-9 ? Infinity : 0);
    return { ...pt, Mcap, UR };
  });
  const governing = demands.length
    ? demands.reduce((acc, p) => (p.UR > acc.UR ? p : acc), demands[0])
    : { key: '-', label: '-', N: 0, M: 0, Mcap: 0, UR: 0 };

  const axialOK = demands.every(p => p.N <= phiP0 + 1e-6);
  const pass = axialOK && Number.isFinite(governing.UR) && governing.UR <= 1;

  return {
    available: true,
    section: { bw, bt, bc, hc, Agc, AsTotal, AsLayer, nBars, barDia, dPrime, d, beta1 },
    keyPoints: {
      P0: P0 / 1000, phiP0,
      cb, Nb, Mb: bal.M, phiNb: phiC * Nb, phiMb: phiC * bal.M,
      M0, phiM0
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
IN-PLANE CALCULATION
Uses unified geometry: wallWidth / wallHeight / wallThickness
Uses unified reinforcement: VbarDia / VbarSpace / HbarDia / HbarSpace
In-plane specific: diaphragmWindForce / diaphragmSeismicForce (at wall top)
Gravity: gLine / qLine are pressures (kPa), Sr = tributary range

与 PanelWallInPlaneDesign.jsx 的对应关系：
  PanelWall 直接输入线荷载 (kN/m)；本引擎 gLine/qLine 为压力 (kPa)，
  线荷载 = 压力 × Sr，两者通过 Sr 等价换算。
  PanelWall 用显式钢筋根数；本引擎按间距推算
  n = floor(b×1000 / spacing) + 1。
  其余公式（C/Cd、V*、M*、弹性应力、承压、N-M、抗剪）与参考一致。
========================================================================== */
export function calculateInPlaneDesign(input) {
  const b = positive(input.wallWidth);
  const h = positive(input.wallHeight);
  const t = positive(input.wallThickness);
  const gamma = positive(input.concreteDensity, 24);
  const fc = positive(input.fc);
  const fy = positive(input.fy);

  /* Gravity loads: pressures × tributary range = line loads */
  const Sr = positive(input.Sr, 1);
  const gPressure = positive(input.gLine);
  const qPressure = positive(input.qLine);
  const gLineLoad = gPressure * Sr;   // kN/m
  const qLineLoad = qPressure * Sr;   // kN/m

  const lintelReaction = positive(input.lintelReaction);
  const lintelEcc = finite(input.lintelEccentricity);

  /* Diaphragm forces at wall top */
  const diaphragmWindForce = positive(input.diaphragmWindForce);
  const diaphragmSeismicForce = positive(input.diaphragmSeismicForce);

  /* Geometry */
  const Ag = b * 1000 * t * 1000;
  const I = b * 1000 * Math.pow(t * 1000, 3) / 12;
  const Zg = Math.pow(b * 1000, 2) * (t * 1000) / 6;

  /* Self weight */
  const Gwall = gamma * t * h * b;
  const GwallPerM = b > 0 ? Gwall / b : 0;
  const GlineTotal = gLineLoad * b;
  const QlineTotal = qLineLoad * b;

  /* Gravity-only ULS */
  const Ngravity = 1.2 * (Gwall + GlineTotal) + 1.5 * QlineTotal;

  /* Seismic coefficient */
  const Z = positive(input.hazardFactor);
  const Ru = positive(input.returnPeriodFactor, 1);
  const Sp = finite(input.structuralPerformanceFactor, 1.3 - 0.3 * positive(input.ductility, 1));
  const mu = Math.max(positive(input.ductility, 1), 1);
  const Ch = positive(input.siteCoefficient);
  const Nt = positive(input.nearFaultFactor, 1);
  const Wt = positive(input.seismicWeight);
  const C = Ch * Z * Ru * Nt;
  const Cd = mu > 0 ? C * Sp / mu : 0;
  const Vseismic = Cd * Wt * positive(input.seismicDistributionFactor, 1);
  const Mseismic = Vseismic * h;

  /* Diaphragm forces: act at wall top, produce moment = F × h */
  const VdiaphragmWind = diaphragmWindForce;
  const VdiaphragmSeismic = diaphragmSeismicForce;
  const MdiaphragmWind = VdiaphragmWind * h;
  const MdiaphragmSeismic = VdiaphragmSeismic * h;

  /* Gravity + seismic */
  const psiE = positive(input.psiE, 0.30);
  const seismicGravity = Gwall + GlineTotal + psiE * QlineTotal;
  const NseismicCompression = seismicGravity + lintelReaction;
  const NseismicTension = seismicGravity - lintelReaction;

  /* Lintel eccentricity */
  const Mlintel = lintelReaction * lintelEcc;

  /* Total actions: seismic + diaphragm + lintel */
  const Mtotal = Mseismic + Math.max(MdiaphragmWind, MdiaphragmSeismic) + Mlintel;
  const Vtotal = Vseismic + Math.max(VdiaphragmWind, VdiaphragmSeismic);

  /* Elastic stress distribution */
  const sigmaN = Ag > 0 ? kNToN(NseismicCompression) / Ag : 0;
  const sigmaM = Zg > 0 ? kNmToNmm(Mtotal) / Zg : 0;
  const sigmaMax = sigmaN + sigmaM;
  const sigmaMin = sigmaN - sigmaM;
  const eccentricity = NseismicCompression > 0 ? Mtotal / NseismicCompression : 0;
  const kern = b / 6;

  /* Slenderness */
  const aspectRatio = b > 0 ? h / b : 0;
  const outOfPlaneSlenderness = t > 0 ? h / t : 0;
  let wallClassification = 'Intermediate wall';
  if (aspectRatio < 1.0) wallClassification = 'Squat wall';
  else if (aspectRatio > 2.0) wallClassification = 'Slender wall';

  /* Lintel bearing */
  const bearingArea = (positive(input.bearingWidth) / 1000) * (positive(input.bearingLength) / 1000);
  const bearingStress = bearingArea > 0 ? kNToN(lintelReaction) / (bearingArea * 1e6) : 0;
  const bearingCapacity = 0.6 * Math.sqrt(fc) * 1000;
  const bearingRatio = bearingCapacity > 0 ? bearingStress / bearingCapacity : 0;

  /* Reinforcement – unified（间距推算根数，替代 PanelWall 的显式根数输入） */
  const vBarArea = areaBar(positive(input.VbarDia));
  const nVerticalBars = positive(input.VbarSpace) > 0
    ? Math.floor(b * 1000 / positive(input.VbarSpace)) + 1
    : 0;
  const AsDistributed = nVerticalBars * vBarArea;
  const rhoVertical = Ag > 0 ? AsDistributed / Ag : 0;

  const hBarArea = areaBar(positive(input.HbarDia));
  const AsHorizontalPerM = positive(input.HbarSpace) > 0
    ? hBarArea * 1000 / positive(input.HbarSpace)
    : 0;

  /* Boundary element */
  const AsBoundary = positive(input.boundaryBarCount) * areaBar(positive(input.boundaryBarDiameter));
  const boundaryArea = (positive(input.boundaryWidth) * 1000) * (positive(input.boundaryThickness, t) * 1000);
  const rhoBoundary = boundaryArea > 0 ? AsBoundary / boundaryArea : 0;
  const boundarySteelTensionCapacity = AsBoundary * fy / 1000;

  /* Simplified N-M interaction estimate（与 PanelWall 参考实现一致） */
  const d = t * 1000 - positive(input.cover) - positive(input.boundaryBarDiameter) / 2;
  const compressionBlockWidth = positive(input.boundaryWidth) * 1000;
  const alpha1 = 0.85;
  const As = AsBoundary;
  const compressionConcrete = alpha1 * fc * compressionBlockWidth * Math.min(d, compressionBlockWidth);
  const steelCompression = As * fy;
  const phiPn = positive(input.phiCompression, 0.75) * (compressionConcrete + steelCompression) / 1000;
  const MnApprox = (compressionConcrete * Math.max(d / 2, 1) + steelCompression * Math.max(d / 2, 1)) / 1e6;
  const phiMn = positive(input.phiFlexure, 0.80) * MnApprox;
  const axialRatio = phiPn > 0 ? NseismicCompression / phiPn : 0;
  const momentRatio = phiMn > 0 ? Mtotal / phiMn : 0;
  const interactionRatio = axialRatio + momentRatio;

  /* Shear */
  const bw = t * 1000;
  const dv = 0.8 * d;
  const vc = 0.17 * Math.sqrt(fc) * bw * dv / 1000;
  const phiVc = positive(input.phiShear, 0.75) * vc;
  const VsRequired = max0(Vtotal - phiVc);
  const horizontalSpacing = Math.max(positive(input.HbarSpace), 1);
  const VsProvided = 2 * hBarArea * fy * dv / horizontalSpacing / 1000;
  const shearCapacity = phiVc + positive(input.phiShear, 0.75) * VsProvided;
  const shearRatio = shearCapacity > 0 ? Vtotal / shearCapacity : 0;

  /* Foundation / base */
  const foundationShear = Vtotal;
  const foundationMoment = Mtotal;
  const tensionDemand = max0(-NseismicTension);

  /* v0.6.2 —— 边缘构件局部 N-M（Lintel 反力作用于墙边时的压弯验算） */
  const boundaryNM = calculateBoundaryElementNM(input, {
    Gwall, GlineTotal, QlineTotal, Ngravity, seismicGravity, psiE,
    lintelReaction, lintelEcc
  });

  /* Pass / warning */
  const stressCompressionPass = sigmaMax <= 0.6 * fc;
  const bearingPass = bearingRatio <= 1.0;
  const interactionPass = interactionRatio <= 1.0;
  const shearPass = shearRatio <= 1.0;
  const tensionPass = boundarySteelTensionCapacity >= tensionDemand;
  const slendernessWarning = outOfPlaneSlenderness > 25;
  const boundaryNMPass = boundaryNM.checks.pass;   // v0.6.2

  return {
    geometry: { b, h, t, Ag, I, Zg },
    gravity: {
      Gwall, GwallPerM, GlineTotal, QlineTotal, Ngravity,
      gPressure, qPressure, Sr, gLineLoad, qLineLoad
    },
    seismic: { C, Cd, Vseismic, Mseismic, Wt, Z, Ru, Sp, mu, Ch, Nt },
    diaphragm: {
      VdiaphragmWind, VdiaphragmSeismic,
      MdiaphragmWind, MdiaphragmSeismic
    },
    sectionActions: {
      seismicGravity,
      NseismicCompression,
      NseismicTension,
      Mlintel,
      Mtotal,
      Vtotal
    },
    elasticStress: { sigmaN, sigmaM, sigmaMax, sigmaMin, eccentricity, kern },
    slenderness: { aspectRatio, outOfPlaneSlenderness, wallClassification },
    bearing: { bearingArea, bearingStress, bearingCapacity, bearingRatio },
    reinforcement: {
      nVerticalBars, vBarArea, hBarArea,
      AsDistributed, rhoVertical, AsHorizontalPerM,
      AsBoundary, boundaryArea, rhoBoundary,
      boundarySteelTensionCapacity, d
    },
    interaction: {
      compressionConcrete, steelCompression, phiPn, MnApprox, phiMn,
      axialRatio, momentRatio, interactionRatio
    },
    shear: { bw, dv, vc, phiVc, VsRequired, VsProvided, shearCapacity, shearRatio },
    foundation: { foundationShear, foundationMoment, tensionDemand },
    boundaryNM,   // v0.6.2 —— 边缘构件局部 N-M 交互（曲线 + 需求包络 + UR）
    checks: {
      stressCompressionPass, bearingPass, interactionPass,
      shearPass, tensionPass, slendernessWarning,
      boundaryNMPass   // v0.6.2
    }
  };
}

/* ============================================================================
OUT-OF-PLANE CALCULATION
Uses unified geometry: wallWidth / wallHeight / wallThickness → Lw / Hw / tw
hroof is validated and clamped
Gravity: gLine / qLine / wwd are pressures, Sr = tributary range
Includes additional point force & moment for canopy / attachments

v0.5 修正：支承条件系数现在真正代入弯矩计算。
基准（与参考实现一致）：
  Wind & Seismic 中部弯矩 = wL²/8   （Pinned–Pinned）
  Wind & Seismic 底部弯矩 = wL²/8   （Pinned–Pinned）
  Fire 底部弯矩           = wL²/2   （Fixed–Free 悬臂）
所选支承条件通过调整系数对上述基准进行缩放：
  wsMidAdjust  = k_mid(selected)  / (1/8)
  wsBaseAdjust = k_base(selected) / (1/8)
  fireAdjust   = k_base(fire)     / (1/2)
默认支承条件下三个系数均为 1，结果与参考实现完全一致。
注意：Vs（水平筋抗剪贡献）使用 Hspace —— 参考文件中误用 Vspace，
此处为有意修正。

v0.6 修正：OOP 地震作用不再使用直接输入的 CdT1 / CdTE 系数，
改为按 AS/NZS 1170.5:2004 第 8 章（Parts and components）计算：
  Fp = Cp × H × Wp        （§8.4.2.2 / §8.5.1）
  H  = 1 + 2(hx/hn)       （§8.4.2.3）
  Wp = γc × tw × hroof    （每延米墙板重量）
  均布压力 WE = Fp / hroof = Cp × H × γc × tw。
========================================================================== */
export function calculateOutOfPlaneDesign(input) {
  /* Unified geometry → OOP variables */
  const Hw = positive(input.wallHeight) * 1000;
  const Lw = positive(input.wallWidth) * 1000;
  const tw = positive(input.wallThickness) * 1000;
  const tf = positive(input.tf);
  const Lf = positive(input.Lf);
  const ts = positive(input.ts);
  const fo = positive(input.fo);
  const ds = positive(input.ds);

  /* hroof validation */
  const { hroofEffective, hroofMax, hroofValid } = validateHroof(input);
  const hroof = hroofEffective;

  const gs = positive(input.gs, 18);
  const gc = positive(input.concreteDensity, 24);
  const fy = positive(input.fy);
  const fyMesh = positive(input.fyMesh);
  const fc = positive(input.fc);
  const Es = positive(input.Es, 200000);

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

  /* 支承条件弯矩调整系数（相对参考基准 wL²/8 与 wL²/2） */
  const wsMidAdjust = wsFactors.mid / (1 / 8);
  const wsBaseAdjust = wsFactors.base / (1 / 8);
  const fireAdjust = fireFactors.base / (1 / 2);

  /* Unified gravity loads: pressures × Sr = line loads */
  const Sr = positive(input.Sr, 1);
  const gPressure = positive(input.gLine);
  const qPressure = positive(input.qLine);
  const wwdPressure = positive(input.wwd);
  const wd = gPressure * Sr;          // kN/m line load
  const wq = qPressure * Sr;          // kN/m line load
  const wwdLine = wwdPressure * Sr;   // kN/m line load (roof wind)

  /* OOP specific loads */
  const wwf = positive(input.wwf);
  const qU = positive(input.qU);
  const wf = positive(input.wf);
  const th = positive(input.th);

  /* OOP additional point loads */
  const F_add = positive(input.additionalForce);
  const h_force = positive(input.additionalForceHeight);
  const M_add = positive(input.additionalMoment);
  const h_moment = positive(input.additionalMomentHeight);

  const Ec = 3320 * Math.sqrt(Math.max(fc, 0)) + 6900;
  const n = Ec > 0 ? Es / Ec : 0;
  const Ag = tw * 1000;
  const d = 0.5 * tw;
  const Ig = Math.pow(tw, 3) / 12;
  const Iw = Lw * Ig;
  const Z = (Lw * Math.pow(tw, 2)) / 6;

  const AWV = (Math.PI * Math.pow(Vbar, 2) / 4) * (1000 / Vspace);
  const AWS = Lw * AWV;
  const AWH = (Math.PI * Math.pow(Hbar, 2) / 4) * (1000 / Hspace);
  const AWF = (Math.PI * Math.pow(Fbar, 2) / 4) * (1000 / Fspace);
  const Tmesh = (AsMesh * fyMesh) / 1000;
  const rhoV = tw > 0 ? AWV / tw : 0;
  const rhoH = tw > 0 ? AWH / tw : 0;

  /* Gravity actions（自重项公式形式与参考实现完全一致） */
  const Wd_line = wd;
  const Wq_line = wq;
  const wallHeightAboveFooting = Math.max(Hw - tf, 0);
  const NSW = (tw / 1000) * (wallHeightAboveFooting / 2) * gc;
  const NFF = (Math.max(Lf, 0) * (tf / 1000) * gc);
  const slabWidth = Math.max(Lf + 2 * fo, 0);
  const NSF = slabWidth * (ts / 1000) * gc;
  const NHF = slabWidth * (ds / 1000) * gs;
  const N_GE = NSW + NFF + NSF + NHF + Wd_line;
  const Nmax = Math.max(1.35 * N_GE, 1.2 * N_GE + 1.5 * Wq_line);

  /* Seismic / wind actions —— AS/NZS 1170.5:2004 Chapter 8 (Parts and components)
     墙体作为 part 承受平面外地震作用（§8.4.2.2 / §8.5.1）：
       Fp = Cp × H × Wp
       H  = 1 + 2(hx/hn)                    （§8.4.2.3 高度放大系数）
       Wp = γc × tw × hroof                 （每延米墙板重量，kN/m）
     将 Fp 沿 hroof 均布得到等效压力：
       WE = Fp / hroof = Cp × H × γc × tw   （kPa）
     v0.6：取代旧版直接输入的 CdT1 / CdTE 系数。 */
  const partCp = positive(input.partResponseCoefficient, 0.75);
  const partHx = positive(input.partHeightHx);
  const partHn = positive(input.buildingHeightHn);
  const partH = partHn > 0 ? 1 + 2 * Math.min(partHx / partHn, 1) : 1;
  const Wp_panel = gc * (tw / 1000) * hroof;        // kN per metre wall length
  const Fp_panel = partCp * partH * Wp_panel;       // kN per metre wall length
  const WE_T1 = partCp * partH * gc * (tw / 1000);  // kPa（保留旧变量名以兼容下游）
  const WE_TE = WE_T1;                              // 单一 part 系数，两个旧名取同值
  const WE = Math.max(WE_T1, WE_TE);

  const x_m = hroof / 2;
  const effectiveRoofHeight = Math.max(hroof, 0.001);
  const ME = (WE * x_m * (Math.pow(effectiveRoofHeight, 2) - x_m * effectiveRoofHeight)) / (2 * effectiveRoofHeight);
  const WindPressure = Math.max(wwdPressure, wwf);
  const MW = (WindPressure * x_m * (Math.pow(effectiveRoofHeight, 2) - x_m * effectiveRoofHeight)) / (2 * effectiveRoofHeight);

  /* —— 中部弯矩：参考基准 wL²/8 × 支承调整系数 —— */
  let Ma = Math.max(ME, MW) * wsMidAdjust;
  const Na = N_GE;
  const hroof_mm = hroof * 1000;

  /* Additional point loads（叠加在支承调整之后） */
  const M_add_mid_F = F_add * Math.max(h_force - x_m, 0);
  const M_add_mid_M = M_add;
  Ma = Ma + M_add_mid_F + M_add_mid_M;

  /* —— 底部弯矩：参考基准 wL²/8 × 支承调整系数 —— */
  const baseLeverArm = Math.max((Hw / 1000) - hroof - (tf / 1000), 0);
  let MbE = ((WE * (Math.pow(hroof, 2) - 2 * Math.pow(baseLeverArm, 2))) / 8) * wsBaseAdjust;
  let MbW = ((WindPressure * (Math.pow(hroof, 2) - 2 * Math.pow(baseLeverArm, 2))) / 8) * wsBaseAdjust;
  const M_add_base_F = F_add * h_force;
  const M_add_base_M = M_add;
  MbE = MbE + M_add_base_F + M_add_base_M;
  MbW = MbW + M_add_base_F + M_add_base_M;

  /* Flexural capacity */
  const Ts = (AWS * fy) / 1000;
  const aDen = 0.85 * fc * Lw * 1000;
  const a = aDen > 0 ? (Ts * 1000) / aDen : 0;
  const c = a / 0.85;
  const k = d > 0 ? a / (0.85 * d) : 0;
  const phiMn = (0.85 * AWV * fy * (d - a / 2)) / 1e6;

  const Ase = fy > 0 ? (N_GE * 1000 + AWV * fy) / fy : 0;
  const Icr = n * Ase * Math.pow(d - k * d, 2) + Math.pow(k * d, 3) / 3;
  const pDeltaDen = 0.75 * 48 * Ec * Icr;
  const pDeltaFactor = pDeltaDen > 0 ? (5 * Na * Math.pow(hroof_mm, 2)) / pDeltaDen : 0;
  const pDeltaDenominator = 1 - pDeltaFactor;
  const M_prime = Math.abs(pDeltaDenominator) > 1e-9 ? Ma / pDeltaDenominator : Infinity;
  const delta_u = pDeltaDen > 0 ? (5 * M_prime * Math.pow(hroof_mm, 2)) / pDeltaDen : Infinity;
  const UR1 = phiMn > 0 ? M_prime / phiMn : Infinity;
  const UR2 = phiMn > 0 ? Math.max(MbE, MbW) / phiMn : Infinity;

  /* ======================================================================
     FIRE (UR3) – uses supportFire
     Base formula: M = w × L² × fireFactors.base
     参考实现采用 wL²/2（悬臂）。此处以 wL²/2 为基准乘以 fireAdjust。
     ====================================================================== */
  const hs = Math.max((Hw - tf - ds - ts) / 1000, 0);
  const xt = Math.max(tw / 2 - Vbar / 2 - Hbar, 0.001);
  const etax = 0.16 * Math.log(Math.max(th, 0.001) * Math.pow(xt / 1000, -2)) - 0.65;
  const etaw = 1 - 0.162 * Math.pow(Math.max(th, 0.001), -0.6);
  const Tf = 660;
  const Tfs = etax * etaw * Tf;
  const fyt = Math.min(Math.max(((720 - Tfs) / 470) * fy, 0), fy);
  const Ts_fire = (AWS * fyt) / 1000;
  const a_fireDen = 0.85 * fc * Lw * 1000;
  const a_fire = a_fireDen > 0 ? (Ts_fire * 1000) / a_fireDen : 0;
  const phiMn_fire = (0.85 * AWV * fyt * (d - a_fire / 2)) / 1e6;
  const Mbf = ((wf * Math.pow(Math.max((Hw - tf) / 1000, 0), 2)) / 2) * fireAdjust;
  const UR3 = phiMn_fire > 0 ? Mbf / phiMn_fire : Infinity;

  /* Shear —— Vs 使用 Hspace（参考文件误用 Vspace，此处为修正）
     v0.6：VE 改由 part 均布压力 WE 推算（取代旧 CdT1/CdTE 形式） */
  const VE_T1 = (5 / 8) * WE * ((Hw - tf) / 1000);
  const VE_TE = VE_T1;
  let VE = Math.max(VE_T1, VE_TE) + F_add;
  let Vw = (5 / 8) * WindPressure * ((Hw - tf) / 1000) + F_add;
  const vc1 = 0.25 * Math.sqrt(Math.max(fc, 0)) + (Ag > 0 ? Na / (4 * Ag) : 0);
  const Vc = (vc1 * d) / 1000;
  const Vs = (AWH * fy * d) / Hspace / 1000;
  const phiVw = 0.75 * (Vc + Vs);
  const Vprime = Math.max(VE, Vw);
  const UR4 = phiVw > 0 ? Vprime / phiVw : Infinity;

  /* Foundation */
  const Wsum = Math.max(N_GE + Wq_line, 0.001);
  const lateralResultant = Math.max(Ma, 0);
  const Mo = lateralResultant * Math.max(hroof, 0);
  const footingWidth = Math.max(Lf + 2 * fo, 0.001);
  const foundationLeverArm = footingWidth / 2;
  const MR_weight = Wsum * foundationLeverArm;
  const X = Wsum > 0 ? ((MR_weight - Mo) / Wsum) * 1000 : 0;
  const Xclamped = Math.max(0, Math.min(footingWidth * 1000, X));
  const LBR = Math.max(2 * Math.min(Xclamped, footingWidth * 1000 / 2), 1);
  const qd = Wsum / (LBR / 1000);
  const qD = 0.5 * qU;
  const UR5 = qD > 0 ? qd / qD : Infinity;

  const foot_d = Math.max(tf - cover - Fbar / 2, 1);
  const footCompressionBlock = (AWF * fy) / (2 * Math.max(0.85 * fc * 1000, 1));
  const phiMn_foot = (0.85 * AWF * fy * Math.max(foot_d - footCompressionBlock, 0)) / 1e6;
  const foundationMoment = Mo;
  const UR6 = phiMn_foot > 0 ? foundationMoment / phiMn_foot : Infinity;

  const overallOK = [UR1, UR2, UR3, UR4, UR5, UR6].every((ur) => Number.isFinite(ur) && ur <= 1);

  return {
    Ec, n, Ag, d, Ig, Iw, Z, AWV, AWS, AWH, AWF, Tmesh, rhoV, rhoH,
    Wd_line, Wq_line, NSW, NFF, NSF, NHF, N_GE, Nmax,
    WE_T1, WE_TE, WE, x_m, ME, MW, WindPressure, Ma, Na,
    Ts, a, c, k, phiMn, Ase, Icr, M_prime, delta_u, UR1,
    MbE, MbW, UR2,
    hs, xt, etax, etaw, Tfs, fyt, Ts_fire, a_fire, phiMn_fire, Mbf, UR3,
    VE_T1, VE_TE, VE, Vw, vc1, Vc, Vs, phiVw, Vprime, UR4,
    Mo, Wsum, MR_weight, footingWidth, X: Xclamped, LBR, qd, qD, UR5,
    foot_d, foundationMoment, phiMn_foot, UR6,
    overallOK,
    /* v0.6 新增：AS/NZS 1170.5 Chapter 8 part 地震作用 */
    partSeismic: { Cp: partCp, hx: partHx, hn: partHn, H: partH, Wp: Wp_panel, Fp: Fp_panel, WE },
    /* hroof validation result */
    hroofValidation: { hroofEffective, hroofMax, hroofValid },
    /* v0.5 新增：支承条件信息（供界面显示） */
    supportConditions: {
      windSeismic: supportWS,
      fire: supportFire,
      windSeismicFactors: wsFactors,
      fireFactors,
      wsMidAdjust,
      wsBaseAdjust,
      fireAdjust
    },
    /* Additional load effects */
    additionalLoads: {
      F_add, h_force, M_add, h_moment,
      M_add_mid_F, M_add_mid_M, M_add_base_F, M_add_base_M
    }
  };
}

/* ============================================================================
CONNECTION DESIGN（v0.5 新增）
底部连接（锚筋 + 灌浆）简化力学模型，与参考引擎的“连接未计算”缺口对应：
  剪力需求      V* = max(平面内 V*, 平面外 V' × b)
  锚筋钢材抗剪  V_steel = n × 0.6 × A_d × f_y
  灌浆粘结锚固  V_bond  = n × π × φ × l_emb × 0.35√f'_g
  锚筋抗剪取小  V_dowel = min(V_steel, V_bond)
  剪切摩擦      V_fric  = μ × N*（仅压力有利）
  剪力键        有剪力键时附加 15% × V_steel（简化）
  抗拔          T_n = n × A_d × f_y
  灌浆垫承压    σ = N* / (b × t) ≤ 0.6√f'_g
========================================================================== */
export function calculateConnectionDesign(input, inPlane, outOfPlane) {
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

  /* ---- Demand ---------------------------------------------------------- */
  const VinPlane = positive(inPlane?.sectionActions?.Vtotal);      // kN（整墙）
  const VoutPerM = positive(outOfPlane?.Vprime);                   // kN/m
  const VoutTotal = VoutPerM * b;                                  // kN
  const Vstar = Math.max(VinPlane, VoutTotal);
  const Nstar = positive(inPlane?.sectionActions?.NseismicCompression);
  const Tstar = positive(inPlane?.foundation?.tensionDemand);

  /* ---- Dowel shear（钢材 vs 灌浆粘结锚固取小） ------------------------ */
  const VdowelSteel = (nDowel * 0.6 * Ad * fy) / 1000;             // kN
  const bondArea = nDowel * Math.PI * dDowel * embedment;          // mm²
  const tauBond = 0.35 * Math.sqrt(Math.max(fgrout, 0));           // MPa
  const VgroutBond = (bondArea * tauBond) / 1000;                  // kN
  const Vdowel = Math.min(VdowelSteel, VgroutBond);

  /* ---- Shear friction + shear key -------------------------------------- */
  const Vfriction = muFriction * Nstar;
  const VshearKey = shearKey ? 0.15 * VdowelSteel : 0;
  const Vn = Vdowel + Vfriction + VshearKey;
  const phiVconn = phiConn * Vn;
  const shearRatio = phiVconn > 0 ? Vstar / phiVconn : (Vstar > 0 ? Infinity : 0);

  /* ---- Uplift / tension ------------------------------------------------- */
  const Tn = (nDowel * Ad * fy) / 1000;
  const phiTconn = phiConn * Tn;
  const tensionRatio = phiTconn > 0 ? Tstar / phiTconn : (Tstar > 0 ? Infinity : 0);

  /* ---- Grout bed bearing ------------------------------------------------- */
  const Abearing = (b * 1000) * (t * 1000);                        // mm²
  const sigmaBearing = Abearing > 0 ? (Nstar * 1000) / Abearing : 0; // MPa
  const bearingCapacity = 0.6 * Math.sqrt(Math.max(fgrout, 0));      // MPa
  const bearingRatio = bearingCapacity > 0 ? sigmaBearing / bearingCapacity : 0;

  const shearPass = Number.isFinite(shearRatio) && shearRatio <= 1;
  const tensionPass = Number.isFinite(tensionRatio) && tensionRatio <= 1;
  const bearingPass = Number.isFinite(bearingRatio) && bearingRatio <= 1;
  const overallPass = shearPass && tensionPass && bearingPass;

  return {
    demand: { VinPlane, VoutPerM, VoutTotal, Vstar, Nstar, Tstar },
    dowel: { Ad, nDowel, dDowel, embedment, VdowelSteel, bondArea, tauBond, VgroutBond, Vdowel },
    friction: { muFriction, Vfriction, shearKey, shearKeyDepth, VshearKey },
    capacity: { Vn, phiVconn, Tn, phiTconn },
    bearing: { Abearing, sigmaBearing, bearingCapacity, bearingRatio },
    ratios: { shearRatio, tensionRatio, bearingRatio },
    checks: { shearPass, tensionPass, bearingPass, overallPass },
    phiConn
  };
}

/* ============================================================================
IN-PLANE FOUNDATION DESIGN（v0.5 新增）
平面内基础简化验算（条形基础，弯矩绕墙长度方向的截面模量）：
  G_foot   = γc × B × L × t_foot
  N_total  = N* + G_foot
  q_max    = N_total / A + M* / Z_foot
  q_min    = N_total / A - M* / Z_foot
  bearing  = q_max / q_allow
  sliding  = V* / (μ × N_total)
========================================================================== */
export function calculateFoundationDesign(input, inPlane) {
  const B = positive(input.footingWidth);                 // m（垂直墙面方向）
  const L = positive(input.footingLength);                // m（沿墙长度方向）
  const tf = positive(input.footingThickness);            // m
  const qAllow = positive(input.allowableBearingPressure, 150); // kPa
  const mu = positive(input.frictionCoefficient, 0.5);
  const gamma = positive(input.concreteDensity, 24);

  const Nstar = positive(inPlane?.sectionActions?.NseismicCompression);
  const Mstar = positive(inPlane?.sectionActions?.Mtotal);
  const Vstar = positive(inPlane?.sectionActions?.Vtotal);

  const Gfooting = gamma * B * L * tf;                    // kN
  const Ntotal = Nstar + Gfooting;
  const A = B * L;                                        // m²
  const Zfoot = (B * L * L) / 6;                          // m³

  const qMax = A > 0 ? Ntotal / A + (Zfoot > 0 ? Mstar / Zfoot : 0) : 0;
  const qMin = A > 0 ? Ntotal / A - (Zfoot > 0 ? Mstar / Zfoot : 0) : 0;
  const bearingRatio = qAllow > 0 ? qMax / qAllow : (qMax > 0 ? Infinity : 0);

  const slidingResistance = mu * Ntotal;
  const slidingRatio = slidingResistance > 0 ? Vstar / slidingResistance : (Vstar > 0 ? Infinity : 0);

  const bearingPass = Number.isFinite(bearingRatio) && bearingRatio <= 1;
  const slidingPass = Number.isFinite(slidingRatio) && slidingRatio <= 1;
  const noUplift = qMin >= 0;
  const overallPass = bearingPass && slidingPass;

  return {
    B, L, tf, qAllow, mu,
    Gfooting, Ntotal, A, Z: Zfoot,
    qMax, qMin, bearingRatio,
    slidingResistance, slidingRatio,
    checks: { bearingPass, slidingPass, noUplift, overallPass }
  };
}

/* ============================================================================
BUILD DESIGN SUMMARY（v0.5：纳入连接与基础；v0.6.2：纳入边缘构件局部 N-M）
========================================================================== */
export function buildDesignSummary(inPlane, outOfPlane, connection, foundation) {
  const inPlaneChecks = [
    inPlane.checks.stressCompressionPass,
    inPlane.checks.bearingPass,
    inPlane.checks.interactionPass,
    inPlane.checks.shearPass,
    inPlane.checks.tensionPass,
    /* v0.6.2 —— 边缘构件局部 N-M（缺失时视为通过，向后兼容） */
    (inPlane.checks.boundaryNMPass !== false)
  ].every(Boolean);

  const oopChecks = outOfPlane.overallOK;
  const connectionChecks = connection?.checks?.overallPass ?? true;
  const foundationChecks = foundation?.checks?.overallPass ?? true;
  const slendernessWarning = inPlane.checks.slendernessWarning;
  const hroofWarning = !outOfPlane.hroofValidation.hroofValid;

  const overallPass =
    inPlaneChecks && oopChecks && connectionChecks && foundationChecks && !slendernessWarning;

  return {
    inPlanePass: inPlaneChecks,
    outOfPlanePass: oopChecks,
    connectionPass: connectionChecks,
    foundationPass: foundationChecks,
    slendernessWarning,
    hroofWarning,
    overallPass,
    warnings: [
      slendernessWarning ? 'Wall h/t exceeds 25; explicit slenderness and stability verification is required.' : null,
      hroofWarning ? `hroof exceeds maximum allowed value (${outOfPlane.hroofValidation.hroofMax.toFixed(2)} m). Value has been clamped.` : null,
      !inPlaneChecks ? 'One or more in-plane checks failed.' : null,
      !oopChecks ? 'One or more out-of-plane checks failed.' : null,
      !connectionChecks ? 'One or more base connection checks failed.' : null,
      !foundationChecks ? 'One or more in-plane foundation checks failed.' : null,
      /* v0.6.2 */
      inPlane.checks.boundaryNMPass === false
        ? 'Boundary element local N-M check failed (lintel edge compression-bending).'
        : null
    ].filter(Boolean)
  };
}

/* ============================================================================
MAIN PUBLIC CALCULATION FUNCTION
========================================================================== */
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
      version: '0.6.2',
      status: 'Unified In-Plane + Out-of-Plane + Connection + Foundation framework',
      note: 'Cross-checked against PanelWallInPlaneDesign.jsx (in-plane) and PrecastPanelOOPDesign.jsx (OOP). Support condition coefficients are now applied; connection and in-plane foundation checks added. v0.6: OOP seismic action computed per AS/NZS 1170.5:2004 Chapter 8 (parts): Fp = Cp × H × Wp (replaces CdT1/CdTE inputs). v0.6.2: Boundary element local N-M interaction check added (lintel reaction acting at wall edge): full strain-compatibility interaction curve, φ(N) design envelope and demand envelope (1.35G / 1.2G+1.5Q / seismic).'
    }
  };
}

/* ============================================================================
LEGACY COMPATIBILITY
========================================================================== */
export function calculateDesign(input = {}) {
  return calculatePrecastPanelDesign(input);
}

export default calculatePrecastPanelDesign;