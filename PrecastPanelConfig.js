/* ============================================================================
PrecastPanelConfig.js
Configuration and default design parameters for:
NZ Precast Concrete Panel Wall Design (Unified In-Plane + Out-of-Plane)

v0.5 说明（与参考引擎 PanelWallInPlaneDesign.jsx / PrecastPanelOOPDesign.jsx
核对后的修正）：
补充 supportWindSeismic 默认值：界面与计算引擎均使用该键，
原配置只有 outOfPlaneSupportCondition，导致下拉框初始无绑定值。
连接参数（锚筋/灌浆/剪力键/φ_conn）与平面内基础参数
（footingWidth/Length/Thickness、allowableBearingPressure）
已由 PrecastPanelCalculation.js v0.5 的连接与基础模块实际使用。

v0.6 说明：
OOP 地震作用改按 AS/NZS 1170.5:2004 第 8 章（Parts and components）计算：
墙体作为 part，Fp = Cp × H × Wp（§8.4.2.2 / §8.5.1）。
移除旧的 OOP 地震系数输入 CdT1 / CdTE，新增 part 参数：
  partResponseCoefficient —— Cp（Table 8.1，预制墙板默认 0.75）
  partHeightHx            —— hx（part 计算高度，默认取墙高中部）
  buildingHeightHn        —— hn（建筑总高）
引擎内计算 H = 1 + 2(hx/hn)（§8.4.2.3），
Wp = γc × tw × hroof（每延米墙板重量），
Fp = Cp × H × Wp，等效均布压力 WE = Fp / hroof。
========================================================================== */

/* ============================================================================
CODE BASIS
========================================================================== */
export const CODE_BASIS = {
  buildingCode: {
    code: 'NZ Building Code',
    clause: 'B1',
    verificationMethod: 'B1/VM1',
    edition: '2nd Edition',
    status: 'Current design basis'
  },
  actions: {
    general: 'AS/NZS 1170.0',
    permanent: 'AS/NZS 1170.1',
    wind: 'AS/NZS 1170.2:2021',
    earthquake: 'AS/NZS 1170.5'
  },
  concrete: {
    standard: 'NZS 3101.1:2006',
    amendments: 'A1 / A2 / A3'
  },
  steel: {
    standard: 'NZS 3404',
    note: 'Applicable to structural steel components and steel connections'
  },
  foundation: {
    note: 'Foundation design is treated separately from the precast panel member design.'
  }
};

