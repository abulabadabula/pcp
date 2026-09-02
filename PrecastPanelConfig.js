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
   INPUT SECTION DEFINITIONS 所有输入内容的定义，被Input页面调用
========================================================================== */
export const INPUT_SECTIONS = [
  {
    id: 'geometry',
    title: '1. Wall Geometry (Shared)',
    fields: [
      { key: 'wallWidth', label: 'Wall Width', unit: 'm', step: '0.1', min: '0.1' },
      { key: 'wallHeight', label: 'Wall Height', unit: 'm', step: '0.1', min: '0.5' },
      { key: 'wallThickness', label: 'Wall Thickness', unit: 'm', step: '0.005', min: '0.05' }
    ]
  },
  {
    id: 'oopGeometry',
    title: '2. OOP Geometry (Footing / Slab / Hardfill)',
    fields: [
      { key: 'tf', label: 'Footing Thickness (tf)', unit: 'm', step: '0.01', min: '0' },
      { key: 'Lf', label: 'Footing Length (Lf)', unit: 'm', step: '0.1', min: '0' },
      { key: 'ts', label: 'Slab Thickness (ts)', unit: 'm', step: '0.01', min: '0' },
      { key: 'fo', label: 'Footing Overhang (fo)', unit: 'm', step: '0.01', min: '0' },
      { key: 'ds', label: 'Hardfill Thickness (ds)', unit: 'm', step: '0.05', min: '0' },
      { key: 'hroof', label: 'Height to Roof (hroof)', unit: 'm', step: '0.1', min: '0' }
    ]
  },
  {
    id: 'materials',
    title: '3. Material Properties (Shared)',
    fields: [
      { key: 'concreteDensity', label: 'Concrete Weight Density (γc)', unit: 'kN/m³', step: '0.5', min: '15' },
      { key: 'fc', label: "Concrete Strength f'c", unit: 'MPa', step: '1', min: '15' },
      { key: 'fy', label: 'Steel Yield (fy)', unit: 'MPa', step: '5', min: '250' },
      { key: 'fyMesh', label: 'Mesh Yield (fyMesh)', unit: 'MPa', step: '1', min: '0' },
      { key: 'Es', label: 'Steel Modulus (Es)', unit: 'MPa', step: '1', min: '0' },
      { key: 'gs', label: 'Hardfill Density (γs)', unit: 'kN/m³', step: '0.1', min: '0' },
      { key: 'cover', label: 'Concrete Cover', unit: 'mm', step: '1', min: '15' }
    ]
  },
  {
    id: 'gravity',
    title: '4. Gravity Loads (Roof Pressures + Tributary Range)',
    fields: [
      { key: 'gUniform', label: 'Roof Dead Load Pressure (G)', unit: 'kPa', step: '0.05', min: '0' },
      { key: 'qUniform', label: 'Roof Live Load Pressure (Q)', unit: 'kPa', step: '0.05', min: '0' },
      { key: 'wwd', label: 'Roof Wind Pressure (wwd)', unit: 'kPa', step: '0.05', min: '0' },
      { key: 'Sr', label: 'Tributary Range (Sr)', unit: 'm', step: '0.1', min: '0' }
    ]
  },
  {
    id: 'inPlaneLoads',
    title: '5. In-Plane Specific Loads (Roof Diaphragm Forces)',
    fields: [
      { key: 'diaphragmWindForce', label: 'Diaphragm Wind Force (at wall top)', unit: 'kN', step: '1', min: '0' },
      { key: 'diaphragmSeismicForce', label: 'Diaphragm Seismic Force (at wall top)', unit: 'kN', step: '1', min: '0' },
      { key: 'lintelReaction', label: 'Lintel Reaction', unit: 'kN', step: '1', min: '0' },
      { key: 'lintelEccentricity', label: 'Lintel Eccentricity', unit: 'm', step: '0.01', min: '0' }
    ]
  },
  {
    id: 'oopLoads',
    title: '6. OOP Specific Loads',
    fields: [
      { key: 'wwf', label: 'Wall Wind Pressure (wwf)', unit: 'kPa', step: '0.1', min: '0' },
      { key: 'wf', label: 'Fire Load (wf)', unit: 'kPa', step: '0.1', min: '0' },
      { key: 'th', label: 'Fire Duration (th)', unit: 'hr', step: '0.1', min: '0' }
    ]
  },
  {
    id: 'oopAdditional',
    title: '7. OOP Additional Point Loads (Canopy / Attachments)',
    fields: [
      { key: 'additionalForce', label: 'Additional Horizontal Force', unit: 'kN', step: '0.1', min: '0' },
      { key: 'additionalForceHeight', label: 'Force Height Above Floor', unit: 'm', step: '0.1', min: '0' },
      { key: 'additionalMoment', label: 'Additional Moment', unit: 'kN·m', step: '0.1', min: '0' },
      { key: 'additionalMomentHeight', label: 'Moment Height Above Floor', unit: 'm', step: '0.1', min: '0' }
    ]
  },
  {
    id: 'seismic',
    title: '8. Seismic Parameters (In-Plane)',
    fields: [
      { key: 'hazardFactor', label: 'Hazard Factor Z', unit: '', step: '0.01', min: '0' },
      { key: 'returnPeriodFactor', label: 'Return Period Factor Ru', unit: '', step: '0.01', min: '0' },
      { key: 'ductility', label: 'Ductility Factor μ', unit: '', step: '0.05', min: '1' },
      { key: 'spectralShapeFactor', label: 'Spectral Shape Factor Ch(T)', unit: '', step: '0.01', min: '0' },
      { key: 'nearFaultFactor', label: 'Near-Fault Factor N(T,D)', unit: '', step: '0.01', min: '0' },
      { key: 'period', label: 'Fundamental Period T', unit: 's', step: '0.01', min: '0.01' },
      // { key: 'seismicWeight', label: 'Tributary Seismic Weight', unit: 'kN', step: '1', min: '0' },
      // { key: 'seismicDistributionFactor', label: 'Wall Distribution Factor', unit: '', step: '0.01', min: '0' },
      { key: 'psiE', label: 'Seismic Combination ψe', unit: '', step: '0.3', min: '0.3' },
    ]
  },
  {
    id: 'oopseismic',
    title: '9. Seismic Parameters (OOP)',
    fields: [
      /* v0.7 —— OOP 地震改按 AS/NZS 1170.5 Chapter 8 (parts) 计算  */
      { key: 'partResponseCoefficient', label: 'OOP Part Response Coefficient Cp', unit: '', step: '0.05', min: '0' },
      { key: 'partHeightHx', label: 'OOP Part Height hx (above base)', unit: 'm', step: '0.1', min: '0' },
      { key: 'buildingHeightHn', label: 'Building Height hn', unit: 'm', step: '0.1', min: '0.1' },
      { key: 'partImportanceFactor', label: 'Part Importance Factor (ap)', unit: '', step: '0.1', min: '0' },
      { key: 'partResponseModification', label: 'Part Response Modification (Rp)', unit: '', step: '0.1', min: '0.9' },
      { key: 'partDuctility', label: 'Part Ductility Factor (μp)', unit: '', step: '0.1', min: '1' },
      { key: 'partPeriod', label: 'Part Fundamental Period (Tp)', unit: 's', step: '0.01', min: '0.01' },
      { key: 'buildingPeriod', label: 'Building Fundamental Period (Tn)', unit: 's', step: '0.01', min: '0.01' },
      { key: 'importanceFactor', label: 'Building Importance Factor (I)', unit: '', step: '0.1', min: '1' }
    ]
  },
  {
    id: 'reinforcement',
    title: '10. Reinforcement (Shared)',
    fields: [
      { key: 'VbarDia', label: 'Vertical Bar Diameter (φV)', unit: 'mm', step: '2', min: '6' },
      { key: 'VbarSpace', label: 'Vertical Bar Spacing', unit: 'mm', step: '25', min: '50' },
      { key: 'HbarDia', label: 'Horizontal Bar Diameter (φH)', unit: 'mm', step: '2', min: '6' },
      { key: 'HbarSpace', label: 'Horizontal Bar Spacing', unit: 'mm', step: '25', min: '50' },
      { key: 'FootBarDia', label: 'Footing Bar Diameter (φF)', unit: 'mm', step: '2', min: '6' },
      { key: 'FootBarSpace', label: 'Footing Bar Spacing', unit: 'mm', step: '25', min: '50' },
      { key: 'MeshArea', label: 'Slab Mesh Area (As)', unit: 'mm²/m', step: '1', min: '0' },
      { key: 'BarLayers', label: 'Number of Bar Layers', unit: 'layers', step: '1', min: '1' }
    ]
  },
  {
    id: 'boundary',
    title: '11. Boundary Element (In-Plane)',
    fields: [
      { key: 'boundaryWidth', label: 'Boundary Width', unit: 'm', step: '0.01', min: '0.05' },
      { key: 'boundaryThickness', label: 'Boundary Thickness', unit: 'm', step: '0.005', min: '0.05' },
      { key: 'boundaryBarDiameter', label: 'Boundary Bar Diameter', unit: 'mm', step: '1', min: '6' },
      { key: 'boundaryBarCount', label: 'Boundary Bar Count', unit: 'bars', step: '1', min: '1' },
      { key: 'boundaryTieDiameter', label: 'Tie Diameter', unit: 'mm', step: '1', min: '6' },
      { key: 'boundaryTieSpacing', label: 'Tie Spacing', unit: 'mm', step: '10', min: '50' }
    ]
  },
  {
    id: 'bearing',
    title: '12. Lintel Bearing (In-Plane)',
    fields: [
      { key: 'bearingWidth', label: 'Bearing Width', unit: 'mm', step: '5', min: '25' },
      { key: 'bearingLength', label: 'Bearing Length', unit: 'mm', step: '5', min: '25' }
    ]
  },
  {
    id: 'support',
    title: '13. OOP Support Conditions & Design Factors',
    fields: [
      { key: 'effectiveLengthFactor', label: 'Effective Length Factor K', unit: '', step: '0.05', min: '0.1' },
      { key: 'phiFlexure', label: 'ϕ Flexure', unit: '', step: '0.01', min: '0' },
      { key: 'phiShear', label: 'ϕ Shear', unit: '', step: '0.01', min: '0' },
      { key: 'phiCompression', label: 'ϕ Compression', unit: '', step: '0.01', min: '0' }
    ]
  },
  {
    id: 'foundation',
    title: '14. Foundation and Hold Down Check',
    fields: [
      { key: 'qU', label: 'Ultimate Bearing Capacity (qU)', unit: 'kPa', step: '10', min: '0' }
    ]
  },
  {
    id: 'connection',
    title: '15. Base Connection (Connection Design)',
    fields: [
      { key: 'baseDowelDiameter', label: 'Base Dowel Diameter', unit: 'mm', step: '1', min: '6' },
      { key: 'baseDowelCount', label: 'Base Dowel Count', unit: 'bars', step: '1', min: '0' },
      { key: 'baseDowelEmbedment', label: 'Dowel Embedment', unit: 'mm', step: '10', min: '0' },
      { key: 'groutStrength', label: "Grout Strength f'g", unit: 'MPa', step: '1', min: '10' },
      { key: 'shearKeyDepth', label: 'Shear Key Depth', unit: 'mm', step: '5', min: '0' },
      { key: 'frictionCoefficient', label: 'Friction Coefficient μ', unit: '', step: '0.05', min: '0' },
      { key: 'phiConnection', label: 'ϕ Connection', unit: '', step: '0.01', min: '0' }
    ]
  },
  {
    id: 'inPlaneFoundation',
    title: '16. In-Plane Foundation (Footing Checks)',
    fields: [
      { key: 'footingWidth', label: 'Footing Width B', unit: 'm', step: '0.05', min: '0.1' },
      { key: 'footingLength', label: 'Footing Length L', unit: 'm', step: '0.05', min: '0.1' },
      { key: 'footingThickness', label: 'Footing Thickness', unit: 'm', step: '0.05', min: '0.05' },
      { key: 'allowableBearingPressure', label: 'Allowable Bearing Pressure', unit: 'kPa', step: '10', min: '0' }
    ]
  }
];


