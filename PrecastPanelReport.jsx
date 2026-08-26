// src/features/design/modules/PrecastPanelReport.jsx
/* ============================================================================
职责：
  CalculationReportContext        —— CalculationSection 在屏幕渲染为手风琴、
                                     在报告模式渲染为分页 Paper 的切换上下文
                                     （由 PrecastPanel.jsx 引用）。
  getPrecastPanelInputRows / getPrecastPanelSummaryRows /
  getPrecastPanelFormulaSections  —— Summary（简易）打印报告数据层。
                                     ★ 简易报告为成熟稳定部分，v0.6.2 不做任何改动。
  getPrecastPanelDetailSections / getPrecastPanelUtilisationRows ——
                                     Detail（详细）打印报告数据层，
                                     公式细节与 Calculation Tab 完全一致。
  PrecastPanelPrintReport         —— Summary Report A4 打印正文。
  PrecastPanelDetailPrintReport   —— Detail Report A4 打印正文（v0.6.1 新增）。
  PrecastPanelReportDialog（默认导出）—— Summary Report 预览 + 自动打印。
  PrecastPanelDetailReportDialog（命名导出）—— Detail Report 预览 + 自动打印。
样式复用 ../style/ReportPrintStyles.css。
所有报告数据均取自 calculatePrecastPanelDesign 的返回结果，
与 Calculation Tab 的公式保持同一来源。

v0.6.2 说明（修正版）：
  · 简易报告（Summary Report）完全恢复成熟版原样——不新增公式、不改页脚，
    避免两栏公式区因超宽 KaTeX 公式产生页面水平滚动条。
  · 边缘构件局部 N-M（Lintel 反力作用于墙边）内容仅加入 Detail Report：
      getPrecastPanelDetailSections —— Section 4 新增 4.7 完整推导
                                       （nmTable → 需求包络表；nmChart → N-M 图）
      getPrecastPanelUtilisationRows —— 新增 Boundary local N-M 利用率行
      BoundaryNMInteractionChart / NMDemandTable —— 报告本地自包含组件
      （避免 PrecastPanel.jsx ↔ PrecastPanelReport.jsx 循环引用）。
  · Detail Report 为单栏全宽排版，长公式与 SVG 图不会引起横向溢出；
    4.7 中超长的平衡点公式已拆分为两条以保证打印宽度安全。
========================================================================== */

import React, { createContext, useEffect } from 'react';
import { Box, Button, Dialog, DialogContent, IconButton, Typography } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import CloseIcon from '@mui/icons-material/Close';
import { BlockMath } from 'react-katex';
import '../style/ReportPrintStyles.css';
import PrecastPanelSVG from './PrecastPanelSVG';

/* ============================================================================
报告模式上下文
PrecastPanel.jsx 的 CalculationSection 通过 useContext 读取该值：
  false（默认）→ 屏幕手风琴；true → 打印分页 Paper
========================================================================== */
export const CalculationReportContext = createContext(false);

/* ============================================================================
HELPERS（报告专用格式化）
========================================================================== */
const safe = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const calcFmt = (value, digits = 3) => {
  const v = Number(value);
  return Number.isFinite(v) ? v.toFixed(digits) : '-';
};

/* KaTeX 公式数值格式化（非有限值显示 '-' 或 ∞） */
const tx = (value, digits = 3) => {
  const v = Number(value);
  return Number.isFinite(v) ? v.toFixed(digits) : '-';
};

const txUR = (value) => {
  const v = Number(value);
  return Number.isFinite(v) ? v.toFixed(3) : '∞';
};

/* v0.6.1 —— 百分比格式化（Detail Report 利用率显示用） */
const txPct = (value) => {
  const v = Number(value);
  return Number.isFinite(v) ? (v * 100).toFixed(1) : '—';
};

/* v0.6.1 —— Detail Report 支承条件弯矩系数表（与 PrecastPanel.jsx 中保持一致） */
const SUPPORT_MOMENT_TABLE = [
  { key: 'Pinned-Pinned', label: 'Pinned – Pinned', mid: '1/8', midVal: 0.125, base: '1/8', baseVal: 0.125 },
  { key: 'Fixed-Free', label: 'Fixed – Free (Cantilever)', mid: '1/8', midVal: 0.125, base: '1/2', baseVal: 0.5 },
  { key: 'Fixed-Fixed', label: 'Fixed – Fixed', mid: '1/24', midVal: 0.0417, base: '1/12', baseVal: 0.0833 },
  { key: 'Fixed-Pinned', label: 'Fixed – Pinned', mid: '9/128', midVal: 0.0703, base: '1/8', baseVal: 0.125 }
];

/* ============================================================================
状态文字（报告页头 Status 字段）
========================================================================== */
export function getPrecastPanelStatusText(summary) {
  if (!summary) return 'CHECK REQUIRED';
  if (summary.slendernessWarning) return 'CHECK SLENDERNESS';
  if (summary.hroofWarning) return 'CHECK HROOF';
  return summary.overallPass ? 'DESIGN PASS' : 'CHECK REQUIRED';
}

/* ============================================================================
报告第一页：输入参数行（双列排版）—— 成熟版原样（v0.6.2 未改动）
========================================================================== */
export function getPrecastPanelInputRows(inputs) {
  return [
    ['Wall width', calcFmt(inputs.wallWidth, 3), 'm'],
    ['Wall height', calcFmt(inputs.wallHeight, 3), 'm'],
    ['Wall thickness', calcFmt(inputs.wallThickness, 3), 'm'],
    ['Concrete density γc', calcFmt(inputs.concreteDensity, 2), 'kN/m³'],
    ["Concrete strength f'c", calcFmt(inputs.fc, 1), 'MPa'],
    ['Steel yield fy', calcFmt(inputs.fy, 0), 'MPa'],
    ['Mesh yield fyMesh', calcFmt(inputs.fyMesh, 0), 'MPa'],
    ['Steel modulus Es', calcFmt(inputs.Es, 0), 'MPa'],
    ['Hardfill density γs', calcFmt(inputs.gs, 1), 'kN/m³'],
    ['Concrete cover', calcFmt(inputs.cover, 0), 'mm'],
    ['tf / Lf', `${calcFmt(inputs.tf, 0)} / ${calcFmt(inputs.Lf, 0)}`, 'mm'],
    ['ts / fo / ds', `${calcFmt(inputs.ts, 0)} / ${calcFmt(inputs.fo, 0)} / ${calcFmt(inputs.ds, 0)}`, 'mm'],
    ['hroof', calcFmt(inputs.hroof, 3), 'm'],
    ['Roof dead pressure g', calcFmt(inputs.gLine, 3), 'kPa'],
    ['Roof live pressure q', calcFmt(inputs.qLine, 3), 'kPa'],
    ['Roof wind pressure wwd', calcFmt(inputs.wwd, 3), 'kPa'],
    ['Tributary range Sr', calcFmt(inputs.Sr, 2), 'm'],
    ['Diaphragm wind force', calcFmt(inputs.diaphragmWindForce, 1), 'kN'],
    ['Diaphragm seismic force', calcFmt(inputs.diaphragmSeismicForce, 1), 'kN'],
    ['Lintel reaction', calcFmt(inputs.lintelReaction, 1), 'kN'],
    ['Lintel eccentricity', calcFmt(inputs.lintelEccentricity, 3), 'm'],
    ['Wall wind pressure wwf', calcFmt(inputs.wwf, 3), 'kPa'],
    ['Fire load wf', calcFmt(inputs.wf, 3), 'kPa'],
    ['Fire duration th', calcFmt(inputs.th, 2), 'hr'],
    ['Additional force / height', `${calcFmt(inputs.additionalForce, 1)} / ${calcFmt(inputs.additionalForceHeight, 2)}`, 'kN / m'],
    ['Additional moment / height', `${calcFmt(inputs.additionalMoment, 1)} / ${calcFmt(inputs.additionalMomentHeight, 2)}`, 'kN·m / m'],
    ['Hazard factor Z', calcFmt(inputs.hazardFactor, 3), ''],
    ['Return period factor Ru', calcFmt(inputs.returnPeriodFactor, 3), ''],
    ['Ductility μ', calcFmt(inputs.ductility, 3), ''],
    ['Performance factor Sp', calcFmt(inputs.structuralPerformanceFactor, 3), ''],
    ['Site coefficient Ch(T)', calcFmt(inputs.siteCoefficient, 3), ''],
    ['Near-fault N(T,D)', calcFmt(inputs.nearFaultFactor, 3), ''],
    ['Seismic weight Wt', calcFmt(inputs.seismicWeight, 1), 'kN'],
    ['Distribution factor kd', calcFmt(inputs.seismicDistributionFactor, 3), ''],
    ['ψe', calcFmt(inputs.psiE, 2), ''],
    /* v0.6 —— OOP part 地震参数（取代 CdT1 / CdTE） */
    ['OOP part coefficient Cp (Table 8.1)', calcFmt(inputs.partResponseCoefficient, 3), ''],
    ['OOP part height hx / building hn', `${calcFmt(inputs.partHeightHx, 2)} / ${calcFmt(inputs.buildingHeightHn, 2)}`, 'm'],
    ['Vertical bar φV@Sv', `${calcFmt(inputs.VbarDia, 0)} @ ${calcFmt(inputs.VbarSpace, 0)}`, 'mm'],
    ['Horizontal bar φH@Sh', `${calcFmt(inputs.HbarDia, 0)} @ ${calcFmt(inputs.HbarSpace, 0)}`, 'mm'],
    ['Footing bar φF@Sf', `${calcFmt(inputs.FootBarDia, 0)} @ ${calcFmt(inputs.FootBarSpace, 0)}`, 'mm'],
    ['Slab mesh area', calcFmt(inputs.MeshArea, 0), 'mm²/m'],
    ['Boundary width / thickness', `${calcFmt(inputs.boundaryWidth, 2)} / ${calcFmt(inputs.boundaryThickness, 2)}`, 'm'],
    ['Boundary bars', `${calcFmt(inputs.boundaryBarCount, 0)}-φ${calcFmt(inputs.boundaryBarDiameter, 0)}`, ''],
    ['Bearing width × length', `${calcFmt(inputs.bearingWidth, 0)} × ${calcFmt(inputs.bearingLength, 0)}`, 'mm'],
    ['Support: Wind & Seismic', String(inputs.supportWindSeismic || 'Pinned-Pinned'), ''],
    ['Support: Fire', String(inputs.supportFire || 'Fixed-Free'), ''],
    ['qU (OOP bearing)', calcFmt(inputs.qU, 0), 'kPa'],
    ['Base dowels', `${calcFmt(inputs.baseDowelCount, 0)}-φ${calcFmt(inputs.baseDowelDiameter, 0)} @ ${calcFmt(inputs.baseDowelEmbedment, 0)}`, 'mm'],
    ["Grout strength f'g", calcFmt(inputs.groutStrength, 1), 'MPa'],
    ['Shear key', inputs.shearKey ? 'Yes' : 'No', ''],
    ['Friction coefficient μ', calcFmt(inputs.frictionCoefficient, 2), ''],
    ['ϕ connection', calcFmt(inputs.phiConnection, 2), ''],
    ['Footing B × L × t', `${calcFmt(inputs.footingWidth, 2)} × ${calcFmt(inputs.footingLength, 2)} × ${calcFmt(inputs.footingThickness, 2)}`, 'm'],
    ['Allowable bearing', calcFmt(inputs.allowableBearingPressure, 0), 'kPa']
  ];
}

/* ============================================================================
报告第一页：结果摘要行 —— ★ v0.6.2 恢复成熟版原样（不再新增行）
========================================================================== */
export function getPrecastPanelSummaryRows(inputs, results) {
  const ip = results.inPlane || {};
  const op = results.outOfPlane || {};
  const cn = results.connection || {};
  const fd = results.foundation || {};
  return [
    { param: 'In-plane V*', value: calcFmt(ip.sectionActions?.Vtotal, 2), unit: 'kN', status: null },
    { param: 'In-plane M*', value: calcFmt(ip.sectionActions?.Mtotal, 2), unit: 'kN·m', status: null },
    { param: 'In-plane N* (compression)', value: calcFmt(ip.sectionActions?.NseismicCompression, 2), unit: 'kN', status: null },
    { param: 'Max compression stress σmax', value: calcFmt(ip.elasticStress?.sigmaMax, 3), unit: 'MPa', status: ip.checks?.stressCompressionPass },
    { param: 'Lintel bearing UR', value: calcFmt(safe(ip.bearing?.bearingRatio) * 100, 1), unit: '%', status: ip.checks?.bearingPass },
    { param: 'N-M interaction UR', value: calcFmt(safe(ip.interaction?.interactionRatio) * 100, 1), unit: '%', status: ip.checks?.interactionPass },
    { param: 'In-plane shear UR', value: calcFmt(safe(ip.shear?.shearRatio) * 100, 1), unit: '%', status: ip.checks?.shearPass },
    { param: 'Boundary tension check', value: '', unit: '', status: ip.checks?.tensionPass },
    { param: 'Slenderness h/t (limit 25)', value: calcFmt(ip.slenderness?.outOfPlaneSlenderness, 1), unit: '', status: !(ip.checks?.slendernessWarning) },
    { param: 'OOP part force Fp = Cp·H·Wp', value: calcFmt(op.partSeismic?.Fp, 2), unit: 'kN/m', status: null },
    { param: 'OOP UR1 mid-height P-Δ', value: calcFmt(safe(op.UR1) * 100, 1), unit: '%', status: Number.isFinite(op.UR1) && op.UR1 <= 1 },
    { param: 'OOP UR2 base moment', value: calcFmt(safe(op.UR2) * 100, 1), unit: '%', status: Number.isFinite(op.UR2) && op.UR2 <= 1 },
    { param: 'OOP UR3 fire', value: calcFmt(safe(op.UR3) * 100, 1), unit: '%', status: Number.isFinite(op.UR3) && op.UR3 <= 1 },
    { param: 'OOP UR4 shear', value: calcFmt(safe(op.UR4) * 100, 1), unit: '%', status: Number.isFinite(op.UR4) && op.UR4 <= 1 },
    { param: 'OOP UR5 foundation bearing', value: calcFmt(safe(op.UR5) * 100, 1), unit: '%', status: Number.isFinite(op.UR5) && op.UR5 <= 1 },
    { param: 'OOP UR6 footing flexure', value: calcFmt(safe(op.UR6) * 100, 1), unit: '%', status: Number.isFinite(op.UR6) && op.UR6 <= 1 },
    { param: 'Connection shear UR', value: calcFmt(safe(cn.ratios?.shearRatio) * 100, 1), unit: '%', status: cn.checks?.shearPass },
    { param: 'Connection uplift UR', value: calcFmt(safe(cn.ratios?.tensionRatio) * 100, 1), unit: '%', status: cn.checks?.tensionPass },
    { param: 'Connection grout bearing UR', value: calcFmt(safe(cn.ratios?.bearingRatio) * 100, 1), unit: '%', status: cn.checks?.bearingPass },
    { param: 'In-plane footing bearing UR', value: calcFmt(safe(fd.bearingRatio) * 100, 1), unit: '%', status: fd.checks?.bearingPass },
    { param: 'In-plane footing sliding UR', value: calcFmt(safe(fd.slidingRatio) * 100, 1), unit: '%', status: fd.checks?.slidingPass }
  ];
}