/* ============================================================================
DEFAULT INPUTS
Unified input model:
wallWidth / wallHeight / wallThickness serve BOTH in-plane and OOP
Reinforcement: VbarDia/VbarSpace/HbarDia/HbarSpace/FootBarDia/FootBarSpace/MeshArea
gLine / qLine / wwd are roof pressures (kPa), Sr = tributary range
In-plane diaphragm forces: diaphragmWindForce / diaphragmSeismicForce
OOP additional point loads for canopy / attachments
hroof must be ≤ wallHeight - tf/1000 - ds/1000 - ts/1000
========================================================================== */
export const DEFAULT_INPUTS = {
  /* --------------------------------------------------------------------------
  Project
  ------------------------------------------------------------------------ */
  projectName: 'Precast Concrete Panel Design',
  projectNumber: '',
  designer: '',
  company: '',
  revision: '1',
  designBasis: 'NZ Building Code B1 / B1-VM1',
  date: new Date().toISOString().split('T')[0],

  /* --------------------------------------------------------------------------
  UNIFIED Wall Geometry (m)
  ------------------------------------------------------------------------ */
  wallWidth: 3.0,
  wallHeight: 4.0,
  wallThickness: 0.15,

  /* --------------------------------------------------------------------------
  2. OOP-specific Geometry (mm / m)
  hroof must satisfy: hroof ≤ wallHeight - tf/1000 - ds/1000 - ts/1000
  Default: 4.0 - 0.3 - 0.15 - 0.15 = 3.4
  ------------------------------------------------------------------------ */
  tf: 300,
  Lf: 1800,
  ts: 150,
  fo: 50,
  ds: 150,
  hroof: 3.4,

  /* --------------------------------------------------------------------------
  3. UNIFIED Material Properties
  ------------------------------------------------------------------------ */
  concreteDensity: 24,
  fc: 40,
  fy: 500,
  fyMesh: 485,
  Es: 200000,
  gs: 18,
  cover: 30,

  /* --------------------------------------------------------------------------
  4. UNIFIED Gravity Loads (kPa pressures + tributary range)
  gLine  – roof permanent (dead) pressure
  qLine  – roof imposed (live) pressure
  wwd    – roof wind pressure (moved from OOP section)
  Sr     – tributary range (m) to convert pressures to line loads
  Line load = pressure × Sr  (kN/m)
  ------------------------------------------------------------------------ */
  gLine: 0.4,
  qLine: 0.25,
  wwd: 0.33,
  Sr: 2.0,

  /* --------------------------------------------------------------------------
  5. In-Plane Specific Loads (Roof Diaphragm Forces)
  diaphragmWindForce    – concentrated horizontal wind force from roof
                          diaphragm acting at wall top (kN)
  diaphragmSeismicForce – concentrated horizontal seismic force from roof
                          diaphragm acting at wall top (kN)
  ------------------------------------------------------------------------ */
  diaphragmWindForce: 0,
  diaphragmSeismicForce: 0,
  lintelReaction: 60,
  lintelEccentricity: 0.30,

  /* --------------------------------------------------------------------------
  6. OOP Specific Loads
  wwf – windward face pressure (kPa)
  wf  - fire pressure (kPa)
  th  - fire duration (hours)
  ------------------------------------------------------------------------ */
  wwf: 1.1,
  wf: 0.5,
  th: 1.5,

  /* --------------------------------------------------------------------------
  7. OOP Additional Point Loads (Canopy / Attachments)
  ------------------------------------------------------------------------ */
  additionalForce: 0,
  additionalForceHeight: 0,
  additionalMoment: 0,
  additionalMomentHeight: 0,

  /* --------------------------------------------------------------------------
  8. UNIFIED Seismic Parameters (In-Plane + OOP)
  in-plane seismic design is based on AS/NZS 1170.5:2004, Clause 3.2.2
  out-of-plane seismic design is based on AS/NZS 1170.5:2004, Chapter 8
  (Parts and components) —— 墙体作为 part 计算平面外地震作用：
      Fp = Cp × H × Wp                    （§8.4.2.2 / §8.5.1）
      H  = 1 + 2(hx/hn)                   （§8.4.2.3）
      Wp = γc × tw × hroof（每延米墙板重量，由引擎自动计算）
  旧的 OOP 系数输入 CdT1 / CdTE 已在 v0.6 移除。
  ------------------------------------------------------------------------ */
  subsoilClass: 'D',
  importanceLevel: 'IL2',
  hazardFactor: 0.13,
  returnPeriodFactor: 1.0,
  ductility: 1.25,
  structuralPerformanceFactor: 1.3 - 0.3 * 1.25,
  period: 0.40,
  siteCoefficient: 1.70,
  nearFaultFactor: 1.0,
  seismicWeight: 150,
  seismicDistributionFactor: 1.0,
  psiE: 0.30,
  /* v0.6 —— AS/NZS 1170.5 Chapter 8 part 参数（取代 CdT1 / CdTE） */
  partResponseCoefficient: 0.75,
  partHeightHx: 2.0,
  buildingHeightHn: 4.0,

  /* --------------------------------------------------------------------------
  9. UNIFIED Reinforcement
  ------------------------------------------------------------------------ */
  VbarDia: 12,
  VbarSpace: 250,
  HbarDia: 10,
  HbarSpace: 250,
  FootBarDia: 12,
  FootBarSpace: 375,
  MeshArea: 142,

  /* --------------------------------------------------------------------------
  10. Boundary Element (In-Plane)
  ------------------------------------------------------------------------ */
  hasBoundaryElement: true,
  boundaryWidth: 0.30,
  boundaryThickness: 0.15,
  boundaryBarDiameter: 20,
  boundaryBarCount: 4,
  boundaryTieDiameter: 10,
  boundaryTieSpacing: 150,

  /* --------------------------------------------------------------------------
  11. Lintel Bearing
  ------------------------------------------------------------------------ */
  bearingWidth: 200,
  bearingLength: 150,

  /* --------------------------------------------------------------------------
  12. OOP Support & Design Factors
  TWO SEPARATE SUPPORT CONDITIONS:
  supportWindSeismic : for wind & seismic design (Default: Pinned-Pinned)
                       —— 新增默认值，与界面下拉框绑定键一致
  supportFire        : for fire resistance check (Default: Fixed-Free)
  outOfPlaneSupportCondition 保留为旧版兼容键。
  ------------------------------------------------------------------------ */
  supportWindSeismic: 'Pinned-Pinned',
  outOfPlaneSupportCondition: 'Pinned-Pinned',
  supportFire: 'Fixed-Free',
  effectiveLengthFactor: 1.0,
  phiFlexure: 0.80,
  phiShear: 0.75,
  phiCompression: 0.75,

  /* --------------------------------------------------------------------------
  13. Foundation and Hold Down Check
  qU – ultimate bearing capacity used by the OOP foundation check (UR5)
  ------------------------------------------------------------------------ */
  qU: 300,

  /* --------------------------------------------------------------------------
  Connection —— 由 calculateConnectionDesign 使用
  ------------------------------------------------------------------------ */
  baseConnectionType: 'Dowel / Grouted Connection',
  topConnectionType: 'Pinned',
  panelConnectionType: 'None',
  baseDowelDiameter: 16,
  baseDowelCount: 4,
  baseDowelEmbedment: 300,
  groutStrength: 40,
  shearKey: false,
  shearKeyDepth: 50,

  /* --------------------------------------------------------------------------
  Foundation (In-plane) —— 由 calculateFoundationDesign 使用
  ------------------------------------------------------------------------ */
  footingWidth: 1.20,
  footingLength: 3.60,
  footingThickness: 0.40,
  allowableBearingPressure: 150,
  frictionCoefficient: 0.50,

  /* --------------------------------------------------------------------------
  Strength reduction factors for connection and foundation checks
  ------------------------------------------------------------------------ */
  phiConnection: 0.75,

  /* --------------------------------------------------------------------------
  Analysis options
  ------------------------------------------------------------------------ */
  includePDelta: true,
  includeOutOfPlaneStability: true,
  includeSeismicOutOfPlane: true,
  includeWind: true,
  includeFoundationChecks: true,
  includeConnectionChecks: true,
  includeLintelSTM: true
};