/* ============================================================================
DEFAULT INPUTS 必须有，否则控件显示不正常
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
  tf: 0.3,
  Lf: 1.8,
  ts: 0.15,
  fo: 0.05,
  ds: 0.15,
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
  gUniform  – roof permanent (dead) pressure
  qUniform  – roof imposed (live) pressure
  wwd    – roof wind pressure (moved from OOP section)
  Sr     – tributary range (m) to convert pressures to line loads
  Line load = pressure × Sr  (kN/m)
  ------------------------------------------------------------------------ */
  gUniform: 0.5,
  qUniform: 0.25,
  wwd: 0.33,
  Sr: 2.0,

  /* --------------------------------------------------------------------------
  5. In-Plane Specific Loads (Roof Diaphragm Forces)
  diaphragmWindForce    – concentrated horizontal wind force from roof
                          diaphragm acting at wall top (kN)
  diaphragmSeismicForce – concentrated horizontal seismic force from roof
                          diaphragm acting at wall top (kN)
  ------------------------------------------------------------------------ */
  diaphragmWindForce: 10,
  diaphragmSeismicForce: 15,
  lintelReaction: 60,
  lintelEccentricity: 0.20,

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
  subsoilClass: 'C',
  importanceLevel: 'IL2',
  hazardFactor: 0.13,
  returnPeriodFactor: 1.0,
  ductility: 1.25,
  structuralPerformanceFactor: 1.3 - 0.3 * 1.25,
  period: 0.40,
  spectralShapeFactor: 2.36,
  nearFaultFactor: 1.0,
  // seismicWeight: 150,
  // seismicDistributionFactor: 1.0,
  psiE: 0.30,
  /* v0.6 —— AS/NZS 1170.5 Chapter 8 part 参数 */
  partResponseCoefficient: 0.75,
  partHeightHx: 2.0,
  buildingHeightHn: 4.0,
  partImportanceFactor: 1.0,
  partResponseModification: 1.0,
  partDuctility: 1.0,
  partPeriod: 0.1,
  buildingPeriod: 0.4,
  importanceFactor: 1.0,

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
  BarLayers: 1,

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