/* ============================================================================
Summary Report 第二页起：分段 KaTeX 公式（精简版，与 Calculation Tab 对应）
★ v0.6.2 恢复成熟版原样：
  —— Section 4 不新增 Boundary N-M 步骤；Section 8 的 In-plane 行保持三项 UR。
  简易报告采用两栏公式排版（.formula-two-col），超宽 KaTeX 显示公式会撑破
  栏宽并导致打印页面出现水平滚动条，因此 v0.6.2 新内容一律放入 Detail Report。
========================================================================== */
export function getPrecastPanelFormulaSections(inputs, results) {
  const ip = results.inPlane || {};
  const op = results.outOfPlane || {};
  const cn = results.connection || {};
  const fd = results.foundation || {};

  const geo = ip.geometry || {};
  const g = ip.gravity || {};
  const s = ip.seismic || {};
  const di = ip.diaphragm || {};
  const a = ip.sectionActions || {};
  const es = ip.elasticStress || {};
  const sl = ip.slenderness || {};
  const be = ip.bearing || {};
  const re = ip.reinforcement || {};
  const it = ip.interaction || {};
  const sh = ip.shear || {};
  const hv = op.hroofValidation || {};
  const sc = op.supportConditions || {};
  const ps = op.partSeismic || {};
  const dm = cn.demand || {};
  const dw = cn.dowel || {};
  const fr = cn.friction || {};
  const cap = cn.capacity || {};
  const cbe = cn.bearing || {};
  const rt = cn.ratios || {};

  const diaV = Math.max(safe(di.VdiaphragmWind), safe(di.VdiaphragmSeismic));
  const diaM = Math.max(safe(di.MdiaphragmWind), safe(di.MdiaphragmSeismic));
  const nV = re.nVerticalBars ?? 0;
  const passLabel = pass => (pass ? 'PASS' : 'CHECK');

  return [
    {
      title: '1. Geometry & Load Derivation',
      steps: [
        {
          sub: 'In-plane section properties',
          formulas: [
            { caption: 'Gross area', tex: `A_g = (b\\times1000)(t\\times1000) = ${tx(geo.Ag, 0)}\\,\\mathrm{mm^2}` },
            { caption: 'Second moment of area', tex: `I = \\frac{(b\\times1000)(t\\times1000)^3}{12} = ${tx(geo.I, 0)}\\,\\mathrm{mm^4}` },
            { caption: 'Section modulus', tex: `Z_g = \\frac{(b\\times1000)^2(t\\times1000)}{6} = ${tx(geo.Zg, 0)}\\,\\mathrm{mm^3}` }
          ]
        },
        {
          sub: 'Roof pressures to line loads (line load = pressure × Sr)',
          formulas: [
            { caption: 'Dead line load', tex: `g_{line} = g\\times S_r = (${tx(inputs.gLine)})(${tx(inputs.Sr)}) = ${tx(g.gLineLoad)}\\,\\mathrm{kN/m}` },
            { caption: 'Live line load', tex: `q_{line} = q\\times S_r = (${tx(inputs.qLine)})(${tx(inputs.Sr)}) = ${tx(g.qLineLoad)}\\,\\mathrm{kN/m}` },
            { caption: 'Roof wind line load', tex: `w_{wd,line} = w_{wd}\\times S_r = (${tx(inputs.wwd)})(${tx(inputs.Sr)}) = ${tx(safe(inputs.wwd) * safe(inputs.Sr, 1))}\\,\\mathrm{kN/m}` }
          ]
        },
        {
          sub: 'In-plane self-weight & gravity ULS',
          formulas: [
            { caption: 'Wall self-weight', tex: `G_{wall} = \\gamma_c t h b = ${tx(g.Gwall)}\\,\\mathrm{kN}` },
            { caption: 'Total permanent line load', tex: `G_{line,total} = g_{line} b = ${tx(g.GlineTotal)}\\,\\mathrm{kN}` },
            { caption: 'Total imposed line load', tex: `Q_{line,total} = q_{line} b = ${tx(g.QlineTotal)}\\,\\mathrm{kN}` },
            { caption: 'Gravity ULS axial force', tex: `N^*_{gravity} = 1.2(G_{wall}+G_{line,total}) + 1.5Q_{line,total} = ${tx(g.Ngravity)}\\,\\mathrm{kN}` }
          ]
        },
        {
          sub: 'OOP gravity axial force',
          formulas: [
            { caption: 'Roof dead line load', tex: `W_d = S_r w_d = ${tx(op.Wd_line)}\\,\\mathrm{kN/m}` },
            { caption: 'Wall self-weight above mid-height', tex: `N_{SW} = \\frac{t_w}{1000}\\frac{H_w-t_f}{2}\\gamma_c = ${tx(op.NSW)}\\,\\mathrm{kN/m}` },
            { caption: 'Footing / slab / hardfill weights', tex: `N_{FF} = ${tx(op.NFF, 2)},\\quad N_{SF} = ${tx(op.NSF, 2)},\\quad N_{HF} = ${tx(op.NHF, 2)}\\,\\mathrm{kN/m}` },
            { caption: 'Effective gravity axial force', tex: `N_{GE} = N_{SW}+N_{FF}+N_{SF}+N_{HF}+W_d = ${tx(op.N_GE)}\\,\\mathrm{kN/m}` },
            { caption: 'ULS gravity envelope', tex: `N_{max} = \\max(1.35N_{GE},\\;1.2N_{GE}+1.5W_q) = ${tx(op.Nmax)}\\,\\mathrm{kN/m}` }
          ]
        }
      ]
    },
    {
      title: '2. In-Plane Seismic Action (AS/NZS 1170.5 §3.2.2)',
      steps: [
        {
          sub: 'Seismic coefficients',
          formulas: [
            { caption: 'Elastic site hazard coefficient', tex: `C(T) = C_h(T)ZR_uN(T,D) = ${tx(s.C, 5)}` },
            { caption: 'Structural performance factor', tex: `S_p = 1.3 - 0.3\\mu = ${tx(s.Sp)}` },
            { caption: 'Design action coefficient', tex: `C_d(T) = C(T)\\frac{S_p}{\\mu} = ${tx(s.Cd, 5)}` }
          ]
        },
        {
          sub: 'Base shear and overturning moment',
          formulas: [
            { caption: 'In-plane base shear', tex: `V^*_{seismic} = C_d W_t k_d = ${tx(s.Vseismic)}\\,\\mathrm{kN}` },
            { caption: 'Seismic overturning moment', tex: `M^*_{seismic} = V^*_{seismic} h = ${tx(s.Mseismic)}\\,\\mathrm{kN\\cdot m}` }
          ]
        }
      ]
    },
    {
      title: '3. Combined In-Plane Actions (Diaphragm + Lintel)',
      steps: [
        {
          sub: 'Diaphragm forces at wall top',
          formulas: [
            { caption: 'Envelope diaphragm force', tex: `V_{dia} = \\max(V_{wd},V_{es}) = ${tx(diaV)}\\,\\mathrm{kN}` },
            { caption: 'Diaphragm moment at base', tex: `M_{dia} = V_{dia} h = ${tx(diaM)}\\,\\mathrm{kN\\cdot m}` },
            { caption: 'Lintel eccentric moment', tex: `M_{lintel} = R_{lintel} e = ${tx(a.Mlintel)}\\,\\mathrm{kN\\cdot m}` }
          ]
        },
        {
          sub: 'Axial forces & total actions',
          formulas: [
            { caption: 'Seismic gravity axial force', tex: `N_{EQ,g} = G_{wall}+G_{line,total}+\\psi_e Q_{line,total} = ${tx(a.seismicGravity)}\\,\\mathrm{kN}` },
            { caption: 'Compression case', tex: `N^*_{comp} = N_{EQ,g}+R_{lintel} = ${tx(a.NseismicCompression)}\\,\\mathrm{kN}` },
            { caption: 'Opposite direction', tex: `N^*_{tension} = N_{EQ,g}-R_{lintel} = ${tx(a.NseismicTension)}\\,\\mathrm{kN}` },
            { caption: 'Total in-plane moment', tex: `M^* = M^*_{seismic}+M_{dia}+M_{lintel} = ${tx(a.Mtotal)}\\,\\mathrm{kN\\cdot m}` },
            { caption: 'Total in-plane shear', tex: `V^* = V^*_{seismic}+V_{dia} = ${tx(a.Vtotal)}\\,\\mathrm{kN}` }
          ]
        }
      ]
    },
    {
      title: '4. In-Plane Section Checks',
      steps: [
        {
          sub: 'Elastic stress distribution',
          formulas: [
            { caption: 'Uniform axial stress', tex: `\\sigma_N = \\frac{N^*}{A_g} = ${tx(es.sigmaN, 4)}\\,\\mathrm{MPa}` },
            { caption: 'Bending stress', tex: `\\sigma_M = \\frac{M^*}{Z_g} = ${tx(es.sigmaM, 4)}\\,\\mathrm{MPa}` },
            { caption: 'Maximum edge compression', tex: `\\sigma_{max} = \\sigma_N+\\sigma_M = ${tx(es.sigmaMax, 4)}\\,\\mathrm{MPa} \\le 0.6f'_c \\Rightarrow \\text{${passLabel(ip.checks?.stressCompressionPass)}}` },
            { caption: 'Minimum edge stress', tex: `\\sigma_{min} = ${tx(es.sigmaMin, 4)}\\,\\mathrm{MPa} \\Rightarrow \\text{${safe(es.sigmaMin) >= 0 ? 'NO TENSION' : 'TENSION PREDICTED'}}` },
            { caption: 'Resultant eccentricity / kern', tex: `e = ${tx(es.eccentricity, 4)}\\,\\mathrm{m},\\qquad e_{kern} = \\frac{b}{6} = ${tx(es.kern, 4)}\\,\\mathrm{m}` }
          ]
        },
        {
          sub: 'Slenderness classification',
          formulas: [
            { caption: 'In-plane aspect ratio', tex: `\\frac{h}{l_w} = ${tx(sl.aspectRatio)} \\Rightarrow \\text{${sl.wallClassification || '-'}}` },
            { caption: 'Out-of-plane slenderness', tex: `\\frac{h}{t} = ${tx(sl.outOfPlaneSlenderness)} \\Rightarrow \\text{${ip.checks?.slendernessWarning ? 'WARNING (h/t>25)' : 'OK (h/t≤25)'}}` }
          ]
        },
        {
          sub: 'Lintel bearing (D-region)',
          formulas: [
            { caption: 'Bearing stress', tex: `\\sigma_b = \\frac{R_{lintel}}{A_b} = ${tx(be.bearingStress, 4)}\\,\\mathrm{MPa}` },
            { caption: 'Bearing capacity', tex: `\\sigma_{b,cap} = 0.6\\sqrt{f'_c} = ${tx(safe(be.bearingCapacity) / 1000, 4)}\\,\\mathrm{MPa}` },
            { caption: 'Bearing utilisation', tex: `UR_{bearing} = \\frac{\\sigma_b}{\\sigma_{b,cap}} = ${txUR(be.bearingRatio)} \\Rightarrow \\text{${passLabel(ip.checks?.bearingPass)}}` }
          ]
        },
        {
          sub: 'Reinforcement properties',
          formulas: [
            { caption: 'Number of vertical bars', tex: `n_v = \\left\\lfloor\\frac{b\\times1000}{s_v}\\right\\rfloor + 1 = ${tx(nV, 0)}` },
            { caption: 'Distributed vertical steel', tex: `A_{s,dist} = ${tx(re.AsDistributed, 1)}\\,\\mathrm{mm^2},\\qquad \\rho_v = ${tx(safe(re.rhoVertical) * 100, 3)}\\%` },
            { caption: 'Boundary steel', tex: `A_{s,b} = ${tx(re.AsBoundary, 1)}\\,\\mathrm{mm^2},\\qquad T_{s,b} = ${tx(re.boundarySteelTensionCapacity)}\\,\\mathrm{kN}` }
          ]
        },
        {
          sub: 'Simplified N-M interaction',
          formulas: [
            { caption: 'Effective depth', tex: `d = t\\times1000 - c_{cover} - \\frac{\\phi_b}{2} = ${tx(re.d, 1)}\\,\\mathrm{mm}` },
            { caption: 'Compression forces', tex: `C_c = 0.85f'_c b_c a_{block} = ${tx(it.compressionConcrete, 0)}\\,\\mathrm{N},\\qquad C_s = A_{s,b}f_y = ${tx(it.steelCompression, 0)}\\,\\mathrm{N}` },
            { caption: 'Design capacities', tex: `\\phi P_n = ${tx(it.phiPn)}\\,\\mathrm{kN},\\qquad \\phi M_n = ${tx(it.phiMn)}\\,\\mathrm{kN\\cdot m}` },
            { caption: 'Interaction ratio', tex: `\\eta_{N-M} = \\frac{N^*}{\\phi P_n}+\\frac{M^*}{\\phi M_n} = ${txUR(it.interactionRatio)} \\Rightarrow \\text{${passLabel(ip.checks?.interactionPass)}}` }
          ]
        },
        {
          sub: 'In-plane shear',
          formulas: [
            { caption: 'Concrete shear', tex: `V_c = 0.17\\sqrt{f'_c}b_wd_v/1000 = ${tx(sh.vc)}\\,\\mathrm{kN},\\qquad \\phi V_c = ${tx(sh.phiVc)}\\,\\mathrm{kN}` },
            { caption: 'Steel contribution', tex: `V_s = \\frac{2A_{\\phi h}f_yd_v}{s_h} = ${tx(sh.VsProvided)}\\,\\mathrm{kN}` },
            { caption: 'Shear utilisation', tex: `UR_V = \\frac{V^*}{\\phi V_c + \\phi V_s} = ${txUR(sh.shearRatio)} \\Rightarrow \\text{${passLabel(ip.checks?.shearPass)}}` }
          ]
        }
      ]
    },
    {
      title: '5. Out-of-Plane Design (AS/NZS 1170.5 Ch.8 Parts / §8.5.1)',
      steps: [
        {
          sub: 'hroof validation',
          formulas: [
            { caption: 'Maximum allowed', tex: `h_{roof,max} = H_w - t_f - d_s - t_s = ${tx(hv.hroofMax)}\\,\\mathrm{m}` },
            { caption: 'Effective value used', tex: `h_{roof,eff} = \\min(h_{roof}, h_{roof,max}) = ${tx(hv.hroofEffective)}\\,\\mathrm{m} \\Rightarrow \\text{${hv.hroofValid ? 'VALID' : 'CLAMPED'}}` }
          ]
        },
        {
          sub: 'OOP lateral actions (AS/NZS 1170.5 Chapter 8 — parts)',
          formulas: [
            { caption: 'Part height amplification factor (§8.4.2.3)', tex: `H = 1 + 2\\frac{h_x}{h_n} = 1 + 2\\times\\frac{${tx(ps.hx)}}{${tx(ps.hn)}} = ${tx(ps.H, 3)}` },
            { caption: 'Wall panel tributary weight (per metre length over hroof)', tex: `W_p = \\gamma_c\\,t_w\\,h_{roof} = ${tx(ps.Wp)}\\,\\mathrm{kN/m}` },
            { caption: 'Part seismic force (§8.4.2.2)', tex: `F_p = C_p\\,H\\,W_p = (${tx(ps.Cp)})(${tx(ps.H, 3)})(${tx(ps.Wp)}) = ${tx(ps.Fp)}\\,\\mathrm{kN/m}` },
            { caption: 'OOP seismic pressure (uniform over hroof)', tex: `W_E = \\frac{F_p}{h_{roof}} = C_p\\,H\\,\\gamma_c\\,t_w = ${tx(op.WE)}\\,\\mathrm{kPa}` },
            { caption: 'Governing wind pressure', tex: `W_{pressure} = \\max(w_{wd},w_{wf}) = ${tx(op.WindPressure)}\\,\\mathrm{kPa}` },
            { caption: 'Mid-height moment', tex: `M_a = \\max(M_E,M_W)k_{mid} + \\Delta M_{add,mid} = ${tx(op.Ma)}\\,\\mathrm{kN\\cdot m/m}` }
          ]
        },
        {
          sub: 'Support condition adjustments',
          formulas: [
            { caption: 'Adjustment factors (baseline wL²/8 & wL²/2)', tex: `k_{mid} = ${tx(sc.wsMidAdjust, 3)},\\qquad k_{base} = ${tx(sc.wsBaseAdjust, 3)},\\qquad k_{fire} = ${tx(sc.fireAdjust, 3)}` }
          ]
        },
        {
          sub: 'Flexural capacity & P-Δ (UR1)',
          formulas: [
            { caption: 'Flexural capacity', tex: `\\phi M_n = 0.85A_{WV}f_y\\left(d-\\frac{a}{2}\\right)/10^6 = ${tx(op.phiMn)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'P-Δ magnified moment', tex: `M' = \\frac{M_a}{1-\\frac{5N_a h_{roof}^2}{0.75\\times48E_cI_{cr}}} = ${tx(op.M_prime)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'Ultimate deflection', tex: `\\Delta_u = ${tx(op.delta_u, 1)}\\,\\mathrm{mm}` },
            { caption: 'Mid-height utilisation', tex: `UR_1 = \\frac{M'}{\\phi M_n} = ${txUR(op.UR1)} \\Rightarrow \\text{${Number.isFinite(op.UR1) && op.UR1 <= 1 ? 'PASS' : 'CHECK'}}` }
          ]
        },
        {
          sub: 'Base moment (UR2)',
          formulas: [
            { caption: 'Base moments', tex: `M_{bE} = ${tx(op.MbE)},\\qquad M_{bW} = ${tx(op.MbW)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'Base utilisation', tex: `UR_2 = \\frac{\\max(M_{bE},M_{bW})}{\\phi M_n} = ${txUR(op.UR2)} \\Rightarrow \\text{${Number.isFinite(op.UR2) && op.UR2 <= 1 ? 'PASS' : 'CHECK'}}` }
          ]
        },
        {
          sub: 'Fire check (UR3)',
          formulas: [
            { caption: 'Steel temperature', tex: `T_{fs} = \\eta_x\\eta_w\\times660 = ${tx(op.Tfs, 0)}\\,^{\\circ}\\mathrm{C},\\qquad f_{yt} = ${tx(op.fyt, 0)}\\,\\mathrm{MPa}` },
            { caption: 'Fire moment', tex: `M_{bf} = \\frac{w_f(H_w-t_f)^2}{2}k_{fire} = ${tx(op.Mbf)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'Fire utilisation', tex: `UR_3 = \\frac{M_{bf}}{\\phi M_{n,fire}} = ${txUR(op.UR3)} \\Rightarrow \\text{${Number.isFinite(op.UR3) && op.UR3 <= 1 ? 'PASS' : 'CHECK'}}` }
          ]
        },
        {
          sub: 'OOP shear (UR4)',
          formulas: [
            { caption: 'Shear demand', tex: `V' = \\max(V_E,V_w) = ${tx(op.Vprime)}\\,\\mathrm{kN/m}` },
            { caption: 'Shear capacity', tex: `\\phi V = 0.75(V_c+V_s) = ${tx(op.phiVw)}\\,\\mathrm{kN/m}` },
            { caption: 'Shear utilisation', tex: `UR_4 = ${txUR(op.UR4)} \\Rightarrow \\text{${Number.isFinite(op.UR4) && op.UR4 <= 1 ? 'PASS' : 'CHECK'}}` }
          ]
        }
      ]
    },
    {
      title: '6. Base Connection Design',
      steps: [
        {
          sub: 'Shear demand',
          formulas: [
            { caption: 'Connection shear demand', tex: `V^*_{conn} = \\max(V^*_{in},\\,V' b) = \\max(${tx(dm.VinPlane)},${tx(dm.VoutTotal)}) = ${tx(dm.Vstar)}\\,\\mathrm{kN}` }
          ]
        },
        {
          sub: 'Dowel shear capacity',
          formulas: [
            { caption: 'Steel shear', tex: `V_{steel} = n\\times0.6A_df_y/1000 = ${tx(dw.VdowelSteel)}\\,\\mathrm{kN}` },
            { caption: 'Grout bond anchorage', tex: `V_{bond} = n\\pi\\phi_dl_{emb}\\times0.35\\sqrt{f'_g}/1000 = ${tx(dw.VgroutBond)}\\,\\mathrm{kN}` },
            { caption: 'Governing dowel shear', tex: `V_{dowel} = \\min(V_{steel},V_{bond}) = ${tx(dw.Vdowel)}\\,\\mathrm{kN}` }
          ]
        },
        {
          sub: 'Friction, shear key & utilisation',
          formulas: [
            { caption: 'Shear friction', tex: `V_{fric} = \\mu N^* = ${tx(fr.Vfriction)}\\,\\mathrm{kN}` },
            { caption: 'Shear key contribution', tex: `V_{key} = ${tx(fr.VshearKey)}\\,\\mathrm{kN}` },
            { caption: 'Connection shear utilisation', tex: `UR_{V,conn} = \\frac{V^*_{conn}}{\\phi(V_{dowel}+V_{fric}+V_{key})} = ${txUR(rt.shearRatio)} \\Rightarrow \\text{${cn.checks?.shearPass ? 'PASS' : 'CHECK'}}` }
          ]
        },
        {
          sub: 'Uplift & grout bearing',
          formulas: [
            { caption: 'Uplift utilisation', tex: `UR_{T,conn} = \\frac{T^*}{\\phi nA_df_y/1000} = \\frac{${tx(dm.Tstar)}}{${tx(cap.phiTconn)}} = ${txUR(rt.tensionRatio)} \\Rightarrow \\text{${cn.checks?.tensionPass ? 'PASS' : 'CHECK'}}` },
            { caption: 'Grout bed bearing', tex: `\\sigma = ${tx(cbe.sigmaBearing, 4)}\\,\\mathrm{MPa} \\le 0.6\\sqrt{f'_g} = ${tx(cbe.bearingCapacity, 4)}\\,\\mathrm{MPa} \\Rightarrow \\text{${cn.checks?.bearingPass ? 'PASS' : 'CHECK'}}` }
          ]
        }
      ]
    },
    {
      title: '7. Foundation Design',
      steps: [
        {
          sub: 'OOP foundation (UR5 bearing / UR6 footing flexure)',
          formulas: [
            { caption: 'Overturning & resisting moment', tex: `M_O = ${tx(op.Mo)},\\qquad M_R = ${tx(op.MR_weight)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'Effective bearing length', tex: `L_{BR} = 2\\min(X,L/2) = ${tx(op.LBR, 0)}\\,\\mathrm{mm}` },
            { caption: 'Bearing utilisation', tex: `UR_5 = \\frac{q_d}{0.5q_U} = ${txUR(op.UR5)} \\Rightarrow \\text{${Number.isFinite(op.UR5) && op.UR5 <= 1 ? 'PASS' : 'CHECK'}}` },
            { caption: 'Footing flexure utilisation', tex: `UR_6 = \\frac{M_O}{\\phi M_{n,foot}} = ${txUR(op.UR6)} \\Rightarrow \\text{${Number.isFinite(op.UR6) && op.UR6 <= 1 ? 'PASS' : 'CHECK'}}` }
          ]
        },
        {
          sub: 'In-plane footing checks',
          formulas: [
            { caption: 'Total axial force', tex: `N_{total} = N^* + G_{foot} = ${tx(fd.Ntotal)}\\,\\mathrm{kN}` },
            { caption: 'Base pressure', tex: `q_{max} = \\frac{N_{total}}{A}+\\frac{M^*}{Z} = ${tx(fd.qMax, 0)}\\,\\mathrm{kPa},\\qquad q_{min} = ${tx(fd.qMin, 0)}\\,\\mathrm{kPa}` },
            { caption: 'Bearing utilisation', tex: `UR_{foot,q} = \\frac{q_{max}}{q_{allow}} = ${txUR(fd.bearingRatio)} \\Rightarrow \\text{${fd.checks?.bearingPass ? 'PASS' : 'CHECK'}}` },
            { caption: 'Sliding utilisation', tex: `UR_{slide} = \\frac{V^*}{\\mu N_{total}} = ${txUR(fd.slidingRatio)} \\Rightarrow \\text{${fd.checks?.slidingPass ? 'PASS' : 'CHECK'}}` }
          ]
        }
      ]
    },
    {
      title: '8. Utilisation Summary',
      steps: [
        {
          sub: 'Implemented checks (UR ≤ 1.00)',
          formulas: [
            { caption: 'In-plane', tex: `UR_{bearing}=${txUR(be.bearingRatio)},\\quad UR_{N-M}=${txUR(it.interactionRatio)},\\quad UR_V=${txUR(sh.shearRatio)}` },
            { caption: 'Out-of-plane', tex: `UR_1=${txUR(op.UR1)},\\quad UR_2=${txUR(op.UR2)},\\quad UR_3=${txUR(op.UR3)}` },
            { caption: 'Out-of-plane (cont.)', tex: `UR_4=${txUR(op.UR4)},\\quad UR_5=${txUR(op.UR5)},\\quad UR_6=${txUR(op.UR6)}` },
            { caption: 'Connection', tex: `UR_{V,conn}=${txUR(rt.shearRatio)},\\quad UR_{T,conn}=${txUR(rt.tensionRatio)}` },
            { caption: 'In-plane foundation', tex: `UR_{foot,q}=${txUR(fd.bearingRatio)},\\quad UR_{slide}=${txUR(fd.slidingRatio)}` }
          ]
        }
      ]
    }
  ];
}

/* ============================================================================
v0.6.1 新增 —— Detail Report 数据层
getPrecastPanelDetailSections：与 Calculation Tab 完全一致的完整公式推导
（每一步均代入数值，公式条数 / 细节与屏幕 Block 组件一一对应）。
v0.6.2 —— Section 4 新增 4.7 边缘构件局部压弯 N-M
（nmTable → 需求包络表；nmChart → N-M 承载力曲线与需求包络图）。
注意：Detail Report 为单栏全宽排版；4.7 中超长的平衡点公式已拆分为两条，
避免打印时的横向溢出。
========================================================================== */
export function getPrecastPanelDetailSections(inputs, results) {
  const ip = results.inPlane || {};
  const op = results.outOfPlane || {};
  const cn = results.connection || {};
  const fd = results.foundation || {};

  const geo = ip.geometry || {};
  const g = ip.gravity || {};
  const s = ip.seismic || {};
  const di = ip.diaphragm || {};
  const a = ip.sectionActions || {};
  const es = ip.elasticStress || {};
  const sl = ip.slenderness || {};
  const be = ip.bearing || {};
  const re = ip.reinforcement || {};
  const it = ip.interaction || {};
  const sh = ip.shear || {};
  const ch = ip.checks || {};
  const hv = op.hroofValidation || {};
  const sc = op.supportConditions || {};
  const ps = op.partSeismic || {};
  const add = op.additionalLoads || {};
  const wsF = sc.windSeismicFactors || { mid: 1 / 8, base: 1 / 8 };
  const fF = sc.fireFactors || { base: 1 / 2 };
  const dm = cn.demand || {};
  const dw = cn.dowel || {};
  const fr = cn.friction || {};
  const cap = cn.capacity || {};
  const cbe = cn.bearing || {};
  const rt = cn.ratios || {};

  /* v0.6.2 —— 边缘构件局部 N-M（Lintel 反力作用于墙边） */
  const bn = ip.boundaryNM || {};
  const bns = bn.section || {};
  const bnk = bn.keyPoints || {};
  const bng = bn.gravityShare || {};
  const bnc = bn.checks || {};
  const bngov = bn.governing || {};

  const diaV = Math.max(safe(di.VdiaphragmWind), safe(di.VdiaphragmSeismic));
  const diaM = Math.max(safe(di.MdiaphragmWind), safe(di.MdiaphragmSeismic));
  const nV = re.nVerticalBars ?? 0;
  const minBlock = Math.min(safe(re.d), safe(inputs.boundaryWidth) * 1000);

  /* 生成公式状态标记（PASS / CHECK 等） */
  const st = (pass, okLabel, badLabel) => ({ pass: Boolean(pass), label: pass ? okLabel : badLabel });

  /* ★ 为公式展示推算辅助变量 */
  const hroofEff = safe(hv.hroofEffective);
  const baseLeverArm = Math.max(safe(inputs.wallHeight) - hroofEff - safe(inputs.tf) / 1000, 0);
  const HwMinusTf = safe(inputs.wallHeight) - safe(inputs.tf) / 1000;
  const MstarIP = safe(ip.sectionActions?.Mtotal);
  const VstarIP = safe(ip.sectionActions?.Vtotal);

  return [
    {
      title: '1. Geometry & Load Derivation · 几何特性与荷载推算',
      steps: [
        {
          sub: '1.1 In-plane section properties · 平面内截面特性',
          formulas: [
            { caption: 'Gross area / 毛截面面积', tex: `A_g = (b\\times1000)(t\\times1000) = (${tx(geo.b)}\\times1000)(${tx(geo.t)}\\times1000) = ${tx(geo.Ag, 0)}\\,\\mathrm{mm^2}` },
            { caption: 'Second moment of area / 惯性矩', tex: `I = \\frac{(b\\times1000)(t\\times1000)^3}{12} = ${tx(geo.I, 0)}\\,\\mathrm{mm^4}` },
            { caption: 'Section modulus / 截面模量', tex: `Z_g = \\frac{(b\\times1000)^2(t\\times1000)}{6} = ${tx(geo.Zg, 0)}\\,\\mathrm{mm^3}` }
          ]
        },
        {
          sub: '1.2 Roof pressures → line loads · 屋面压力 → 线荷载 (line load = pressure × Sr)',
          formulas: [
            { caption: 'Dead line load / 永久荷载线荷载', tex: `g_{line} = g\\times S_r = (${tx(inputs.gLine)}\\,\\mathrm{kPa})(${tx(inputs.Sr)}\\,\\mathrm{m}) = ${tx(g.gLineLoad)}\\,\\mathrm{kN/m}` },
            { caption: 'Live line load / 活荷载线荷载', tex: `q_{line} = q\\times S_r = (${tx(inputs.qLine)}\\,\\mathrm{kPa})(${tx(inputs.Sr)}\\,\\mathrm{m}) = ${tx(g.qLineLoad)}\\,\\mathrm{kN/m}` },
            { caption: 'Roof wind line load / 屋面风压线荷载', tex: `w_{wd,line} = w_{wd}\\times S_r = (${tx(inputs.wwd)}\\,\\mathrm{kPa})(${tx(inputs.Sr)}\\,\\mathrm{m}) = ${tx(safe(inputs.wwd) * safe(inputs.Sr, 1))}\\,\\mathrm{kN/m}` }
          ]
        },
        {
          sub: '1.3 In-plane self-weight & gravity ULS · 平面内自重与重力组合',
          formulas: [
            { caption: 'Wall self-weight / 墙体自重', tex: `G_{wall} = \\gamma_c\\,t\\,h\\,b = (${tx(inputs.concreteDensity)})(${tx(inputs.wallThickness)})(${tx(inputs.wallHeight)})(${tx(inputs.wallWidth)}) = ${tx(g.Gwall)}\\,\\mathrm{kN}` },
            { caption: 'Total permanent line load / 顶部永久线荷载合计', tex: `G_{line,total} = g_{line}\\times b = (${tx(g.gLineLoad)})(${tx(geo.b)}) = ${tx(g.GlineTotal)}\\,\\mathrm{kN}` },
            { caption: 'Total imposed line load / 顶部活线荷载合计', tex: `Q_{line,total} = q_{line}\\times b = (${tx(g.qLineLoad)})(${tx(geo.b)}) = ${tx(g.QlineTotal)}\\,\\mathrm{kN}` },
            { caption: 'Gravity ULS axial force / 重力 ULS 轴力', tex: `N^*_{gravity} = 1.2(G_{wall}+G_{line,total}) + 1.5\\,Q_{line,total} = 1.2(${tx(g.Gwall)}+${tx(g.GlineTotal)}) + 1.5(${tx(g.QlineTotal)}) = ${tx(g.Ngravity)}\\,\\mathrm{kN}` }
          ]
        },
        {
          sub: '1.4 OOP gravity axial force · 平面外重力轴力',
          formulas: [
            { caption: 'Roof dead line load / 屋面恒载', tex: `W_d = S_r\\,w_d = ${tx(op.Wd_line)}\\,\\mathrm{kN/m}` },
            { caption: 'Wall self-weight above mid-height / 墙体自重（半高以上）', tex: `N_{SW} = \\frac{t_w}{1000}\\cdot\\frac{H_w-t_f}{2}\\cdot\\gamma_c = ${tx(op.NSW)}\\,\\mathrm{kN/m}` },
            { caption: 'Footing weight / 基础自重', tex: `N_{FF} = L_f\\frac{t_f}{1000}\\gamma_c = ${tx(op.NFF)}\\,\\mathrm{kN/m}` },
            { caption: 'Slab weight / 楼板自重', tex: `N_{SF} = (L_f+2f_o)\\frac{t_s}{1000}\\gamma_c = ${tx(op.NSF)}\\,\\mathrm{kN/m}` },
            { caption: 'Hardfill weight / 硬填层自重', tex: `N_{HF} = (L_f+2f_o)\\frac{d_s}{1000}\\gamma_s = ${tx(op.NHF)}\\,\\mathrm{kN/m}` },
            { caption: 'Effective gravity axial force / 有效重力轴力', tex: `N_{GE} = N_{SW}+N_{FF}+N_{SF}+N_{HF}+W_d = ${tx(op.N_GE)}\\,\\mathrm{kN/m}` },
            { caption: 'ULS gravity envelope / ULS 重力包络', tex: `N_{max} = \\max(1.35\\,N_{GE},\\;1.2\\,N_{GE}+1.5\\,W_q) = ${tx(op.Nmax)}\\,\\mathrm{kN/m}` }
          ]
        }
      ]
    },
    {
      title: '2. In-Plane Seismic Action · 平面内抗震作用 (AS/NZS 1170.5 §3.2.2)',
      steps: [
        {
          sub: '2.1 Seismic coefficients',
          formulas: [
            { caption: 'Elastic site hazard coefficient / 弹性场地危险系数', tex: `C(T) = C_h(T)\\,Z\\,R_u\\,N(T,D) = (${tx(s.Ch)})(${tx(s.Z)})(${tx(s.Ru)})(${tx(s.Nt)}) = ${tx(s.C, 5)}` },
            { caption: 'Structural performance factor / 结构性能系数', tex: `S_p = 1.3 - 0.3\\mu = 1.3 - 0.3(${tx(s.mu)}) = ${tx(s.Sp)}` },
            { caption: 'Design action coefficient / 设计作用系数', tex: `C_d(T) = C(T)\\frac{S_p}{\\mu} = ${tx(s.C, 5)}\\times\\frac{${tx(s.Sp)}}{${tx(s.mu)}} = ${tx(s.Cd, 5)}` }
          ]
        },
        {
          sub: '2.2 Base shear and overturning moment',
          formulas: [
            { caption: 'In-plane base shear / 平面内基底剪力', tex: `V^*_{seismic} = C_d\\,W_t\\,k_d = (${tx(s.Cd, 5)})(${tx(s.Wt)}\\,\\mathrm{kN})(${tx(inputs.seismicDistributionFactor)}) = ${tx(s.Vseismic)}\\,\\mathrm{kN}` },
            { caption: 'Seismic overturning moment / 抗震倾覆弯矩', tex: `M^*_{seismic} = V^*_{seismic}\\,h = (${tx(s.Vseismic)})(${tx(inputs.wallHeight)}) = ${tx(s.Mseismic)}\\,\\mathrm{kN\\cdot m}` }
          ]
        }
      ]
    },
    {
      title: '3. Combined In-Plane Actions · 平面内组合内力 (Seismic + Diaphragm + Lintel)',
      steps: [
        {
          sub: '3.1 Roof diaphragm forces · 屋盖隔膜力 (at wall top)',
          formulas: [
            { caption: 'Envelope diaphragm force / 隔膜水平力包络', tex: `V_{dia} = \\max(V_{wd},\\,V_{es}) = \\max(${tx(di.VdiaphragmWind)},\\,${tx(di.VdiaphragmSeismic)}) = ${tx(diaV)}\\,\\mathrm{kN}` },
            { caption: 'Diaphragm moment at base / 隔膜底部弯矩', tex: `M_{dia} = V_{dia}\\times h = ${tx(diaV)}\\times${tx(inputs.wallHeight)} = ${tx(diaM)}\\,\\mathrm{kN\\cdot m}` }
          ]
        },
        {
          sub: '3.2 Lintel reaction & eccentricity · 过梁反力与偏心',
          formulas: [
            { caption: 'Lintel eccentric moment / 过梁偏心弯矩', tex: `M_{lintel} = R_{lintel}\\,e = (${tx(inputs.lintelReaction)}\\,\\mathrm{kN})(${tx(inputs.lintelEccentricity)}\\,\\mathrm{m}) = ${tx(a.Mlintel)}\\,\\mathrm{kN\\cdot m}` }
          ]
        },
        {
          sub: '3.3 Axial forces & total actions · 轴力与总内力',
          formulas: [
            { caption: 'Seismic gravity axial force / 抗震重力组合轴力', tex: `N_{EQ,g} = G_{wall}+G_{line,total}+\\psi_e Q_{line,total} = ${tx(a.seismicGravity)}\\,\\mathrm{kN}` },
            { caption: 'Compression case / 受压工况轴力', tex: `N^*_{comp} = N_{EQ,g}+R_{lintel} = ${tx(a.seismicGravity)}+${tx(inputs.lintelReaction)} = ${tx(a.NseismicCompression)}\\,\\mathrm{kN}` },
            { caption: 'Opposite direction axial force / 反向抗震轴力', tex: `N^*_{tension} = N_{EQ,g}-R_{lintel} = ${tx(a.seismicGravity)}-${tx(inputs.lintelReaction)} = ${tx(a.NseismicTension)}\\,\\mathrm{kN}`, status: st(safe(a.NseismicTension) >= 0, 'COMPRESSION', 'TENSION / UPLIFT') },
            { caption: 'Total in-plane moment / 总弯矩', tex: `M^* = M^*_{seismic}+M_{dia}+M_{lintel} = ${tx(s.Mseismic)}+${tx(diaM)}+${tx(a.Mlintel)} = ${tx(a.Mtotal)}\\,\\mathrm{kN\\cdot m}` },
            { caption: 'Total in-plane shear / 总剪力', tex: `V^* = V^*_{seismic}+V_{dia} = ${tx(s.Vseismic)}+${tx(diaV)} = ${tx(a.Vtotal)}\\,\\mathrm{kN}` }
          ]
        }
      ]
    },
    {
      title: '4. In-Plane Section Checks · 平面内截面验算 (NZS 3101 simplified)',
      steps: [
        {
          sub: '4.1 Elastic stress distribution · 弹性应力分布',
          formulas: [
            { caption: 'Uniform axial stress / 均匀轴压应力', tex: `\\sigma_N = \\frac{N^*}{A_g} = \\frac{${tx(a.NseismicCompression)}\\times1000}{${tx(geo.Ag, 0)}} = ${tx(es.sigmaN, 4)}\\,\\mathrm{MPa}` },
            { caption: 'Bending stress / 弯曲应力', tex: `\\sigma_M = \\frac{M^*}{Z_g} = \\frac{${tx(a.Mtotal)}\\times10^6}{${tx(geo.Zg, 0)}} = ${tx(es.sigmaM, 4)}\\,\\mathrm{MPa}` },
            { caption: 'Maximum edge compression / 最大边缘压应力', tex: `\\sigma_{max} = \\sigma_N+\\sigma_M = ${tx(es.sigmaMax, 4)}\\,\\mathrm{MPa} \\le 0.6f'_c`, status: st(ch.stressCompressionPass, 'PASS', 'CHECK') },
            { caption: 'Minimum edge stress / 最小边缘应力', tex: `\\sigma_{min} = \\sigma_N-\\sigma_M = ${tx(es.sigmaMin, 4)}\\,\\mathrm{MPa}`, status: st(safe(es.sigmaMin) >= 0, 'NO TENSION', 'TENSION PREDICTED') },
            { caption: 'Resultant eccentricity / 合力偏心距', tex: `e = \\frac{M^*}{N^*} = ${tx(es.eccentricity, 4)}\\,\\mathrm{m} = ${tx(safe(es.eccentricity) * 1000, 1)}\\,\\mathrm{mm},\\qquad e_{kern} = \\frac{b}{6} = ${tx(es.kern, 4)}\\,\\mathrm{m}` }
          ]
        },
        {
          sub: '4.2 Slenderness classification · 长细比与分类',
          formulas: [
            { caption: 'In-plane aspect ratio / 平面内高宽比', tex: `\\frac{h}{l_w} = \\frac{${tx(inputs.wallHeight)}}{${tx(inputs.wallWidth)}} = ${tx(sl.aspectRatio)}\\quad\\Rightarrow\\quad\\text{${sl.wallClassification || '-'}}` },
            { caption: 'Out-of-plane slenderness / 平面外长细比', tex: `\\frac{h}{t} = \\frac{${tx(inputs.wallHeight)}}{${tx(inputs.wallThickness)}} = ${tx(sl.outOfPlaneSlenderness)}`, status: st(!ch.slendernessWarning, 'h/t ≤ 25', 'h/t > 25 — CHECK') }
          ]
        },
        {
          sub: '4.3 Lintel bearing (D-region) · 过梁局部承压',
          formulas: [
            { caption: 'Bearing area / 承压面积', tex: `A_b = \\frac{b_b}{1000}\\times\\frac{l_b}{1000} = ${tx(safe(inputs.bearingWidth) * safe(inputs.bearingLength) / 1e6, 6)}\\,\\mathrm{m^2} = ${tx(safe(inputs.bearingWidth) * safe(inputs.bearingLength), 0)}\\,\\mathrm{mm^2}` },
            { caption: 'Bearing stress / 承压应力', tex: `\\sigma_b = \\frac{R_{lintel}}{A_b} = \\frac{${tx(inputs.lintelReaction)}\\times1000}{${tx(safe(inputs.bearingWidth) * safe(inputs.bearingLength), 0)}} = ${tx(be.bearingStress, 4)}\\,\\mathrm{MPa}` },
            { caption: 'Bearing capacity / 承压承载力限值', tex: `\\sigma_{b,cap} = 0.6\\sqrt{f'_c} = 0.6\\sqrt{${tx(inputs.fc)}} = ${tx(safe(be.bearingCapacity) / 1000, 4)}\\,\\mathrm{MPa}` },
            { caption: 'Bearing utilisation / 承压利用率', tex: `UR_{bearing} = \\frac{\\sigma_b}{\\sigma_{b,cap}} = ${txUR(be.bearingRatio)} = ${txPct(be.bearingRatio)}\\%`, status: st(ch.bearingPass, 'PASS', 'CHECK') }
          ]
        },
        {
          sub: '4.4 Reinforcement properties · 配筋特性 (bar count from spacing)',
          formulas: [
            { caption: 'Number of vertical bars / 竖向分布筋根数', tex: `n_v = \\left\\lfloor\\frac{b\\times1000}{s_v}\\right\\rfloor + 1 = \\left\\lfloor\\frac{${tx(geo.b)}\\times1000}{${tx(inputs.VbarSpace, 0)}}\\right\\rfloor + 1 = ${tx(nV, 0)}` },
            { caption: 'Distributed vertical steel / 竖向分布筋面积', tex: `A_{s,dist} = n_v\\frac{\\pi\\phi_v^2}{4} = ${tx(re.AsDistributed, 1)}\\,\\mathrm{mm^2}` },
            { caption: 'Vertical reinforcement ratio / 竖向配筋率', tex: `\\rho_v = \\frac{A_{s,dist}}{A_g} = ${tx(safe(re.rhoVertical) * 100, 3)}\\%` },
            { caption: 'Boundary steel / 边缘构件纵筋', tex: `A_{s,b} = n_b\\frac{\\pi\\phi_b^2}{4} = (${tx(inputs.boundaryBarCount, 0)})\\frac{\\pi(${tx(inputs.boundaryBarDiameter, 0)})^2}{4} = ${tx(re.AsBoundary, 1)}\\,\\mathrm{mm^2}` },
            { caption: 'Boundary reinforcement ratio / 边缘构件配筋率', tex: `\\rho_b = \\frac{A_{s,b}}{A_{boundary}} = ${tx(safe(re.rhoBoundary) * 100, 3)}\\%` },
            { caption: 'Boundary steel tensile capacity / 边缘钢筋抗拉能力', tex: `T_{s,b} = A_{s,b}f_y/1000 = ${tx(re.boundarySteelTensionCapacity)}\\,\\mathrm{kN}` }
          ]
        },
        {
          sub: '4.5 Simplified N-M interaction · N-M 交互（简化模型）',
          formulas: [
            { caption: 'Effective depth / 有效高度', tex: `d = t\\times1000 - c_{cover} - \\frac{\\phi_b}{2} = ${tx(re.d, 1)}\\,\\mathrm{mm}` },
            { caption: 'Concrete compression force / 混凝土压力', tex: `C_c = 0.85\\,f'_c\\,b_c\\,a_{block} = 0.85(${tx(inputs.fc)})(${tx(safe(inputs.boundaryWidth) * 1000, 0)})(${tx(minBlock, 0)}) = ${tx(it.compressionConcrete, 0)}\\,\\mathrm{N}` },
            { caption: 'Steel compression force / 钢筋压力', tex: `C_s = A_{s,b}f_y = ${tx(it.steelCompression, 0)}\\,\\mathrm{N}` },
            { caption: 'Design axial capacity / 轴压承载力', tex: `\\phi P_n = \\phi_c(C_c+C_s)/1000 = ${tx(it.phiPn)}\\,\\mathrm{kN}` },
            { caption: 'Approximate flexural capacity / 近似抗弯承载力', tex: `\\phi M_n = \\phi_f\\frac{(C_c+C_s)(d/2)}{10^6} = ${tx(it.phiMn)}\\,\\mathrm{kN\\cdot m}` },
            { caption: 'N-M interaction ratio / N-M 交互利用率', tex: `\\eta_{N-M} = \\frac{N^*}{\\phi P_n} + \\frac{M^*}{\\phi M_n} = ${tx(it.axialRatio, 4)} + ${tx(it.momentRatio, 4)} = ${txUR(it.interactionRatio)}`, status: st(ch.interactionPass, 'PASS', 'CHECK') }
          ]
        },
        {
          sub: '4.6 In-plane shear · 平面内抗剪',
          formulas: [
            { caption: 'Web width & shear depth / 腹板宽度与有效剪深', tex: `b_w = ${tx(sh.bw, 0)}\\,\\mathrm{mm},\\qquad d_v = 0.8d = ${tx(sh.dv, 0)}\\,\\mathrm{mm}` },
            { caption: 'Concrete shear capacity / 混凝土抗剪', tex: `V_c = 0.17\\sqrt{f'_c}\\,b_w\\,d_v/1000 = ${tx(sh.vc)}\\,\\mathrm{kN},\\qquad \\phi V_c = ${tx(sh.phiVc)}\\,\\mathrm{kN}` },
            { caption: 'Horizontal steel contribution / 水平筋抗剪', tex: `V_s = \\frac{2A_{\\phi h}f_y d_v}{s_h} = ${tx(sh.VsProvided)}\\,\\mathrm{kN}` },
            { caption: 'Design shear capacity / 抗剪承载力', tex: `\\phi V = \\phi V_c + \\phi V_s = ${tx(sh.shearCapacity)}\\,\\mathrm{kN}` },
            { caption: 'Shear utilisation / 抗剪利用率', tex: `UR_V = \\frac{V^*}{\\phi V} = \\frac{${tx(a.Vtotal)}}{${tx(sh.shearCapacity)}} = ${txUR(sh.shearRatio)} = ${txPct(sh.shearRatio)}\\%`, status: st(ch.shearPass, 'PASS', 'CHECK') }
          ]
        },
        /* ------------------------------------------------------------
           v0.6.2 新增 —— 4.7 边缘构件局部压弯 N-M（仅 Detail Report）
           Lintel 反力作用于墙边时边缘构件的局部 N-M 验算：
             · 完整平截面 N-M 承载力曲线（εcu=0.003，β1 折减，对数扫描）
             · ϕ(N) 设计包络：受压区 ϕc → 平衡点以下线性过渡至 ϕf
             · 需求包络 D0/D1/D2（1.35G / 1.2G+1.5Q / G+ψeQ+R，含 R·e）
             · UR = M* / φMn(N*)（等轴力内插），并校核 N* ≤ φP0
           nmTable → 渲染需求包络表；nmChart → 渲染 N-M 交互图
           注：平衡点公式拆分为两条，防止单栏打印超宽。
        ------------------------------------------------------------ */
        {
          sub: '4.7 Boundary element local N-M (lintel at wall edge) · 边缘构件局部压弯 N-M（v0.6.2 新增）',
          nmTable: Boolean(bn.available),
          nmChart: Boolean(bn.available),
          formulas: bn.available ? [
            { caption: 'Boundary section & reinforcement / 边缘构件截面与配筋（绕墙厚方向轴受弯，两层对称配筋近似）',
              tex: `A_b = b_b\\times t_b = ${tx(bns.bw)}\\times${tx(bns.bt)} = ${tx(safe(bns.bw) * safe(bns.bt), 4)}\\,\\mathrm{m^2},\\qquad A_{s,b} = ${tx(bns.AsTotal, 0)}\\,\\mathrm{mm^2},\\qquad d = ${tx(bns.d, 0)}\\,\\mathrm{mm}` },
            { caption: 'Strain-compatibility parameters / 平截面参数',
              tex: `\\varepsilon_{cu} = 0.003,\\qquad \\beta_1 = \\max[0.85-0.008(f'_c-30),\\,0.65] = ${tx(bns.beta1, 3)},\\qquad \\phi_c = ${tx(inputs.phiCompression)},\\;\\phi_f = ${tx(inputs.phiFlexure)}` },
            { caption: 'Pure compression capacity / 纯压承载力',
              tex: `\\phi P_0 = \\phi_c[0.85f'_c(A_b-A_s)+f_yA_s] = ${tx(bnk.phiP0, 0)}\\,\\mathrm{kN}` },
            { caption: 'Balanced neutral axis / 平衡点中性轴深度',
              tex: `c_b = \\frac{\\varepsilon_{cu}}{\\varepsilon_{cu}+f_y/E_s}\\,d = ${tx(bnk.cb, 0)}\\,\\mathrm{mm}` },
            { caption: 'Balanced point (nominal & design) / 平衡点（名义与设计值）',
              tex: `(N_b,M_b) = (${tx(bnk.Nb, 0)}\\,\\mathrm{kN},\\;${tx(bnk.Mb, 1)}\\,\\mathrm{kN\\cdot m}),\\qquad (\\phi N_b,\\phi M_b) = (${tx(bnk.phiNb, 0)}\\,\\mathrm{kN},\\;${tx(bnk.phiMb, 1)}\\,\\mathrm{kN\\cdot m})` },
            { caption: 'Pure bending capacity / 纯弯承载力（N = 0 交点）',
              tex: `\\phi M_0 = ${tx(bnk.phiM0, 1)}\\,\\mathrm{kN\\cdot m}` },
            { caption: 'Gravity share of boundary element / 边缘构件分担重力（按面积占比 r = A_b/A_g）',
              tex: `r = ${tx(bng.r, 4)},\\qquad G_b = ${tx(bng.Gb, 1)}\\,\\mathrm{kN},\\qquad Q_b = ${tx(bng.Qb, 1)}\\,\\mathrm{kN}` },
            { caption: 'Governing N-M utilisation (constant-N interpolation) / 控制利用率（等轴力内插：UR = M*/φMn(N*)）',
              tex: `UR_{b,N-M} = \\frac{M^*}{\\phi M_n(N^*)} = \\frac{${tx(bngov.M, 2)}}{${tx(bngov.Mcap, 2)}} = ${txUR(bnc.governingUR)} = ${txPct(bnc.governingUR)}\\%`,
              status: st(bnc.pass, 'PASS', 'CHECK') }
          ] : [
            { caption: 'Boundary element local N-M / 边缘构件局部压弯',
              tex: `\\text{Not applicable with current inputs（当前输入下不适用）}` }
          ]
        }
      ]
    },
    {
      title: '5. Out-of-Plane Design · 平面外设计 (AS/NZS 1170.5 Ch.8 Parts / §8.5.1)',
      steps: [
        {
          sub: '5.1 hroof validation · hroof 校验',
          formulas: [
            { caption: 'Maximum allowed / 允许最大值', tex: `h_{roof,max} = H_w - t_f - d_s - t_s = ${tx(inputs.wallHeight)} - ${tx(safe(inputs.tf) / 1000)} - ${tx(safe(inputs.ds) / 1000)} - ${tx(safe(inputs.ts) / 1000)} = ${tx(hv.hroofMax)}\\,\\mathrm{m}` },
            { caption: 'Effective value used / 实际采用值', tex: `h_{roof,eff} = \\min(h_{roof},\\,h_{roof,max}) = \\min(${tx(inputs.hroof)},\\,${tx(hv.hroofMax)}) = ${tx(hv.hroofEffective)}\\,\\mathrm{m}`, status: st(hv.hroofValid, 'VALID', 'CLAMPED') }
          ]
        },
        {
          sub: '5.2 OOP lateral actions (AS/NZS 1170.5 Ch.8 parts) · 平面外水平作用',
          formulas: [
            { caption: 'Part height amplification factor (§8.4.2.3)', tex: `H = 1 + 2\\frac{h_x}{h_n} = 1 + 2\\times\\frac{${tx(ps.hx)}}{${tx(ps.hn)}} = ${tx(ps.H, 3)}` },
            { caption: 'Wall panel tributary weight / 墙板重量（每延米，沿 hroof）', tex: `W_p = \\gamma_c\\,t_w\\,h_{roof} = (${tx(inputs.concreteDensity)})(${tx(safe(inputs.wallThickness))})(${tx(hv.hroofEffective)}) = ${tx(ps.Wp)}\\,\\mathrm{kN/m}` },
            { caption: 'Part seismic force (§8.4.2.2) / part 地震作用', tex: `F_p = C_p\\,H\\,W_p = (${tx(ps.Cp)})(${tx(ps.H, 3)})(${tx(ps.Wp)}) = ${tx(ps.Fp)}\\,\\mathrm{kN/m}` },
            { caption: 'OOP seismic pressure (uniform over hroof) / 平面外地震压力', tex: `W_E = \\frac{F_p}{h_{roof}} = C_p\\,H\\,\\gamma_c\\,t_w = ${tx(op.WE)}\\,\\mathrm{kPa}` },
            { caption: 'Governing wind pressure / 控制风压', tex: `W_{pressure} = \\max(w_{wd},\\,w_{wf}) = \\max(${tx(inputs.wwd)},\\,${tx(inputs.wwf)}) = ${tx(op.WindPressure)}\\,\\mathrm{kPa}` },
            { caption: 'Max-moment height / 最大弯矩高度', tex: `x_m = \\frac{h_{roof}}{2} = ${tx(op.x_m)}\\,\\mathrm{m}` },
            { caption: 'Seismic mid-height moment / 地震中部弯矩',
              tex: `M_E = \\frac{W_E\\,x_m(h^2-x_m h)}{2h} = \\frac{${tx(op.WE)}\\times${tx(op.x_m)}\\times(${tx(hroofEff)}^2-${tx(op.x_m)}\\times${tx(hroofEff)})}{2\\times${tx(hroofEff)}} = ${tx(op.ME)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'Wind mid-height moment / 风中部弯矩',
              tex: `M_W = \\frac{W_{pressure}\\,x_m(h^2-x_m h)}{2h} = \\frac{${tx(op.WindPressure)}\\times${tx(op.x_m)}\\times(${tx(hroofEff)}^2-${tx(op.x_m)}\\times${tx(hroofEff)})}{2\\times${tx(hroofEff)}} = ${tx(op.MW)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'Additional point-load mid contribution / 附加点荷载中部贡献',
              tex: `\\Delta M_{add,mid} = F_{add}\\max(h_F-x_m,0)+M_{add} = ${tx(add.F_add)}\\times\\max(${tx(add.h_force)}-${tx(op.x_m)},0)+${tx(add.M_add)} = ${tx(add.M_add_mid_F)}+${tx(add.M_add_mid_M)}\\,\\mathrm{kN\\cdot m/m}` }
          ]
        },
        {
          /* v0.6.1 —— supportTable 标记：渲染时先输出支承条件弯矩系数表 */
          sub: `5.3 Support condition factors · 支承条件弯矩系数 (W&S: ${sc.windSeismic || 'Pinned-Pinned'}; Fire: ${sc.fire || 'Fixed-Free'})`,
          supportTable: true,
          formulas: [
            { caption: 'Adjustment factors (vs baseline wL²/8 & wL²/2) / 中部/底部/火灾调整系数', tex: `k_{mid} = \\frac{${tx(wsF.mid, 4)}}{1/8} = ${tx(sc.wsMidAdjust, 3)},\\qquad k_{base} = \\frac{${tx(wsF.base, 4)}}{1/8} = ${tx(sc.wsBaseAdjust, 3)},\\qquad k_{fire} = \\frac{${tx(fF.base, 4)}}{1/2} = ${tx(sc.fireAdjust, 3)}` },
            { caption: 'Mid-height design moment / 中部设计弯矩 (incl. support factor & additional loads)',
              tex: `M_a = \\max(M_E,M_W)\\,k_{mid} + \\Delta M_{add,mid} = \\max(${tx(op.ME)},${tx(op.MW)})\\times${tx(sc.wsMidAdjust, 3)}+${tx(safe(add.M_add_mid_F) + safe(add.M_add_mid_M))} = ${tx(op.Ma)}\\,\\mathrm{kN\\cdot m/m}` }
          ]
        },
        {
          sub: '5.4 Flexural capacity · 抗弯承载力',
          formulas: [
            { caption: 'Steel tension / 钢筋拉力', tex: `T_s = L_w A_{WV} f_y/1000 = ${tx(op.Ts)}\\,\\mathrm{kN}` },
            { caption: 'Stress block depth / 应力块高度', tex: `a = \\frac{T_s\\times1000}{0.85 f'_c L_w\\times1000} = ${tx(op.a, 1)}\\,\\mathrm{mm},\\qquad d = 0.5t_w = ${tx(op.d, 0)}\\,\\mathrm{mm}` },
            { caption: 'Flexural capacity / 抗弯承载力', tex: `\\phi M_n = 0.85\\,A_{WV}f_y\\left(d-\\frac{a}{2}\\right)/10^6 = ${tx(op.phiMn)}\\,\\mathrm{kN\\cdot m/m}` }
          ]
        },
        {
          sub: '5.5 P-Delta mid-height check (UR1) · P-Δ 中部验算',
          formulas: [
            { caption: 'Concrete modulus / 混凝土弹性模量', tex: `E_c = 3320\\sqrt{f'_c}+6900 = ${tx(op.Ec, 0)}\\,\\mathrm{MPa}` },
            { caption: 'Equivalent steel area / 换算钢筋面积', tex: `A_{se} = \\frac{N_{GE}\\times1000 + A_{WV}f_y}{f_y} = ${tx(op.Ase, 0)}\\,\\mathrm{mm^2/m}` },
            { caption: 'Cracked second moment / 开裂截面惯性矩', tex: `I_{cr} = nA_{se}(d-kd)^2 + \\frac{(kd)^3}{3} = ${tx(op.Icr, 0)}\\,\\mathrm{mm^4/m}` },
            { caption: 'P-Δ magnified moment / P-Δ 放大弯矩',
              tex: `M' = \\frac{M_a}{1-\\dfrac{5N_a h_{roof}^2}{0.75\\times48\\,E_c I_{cr}}} = \\frac{${tx(op.Ma)}}{1-\\dfrac{5\\times${tx(op.Na)}\\times${tx(hroofEff * 1000, 0)}^2}{0.75\\times48\\times${tx(op.Ec, 0)}\\times${tx(op.Icr, 0)}}} = ${tx(op.M_prime)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'Ultimate deflection / 极限挠度',
              tex: `\\Delta_u = \\frac{5M' h_{roof}^2}{0.75\\times48\\,E_c I_{cr}} = \\frac{5\\times${tx(op.M_prime)}\\times${tx(hroofEff * 1000, 0)}^2}{0.75\\times48\\times${tx(op.Ec, 0)}\\times${tx(op.Icr, 0)}} = ${tx(op.delta_u, 1)}\\,\\mathrm{mm}` },
            { caption: 'Mid-height utilisation / 中部利用率', tex: `UR_1 = \\frac{M'}{\\phi M_n} = ${txUR(op.UR1)} = ${txPct(op.UR1)}\\%`, status: st(Number.isFinite(op.UR1) && op.UR1 <= 1, 'PASS', 'CHECK') }
          ]
        },
        {
          sub: '5.6 Base moment check (UR2) · 底部弯矩验算',
          formulas: [
            { caption: 'Seismic base moment / 地震底部弯矩',
              tex: `M_{bE} = \\frac{W_E(h^2-2a^2)}{8}k_{base} + \\Delta M_{add,base} = \\frac{${tx(op.WE)}\\times(${tx(hroofEff)}^2-2\\times${tx(baseLeverArm)}^2)}{8}\\times${tx(sc.wsBaseAdjust, 3)}+${tx(safe(add.M_add_base_F) + safe(add.M_add_base_M))} = ${tx(op.MbE)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'Wind base moment / 风底部弯矩',
              tex: `M_{bW} = \\frac{W_{pressure}(h^2-2a^2)}{8}k_{base} + \\Delta M_{add,base} = \\frac{${tx(op.WindPressure)}\\times(${tx(hroofEff)}^2-2\\times${tx(baseLeverArm)}^2)}{8}\\times${tx(sc.wsBaseAdjust, 3)}+${tx(safe(add.M_add_base_F) + safe(add.M_add_base_M))} = ${tx(op.MbW)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'Base utilisation / 底部利用率', tex: `UR_2 = \\frac{\\max(M_{bE},M_{bW})}{\\phi M_n} = ${txUR(op.UR2)} = ${txPct(op.UR2)}\\%`, status: st(Number.isFinite(op.UR2) && op.UR2 <= 1, 'PASS', 'CHECK') }
          ]
        },
        {
          sub: '5.7 Fire check (UR3) · 火灾验算 (support: Fire option)',
          formulas: [
            { caption: 'Axis distance / 钢筋轴向距离', tex: `x_t = \\frac{t_w}{2}-\\frac{\\phi_v}{2}-\\phi_h = ${tx(op.xt, 1)}\\,\\mathrm{mm}` },
            { caption: 'Reduction factors / 温度折减系数', tex: `\\eta_x = 0.16\\ln(t_h x_t^{-2})-0.65 = ${tx(op.etax, 3)},\\qquad \\eta_w = 1-0.162\\,t_h^{-0.6} = ${tx(op.etaw, 3)}` },
            { caption: 'Steel temperature & reduced yield / 钢筋温度与折减屈服', tex: `T_{fs} = \\eta_x\\eta_w\\times660 = ${tx(op.Tfs, 0)}\\,^{\\circ}\\mathrm{C},\\qquad f_{yt} = \\frac{720-T_{fs}}{470}f_y\\,(clamped) = ${tx(op.fyt, 0)}\\,\\mathrm{MPa}` },
            { caption: 'Fire moment (wL²/2 × k_fire) / 火灾弯矩',
              tex: `M_{bf} = \\frac{w_f(H_w-t_f)^2}{2}\\,k_{fire} = \\frac{${tx(inputs.wf)}\\times(${tx(HwMinusTf)})^2}{2}\\times${tx(sc.fireAdjust, 3)} = ${tx(op.Mbf)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'Fire utilisation / 火灾利用率', tex: `UR_3 = \\frac{M_{bf}}{\\phi M_{n,fire}} = ${txUR(op.UR3)} = ${txPct(op.UR3)}\\%`, status: st(Number.isFinite(op.UR3) && op.UR3 <= 1, 'PASS', 'CHECK') }
          ]
        },
		{
		  sub: '5.8 OOP shear (UR4) · 平面外抗剪',
		  formulas: [
			{ caption: 'Seismic shear (incl. additional force) / 地震剪力',
			  tex:  `V_E = \\frac{5}{8}W_E(H_w-t_f)+F_{add} = \\frac{5}{8}\\times${tx(op.WE)}\\times${tx(HwMinusTf)}+${tx(add.F_add)} = ${tx(op.VE)}\\,\\mathrm{kN/m}`  },
			{ caption: 'Wind shear (incl. additional force) / 风剪力',
			  tex:  `V_w = \\frac{5}{8}W_{pressure}(H_w-t_f)+F_{add} = \\frac{5}{8}\\times${tx(op.WindPressure)}\\times${tx(HwMinusTf)}+${tx(add.F_add)} = ${tx(op.Vw)}\\,\\mathrm{kN/m}`  },
			{ caption: 'Concrete shear contribution / 混凝土抗剪贡献',
			  tex:  `V_c = \\left(0.25\\sqrt{f'_c}+\\frac{N'}{4A_g}\\right)\\frac{d}{1000} = \\left(0.25\\sqrt{${tx(inputs.fc)}}+\\frac{${tx(op.Na)}}{4\\times${tx(op.Ag, 0)}}\\right)\\times\\frac{${tx(op.d, 0)}}{1000} = ${tx(op.Vc)}\\,\\mathrm{kN/m}`  },
			{ caption: 'Horizontal steel contribution / 水平筋抗剪贡献',
			  tex:  `V_s = \\frac{A_{wh}f_y d}{s_h\\times1000} = \\frac{${tx(op.AWH, 1)}\\times${tx(inputs.fy)}\\times${tx(op.d, 0)}}{${tx(inputs.HbarSpace, 0)}\\times1000} = ${tx(op.Vs)}\\,\\mathrm{kN/m}`  },
			{ caption: 'Shear utilisation / 抗剪利用率',
			  tex:  `UR_4 = \\frac{\\max(V_E,V_w)}{0.75(V_c+V_s)} = \\frac{\\max(${tx(op.VE)},${tx(op.Vw)})}{0.75(${tx(op.Vc)}+${tx(op.Vs)})} = ${txUR(op.UR4)} = ${txPct(op.UR4)}\\%` ,
			  status: st(Number.isFinite(op.UR4) && op.UR4 <= 1, 'PASS', 'CHECK') }
		  ]
		}
      ]
    },
    {
      title: '6. Base Connection Design · 连接计算 (Dowel / Grouted Connection)',
      steps: [
        {
          sub: '6.1 Shear demand · 剪力需求',
          formulas: [
            { caption: 'OOP shear over wall width / 平面外剪力换算为整墙', tex: `V_{oop,total} = V'\\times b = ${tx(dm.VoutPerM)}\\times${tx(inputs.wallWidth)} = ${tx(dm.VoutTotal)}\\,\\mathrm{kN}` },
            { caption: 'Connection shear demand / 连接剪力需求', tex: `V^*_{conn} = \\max(V^*_{in},\\,V_{oop,total}) = \\max(${tx(dm.VinPlane)},\\,${tx(dm.VoutTotal)}) = ${tx(dm.Vstar)}\\,\\mathrm{kN}` }
          ]
        },
        {
          sub: '6.2 Dowel shear capacity · 锚筋抗剪',
          formulas: [
            { caption: 'Area of one dowel / 单根锚筋面积', tex: `A_d = \\frac{\\pi\\phi_d^2}{4} = \\frac{\\pi(${tx(dw.dDowel, 0)})^2}{4} = ${tx(dw.Ad, 1)}\\,\\mathrm{mm^2}` },
            { caption: 'Steel shear capacity (0.6fy) / 钢材抗剪', tex: `V_{steel} = n\\times0.6A_df_y/1000 = (${tx(dw.nDowel, 0)})(0.6)(${tx(dw.Ad, 1)})(${tx(inputs.fy)})/1000 = ${tx(dw.VdowelSteel)}\\,\\mathrm{kN}` },
            { caption: 'Grout bond anchorage / 灌浆粘结锚固', tex: `V_{bond} = n\\pi\\phi_d l_{emb}\\times0.35\\sqrt{f'_g}/1000 = (${tx(dw.nDowel, 0)})\\pi(${tx(dw.dDowel, 0)})(${tx(dw.embedment, 0)})(0.35\\sqrt{${tx(inputs.groutStrength)}})/1000 = ${tx(dw.VgroutBond)}\\,\\mathrm{kN}` },
            { caption: 'Governing dowel shear / 锚筋抗剪取小', tex: `V_{dowel} = \\min(V_{steel},V_{bond}) = ${tx(dw.Vdowel)}\\,\\mathrm{kN}` }
          ]
        },
        {
          sub: '6.3 Shear friction & shear key · 剪切摩擦与剪力键',
          formulas: [
            { caption: 'Shear friction / 剪切摩擦', tex: `V_{fric} = \\mu N^* = (${tx(fr.muFriction)})(${tx(dm.Nstar)}) = ${tx(fr.Vfriction)}\\,\\mathrm{kN}` },
            { caption: 'Shear key contribution (simplified +15%×V_steel) / 剪力键贡献', tex: `V_{key} = ${fr.shearKey ? `0.15\\times${tx(dw.VdowelSteel)} = ${tx(fr.VshearKey)}` : '0'}\\,\\mathrm{kN}` },
            { caption: 'Connection shear capacity / 连接抗剪承载力', tex: `\\phi V_{conn} = \\phi_c(V_{dowel}+V_{fric}+V_{key}) = (${tx(cn.phiConn)})(${tx(dw.Vdowel)}+${tx(fr.Vfriction)}+${tx(fr.VshearKey)}) = ${tx(cap.phiVconn)}\\,\\mathrm{kN}` },
            { caption: 'Connection shear utilisation / 连接抗剪利用率', tex: `UR_{V,conn} = \\frac{V^*_{conn}}{\\phi V_{conn}} = \\frac{${tx(dm.Vstar)}}{${tx(cap.phiVconn)}} = ${txUR(rt.shearRatio)} = ${txPct(rt.shearRatio)}\\%`, status: st(cn.checks?.shearPass, 'PASS', 'CHECK') }
          ]
        },
        {
          sub: '6.4 Uplift & grout bed bearing · 抗拔与灌浆垫承压',
          formulas: [
            { caption: 'Dowel tension capacity / 锚筋抗拔承载力', tex: `\\phi T_{conn} = \\phi_c\\,nA_df_y/1000 = (${tx(cn.phiConn)})(${tx(dw.nDowel, 0)})(${tx(dw.Ad, 1)})(${tx(inputs.fy)})/1000 = ${tx(cap.phiTconn)}\\,\\mathrm{kN}` },
            { caption: 'Uplift utilisation / 抗拔利用率', tex: `UR_{T,conn} = \\frac{T^*}{\\phi T_{conn}} = \\frac{${tx(dm.Tstar)}}{${tx(cap.phiTconn)}} = ${txUR(rt.tensionRatio)}`, status: st(cn.checks?.tensionPass, 'PASS', 'CHECK') },
            { caption: 'Grout bed bearing / 灌浆垫承压',
              tex: `\\sigma = \\frac{N^*}{b\\times t} = \\frac{${tx(dm.Nstar)}\\times1000}{${tx(safe(inputs.wallWidth) * 1000, 0)}\\times${tx(safe(inputs.wallThickness) * 1000, 0)}} = ${tx(cbe.sigmaBearing, 4)}\\,\\mathrm{MPa} \\le 0.6\\sqrt{f'_g} = 0.6\\sqrt{${tx(inputs.groutStrength)}} = ${tx(cbe.bearingCapacity, 4)}\\,\\mathrm{MPa}\\quad\\Rightarrow\\quad UR = ${txUR(rt.bearingRatio)}`,
              status: st(cn.checks?.bearingPass, 'PASS', 'CHECK') }
          ]
        }
      ]
    },
    {
      title: '7. Foundation Design · 基础计算 (OOP UR5/UR6 + In-Plane Footing)',
      steps: [
        {
          sub: '7.1 OOP foundation (UR5 bearing / UR6 footing flexure) · 平面外基础',
          formulas: [
            { caption: 'Overturning moment / 倾覆弯矩',
              tex: `M_O = M_a\\,h_{roof} = ${tx(op.Ma)}\\times${tx(hroofEff)} = ${tx(op.Mo)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'Total weight & resisting moment / 总重力与抗倾覆力矩',
              tex: `W_{sum} = ${tx(op.Wsum)}\\,\\mathrm{kN/m},\\qquad M_R = W_{sum}\\frac{L_f+2f_o}{2} = ${tx(op.Wsum)}\\times\\frac{${tx(inputs.Lf, 0)}+2\\times${tx(inputs.fo, 0)}}{2} = ${tx(op.MR_weight)}\\,\\mathrm{kN\\cdot m/m}` },
            { caption: 'Effective bearing length / 有效承压长度',
              tex: `X = \\frac{M_R-M_O}{W_{sum}}\\times1000 = \\frac{${tx(op.MR_weight)}-${tx(op.Mo)}}{${tx(op.Wsum)}}\\times1000 = ${tx(op.X, 0)}\\,\\mathrm{mm},\\qquad L_{BR} = 2\\min(X,L/2) = ${tx(op.LBR, 0)}\\,\\mathrm{mm}` },
            { caption: 'Bearing pressure utilisation (UR5) / 基底压力利用率', tex: `UR_5 = \\frac{q_d}{q_D} = \\frac{${tx(op.qd, 0)}}{0.5\\,q_U = ${tx(op.qD, 0)}} = ${txUR(op.UR5)} = ${txPct(op.UR5)}\\%`, status: st(Number.isFinite(op.UR5) && op.UR5 <= 1, 'PASS', 'CHECK') },
            { caption: 'Footing flexure utilisation (UR6) / 基础抗弯利用率', tex: `UR_6 = \\frac{M_O}{\\phi M_{n,foot}} = \\frac{${tx(op.Mo)}}{${tx(op.phiMn_foot)}} = ${txUR(op.UR6)} = ${txPct(op.UR6)}\\%`, status: st(Number.isFinite(op.UR6) && op.UR6 <= 1, 'PASS', 'CHECK') }
          ]
        },
        {
          sub: '7.2 In-plane footing checks · 平面内基础（条形基础简化验算）',
          formulas: [
            { caption: 'Footing self-weight / 基础自重', tex: `G_{foot} = \\gamma_c B L t_{foot} = (${tx(inputs.concreteDensity)})(${tx(fd.B)})(${tx(fd.L)})(${tx(fd.tf)}) = ${tx(fd.Gfooting)}\\,\\mathrm{kN}` },
            { caption: 'Total axial force / 总轴力', tex: `N_{total} = N^* + G_{foot} = ${tx(safe(fd.Ntotal) - safe(fd.Gfooting))} + ${tx(fd.Gfooting)} = ${tx(fd.Ntotal)}\\,\\mathrm{kN}` },
            { caption: 'Footing area & section modulus / 基底面积与截面模量', tex: `A = B\\times L = ${tx(fd.A)}\\,\\mathrm{m^2},\\qquad Z = \\frac{BL^2}{6} = ${tx(fd.Z)}\\,\\mathrm{m^3}` },
            { caption: 'Base pressure (max/min) / 基底最大/最小压力', tex: `q_{max} = \\frac{N_{total}}{A}+\\frac{M^*}{Z} = ${tx(fd.qMax, 0)}\\,\\mathrm{kPa},\\qquad q_{min} = \\frac{N_{total}}{A}-\\frac{M^*}{Z} = ${tx(fd.qMin, 0)}\\,\\mathrm{kPa}`, status: st(fd.checks?.bearingPass, 'PASS', 'CHECK') },
            { caption: 'Base pressure (max/min) / 基底最大/最小压力',
              tex: `q_{max} = \\frac{N_{total}}{A}+\\frac{M^*}{Z} = \\frac{${tx(fd.Ntotal)}}{${tx(fd.A)}}+\\frac{${tx(MstarIP)}}{${tx(fd.Z)}} = ${tx(fd.qMax, 0)}\\,\\mathrm{kPa},\\qquad q_{min} = \\frac{${tx(fd.Ntotal)}}{${tx(fd.A)}}-\\frac{${tx(MstarIP)}}{${tx(fd.Z)}} = ${tx(fd.qMin, 0)}\\,\\mathrm{kPa}`,
              status: st(fd.checks?.bearingPass, 'PASS', 'CHECK') },
            { caption: 'Sliding resistance / 抗滑移',
              tex: `UR_{slide} = \\frac{V^*}{\\mu N_{total}} = \\frac{${tx(VstarIP)}}{${tx(fd.mu)}\\times${tx(fd.Ntotal)}} = ${txUR(fd.slidingRatio)}`,
              status: st(fd.checks?.slidingPass, 'PASS', 'CHECK') }
          ]
        }
      ]
    }
  ];
}

/* ============================================================================
v0.6.1 新增 —— Detail Report 利用率汇总表（Section 8）
v0.6.2 —— 新增边缘构件局部 N-M 利用率行（该表仅 Detail Report 使用，
不影响简易报告）
========================================================================== */
export function getPrecastPanelUtilisationRows(results) {
  const ip = results.inPlane || {};
  const op = results.outOfPlane || {};
  const cn = results.connection || {};
  const fd = results.foundation || {};
  return [
    ["In-plane: Compression stress σmax ≤ 0.6f'c", null, ip.checks?.stressCompressionPass],
    ['In-plane: Lintel bearing', ip.bearing?.bearingRatio, ip.checks?.bearingPass],
    ['In-plane: N-M interaction', ip.interaction?.interactionRatio, ip.checks?.interactionPass],
    /* v0.6.2 —— 边缘构件局部压弯 N-M（缺失时视为通过，向后兼容） */
    ['In-plane: Boundary local N-M (lintel edge)', ip.boundaryNM?.checks?.governingUR ?? null, ip.checks?.boundaryNMPass !== false],
    ['In-plane: Shear', ip.shear?.shearRatio, ip.checks?.shearPass],
    ['In-plane: Tension / boundary steel', null, ip.checks?.tensionPass],
    ['OOP: UR1 Mid-height P-Δ', op.UR1, Number.isFinite(op.UR1) && op.UR1 <= 1],
    ['OOP: UR2 Base moment', op.UR2, Number.isFinite(op.UR2) && op.UR2 <= 1],
    ['OOP: UR3 Fire', op.UR3, Number.isFinite(op.UR3) && op.UR3 <= 1],
    ['OOP: UR4 Shear', op.UR4, Number.isFinite(op.UR4) && op.UR4 <= 1],
    ['OOP: UR5 Foundation bearing', op.UR5, Number.isFinite(op.UR5) && op.UR5 <= 1],
    ['OOP: UR6 Footing flexure', op.UR6, Number.isFinite(op.UR6) && op.UR6 <= 1],
    ['Connection: Shear', cn.ratios?.shearRatio, cn.checks?.shearPass],
    ['Connection: Uplift', cn.ratios?.tensionRatio, cn.checks?.tensionPass],
    ['Connection: Grout bearing', cn.ratios?.bearingRatio, cn.checks?.bearingPass],
    ['In-plane footing: Bearing', fd.bearingRatio, fd.checks?.bearingPass],
    ['In-plane footing: Sliding', fd.slidingRatio, fd.checks?.slidingPass],
    ['OOP slenderness h/t (warning item)', null, !(ip.checks?.slendernessWarning)]
  ];
}

/* ============================================================================
v0.6.1 新增 —— Detail Report 支承条件弯矩系数表（Section 5.3）
========================================================================== */
function SupportConditionTable({ sc }) {
  const ws = sc.windSeismic || 'Pinned-Pinned';
  const fire = sc.fire || 'Fixed-Free';
  return (
    <table className="report-table compact-table" style={{ marginBottom: 6 }}>
      <thead>
        <tr>
          <th>Support condition</th>
          <th>Mid-height k</th>
          <th>Base k</th>
          <th>Assigned to</th>
        </tr>
      </thead>
      <tbody>
        {SUPPORT_MOMENT_TABLE.map(row => {
          const isWS = ws === row.key;
          const isFire = fire === row.key;
          return (
            <tr key={row.key} style={{ background: (isWS || isFire) ? '#eef4fb' : 'transparent' }}>
              <td>{row.label}</td>
              <td className="num">{row.mid} = {row.midVal.toFixed(4)}</td>
              <td className="num">{row.base} = {row.baseVal.toFixed(4)}</td>
              <td>
                {isWS && <span style={{ color: '#1976d2', fontWeight: 700, marginRight: 4 }}>Wind & Seismic</span>}
                {isFire && <span style={{ color: '#c62828', fontWeight: 700 }}>Fire</span>}
                {!isWS && !isFire && <span style={{ color: '#9ca3af' }}>—</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ============================================================================
v0.6.2 新增 —— Detail Report 边缘构件 N-M 需求包络表（Section 4.7）
三种组合（D0 1.35G / D1 1.2G+1.5Q / D2 G+ψeQ+R）均含 Lintel 偏心弯矩 R·e；
控制工况（governing）以底色高亮。
========================================================================== */
function NMDemandTable({ boundary }) {
  const demands = boundary?.demands || [];
  const governing = boundary?.governing || {};
  if (!demands.length) return null;
  return (
    <table className="report-table compact-table" style={{ marginBottom: 6 }}>
      <thead>
        <tr>
          <th>Combination 组合</th>
          <th>N* (kN)</th>
          <th>M* (kN·m)</th>
          <th>φMn(N*) (kN·m)</th>
          <th>UR</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {demands.map(pt => {
          const isGov = governing.key === pt.key;
          const pass = Number.isFinite(pt.UR) && pt.UR <= 1;
          return (
            <tr key={pt.key} style={{ background: isGov ? '#eef4fb' : 'transparent' }}>
              <td>{pt.key} · {pt.label}{isGov ? '（governing 控制）' : ''}</td>
              <td className="num">{calcFmt(pt.N, 1)}</td>
              <td className="num">{calcFmt(pt.M, 2)}</td>
              <td className="num">{calcFmt(pt.Mcap, 2)}</td>
              <td className="num">{Number.isFinite(pt.UR) ? `${txPct(pt.UR)}%` : '∞'}</td>
              <td>
                {pass
                  ? <span className="status-ok">✓ PASS</span>
                  : <span className="status-fail">✗ CHECK</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ============================================================================
v0.6.2 新增 —— Detail Report 边缘构件 N-M 交互图（报告本地 SVG 版）
----------------------------------------------------------------------------
与 PrecastPanel.jsx 的 NMInteractionChart 同源；为避免
PrecastPanel.jsx ↔ PrecastPanelReport.jsx 之间的循环引用，
报告文件内自包含实现（打印友好：白底、矢量、固定比例）。
绘制内容：
  · 名义 N-M 曲线（虚线，灰色）
  · ϕ(N) 设计包络（实线，蓝色）：受压控制区 ϕc → 受弯区 ϕf
  · 特征点：φP0（纯压）、Balanced（φNb, φMb）、φM0（纯弯）
  · 需求点包络 D0/D1/D2 及等轴力承载力示意线
========================================================================== */
function BoundaryNMInteractionChart({ boundary }) {
  if (!boundary || !Array.isArray(boundary.curveDesign) || boundary.curveDesign.length === 0) {
    return null;
  }
  const { curveDesign, curveNominal, keyPoints = {}, demands = [] } = boundary;

  const W = 680;
  const H = 430;
  const mL = 72, mR = 20, mT = 20, mB = 50;

  const nMax = (Math.max(
    keyPoints.phiP0 || 0,
    ...curveDesign.map(p => p.N),
    ...demands.map(p => p.N || 0)
  ) || 1) * 1.08;

  const mMax = (Math.max(
    ...curveDesign.map(p => p.M || 0),
    ...(curveNominal || []).map(p => p.M || 0),
    ...demands.map(p => p.M || 0),
    0.1
  )) * 1.15;

  const sx = m => mL + (m / mMax) * (W - mL - mR);
  const sy = nn => mT + (1 - nn / nMax) * (H - mT - mB);
  const path = pts => pts
    .filter(p => Number.isFinite(p.N) && Number.isFinite(p.M) && p.N >= 0)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.M).toFixed(1)} ${sy(p.N).toFixed(1)}`)
    .join(' ');

  const nTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].map(f => f * nMax);
  const mTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].map(f => f * mMax);
  const demandColors = ['#c62828', '#ef6c00', '#6a1b9a'];

  return (
    <div style={{ textAlign: 'center', marginTop: 4 }}>
      <strong style={{ fontSize: '10pt', color: '#555', display: 'block', marginBottom: 3 }}>
        Boundary Element N-M Interaction — capacity curve & demand envelope
        （边缘构件 N-M 承载力曲线与需求包络）
      </strong>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', maxWidth: 680, height: 'auto', background: '#fff', border: '1px solid #d1d5db' }}
      >
        {/* Grid */}
        {nTicks.map((t, i) => (
          <g key={`ng${i}`}>
            <line x1={mL} y1={sy(t)} x2={W - mR} y2={sy(t)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={mL - 6} y={sy(t) + 4} textAnchor="end" fontSize={10} fill="#6b7280">{t.toFixed(0)}</text>
          </g>
        ))}
        {mTicks.map((t, i) => (
          <g key={`mg${i}`}>
            <line x1={sx(t)} y1={mT} x2={sx(t)} y2={H - mB} stroke="#e5e7eb" strokeWidth={1} />
            <text x={sx(t)} y={H - mB + 14} textAnchor="middle" fontSize={10} fill="#6b7280">{t.toFixed(1)}</text>
          </g>
        ))}

        {/* Axes */}
        <line x1={mL} y1={H - mB} x2={W - mR} y2={H - mB} stroke="#374151" strokeWidth={1.2} />
        <line x1={mL} y1={mT} x2={mL} y2={H - mB} stroke="#374151" strokeWidth={1.2} />
        <text x={(mL + W - mR) / 2} y={H - 10} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#374151">M (kN·m)</text>
        <text
          x={16} y={(mT + H - mB) / 2} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#374151"
          transform={`rotate(-90 16 ${(mT + H - mB) / 2})`}
        >
          N (kN)
        </text>

        {/* Nominal curve（名义曲线，虚线） */}
        {Array.isArray(curveNominal) && curveNominal.length > 0 && (
          <path d={path(curveNominal)} fill="none" stroke="#9ca3af" strokeWidth={1.3} strokeDasharray="6 4" />
        )}

        {/* Design envelope（ϕ 设计包络，实线） */}
        <path d={path(curveDesign)} fill="none" stroke="#1d4ed8" strokeWidth={2.4} />

        {/* Key point: φP0（纯压） */}
        {Number.isFinite(keyPoints.phiP0) && keyPoints.phiP0 > 0 && (
          <g>
            <circle cx={sx(0)} cy={sy(keyPoints.phiP0)} r={3.5} fill="#1d4ed8" />
            <text x={sx(0) + 7} y={sy(keyPoints.phiP0) + 4} fontSize={10} fill="#1d4ed8" fontWeight={700}>
              φP0 = {keyPoints.phiP0.toFixed(0)} kN
            </text>
          </g>
        )}

        {/* Key point: Balanced（平衡点） */}
        {Number.isFinite(keyPoints.phiMb) && keyPoints.phiMb > 0 && (
          <g>
            <circle cx={sx(keyPoints.phiMb)} cy={sy(keyPoints.phiNb)} r={3.5} fill="#0891b2" />
            <text x={sx(keyPoints.phiMb) + 7} y={sy(keyPoints.phiNb) - 7} fontSize={10} fill="#0891b2" fontWeight={700}>
              Balanced (φNb = {keyPoints.phiNb.toFixed(0)} kN, φMb = {keyPoints.phiMb.toFixed(1)} kN·m)
            </text>
          </g>
        )}

        {/* Key point: φM0（纯弯） */}
        {Number.isFinite(keyPoints.phiM0) && keyPoints.phiM0 > 0 && (
          <g>
            <circle cx={sx(keyPoints.phiM0)} cy={sy(0)} r={3.5} fill="#1d4ed8" />
            <text x={sx(keyPoints.phiM0) - 4} y={sy(0) - 7} textAnchor="end" fontSize={10} fill="#1d4ed8" fontWeight={700}>
              φM0 = {keyPoints.phiM0.toFixed(1)} kN·m
            </text>
          </g>
        )}

        {/* Demand points（需求点包络 + 等轴力承载力示意线） */}
        {demands.map((pt, i) => {
          const col = demandColors[i % demandColors.length];
          const hasCap = Number.isFinite(pt.Mcap) && pt.Mcap > 0 && Number.isFinite(pt.N) && pt.N >= 0;
          return (
            <g key={pt.key}>
              {hasCap && (
                <line x1={sx(pt.M)} y1={sy(pt.N)} x2={sx(pt.Mcap)} y2={sy(pt.N)} stroke={col} strokeWidth={1.1} strokeDasharray="4 3" />
              )}
              {hasCap && (
                <circle cx={sx(pt.Mcap)} cy={sy(pt.N)} r={2.6} fill="none" stroke={col} strokeWidth={1.3} />
              )}
              <line x1={sx(pt.M)} y1={sy(pt.N)} x2={sx(pt.M)} y2={H - mB} stroke={col} strokeWidth={0.7} strokeDasharray="2 3" opacity={0.5} />
              <circle cx={sx(pt.M)} cy={sy(pt.N)} r={4.5} fill={col} stroke="#fff" strokeWidth={1.1} />
              <text x={sx(pt.M) + 7} y={sy(pt.N) - 7} fontSize={10} fontWeight={700} fill={col}>
                {pt.key} · UR = {txPct(pt.UR)}%
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${W - mR - 240}, ${mT + 4})`}>
          <rect x={-8} y={-10} width={248} height={58} fill="#ffffff" opacity={0.9} stroke="#e5e7eb" rx={3} />
          <line x1={0} y1={0} x2={24} y2={0} stroke="#1d4ed8" strokeWidth={2.4} />
          <text x={30} y={4} fontSize={10} fill="#374151">Design envelope（ϕ 设计包络）</text>
          <line x1={0} y1={16} x2={24} y2={16} stroke="#9ca3af" strokeWidth={1.3} strokeDasharray="6 4" />
          <text x={30} y={20} fontSize={10} fill="#374151">Nominal curve（名义曲线）</text>
          <circle cx={12} cy={34} r={4} fill="#c62828" />
          <text x={30} y={38} fontSize={10} fill="#374151">Demand points（需求包络 D0/D1/D2）</text>
        </g>
      </svg>
    </div>
  );
}

/* ============================================================================
Summary Report 打印正文（第一页输入+SVG+摘要，第二页起精简公式，两栏排列）
★ v0.6.2 恢复成熟版原样（含页脚文字），未做任何改动。
========================================================================== */
export function PrecastPanelPrintReport({ inputs, results }) {
  if (!results || !results.inPlane) return null;

  const summary = results.summary || {};
  const inputRows = getPrecastPanelInputRows(inputs);
  const inputPairs = [];
  for (let i = 0; i < inputRows.length; i += 2) inputPairs.push([inputRows[i], inputRows[i + 1]]);
  const summaryRows = getPrecastPanelSummaryRows(inputs, results);
  const formulaSections = getPrecastPanelFormulaSections(inputs, results);
  const statusText = getPrecastPanelStatusText(summary);

  return (
    <div
      id="printable-report"
      style={{ maxWidth: 800, margin: '10px auto', background: 'white', padding: 40, boxShadow: '0 0 10px rgba(0,0,0,0.1)' }}
    >
      <div className="report-header">
        <h1>Precast Concrete Slender Panel</h1>
        <h2>Design Calculation Report</h2>
        <div className="job-info">
          <strong>Project: </strong> {inputs.projectName || 'N/A'} <br />
          <strong>Designer: </strong> {inputs.designer || 'N/A'} <br />
          <strong>Date: </strong> {inputs.date || new Date().toLocaleDateString()} <br />
          <strong>Wall: </strong> {calcFmt(inputs.wallWidth, 2)} m × {calcFmt(inputs.wallHeight, 2)} m × {calcFmt(inputs.wallThickness, 3)} m <br />
          <strong>Status: </strong> {statusText}
        </div>
      </div>

      {/* ---------------- 第一页：输入参数 + 模型图 + 结果摘要 ---------------- */}
      <div className="first-page-content">
        <div className="report-section">
          <h3>1. Input Parameters</h3>
          <table className="report-table compact-table">
            <thead>
              <tr>
                <th>Parameter</th><th>Value</th><th>Unit</th>
                <th>Parameter</th><th>Value</th><th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {inputPairs.map(([left, right], idx) => (
                <tr key={idx}>
                  <td>{left[0]}</td>
                  <td className="num">{left[1]}</td>
                  <td>{left[2] || '—'}</td>
                  {right ? (
                    <>
                      <td>{right[0]}</td>
                      <td className="num">{right[1]}</td>
                      <td>{right[2] || '—'}</td>
                    </>
                  ) : (
                    <td colSpan={3} />
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="report-section">
          <h3>2. Structural Model Diagram</h3>
          <div className="svg-container">
            <PrecastPanelSVG inputs={inputs} results={results} />
          </div>
        </div>

        <div className="report-section">
          <h3>3. Design Results Summary</h3>
          <table className="report-table compact-table">
            <thead>
              <tr>
                <th>Parameter</th><th>Value</th><th>Unit</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.param}</td>
                  <td className="num">{row.value}</td>
                  <td>{row.unit}</td>
                  <td>
                    {row.status === null
                      ? ''
                      : row.status
                        ? <span className="status-ok">✓ OK</span>
                        : <span className="status-fail">✗ CHECK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- 第二页起：详细公式推导（v0.6.0：两栏排列节省纸张） ---------------- */}
      <div className="page-break">
        <div className="report-section">
          <h3>4. Detailed Calculation Steps</h3>
          {formulaSections.map((section, sIdx) => (
            <div key={sIdx} style={{ marginBottom: 12 }}>
              <h4>{section.title}</h4>
              {section.steps.map((step, stepIdx) => (
                <div key={stepIdx} style={{ marginBottom: 8 }}>
                  <strong style={{ fontSize: '10pt', color: '#555', display: 'block', marginBottom: 3 }}>
                    {step.sub}
                  </strong>
                  {/* 两栏公式布局（formula-two-col 见 ReportPrintStyles.css） */}
                  <div className="formula-two-col">
                    {step.formulas.map((f, fIdx) => (
                      <div key={fIdx} className="formula-col-item">
                        {f.caption && (
                          <strong style={{ fontSize: '10pt', color: '#666', display: 'block', marginBottom: 2 }}>
                            {f.caption}
                          </strong>
                        )}
                        <div className="formula-block">
                          <BlockMath math={String(f.tex)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="report-footer">
        Preliminary design report generated by PrecastPanelCalculation v0.6.0. Verify the final design
        against NZS 3101, AS/NZS 1170 series and project-specific requirements.
      </div>
    </div>
  );
}

/* ============================================================================
v0.6.1 新增 —— Detail Report 打印正文
与 Summary Report 相同的打印排版（report-section / formula-block / report-table），
但公式推导为 Calculation Tab 的完整细节（单栏、全宽，保证长公式不溢出）。
v0.6.2 —— Section 4.7 支持 nmTable（需求包络表）与 nmChart（N-M 交互图）。
========================================================================== */
export function PrecastPanelDetailPrintReport({ inputs, results }) {
  if (!results || !results.inPlane) return null;

  const summary = results.summary || {};
  const statusText = getPrecastPanelStatusText(summary);
  const inputRows = getPrecastPanelInputRows(inputs);
  const inputPairs = [];
  for (let i = 0; i < inputRows.length; i += 2) inputPairs.push([inputRows[i], inputRows[i + 1]]);
  const summaryRows = getPrecastPanelSummaryRows(inputs, results);
  const detailSections = getPrecastPanelDetailSections(inputs, results);
  const utilisationRows = getPrecastPanelUtilisationRows(results);
  const sc = results.outOfPlane?.supportConditions || {};

  return (
    <div
      id="printable-report"
      style={{ maxWidth: 800, margin: '10px auto', background: 'white', padding: 40, boxShadow: '0 0 10px rgba(0,0,0,0.1)' }}
    >
      {/* ---- 报告头部 ---- */}
      <div className="report-header">
        <h1>Precast Concrete Slender Panel</h1>
        <h2>Detailed Design Calculation Report</h2>
        <div className="job-info">
          <strong>Project: </strong> {inputs.projectName || 'N/A'} <br />
          <strong>Designer: </strong> {inputs.designer || 'N/A'} <br />
          <strong>Date: </strong> {inputs.date || new Date().toLocaleDateString()} <br />
          <strong>Wall: </strong> {calcFmt(inputs.wallWidth, 2)} m × {calcFmt(inputs.wallHeight, 2)} m × {calcFmt(inputs.wallThickness, 3)} m <br />
          <strong>Status: </strong> {statusText}
        </div>
      </div>

      {/* ---------------- 第一页：输入参数 + 模型图 + 结果摘要 ---------------- */}
      <div className="first-page-content">
        <div className="report-section">
          <h3>1. Input Parameters</h3>
          <table className="report-table compact-table">
            <thead>
              <tr>
                <th>Parameter</th><th>Value</th><th>Unit</th>
                <th>Parameter</th><th>Value</th><th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {inputPairs.map(([left, right], idx) => (
                <tr key={idx}>
                  <td>{left[0]}</td>
                  <td className="num">{left[1]}</td>
                  <td>{left[2] || '—'}</td>
                  {right ? (
                    <>
                      <td>{right[0]}</td>
                      <td className="num">{right[1]}</td>
                      <td>{right[2] || '—'}</td>
                    </>
                  ) : (
                    <td colSpan={3} />
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="report-section">
          <h3>2. Structural Model Diagram</h3>
          <div className="svg-container">
            <PrecastPanelSVG inputs={inputs} results={results} />
          </div>
        </div>

        <div className="report-section">
          <h3>3. Design Results Summary</h3>
          <table className="report-table compact-table">
            <thead>
              <tr>
                <th>Parameter</th><th>Value</th><th>Unit</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.param}</td>
                  <td className="num">{row.value}</td>
                  <td>{row.unit}</td>
                  <td>
                    {row.status === null
                      ? ''
                      : row.status
                        ? <span className="status-ok">✓ OK</span>
                        : <span className="status-fail">✗ CHECK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- 第二页起：完整公式推导（Calculation Tab 细节） ---------------- */}
      <div className="page-break">
        <div className="report-section">
          <h3>4. Detailed Calculation Steps</h3>
          {detailSections.map((section, sIdx) => (
            <div key={sIdx} style={{ marginBottom: 14 }}>
              <h4>{section.title}</h4>
              {section.steps.map((step, stepIdx) => (
                <div key={stepIdx} style={{ marginBottom: 8, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                  <strong style={{ fontSize: '10pt', color: '#555', display: 'block', marginBottom: 3 }}>
                    {step.sub}
                  </strong>
                  {/* v0.6.1 —— 5.3 支承条件弯矩系数表 */}
                  {step.supportTable && <SupportConditionTable sc={sc} />}
                  {/* v0.6.2 —— 4.7 边缘构件 N-M 需求包络表（公式前显示） */}
                  {step.nmTable && <NMDemandTable boundary={results.inPlane?.boundaryNM} />}
                  {/* 单栏、全宽公式（Detail Report 公式代入完整数值，较宽） */}
                  {step.formulas.map((f, fIdx) => (
                    <div key={fIdx} style={{ marginBottom: 4, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                      {f.caption && (
                        <strong style={{ fontSize: '10pt', color: '#666', display: 'block', marginBottom: 2 }}>
                          {f.caption}
                        </strong>
                      )}
                      <div className="formula-block">
                        <BlockMath math={String(f.tex)} />
                      </div>
                      {/* 公式状态（PASS / CHECK 等） */}
                      {f.status && (
                        <div
                          className={f.status.pass ? 'status-ok' : 'status-fail'}
                          style={{ fontSize: '9.5pt', textAlign: 'right', marginTop: '-2px' }}
                        >
                          {f.status.pass ? '✓' : '✗'} {f.status.label}
                        </div>
                      )}
                    </div>
                  ))}
                  {/* v0.6.2 —— 4.7 N-M 承载力曲线与需求包络图（公式后显示） */}
                  {step.nmChart && (
                    <div style={{ marginTop: 6, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                      <BoundaryNMInteractionChart boundary={results.inPlane?.boundaryNM} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* ---------------- 利用率汇总（Section 8） ---------------- */}
        <div className="report-section">
          <h4>8. Utilisation Summary · 利用率汇总</h4>
          <table className="report-table compact-table">
            <thead>
              <tr>
                <th>Check Item</th>
                <th>UR</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {utilisationRows.map(([label, ur, pass], idx) => (
                <tr key={idx}>
                  <td>{label}</td>
                  <td className="num">{ur === null || ur === undefined ? '—' : `${txPct(ur)}%`}</td>
                  <td>
                    {pass
                      ? <span className="status-ok">✓ PASS</span>
                      : <span className="status-fail">✗ CHECK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- 页脚与免责声明 ---- */}
      <div className="report-footer">
        Detailed design calculation report generated by PrecastPanelCalculation v0.6.2
        (v0.6.2 adds boundary element local N-M interaction check for lintel edge load,
        with interaction diagram in Section 4.7).
        Verify the final design against NZS 3101, AS/NZS 1170 series and project-specific requirements.
      </div>
    </div>
  );
}

/* ============================================================================
打印处理：先等 KaTeX 字体加载完成，再调用浏览器打印
========================================================================== */
export async function printPrecastPanelReport() {
  try {
    await document.fonts.ready;
  } catch (err) {
    console.warn('Font loading check failed:', err);
  }
  setTimeout(() => {
    window.print();
  }, 250);
}

/* ============================================================================
Summary Report 预览 Dialog（默认导出）
========================================================================== */
export default function PrecastPanelReportDialog({ open, onClose, inputs, results }) {
  /* 打开后自动触发系统打印，跳过手动预览步骤 */
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      try { await document.fonts.ready; } catch (_) {}
      window.print();      // 阻塞，直到用户关闭系统打印对话框
      onClose();           // 打印对话框关闭后，自动关闭 Dialog
    }, 600);               // 等 KaTeX 渲染完成
    return () => clearTimeout(timer);
  }, [open, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { height: '90vh', m: 0 } }}
    >
      <DialogContent sx={{ p: 0, overflow: 'auto', bgcolor: '#e0e0e0' }}>
        <PrecastPanelPrintReport inputs={inputs} results={results} />
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================================
v0.6.1 新增 —— Detail Report 预览 Dialog（命名导出）
========================================================================== */
export function PrecastPanelDetailReportDialog({ open, onClose, inputs, results }) {
  /* 打开后自动触发系统打印（与 Summary Report 行为一致） */
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      try { await document.fonts.ready; } catch (_) {}
      window.print();
      onClose();
    }, 600);
    return () => clearTimeout(timer);
  }, [open, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { height: '90vh', m: 0 } }}
    >
      <DialogContent sx={{ p: 0, overflow: 'auto', bgcolor: '#e0e0e0' }}>
        <PrecastPanelDetailPrintReport inputs={inputs} results={results} />
      </DialogContent>
    </Dialog>
  );
}