/* ============================================================================
LOAD COMBINATION CONFIGURATION
========================================================================== */
export const LOAD_COMBINATIONS = {
  ULS_GRAVITY: {
    name: 'ULS Gravity',
    factors: { G: 1.20, Q: 1.50, W: 0.00, E: 0.00 }
  },
  ULS_GRAVITY_ALT: {
    name: 'ULS Gravity Alternative',
    factors: { G: 1.35, Q: 0.00, W: 0.00, E: 0.00 }
  },
  ULS_WIND: {
    name: 'ULS Wind',
    factors: { G: 1.20, Q: 1.00, W: 1.00, E: 0.00 }
  },
  ULS_WIND_REVERSE: {
    name: 'ULS Wind Reverse',
    factors: { G: 1.20, Q: 1.00, W: -1.00, E: 0.00 }
  },
  ULS_SEISMIC_POSITIVE: {
    name: 'ULS Earthquake +',
    factors: { G: 1.00, Q: 0.30, W: 0.00, E: 1.00 }
  },
  ULS_SEISMIC_NEGATIVE: {
    name: 'ULS Earthquake −',
    factors: { G: 1.00, Q: 0.30, W: 0.00, E: -1.00 }
  },
  SLS_GRAVITY: {
    name: 'SLS Gravity',
    factors: { G: 1.00, Q: 1.00, W: 0.00, E: 0.00 }
  },
  SLS_WIND: {
    name: 'SLS Wind',
    factors: { G: 1.00, Q: 1.00, W: 1.00, E: 0.00 }
  }
};

/* ============================================================================
DESIGN DIRECTIONS
========================================================================== */
export const DESIGN_DIRECTIONS = {
  IN_PLANE: 'in-plane',
  OUT_OF_PLANE: 'out-of-plane'
};

/* ============================================================================
SUPPORT CONDITIONS
========================================================================== */
export const SUPPORT_CONDITIONS = [
  { value: 'Pinned-Pinned', label: 'Pinned – Pinned', effectiveLengthFactor: 1.00 },
  { value: 'Fixed-Pinned', label: 'Fixed – Pinned', effectiveLengthFactor: 0.70 },
  { value: 'Fixed-Fixed', label: 'Fixed – Fixed', effectiveLengthFactor: 0.50 },
  { value: 'Fixed-Free', label: 'Cantilever', effectiveLengthFactor: 2.00 }
];

/* ============================================================================
MATERIAL OPTIONS
========================================================================== */
export const CONCRETE_OPTIONS = [
  { value: 25, label: '25 MPa' },
  { value: 30, label: '30 MPa' },
  { value: 40, label: '40 MPa' },
  { value: 50, label: '50 MPa' },
  { value: 60, label: '60 MPa' }
];

export const REBAR_OPTIONS = [
  { value: 300, label: '300 MPa' },
  { value: 500, label: '500 MPa' }
];

/* ============================================================================
REINFORCEMENT OPTIONS
========================================================================== */
export const BAR_DIAMETERS = [10, 12, 16, 20, 24, 25, 28, 32];
export const BAR_SPACINGS = [100, 125, 150, 175, 200, 225, 250, 300];

/* ============================================================================
STATUS LIMITS
========================================================================== */
export const DESIGN_LIMITS = {
  utilisationPass: 1.00,
  utilisationWarning: 0.90,
  slendernessWarning: 25,
  minimumReinforcementRatio: 0.0025,
  defaultConcreteStressLimit: 0.60
};

/* ============================================================================
REPORT CONFIGURATION
========================================================================== */
export const REPORT_CONFIG = {
  title: 'PRECAST CONCRETE PANEL DESIGN',
  subtitle: 'NZ Building Code B1 / Structural Design Assessment',
  companyName: '',
  includeInputSummary: true,
  includeCalculationSummary: true,
  includeDetailedCalculations: true,
  includeDiagrams: true,
  includeInPlaneChecks: true,
  includeOutOfPlaneChecks: true,
  includeConnectionChecks: true,
  includeFoundationChecks: true,
  includeCodeBasis: true
};

/* ============================================================================
DEFAULT DESIGN MODEL
========================================================================== */
export const createDefaultDesignModel = () => ({
  input: { ...DEFAULT_INPUTS },
  loadCases: { ...LOAD_COMBINATIONS },
  results: null,
  status: {
    overall: 'NOT RUN',
    inPlane: 'NOT RUN',
    outOfPlane: 'NOT RUN',
    connection: 'NOT RUN',
    foundation: 'NOT RUN'
  }
});