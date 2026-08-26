// src/features/design/modules/PrecastPanel.jsx
import React, { useContext, useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button,
  Chip, Grid, Paper, Stack, Tab, Tabs, TextField, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EngineeringIcon from '@mui/icons-material/Engineering';
import CalculateIcon from '@mui/icons-material/Calculate';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import calculatePrecastPanelDesign, { validateHroof } from './PrecastPanelCalculation';
import { DEFAULT_INPUTS, SUPPORT_CONDITIONS } from './PrecastPanelConfig';
import PrecastPanelSVG from './PrecastPanelSVG';
/* v0.6.1 —— 同时导入 Summary Report 与 Detail Report 两个打印 Dialog */
import PrecastPanelReportDialog, {
  PrecastPanelDetailReportDialog,
  CalculationReportContext
} from './PrecastPanelReport';
/* v0.6.2 —— 新增边缘构件局部 N-M 交互图（纯 SVG 绘制，无新增依赖）：
   NMInteractionChart 显示名义 / 设计承载力曲线与需求点包络（Section 4.7）。 */

/* ============================================================================
   HELPERS
========================================================================== */
const safe = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const fmt = (value, digits = 2, fallback = '-') => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : fallback;
};
const tx = (value, digits = 3) => {
  const v = Number(value);
  return Number.isFinite(v) ? v.toFixed(digits) : '-';
};
const txUR = (value) => {
  const v = Number(value);
  return Number.isFinite(v) ? v.toFixed(3) : '∞';
};
const txPct = (value) => {
  const v = Number(value);
  return Number.isFinite(v) ? (v * 100).toFixed(1) : '—';
};

/* ============================================================================
   KaTeX DISPLAY COMPONENTS
========================================================================== */
function FormulaBlock({ children }) {
  return (
    <Box
      sx={{
        py: 0.5,
        overflowX: 'auto',
        '& .katex-display': { my: 0.5, textAlign: 'left' },
        '& .katex-display > .katex': { textAlign: 'left', marginLeft: 0 },
        /* ★ 缩小上标字体，让 mm²、mm⁴ 等比例正常 */
        '& .katex .msupsub': { fontSize: '0.68em' }
      }}
    >
      <BlockMath math={String(children)} />
    </Box>
  );
}

function CalculationFormula({ caption, formula, status, highlight = false }) {
  const emphasized = highlight || Boolean(status);
  return (
    <Box
      sx={{
        mb: emphasized ? 1.5 : 1,
        px: emphasized ? 1.25 : 0.5,
        py: emphasized ? 1 : 0.5,
        borderLeft: emphasized ? '3px solid' : '2px solid',
        borderColor: emphasized
          ? (status && !status.pass ? 'warning.main' : 'primary.main')
          : 'divider',
        bgcolor: emphasized ? 'action.hover' : 'transparent',
        borderRadius: emphasized ? 1 : 0,
        overflowX: 'auto'
      }}
    >
      {caption && (
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mb: 0.5,
            fontWeight: 800,
            color: emphasized ? 'text.primary' : 'text.secondary'
          }}
        >
          {caption}
        </Typography>
      )}
      <FormulaBlock>{formula}</FormulaBlock>
      {status && (
        <Box sx={{ mt: 0.75 }}>
          <Chip
            size="small"
            label={status.label}
            color={status.pass ? 'success' : 'warning'}
            icon={status.pass ? <CheckCircleIcon /> : <WarningAmberIcon />}
            sx={{ fontWeight: 700 }}
          />
        </Box>
      )}
    </Box>
  );
}

function CalculationSection({ number, title, chip, children, defaultExpanded = true }) {
  const reportMode = useContext(CalculationReportContext);
  if (reportMode) {
    return (
      <Paper
        variant="outlined"
        sx={{
          mb: 1.5,
          borderRadius: 1,
          overflow: 'hidden',
          breakInside: 'avoid',
          pageBreakInside: 'avoid'
        }}
      >
        <Box sx={{ px: 2, py: 1, bgcolor: '#f3f4f6', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 800 }}>{number}. {title}</Typography>
          {chip}
        </Box>
        <Box sx={{ px: 2.5, py: 2, bgcolor: '#fff' }}>{children}</Box>
      </Paper>
    );
  }
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: '6px !important', overflow: 'hidden', '&:before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 52, '& .MuiAccordionSummary-content': { my: 1 } }}>
        <Typography sx={{ fontWeight: 800 }}>{number}. {title}</Typography>
        {chip && <Box sx={{ ml: 1.5 }}>{chip}</Box>}
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2.5, py: 2, bgcolor: '#fcfcfc' }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}

function CalculationSubsection({ title, children }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography
        variant="subtitle2"
        sx={{
          mb: 1, color: 'text.secondary', fontWeight: 800,
          borderLeft: '3px solid', borderColor: 'primary.main', pl: 1
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

const mkStatus = (pass, passLabel = 'PASS', failLabel = 'CHECK') => ({
  label: pass ? passLabel : failLabel,
  pass: Boolean(pass)
});

/* ============================================================================
   INPUT SECTION DEFINITIONS
========================================================================== */
const INPUT_SECTIONS = [
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
      { key: 'tf', label: 'Footing Thickness (tf)', unit: 'mm', step: '10', min: '0' },
      { key: 'Lf', label: 'Footing Length (Lf)', unit: 'mm', step: '100', min: '0' },
      { key: 'ts', label: 'Slab Thickness (ts)', unit: 'mm', step: '10', min: '0' },
      { key: 'fo', label: 'Footing Overhang (fo)', unit: 'mm', step: '10', min: '0' },
      { key: 'ds', label: 'Hardfill Thickness (ds)', unit: 'mm', step: '10', min: '0' },
      { key: 'hroof', label: 'Height to Roof (hroof)', unit: 'm', step: '0.1', min: '0' }
    ]
  },
  {
    id: 'materials',
    title: '3. Material Properties (Shared)',
    fields: [
      { key: 'concreteDensity', label: 'Concrete Density (γc)', unit: 'kN/m³', step: '0.5', min: '15' },
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
      { key: 'gLine', label: 'Roof Dead Load Pressure (G)', unit: 'kPa', step: '0.05', min: '0' },
      { key: 'qLine', label: 'Roof Live Load Pressure (Q)', unit: 'kPa', step: '0.05', min: '0' },
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
    title: '8. Seismic Parameters (Unified: In-Plane + OOP)',
    fields: [
      { key: 'hazardFactor', label: 'Hazard Factor Z', unit: '', step: '0.01', min: '0' },
      { key: 'returnPeriodFactor', label: 'Return Period Factor Ru', unit: '', step: '0.01', min: '0' },
      { key: 'ductility', label: 'Ductility Factor μ', unit: '', step: '0.05', min: '1' },
      { key: 'siteCoefficient', label: 'Site Coefficient Ch(T)', unit: '', step: '0.01', min: '0' },
      { key: 'nearFaultFactor', label: 'Near-Fault Factor N(T,D)', unit: '', step: '0.01', min: '0' },
      { key: 'period', label: 'Fundamental Period T', unit: 's', step: '0.01', min: '0.01' },
      { key: 'seismicWeight', label: 'Tributary Seismic Weight', unit: 'kN', step: '1', min: '0' },
      { key: 'seismicDistributionFactor', label: 'Wall Distribution Factor', unit: '', step: '0.01', min: '0' },
      { key: 'psiE', label: 'Seismic Combination ψe', unit: '', step: '0.05', min: '0' },
      /* v0.6 —— OOP 地震改按 AS/NZS 1170.5 Chapter 8 (parts) 计算，
         取代旧的 CdT1 / CdTE 系数输入 */
      { key: 'partResponseCoefficient', label: 'OOP Part Response Coefficient Cp (Table 8.1)', unit: '', step: '0.05', min: '0' },
      { key: 'partHeightHx', label: 'OOP Part Height hx (above base)', unit: 'm', step: '0.1', min: '0' },
      { key: 'buildingHeightHn', label: 'Building Height hn', unit: 'm', step: '0.1', min: '0.1' }
    ]
  },
  {
    id: 'reinforcement',
    title: '9. Reinforcement (Shared)',
    fields: [
      { key: 'VbarDia', label: 'Vertical Bar Diameter (φV)', unit: 'mm', step: '2', min: '6' },
      { key: 'VbarSpace', label: 'Vertical Bar Spacing', unit: 'mm', step: '25', min: '50' },
      { key: 'HbarDia', label: 'Horizontal Bar Diameter (φH)', unit: 'mm', step: '2', min: '6' },
      { key: 'HbarSpace', label: 'Horizontal Bar Spacing', unit: 'mm', step: '25', min: '50' },
      { key: 'FootBarDia', label: 'Footing Bar Diameter (φF)', unit: 'mm', step: '2', min: '6' },
      { key: 'FootBarSpace', label: 'Footing Bar Spacing', unit: 'mm', step: '25', min: '50' },
      { key: 'MeshArea', label: 'Slab Mesh Area (As)', unit: 'mm²/m', step: '1', min: '0' }
    ]
  },
  {
    id: 'boundary',
    title: '10. Boundary Element (In-Plane)',
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
    title: '11. Lintel Bearing (In-Plane)',
    fields: [
      { key: 'bearingWidth', label: 'Bearing Width', unit: 'mm', step: '5', min: '25' },
      { key: 'bearingLength', label: 'Bearing Length', unit: 'mm', step: '5', min: '25' }
    ]
  },
  {
    id: 'support',
    title: '12. OOP Support Conditions & Design Factors',
    fields: [
      { key: 'effectiveLengthFactor', label: 'Effective Length Factor K', unit: '', step: '0.05', min: '0.1' },
      { key: 'phiFlexure', label: 'ϕ Flexure', unit: '', step: '0.01', min: '0' },
      { key: 'phiShear', label: 'ϕ Shear', unit: '', step: '0.01', min: '0' },
      { key: 'phiCompression', label: 'ϕ Compression', unit: '', step: '0.01', min: '0' }
    ]
  },
  {
    id: 'foundation',
    title: '13. Foundation and Hold Down Check',
    fields: [
      { key: 'qU', label: 'Ultimate Bearing Capacity (qU)', unit: 'kPa', step: '10', min: '0' }
    ]
  },
  {
    id: 'connection',
    title: '14. Base Connection (Connection Design)',
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
    title: '15. In-Plane Foundation (Footing Checks)',
    fields: [
      { key: 'footingWidth', label: 'Footing Width B', unit: 'm', step: '0.05', min: '0.1' },
      { key: 'footingLength', label: 'Footing Length L', unit: 'm', step: '0.05', min: '0.1' },
      { key: 'footingThickness', label: 'Footing Thickness', unit: 'm', step: '0.05', min: '0.05' },
      { key: 'allowableBearingPressure', label: 'Allowable Bearing Pressure', unit: 'kPa', step: '10', min: '0' }
    ]
  }
];

/* ============================================================================
   INPUT COMPONENTS
========================================================================== */
function NumberInput({ label, value, onChange, unit, step, min, helperText, error }) {
  return (
    <TextField
      fullWidth
      size="small"
      label={label}
      value={value === undefined || value === null ? '' : value}
      onChange={event => onChange(event.target.value)}
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      error={error}
      InputProps={{
        endAdornment: unit ? (
          <Typography variant="caption" sx={{ ml: 1, whiteSpace: 'nowrap', color: 'text.secondary' }}>{unit}</Typography>
        ) : null
      }}
      inputProps={{ min, step }}
      helperText={helperText}
    />
  );
}

function SelectInput({ label, value, onChange, options }) {
  return (
    <TextField
      select
      fullWidth
      size="small"
      label={label}
      value={value ?? ''}
      onChange={event => onChange(event.target.value)}
      SelectProps={{ native: true }}
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </TextField>
  );
}

function InputSection({ title, children, defaultExpanded = true }) {
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: '6px !important', overflow: 'hidden', '&:before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 52, '& .MuiAccordionSummary-content': { my: 1 } }}>
        <Typography sx={{ fontWeight: 800 }}>{title}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: { xs: 1.5, sm: 2.5 }, py: 2, bgcolor: '#fcfcfc' }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}

function StatusChip({ pass, warning = false, label }) {
  const actualPass = pass !== false && !warning;
  return (
    <Chip
      size="small"
      icon={actualPass ? <CheckCircleIcon /> : <WarningAmberIcon />}
      color={actualPass ? 'success' : warning ? 'warning' : 'error'}
      label={label || (actualPass ? 'PASS' : warning ? 'CHECK' : 'FAIL')}
      sx={{ fontWeight: 700 }}
    />
  );
}

function ResultRow({ label, value, unit = '', pass, warning, highlight = false }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, py: 0.9, px: highlight ? 1 : 0, borderBottom: '1px solid', borderColor: 'divider', bgcolor: highlight ? 'action.hover' : 'transparent' }}>
      <Typography variant="body2" sx={{ fontWeight: highlight ? 700 : 400 }}>{label}</Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {value}{unit ? ` ${unit}` : ''}
        </Typography>
        {(pass !== undefined || warning !== undefined) && <StatusChip pass={pass} warning={warning} />}
      </Stack>
    </Box>
  );
}

/* ============================================================================
   BOUNDARY ELEMENT N-M INTERACTION CHART（v0.6.2 新增，纯 SVG 绘制）
   绘制内容：
   · 名义 N-M 曲线（虚线，灰色）
   · ϕ(N) 设计包络（实线，蓝色）：受压控制区 ϕc，向受弯区过渡至 ϕf
   · 特征点：φP0（纯压）、Balanced（φNb, φMb）、φM0（纯弯）
   · 需求点包络 D0, D1, D2（1.35G; 1.2G+1.5Q; 地震组合，含 Lintel 偏心弯矩）
   · 各需求点沿等轴力方向内插到设计曲线的承载力示意线（UR = M* per φMb + N* per φNb）
========================================================================== */
function NMInteractionChart({ boundary, height = 460 }) {
  if (!boundary || !Array.isArray(boundary.curveDesign) || boundary.curveDesign.length === 0) {
    return (
      <Alert severity="info">
        Boundary N-M interaction curve is unavailable.（边缘构件 N-M 曲线不可用。）
      </Alert>
    );
  }
  const { curveDesign, curveNominal, keyPoints = {}, demands = [] } = boundary;
  const W = 760;
  const H = height;
  const mL = 78, mR = 24, mT = 24, mB = 56;
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
  const demandColors = ['#dc2626', '#ea580c', '#9333ea'];
  return (
    <Box sx={{ overflowX: 'auto', mt: 1 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', minWidth: 560, maxWidth: 860, height: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}
      >
        {/* Grid */}
        {nTicks.map((t, i) => (
          <g key={`ng${i}`}>
            <line x1={mL} y1={sy(t)} x2={W - mR} y2={sy(t)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={mL - 8} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="#6b7280">{t.toFixed(0)}</text>
          </g>
        ))}
        {mTicks.map((t, i) => (
          <g key={`mg${i}`}>
            <line x1={sx(t)} y1={mT} x2={sx(t)} y2={H - mB} stroke="#e5e7eb" strokeWidth={1} />
            <text x={sx(t)} y={H - mB + 16} textAnchor="middle" fontSize={11} fill="#6b7280">{t.toFixed(1)}</text>
          </g>
        ))}
        {/* Axes */}
        <line x1={mL} y1={H - mB} x2={W - mR} y2={H - mB} stroke="#374151" strokeWidth={1.2} />
        <line x1={mL} y1={mT} x2={mL} y2={H - mB} stroke="#374151" strokeWidth={1.2} />
        <text x={(mL + W - mR) / 2} y={H - 12} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="#374151">M (kN·m)</text>
        <text
          x={18} y={(mT + H - mB) / 2} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="#374151"
          transform={`rotate(-90 18 ${(mT + H - mB) / 2})`}
        >
          N (kN)
        </text>
        {/* Nominal curve（名义曲线，虚线） */}
        {Array.isArray(curveNominal) && curveNominal.length > 0 && (
          <path d={path(curveNominal)} fill="none" stroke="#9ca3af" strokeWidth={1.4} strokeDasharray="6 4" />
        )}
        {/* Design envelope（ϕ 设计包络，实线） */}
        <path d={path(curveDesign)} fill="none" stroke="#1d4ed8" strokeWidth={2.6} />
        {/* Key point: φP0（纯压） */}
        {Number.isFinite(keyPoints.phiP0) && keyPoints.phiP0 > 0 && (
          <g>
            <circle cx={sx(0)} cy={sy(keyPoints.phiP0)} r={4} fill="#1d4ed8" />
            <text x={sx(0) + 8} y={sy(keyPoints.phiP0) + 4} fontSize={11} fill="#1d4ed8" fontWeight={700}>
              φP0 = {keyPoints.phiP0.toFixed(0)} kN
            </text>
          </g>
        )}
        {/* Key point: Balanced（平衡点） */}
        {Number.isFinite(keyPoints.phiMb) && keyPoints.phiMb > 0 && (
          <g>
            <circle cx={sx(keyPoints.phiMb)} cy={sy(keyPoints.phiNb)} r={4} fill="#0891b2" />
            <text x={sx(keyPoints.phiMb) + 8} y={sy(keyPoints.phiNb) - 8} fontSize={11} fill="#0891b2" fontWeight={700}>
              Balanced (φNb = {keyPoints.phiNb.toFixed(0)} kN, φMb = {keyPoints.phiMb.toFixed(1)} kN·m)
            </text>
          </g>
        )}
        {/* Key point: φM0（纯弯） */}
        {Number.isFinite(keyPoints.phiM0) && keyPoints.phiM0 > 0 && (
          <g>
            <circle cx={sx(keyPoints.phiM0)} cy={sy(0)} r={4} fill="#1d4ed8" />
            <text x={sx(keyPoints.phiM0) - 4} y={sy(0) - 8} textAnchor="end" fontSize={11} fill="#1d4ed8" fontWeight={700}>
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
                <line x1={sx(pt.M)} y1={sy(pt.N)} x2={sx(pt.Mcap)} y2={sy(pt.N)} stroke={col} strokeWidth={1.2} strokeDasharray="4 3" />
              )}
              {hasCap && (
                <circle cx={sx(pt.Mcap)} cy={sy(pt.N)} r={3} fill="none" stroke={col} strokeWidth={1.4} />
              )}
              <line x1={sx(pt.M)} y1={sy(pt.N)} x2={sx(pt.M)} y2={H - mB} stroke={col} strokeWidth={0.8} strokeDasharray="2 3" opacity={0.5} />
              <circle cx={sx(pt.M)} cy={sy(pt.N)} r={5} fill={col} stroke="#fff" strokeWidth={1.2} />
              <text x={sx(pt.M) + 8} y={sy(pt.N) - 8} fontSize={11} fontWeight={700} fill={col}>
                {pt.key} · {pt.label} · UR = {txPct(pt.UR)}%
              </text>
            </g>
          );
        })}
        {/* Legend */}
        <g transform={`translate(${W - mR - 268}, ${mT + 6})`}>
          <rect x={-10} y={-12} width={278} height={66} fill="#ffffff" opacity={0.9} stroke="#e5e7eb" rx={4} />
          <line x1={0} y1={0} x2={26} y2={0} stroke="#1d4ed8" strokeWidth={2.6} />
          <text x={32} y={4} fontSize={11} fill="#374151">Design envelope φ(N)·(Nn, Mn)（设计包络）</text>
          <line x1={0} y1={18} x2={26} y2={18} stroke="#9ca3af" strokeWidth={1.4} strokeDasharray="6 4" />
          <text x={32} y={22} fontSize={11} fill="#374151">Nominal curve (Nn, Mn)（名义曲线）</text>
          <circle cx={13} cy={38} r={4.5} fill="#dc2626" />
          <text x={32} y={42} fontSize={11} fill="#374151">Demand points（需求包络：lintel 偏心压弯）</text>
        </g>
      </svg>
    </Box>
  );
}

/* ============================================================================
   INPUT TAB
========================================================================== */
function InputTab({ inputs, setInputs, previewResults }) {
  const update = key => value => setInputs(previous => ({ ...previous, [key]: value }));
  const updateDuctility = value => {
    setInputs(previous => ({
      ...previous,
      ductility: value,
      structuralPerformanceFactor: String(1.3 - 0.3 * safe(value, 0))
    }));
  };
  const hroofCheck = useMemo(() => validateHroof({
    wallHeight: safe(inputs.wallHeight),
    tf: safe(inputs.tf),
    ds: safe(inputs.ds),
    ts: safe(inputs.ts),
    hroof: safe(inputs.hroof)
  }), [inputs.wallHeight, inputs.tf, inputs.ds, inputs.ts, inputs.hroof]);
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Wall Geometry, Reinforcement and Gravity Loads are shared between In-Plane and OOP.
        Section 12 provides two separate support conditions: one for Wind & Seismic checks,
        one for the Fire check. Section 14 / 15 feed the v0.5 connection and in-plane
        foundation calculation modules.
      </Alert>
      <Paper variant="outlined" sx={{ p: 2, mt: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1.5 }}>
          Model Preview — In-Plane + Out-of-Plane
        </Typography>
        <PrecastPanelSVG inputs={inputs} results={previewResults} showResults={false} />
      </Paper>
      {INPUT_SECTIONS.map(section => (
        <InputSection key={section.id} title={section.title} defaultExpanded={section.id !== 'foundation'}>
          <Grid container spacing={1.5}>
            {section.fields.map(field => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={field.key}>
                <NumberInput
                  label={field.label}
                  value={inputs[field.key]}
                  onChange={field.key === 'ductility' ? updateDuctility : update(field.key)}
                  unit={field.unit}
                  step={field.step}
                  min={field.min}
                  error={field.key === 'hroof' && !hroofCheck.hroofValid}
                  helperText={field.key === 'hroof' && !hroofCheck.hroofValid ? `Max allowed: ${fmt(hroofCheck.hroofMax, 2)} m` : undefined}
                />
              </Grid>
            ))}
            {section.id === 'seismic' && (
              <>
                <Grid item xs={12} sm={6} md={4} lg={3}>
                  <SelectInput
                    label="Subsoil class"
                    value={inputs.subsoilClass}
                    onChange={update('subsoilClass')}
                    options={[
                      { value: 'A', label: 'A' },
                      { value: 'B', label: 'B' },
                      { value: 'C', label: 'C' },
                      { value: 'D', label: 'D' },
                      { value: 'E', label: 'E' }
                    ]}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={4} lg={3}>
                  <SelectInput
                    label="Importance level"
                    value={inputs.importanceLevel}
                    onChange={update('importanceLevel')}
                    options={[
                      { value: 'IL1', label: 'IL1' },
                      { value: 'IL2', label: 'IL2' },
                      { value: 'IL3', label: 'IL3' },
                      { value: 'IL4', label: 'IL4' }
                    ]}
                  />
                </Grid>
              </>
            )}
            {section.id === 'support' && (
              <>
                <Grid item xs={12} sm={6} md={4} lg={3}>
                  <SelectInput
                    label="Support: Wind & Seismic"
                    value={inputs.supportWindSeismic}
                    onChange={update('supportWindSeismic')}
                    options={SUPPORT_CONDITIONS}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={4} lg={3}>
                  <SelectInput
                    label="Support: Fire"
                    value={inputs.supportFire}
                    onChange={update('supportFire')}
                    options={SUPPORT_CONDITIONS}
                  />
                </Grid>
              </>
            )}
            {section.id === 'connection' && (
              <>
                <Grid item xs={12} sm={6} md={4} lg={3}>
                  <SelectInput
                    label="Base connection type"
                    value={inputs.baseConnectionType}
                    onChange={update('baseConnectionType')}
                    options={[
                      { value: 'Dowel / Grouted Connection', label: 'Dowel / Grouted Connection' },
                      { value: 'Welded Connection', label: 'Welded Connection' },
                      { value: 'Bolted Connection', label: 'Bolted Connection' }
                    ]}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={4} lg={3}>
                  <SelectInput
                    label="Shear key"
                    value={inputs.shearKey ? 'yes' : 'no'}
                    onChange={value => update('shearKey')(value === 'yes')}
                    options={[
                      { value: 'no', label: 'No' },
                      { value: 'yes', label: 'Yes' }
                    ]}
                  />
                </Grid>
              </>
            )}
          </Grid>
          {section.id === 'oopGeometry' && !hroofCheck.hroofValid && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              hroof ({fmt(safe(inputs.hroof), 2)} m) exceeds maximum allowed {fmt(hroofCheck.hroofMax, 2)} m.
              Engine will use clamped value {fmt(hroofCheck.hroofEffective, 2)} m.
            </Alert>
          )}
          {section.id === 'gravity' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Line load = Pressure × Tributary Range (Sr). Roof wind pressure (wwd) is included here.
            </Alert>
          )}
          {section.id === 'inPlaneLoads' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Diaphragm forces are concentrated horizontal forces from the roof diaphragm acting at wall top.
              Moment = Force × Wall Height.
            </Alert>
          )}
          {section.id === 'oopAdditional' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Additional point loads for canopy / attachments. Heights measured from indoor floor level.
            </Alert>
          )}
          {section.id === 'seismic' && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Seismic parameters shared between In-Plane and OOP. OOP seismic action follows
              AS/NZS 1170.5:2004 Chapter 8 (parts): Fp = Cp × H × Wp, with H = 1 + 2(hx/hn)
              and Wp = wall panel weight (computed from geometry).
              （平面外地震作用按 AS/NZS 1170.5 第 8 章 parts 计算：Fp = Cp × H × Wp，
              H = 1 + 2(hx/hn)，Wp 为墙板重量，由几何参数自动计算。）
            </Alert>
          )}
          {section.id === 'support' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <strong>Wind & Seismic support</strong> (default: Pinned–Pinned) controls mid-height and
              base moment calculations (UR1, UR2). <br />
              <strong>Fire support</strong> (default: Fixed–Free / Cantilever) controls the fire moment
              calculation (UR3). During fire the top support may be lost, resulting in cantilever action.
            </Alert>
          )}
          {section.id === 'connection' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Connection check model: Dowel shear (min of steel & grout bond) + Shear friction μN* + Shear key (optional),
              plus uplift and grout bed bearing checks. All capacities multiplied by ϕ Connection.
              （连接验算模型：锚筋抗剪（钢材与灌浆粘结取小）+ 剪切摩擦 μN* + 剪力键（可选），并检查抗拔与灌浆垫承压。）
            </Alert>
          )}
          {section.id === 'inPlaneFoundation' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              In-plane footing checks: Base pressure q = N/A + M/Z ≤ allowable bearing; Sliding V* ≤ μN.
              OOP bearing and footing flexure covered by UR5/UR6 (Section 13 qU).
              （平面内基础验算：基底最大压力 q = N/A + M/Z ≤ 容许承载力；抗滑移 V* ≤ μN。）
            </Alert>
          )}
          {/* v0.6.2 —— 提示 Lintel 偏心反力将触发边缘构件局部压弯 N-M 验算（Section 10 + 11 参数） */}
          {section.id === 'boundary' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Boundary element parameters feed the local compression-bending N-M check (Section 4.7):
              lintel reaction at wall edge + tributary gravity, with interaction curve plotted.
              （边缘构件参数用于 4.7 节局部压弯 N-M 验算：Lintel 反力作用于墙边 + 分担重力，绘制 N-M 交互曲线。）
            </Alert>
          )}
        </InputSection>
      ))}
    </Box>
  );
}

/* ============================================================================
   CALCULATION TAB — KaTeX 分段分块公式显示
========================================================================== */
const SUPPORT_MOMENT_TABLE = [
  { key: 'Pinned-Pinned', label: 'Pinned – Pinned', mid: '1/8', midVal: 0.125, base: '1/8', baseVal: 0.125 },
  { key: 'Fixed-Free', label: 'Fixed – Free (Cantilever)', mid: '1/8', midVal: 0.125, base: '1/2', baseVal: 0.5 },
  { key: 'Fixed-Fixed', label: 'Fixed – Fixed', mid: '1/24', midVal: 0.0417, base: '1/12', baseVal: 0.0833 },
  { key: 'Fixed-Pinned', label: 'Fixed – Pinned', mid: '9/128', midVal: 0.0703, base: '1/8', baseVal: 0.125 }
];

/* ---------------------------------------------------------------------------
   0. Input Summary Table（输入参数汇总表）
--------------------------------------------------------------------------- */
function InputSummaryTable({ inputs }) {
  const rows = [
    ['Wall width b (墙宽)', tx(inputs.wallWidth), 'm'],
    ['Wall height h (墙高)', tx(inputs.wallHeight), 'm'],
    ['Wall thickness t (墙厚)', tx(inputs.wallThickness), 'm'],
    ['Concrete density γc (混凝土密度)', tx(inputs.concreteDensity), 'kN/m³'],
    ["Concrete strength f'c (混凝土强度)", tx(inputs.fc), 'MPa'],
    ['Steel yield fy (钢筋屈服)', tx(inputs.fy), 'MPa'],
    ['Cover (保护层)', tx(inputs.cover, 0), 'mm'],
    ['Roof dead pressure g (屋面恒载压力)', tx(inputs.gLine), 'kPa'],
    ['Roof live pressure q (屋面活载压力)', tx(inputs.qLine), 'kPa'],
    ['Roof wind pressure wwd (屋面风压)', tx(inputs.wwd), 'kPa'],
    ['Tributary range Sr (受荷范围)', tx(inputs.Sr), 'm'],
    ['Diaphragm wind force (隔膜风力)', tx(inputs.diaphragmWindForce), 'kN'],
    ['Diaphragm seismic force (隔膜震力)', tx(inputs.diaphragmSeismicForce), 'kN'],
    ['Lintel reaction (过梁反力)', tx(inputs.lintelReaction), 'kN'],
    ['Lintel eccentricity e (过梁偏心)', tx(inputs.lintelEccentricity), 'm'],
    ['Wall wind pressure wwf (墙体风压)', tx(inputs.wwf), 'kPa'],
    ['Fire load wf (火灾荷载)', tx(inputs.wf), 'kPa'],
    ['Fire duration th (火灾时长)', tx(inputs.th), 'hr'],
    ['Z (危险系数)', tx(inputs.hazardFactor), ''],
    ['Ru (重现期系数)', tx(inputs.returnPeriodFactor), ''],
    ['μ (延性系数)', tx(inputs.ductility), ''],
    ['Sp (结构性能系数)', tx(inputs.structuralPerformanceFactor), ''],
    ['Ch(T) (场地系数)', tx(inputs.siteCoefficient), ''],
    ['N(T,D) (近断层系数)', tx(inputs.nearFaultFactor), ''],
    ['Wt (抗震重量)', tx(inputs.seismicWeight), 'kN'],
    ['kd (分布系数)', tx(inputs.seismicDistributionFactor), ''],
    ['ψe (抗震组合系数)', tx(inputs.psiE), ''],
    /* v0.6 —— OOP part 地震参数（取代 CdT1 / CdTE） */
    ['OOP part coefficient Cp (平面外 part 系数, Table 8.1)', tx(inputs.partResponseCoefficient), ''],
    ['OOP part hx / hn → H (part 高度放大系数)', `${tx(inputs.partHeightHx)} / ${tx(inputs.buildingHeightHn)} → ${tx(safe(inputs.buildingHeightHn) > 0 ? 1 + 2 * Math.min(safe(inputs.partHeightHx) / safe(inputs.buildingHeightHn), 1) : 1, 3)}`, 'm'],
    ['Vertical bar φV@Sv (竖向筋)', `${tx(inputs.VbarDia, 0)} @ ${tx(inputs.VbarSpace, 0)}`, 'mm'],
    ['Horizontal bar φH@Sh (水平筋)', `${tx(inputs.HbarDia, 0)} @ ${tx(inputs.HbarSpace, 0)}`, 'mm'],
    ['Footing bar φF@Sf (基础筋)', `${tx(inputs.FootBarDia, 0)} @ ${tx(inputs.FootBarSpace, 0)}`, 'mm'],
    ['Boundary width (边缘构件宽)', tx(inputs.boundaryWidth), 'm'],
    ['Boundary bars (边缘纵筋)', `${tx(inputs.boundaryBarCount, 0)}-φ${tx(inputs.boundaryBarDiameter, 0)}`, ''],
    ['Bearing W×L (承压宽×长)', `${tx(inputs.bearingWidth, 0)} × ${tx(inputs.bearingLength, 0)}`, 'mm'],
    ['hroof (屋面高度)', tx(inputs.hroof), 'm'],
    ['tf / Lf (基础厚/长)', `${tx(inputs.tf, 0)} / ${tx(inputs.Lf, 0)}`, 'mm'],
    ['ts / fo / ds (板厚/挑出/硬填)', `${tx(inputs.ts, 0)} / ${tx(inputs.fo, 0)} / ${tx(inputs.ds, 0)}`, 'mm'],
    ['qU (OOP bearing, 基底承载力)', tx(inputs.qU), 'kPa'],
    ['Base dowels (锚筋)', `${tx(inputs.baseDowelCount, 0)}-φ${tx(inputs.baseDowelDiameter, 0)} @ ${tx(inputs.baseDowelEmbedment, 0)}mm`, ''],
    ["Grout strength f'g (灌浆强度)", tx(inputs.groutStrength), 'MPa'],
    ['Friction coefficient μ (摩擦系数)', tx(inputs.frictionCoefficient), ''],
    ['ϕ Connection (连接强度折减)', tx(inputs.phiConnection), ''],
    ['Footing B×L×t (平面内基础)', `${tx(inputs.footingWidth)} × ${tx(inputs.footingLength)} × ${tx(inputs.footingThickness)}`, 'm'],
    ['Allowable bearing (容许承载力)', tx(inputs.allowableBearingPressure), 'kPa']
  ];
  const pairs = [];
  for (let i = 0; i < rows.length; i += 2) pairs.push([rows[i], rows[i + 1]]);
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 800 }}>Parameter</TableCell>
            <TableCell align="right" sx={{ fontWeight: 800 }}>Value</TableCell>
            <TableCell align="right" sx={{ fontWeight: 800 }}>Unit</TableCell>
            <TableCell sx={{ fontWeight: 800 }}>Parameter</TableCell>
            <TableCell align="right" sx={{ fontWeight: 800 }}>Value</TableCell>
            <TableCell align="right" sx={{ fontWeight: 800 }}>Unit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pairs.map(([left, right], idx) => (
            <TableRow key={idx}>
              <TableCell>{left[0]}</TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{left[1]}</TableCell>
              <TableCell align="right" sx={{ color: 'text.secondary' }}>{left[2] || '—'}</TableCell>
              {right ? (
                <>
                  <TableCell>{right[0]}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{right[1]}</TableCell>
                  <TableCell align="right" sx={{ color: 'text.secondary' }}>{right[2] || '—'}</TableCell>
                </>
              ) : (
                <TableCell colSpan={3} />
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/* ---------------------------------------------------------------------------
   Geometry & Load Derivation（几何特性与荷载推算）
--------------------------------------------------------------------------- */
function LoadDerivationBlock({ inputs, inPlane, outOfPlane }) {
  const g = inPlane.gravity || {};
  const geo = inPlane.geometry || {};
  const oopdata = outOfPlane || {};
  return (
    <CalculationSection number="1" title="Geometry & Load Derivation · 几何特性与荷载推算" chip={<Chip size="small" label="AS/NZS 1170.0 / 1170.1" />}>
      <CalculationSubsection title="1.1 In-plane section properties · 平面内截面特性">
        <CalculationFormula caption="Gross area / 毛截面面积"
          formula={`A_g = (b\\times1000)(t\\times1000) = (${tx(geo.b)}\\times1000)(${tx(geo.t)}\\times1000) = ${tx(geo.Ag, 0)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Second moment of area / 惯性矩"
          formula={`I = \\frac{(b\\times1000)(t\\times1000)^3}{12} = ${tx(geo.I, 0)}\\,\\mathrm{mm^4}`} />
        <CalculationFormula caption="Section modulus / 截面模量"
          formula={`Z_g = \\frac{(b\\times1000)^2(t\\times1000)}{6} = ${tx(geo.Zg, 0)}\\,\\mathrm{mm^3}`} />
      </CalculationSubsection>
      <CalculationSubsection title="1.2 Roof pressures → line loads · 屋面压力 → 线荷载 (line load = pressure × Sr)">
        <CalculationFormula caption="Dead line load / 永久荷载线荷载"
          formula={`g_{line} = g\\times S_r = (${tx(inputs.gLine)}\\,\\mathrm{kPa})(${tx(inputs.Sr)}\\,\\mathrm{m}) = ${tx(g.gLineLoad)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Live line load / 活荷载线荷载"
          formula={`q_{line} = q\\times S_r = (${tx(inputs.qLine)}\\,\\mathrm{kPa})(${tx(inputs.Sr)}\\,\\mathrm{m}) = ${tx(g.qLineLoad)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Roof wind line load / 屋面风压线荷载"
          formula={`w_{wd,line} = w_{wd}\\times S_r = (${tx(inputs.wwd)}\\,\\mathrm{kPa})(${tx(inputs.Sr)}\\,\\mathrm{m}) = ${tx(safe(inputs.wwd) * safe(inputs.Sr, 1))}\\,\\mathrm{kN/m}`} />
      </CalculationSubsection>
      <CalculationSubsection title="1.3 In-plane self-weight & gravity ULS · 平面内自重与重力组合">
        <CalculationFormula caption="Wall self-weight / 墙体自重"
          formula={`G_{wall} = \\gamma_c\\,t\\,h\\,b = (${tx(inputs.concreteDensity)})(${tx(inputs.wallThickness)})(${tx(inputs.wallHeight)})(${tx(inputs.wallWidth)}) = ${tx(g.Gwall)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Total permanent line load / 顶部永久线荷载合计"
          formula={`G_{line,total} = g_{line}\\times b = (${tx(g.gLineLoad)})(${tx(geo.b)}) = ${tx(g.GlineTotal)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Total imposed line load / 顶部活线荷载合计"
          formula={`Q_{line,total} = q_{line}\\times b = (${tx(g.qLineLoad)})(${tx(geo.b)}) = ${tx(g.QlineTotal)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Gravity ULS axial force / 重力 ULS 轴力" highlight
          formula={`N^*_{gravity} = 1.2(G_{wall}+G_{line,total}) + 1.5\\,Q_{line,total} = 1.2(${tx(g.Gwall)}+${tx(g.GlineTotal)}) + 1.5(${tx(g.QlineTotal)}) = ${tx(g.Ngravity)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>
      <CalculationSubsection title="1.4 OOP gravity axial force · 平面外重力轴力">
        <CalculationFormula caption="Roof dead line load / 屋面恒载"
          formula={`W_d = S_r\\,w_d = (${tx(inputs.Sr)})(${tx(inputs.gLine)}) = ${tx(oopdata.Wd_line)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Wall self-weight above mid-height / 墙体自重（半高以上）"
          formula={`N_{SW} = \\frac{t_w}{1000}\\cdot\\frac{H_w-t_f}{2}\\cdot\\gamma_c = \\frac{${tx(inputs.wallThickness*1000,0)}}{1000}\\cdot\\frac{${tx(inputs.wallHeight)}-${tx(inputs.tf/1000)}}{2}\\cdot${tx(inputs.concreteDensity)} = ${tx(oopdata.NSW)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Footing weight / 基础自重"
          formula={`N_{FF} = L_f\\frac{t_f}{1000}\\gamma_c = ${tx(inputs.Lf,0)}\\frac{${tx(inputs.tf,0)}}{1000}${tx(inputs.concreteDensity)} = ${tx(oopdata.NFF)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Slab weight / 楼板自重"
          formula={`N_{SF} = (L_f+2f_o)\\frac{t_s}{1000}\\gamma_c = (${tx(inputs.Lf,0)}+2\\times${tx(inputs.fo,0)})\\frac{${tx(inputs.ts,0)}}{1000}${tx(inputs.concreteDensity)} = ${tx(oopdata.NSF)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Hardfill weight / 硬填层自重"
          formula={`N_{HF} = (L_f+2f_o)\\frac{d_s}{1000}\\gamma_s = (${tx(inputs.Lf,0)}+2\\times${tx(inputs.fo,0)})\\frac{${tx(inputs.ds,0)}}{1000}${tx(inputs.gs)} = ${tx(oopdata.NHF)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Effective gravity axial force / 有效重力轴力" highlight
          formula={`N_{GE} = N_{SW}+N_{FF}+N_{SF}+N_{HF}+W_d = ${tx(oopdata.NSW)}+${tx(oopdata.NFF)}+${tx(oopdata.NSF)}+${tx(oopdata.NHF)}+${tx(oopdata.Wd_line)} = ${tx(oopdata.N_GE)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="ULS gravity envelope / ULS 重力包络"
          formula={`N_{max} = \\max(1.35\\,N_{GE},\\;1.2\\,N_{GE}+1.5\\,W_q) = \\max(1.35\\times${tx(oopdata.N_GE)},\\;1.2\\times${tx(oopdata.N_GE)}+1.5\\times(${tx(inputs.qLine)})(${tx(inputs.Sr)})) = ${tx(oopdata.Nmax)}\\,\\mathrm{kN/m}`} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   2. In-Plane Seismic Action（平面内抗震作用）
--------------------------------------------------------------------------- */
function InPlaneSeismicBlock({ inputs, inPlane }) {
  const s = inPlane.seismic || {};
  return (
    <CalculationSection number="2" title="In-Plane Seismic Action · 平面内抗震作用" chip={<Chip size="small" label="AS/NZS 1170.5 §3.2.2" />}>
      <CalculationFormula caption="Elastic site hazard coefficient / 弹性场地危险系数"
        formula={`C(T) = C_h(T)\\,Z\\,R_u\\,N(T,D) = (${tx(s.Ch)})(${tx(s.Z)})(${tx(s.Ru)})(${tx(s.Nt)}) = ${tx(s.C, 5)}`} />
      <CalculationFormula caption="Structural performance factor / 结构性能系数"
        formula={`S_p = 1.3 - 0.3\\mu = 1.3 - 0.3(${tx(s.mu)}) = ${tx(s.Sp)}`} />
      <CalculationFormula caption="Design action coefficient / 设计作用系数"
        formula={`C_d(T) = C(T)\\frac{S_p}{\\mu} = ${tx(s.C, 5)}\\times\\frac{${tx(s.Sp)}}{${tx(s.mu)}} = ${tx(s.Cd, 5)}`} />
      <CalculationFormula caption="In-plane base shear / 平面内基底剪力" highlight
        formula={`V^*_{seismic} = C_d\\,W_t\\,k_d = (${tx(s.Cd, 5)})(${tx(s.Wt)}\\,\\mathrm{kN})(${tx(inputs.seismicDistributionFactor)}) = ${tx(s.Vseismic)}\\,\\mathrm{kN}`} />
      <CalculationFormula caption="Seismic overturning moment / 抗震倾覆弯矩" highlight
        formula={`M^*_{seismic} = V^*_{seismic}\\,h = (${tx(s.Vseismic)})(${tx(inputs.wallHeight)}) = ${tx(s.Mseismic)}\\,\\mathrm{kN\\cdot m}`} />
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   3. Combined In-Plane Actions（平面内组合内力）
--------------------------------------------------------------------------- */
function InPlaneActionsBlock({ inputs, inPlane }) {
  const s = inPlane.seismic || {};
  const d = inPlane.diaphragm || {};
  const a = inPlane.sectionActions || {};
  const diaV = Math.max(safe(d.VdiaphragmWind), safe(d.VdiaphragmSeismic));
  const diaM = Math.max(safe(d.MdiaphragmWind), safe(d.MdiaphragmSeismic));
  return (
    <CalculationSection number="3" title="Combined In-Plane Actions · 平面内组合内力" chip={<Chip size="small" label="Seismic + Diaphragm + Lintel" />}>
      <CalculationSubsection title="3.1 Roof diaphragm forces · 屋盖隔膜力 (at wall top)">
        <CalculationFormula caption="Envelope diaphragm force / 隔膜水平力包络"
          formula={`V_{dia} = \\max(V_{wd},\\,V_{es}) = \\max(${tx(d.VdiaphragmWind)},\\,${tx(d.VdiaphragmSeismic)}) = ${tx(diaV)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Diaphragm moment at base / 隔膜底部弯矩"
          formula={`M_{dia} = V_{dia}\\times h = ${tx(diaV)}\\times${tx(inputs.wallHeight)} = ${tx(diaM)}\\,\\mathrm{kN\\cdot m}`} />
      </CalculationSubsection>
      <CalculationSubsection title="3.2 Lintel reaction & eccentricity · 过梁反力与偏心">
        <CalculationFormula caption="Lintel eccentric moment / 过梁偏心弯矩"
          formula={`M_{lintel} = R_{lintel}\\,e = (${tx(inputs.lintelReaction)}\\,\\mathrm{kN})(${tx(inputs.lintelEccentricity)}\\,\\mathrm{m}) = ${tx(a.Mlintel)}\\,\\mathrm{kN\\cdot m}`} />
      </CalculationSubsection>
      <CalculationSubsection title="3.3 Axial forces & total actions · 轴力与总内力">
        <CalculationFormula caption="Seismic gravity axial force / 抗震重力组合轴力"
          formula={`N_{EQ,g} = G_{wall}+G_{line,total}+\\psi_e Q_{line,total} = ${tx(a.seismicGravity)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Compression case / 受压工况轴力" highlight
          formula={`N^*_{comp} = N_{EQ,g}+R_{lintel} = ${tx(a.seismicGravity)}+${tx(inputs.lintelReaction)} = ${tx(a.NseismicCompression)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Opposite direction axial force / 反向抗震轴力"
          formula={`N^*_{tension} = N_{EQ,g}-R_{lintel} = ${tx(a.seismicGravity)}-${tx(inputs.lintelReaction)} = ${tx(a.NseismicTension)}\\,\\mathrm{kN}`}
          status={mkStatus(safe(a.NseismicTension) >= 0, 'COMPRESSION', 'TENSION / UPLIFT')} />
        <CalculationFormula caption="Total in-plane moment / 总弯矩" highlight
          formula={`M^* = M^*_{seismic}+M_{dia}+M_{lintel} = ${tx(s.Mseismic)}+${tx(diaM)}+${tx(a.Mlintel)} = ${tx(a.Mtotal)}\\,\\mathrm{kN\\cdot m}`} />
        <CalculationFormula caption="Total in-plane shear / 总剪力" highlight
          formula={`V^* = V^*_{seismic}+V_{dia} = ${tx(s.Vseismic)}+${tx(diaV)} = ${tx(a.Vtotal)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   4. In-Plane Section Checks（平面内截面验算）
   v0.6.2 —— 新增 4.7 边缘构件局部压弯 N-M（Lintel 作用于墙边）
--------------------------------------------------------------------------- */
function InPlaneChecksBlock({ inputs, inPlane }) {
  const geo = inPlane.geometry || {};
  const a = inPlane.sectionActions || {};
  const es = inPlane.elasticStress || {};
  const sl = inPlane.slenderness || {};
  const be = inPlane.bearing || {};
  const re = inPlane.reinforcement || {};
  const it = inPlane.interaction || {};
  const sh = inPlane.shear || {};
  const ch = inPlane.checks || {};
  const nV = re.nVerticalBars ?? 0;
  const minBlock = Math.min(safe(re.d), safe(inputs.boundaryWidth) * 1000);
  /* v0.6.2 —— 边缘构件局部 N-M 数据 */
  const bn = inPlane.boundaryNM || {};
  const bns = bn.section || {};
  const bnk = bn.keyPoints || {};
  const bng = bn.gravityShare || {};
  const bnd = Array.isArray(bn.demands) ? bn.demands : [];
  const bnc = bn.checks || {};
  const bngov = bn.governing || {};
  return (
    <CalculationSection number="4" title="In-Plane Section Checks · 平面内截面验算" chip={<Chip size="small" label="NZS 3101 (simplified)" />}>
      <CalculationSubsection title="4.1 Elastic stress distribution · 弹性应力分布">
        <CalculationFormula caption="Uniform axial stress / 均匀轴压应力"
          formula={`\\sigma_N = \\frac{N^*}{A_g} = \\frac{${tx(a.NseismicCompression)}\\times1000}{${tx(geo.Ag, 0)}} = ${tx(es.sigmaN, 4)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Bending stress / 弯曲应力"
          formula={`\\sigma_M = \\frac{M^*}{Z_g} = \\frac{${tx(a.Mtotal)}\\times10^6}{${tx(geo.Zg, 0)}} = ${tx(es.sigmaM, 4)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Maximum edge compression / 最大边缘压应力" highlight
          formula={`\\sigma_{max} = \\sigma_N+\\sigma_M = ${tx(es.sigmaMax, 4)}\\,\\mathrm{MPa}`}
          status={mkStatus(ch.stressCompressionPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Minimum edge stress / 最小边缘应力"
          formula={`\\sigma_{min} = \\sigma_N-\\sigma_M = ${tx(es.sigmaMin, 4)}\\,\\mathrm{MPa}`}
          status={mkStatus(safe(es.sigmaMin) >= 0, 'NO TENSION', 'TENSION PREDICTED')} />
        <CalculationFormula caption="Resultant eccentricity / 合力偏心距"
          formula={`e = \\frac{M^*}{N^*} = \\frac{${tx(a.Mtotal)}}{${tx(a.NseismicCompression)}} = ${tx(es.eccentricity, 4)}\\,\\mathrm{m} = ${tx(safe(es.eccentricity) * 1000, 1)}\\,\\mathrm{mm},\\qquad e_{kern} = \\frac{b}{6} = \\frac{${tx(geo.b)}}{6} = ${tx(es.kern, 4)}\\,\\mathrm{m}`} />
      </CalculationSubsection>
      <CalculationSubsection title="4.2 Slenderness classification · 长细比与分类">
        <CalculationFormula caption="In-plane aspect ratio / 平面内高宽比"
          formula={`\\frac{h}{l_w} = \\frac{${tx(inputs.wallHeight)}}{${tx(inputs.wallWidth)}} = ${tx(sl.aspectRatio)}\\quad\\Rightarrow\\quad\\text{${sl.wallClassification || '-'}}`} />
        <CalculationFormula caption="Out-of-plane slenderness / 平面外长细比"
          formula={`\\frac{h}{t} = \\frac{${tx(inputs.wallHeight)}}{${tx(inputs.wallThickness)}} = ${tx(sl.outOfPlaneSlenderness)}`}
          status={mkStatus(!ch.slendernessWarning, 'h/t ≤ 25', 'h/t > 25 — CHECK')} />
      </CalculationSubsection>
      <CalculationSubsection title="4.3 Lintel bearing (D-region) · 过梁局部承压">
        <CalculationFormula caption="Bearing area / 承压面积"
          formula={`A_b = \\frac{b_b}{1000}\\times\\frac{l_b}{1000} = \\frac{${tx(inputs.bearingWidth,0)}}{1000}\\times\\frac{${tx(inputs.bearingLength,0)}}{1000} = ${tx(safe(inputs.bearingWidth) * safe(inputs.bearingLength) / 1e6, 6)}\\,\\mathrm{m^2} = ${tx(safe(inputs.bearingWidth) * safe(inputs.bearingLength), 0)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Bearing stress / 承压应力"
          formula={`\\sigma_b = \\frac{R_{lintel}}{A_b} = \\frac{${tx(inputs.lintelReaction)}\\times1000}{${tx(safe(inputs.bearingWidth) * safe(inputs.bearingLength), 0)}} = ${tx(be.bearingStress, 4)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Bearing capacity / 承压承载力限值"
          formula={`\\sigma_{b,cap} = 0.6\\sqrt{f'_c} = 0.6\\sqrt{${tx(inputs.fc)}} = ${tx(safe(be.bearingCapacity) / 1000, 4)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Bearing utilisation / 承压利用率" highlight
          formula={`UR_{bearing} = \\frac{\\sigma_b}{\\sigma_{b,cap}} = ${txUR(be.bearingRatio)} = ${txPct(be.bearingRatio)}\\%`}
          status={mkStatus(ch.bearingPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>
      <CalculationSubsection title="4.4 Reinforcement properties · 配筋特性 (bar count from spacing)">
        <CalculationFormula caption="Number of vertical bars / 竖向分布筋根数"
          formula={`n_v = \\left\\lfloor\\frac{b\\times1000}{s_v}\\right\\rfloor + 1 = \\left\\lfloor\\frac{${tx(geo.b)}\\times1000}{${tx(inputs.VbarSpace, 0)}}\\right\\rfloor + 1 = ${tx(nV, 0)}`} />
        <CalculationFormula caption="Distributed vertical steel / 竖向分布筋面积"
          formula={`A_{s,dist} = n_v\\frac{\\pi\\phi_v^2}{4} = ${tx(nV, 0)}\\times\\frac{\\pi\\times${tx(inputs.VbarDia, 0)}^2}{4} = ${tx(re.AsDistributed, 1)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Vertical reinforcement ratio / 竖向配筋率"
          formula={`\\rho_v = \\frac{A_{s,dist}}{A_g} = \\frac{${tx(re.AsDistributed, 1)}}{${tx(geo.Ag, 0)}} = ${tx(safe(re.rhoVertical) * 100, 3)}\\%`} />
        <CalculationFormula caption="Boundary steel / 边缘构件纵筋"
          formula={`A_{s,b} = n_b\\frac{\\pi\\phi_b^2}{4} = ${tx(inputs.boundaryBarCount, 0)}\\times\\frac{\\pi\\times${tx(inputs.boundaryBarDiameter, 0)}^2}{4} = ${tx(re.AsBoundary, 1)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Boundary reinforcement ratio / 边缘构件配筋率"
          formula={`\\rho_b = \\frac{A_{s,b}}{A_{boundary}} = \\frac{${tx(re.AsBoundary, 1)}}{${tx(re.boundaryArea, 0)}} = ${tx(safe(re.rhoBoundary) * 100, 3)}\\%`} />
        <CalculationFormula caption="Boundary steel tensile capacity / 边缘钢筋抗拉能力"
          formula={`T_{s,b} = A_{s,b}f_y/1000 = \\frac{${tx(re.AsBoundary, 1)}\\times${tx(inputs.fy)}}{1000} = ${tx(re.boundarySteelTensionCapacity)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>
      <CalculationSubsection title="4.5 Simplified N-M interaction · N-M 交互（简化模型）">
        <CalculationFormula caption="Effective depth / 有效高度"
          formula={`d = t\\times1000 - c_{cover} - \\frac{\\phi_b}{2} = ${tx(inputs.wallThickness)}\\times1000 - ${tx(inputs.cover)} - \\frac{${tx(inputs.boundaryBarDiameter,0)}}{2} = ${tx(re.d, 1)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Concrete compression force / 混凝土压力"
          formula={`C_c = 0.85\\,f'_c\\,b_c\\,a_{block} = 0.85(${tx(inputs.fc)})(${tx(safe(inputs.boundaryWidth) * 1000, 0)})(${tx(minBlock, 0)}) = ${tx(it.compressionConcrete, 0)}\\,\\mathrm{N}`} />
        <CalculationFormula caption="Steel compression force / 钢筋压力"
          formula={`C_s = A_{s,b}f_y = ${tx(it.steelCompression, 0)}\\,\\mathrm{N}`} />
        <CalculationFormula caption="Design axial capacity / 轴压承载力" highlight
          formula={`\\phi P_n = \\phi_c(C_c+C_s)/1000 = \\frac{${tx(inputs.phiCompression)}\\times(${tx(it.compressionConcrete, 0)}+${tx(it.steelCompression, 0)})}{1000} = ${tx(it.phiPn)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Approximate flexural capacity / 近似抗弯承载力" highlight
          formula={`\\phi M_n = \\phi_f\\frac{(C_c+C_s)(d/2)}{10^6} = \\frac{${tx(inputs.phiFlexure)}\\times(${tx(it.compressionConcrete, 0)}+${tx(it.steelCompression, 0)})\\times(${tx(re.d, 1)}/2)}{10^6} = ${tx(it.phiMn)}\\,\\mathrm{kN\\cdot m}`} />
        <CalculationFormula caption="N-M interaction ratio / N-M 交互利用率" highlight
          formula={`\\eta_{N-M} = \\frac{N^*}{\\phi P_n} + \\frac{M^*}{\\phi M_n} = \\frac{${tx(a.NseismicCompression)}}{${tx(it.phiPn)}} + \\frac{${tx(a.Mtotal)}}{${tx(it.phiMn)}} = ${tx(it.axialRatio, 4)} + ${tx(it.momentRatio, 4)} = ${txUR(it.interactionRatio)}`}
          status={mkStatus(ch.interactionPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>
      <CalculationSubsection title="4.6 In-plane shear · 平面内抗剪">
        <CalculationFormula caption="Web width & shear depth / 腹板宽度与有效剪深"
          formula={`b_w = ${tx(sh.bw, 0)}\\,\\mathrm{mm},\\qquad d_v = 0.8d = ${tx(sh.dv, 0)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Concrete shear capacity / 混凝土抗剪"
          formula={`V_c = 0.17\\sqrt{f'_c}\\,b_w\\,d_v/1000 = ${tx(sh.vc)}\\,\\mathrm{kN},\\qquad \\phi V_c = ${tx(sh.phiVc)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Horizontal steel contribution / 水平筋抗剪"
          formula={`V_s = \\frac{2A_{\\phi h}f_y d_v}{s_h} = ${tx(sh.VsProvided)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Design shear capacity / 抗剪承载力" highlight
          formula={`\\phi V = \\phi V_c + \\phi V_s = ${tx(sh.shearCapacity)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Shear utilisation / 抗剪利用率" highlight
          formula={`UR_V = \\frac{V^*}{\\phi V} = \\frac{${tx(a.Vtotal)}}{${tx(sh.shearCapacity)}} = ${txUR(sh.shearRatio)} = ${txPct(sh.shearRatio)}\\%`}
          status={mkStatus(ch.shearPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>
      {/* ------------------------------------------------------------------
          v0.6.2 新增 —— 4.7 边缘构件局部压弯 N-M（Lintel 反力作用于墙边）
          完整平截面 N-M 承载力曲线 + ϕ(N) 设计包络 + 需求包络图（SVG）
      ------------------------------------------------------------------ */}
      <CalculationSubsection title="4.7 Boundary element local N-M (lintel at wall edge) · 边缘构件局部压弯 N-M（v0.6.2 新增）">
        {bn.available === false ? (
          <Alert severity="info">
            Boundary element local N-M check skipped (no boundary element or incomplete data).
            （无边缘构件或参数缺失，跳过本项局部压弯验算。）
          </Alert>
        ) : (
          <>
            <CalculationFormula caption="Boundary section & reinforcement / 边缘构件截面与配筋（绕墙厚方向轴受弯，两层对称配筋近似）"
              formula={`A_{b} = b_b\\times t_b = ${tx(bns.bw)}\\times${tx(bns.bt)} = ${tx(safe(bns.bw) * safe(bns.bt), 4)}\\,\\mathrm{m^2},\\qquad A_{s,b} = ${tx(bns.AsTotal, 0)}\\,\\mathrm{mm^2},\\qquad d = ${tx(bns.d, 0)}\\,\\mathrm{mm}`} />
            <CalculationFormula caption="Strain-compatibility parameters / 平截面参数"
              formula={`\\varepsilon_{cu} = 0.003,\\qquad \\beta_1 = \\max[0.85-0.008(f'_c-30),\\,0.65] = ${tx(bns.beta1, 3)},\\qquad \\phi_c = ${tx(inputs.phiCompression)},\\;\\phi_f = ${tx(inputs.phiFlexure)}`} />
            <CalculationFormula caption="Pure compression capacity / 纯压承载力"
              formula={`\\phi P_0 = \\phi_c[0.85f'_c(A_b-A_s)+f_yA_s] = ${tx(bnk.phiP0, 0)}\\,\\mathrm{kN}`} />
            <CalculationFormula caption="Balanced point / 平衡点（受压控制区分界）"
              formula={`c_b = \\frac{\\varepsilon_{cu}}{\\varepsilon_{cu}+f_y/E_s}\\,d = ${tx(bnk.cb, 0)}\\,\\mathrm{mm},\\qquad (N_b,\\,M_b) = (${tx(bnk.Nb, 0)}\\,\\mathrm{kN},\\;${tx(bnk.Mb, 1)}\\,\\mathrm{kN\\cdot m}),\\qquad (\\phi N_b,\\,\\phi M_b) = (${tx(bnk.phiNb, 0)},\\;${tx(bnk.phiMb, 1)})`} />
            <CalculationFormula caption="Pure bending capacity / 纯弯承载力（N = 0 交点）"
              formula={`\\phi M_0 = ${tx(bnk.phiM0, 1)}\\,\\mathrm{kN\\cdot m}`} />
            <CalculationFormula caption="Gravity share of boundary element / 边缘构件分担重力（按面积占比 r = A_b / A_g）"
              formula={`r = ${tx(bng.r, 4)},\\qquad G_b = r(G_{wall}+G_{line,total}) = ${tx(bng.Gb, 1)}\\,\\mathrm{kN},\\qquad Q_b = r\\,Q_{line,total} = ${tx(bng.Qb, 1)}\\,\\mathrm{kN}`} />
            {/* 需求包络表（三种组合，含 Lintel 偏心弯矩 R·e） */}
            <Box sx={{ overflowX: 'auto', mb: 1.5 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Combination 组合', 'N* (kN)', 'M* (kN·m)', 'φMn(N*) (kN·m)', 'UR', 'Status'].map(hd => (
                      <th key={hd} style={{ textAlign: hd === 'Combination 组合' ? 'left' : 'right', padding: '6px 10px', borderBottom: '2px solid #e5e7eb', fontWeight: 800 }}>{hd}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bnd.map((pt) => {
                    const isGov = bngov.key === pt.key;
                    const ptPass = Number.isFinite(pt.UR) && pt.UR <= 1;
                    return (
                      <tr key={pt.key} style={{ background: isGov ? '#fff7ed' : 'transparent' }}>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee', fontWeight: 600 }}>
                          {pt.key} · {pt.label}{isGov ? '（governing 控制）' : ''}
                        </td>
                        <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #eee' }}>{tx(pt.N, 1)}</td>
                        <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #eee' }}>{tx(pt.M, 2)}</td>
                        <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #eee' }}>{tx(pt.Mcap, 2)}</td>
                        <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #eee', fontWeight: 700 }}>
                          {Number.isFinite(pt.UR) ? `${txPct(pt.UR)}%` : '∞'}
                        </td>
                        <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #eee' }}>
                          <Chip size="small" label={ptPass ? 'PASS' : 'CHECK'} color={ptPass ? 'success' : 'warning'} sx={{ fontWeight: 700 }} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Box>
            <CalculationFormula caption="Governing N-M utilisation / 控制利用率（等轴力水平内插：UR = M* / φMn(N*)）" highlight
              formula={`UR_{b,N-M} = \\frac{M^*}{\\phi M_n(N^*)} = \\frac{${tx(bngov.M, 2)}}{${tx(bngov.Mcap, 2)}} = ${txUR(bnc.governingUR)} = ${txPct(bnc.governingUR)}\\%`}
              status={mkStatus(bnc.pass, 'PASS', 'CHECK')} />
            {/* v0.6.2 —— N-M 承载力曲线与需求包络图（SVG） */}
            <NMInteractionChart boundary={bn} />
          </>
        )}
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   5. Out-of-Plane Design（平面外设计）
--------------------------------------------------------------------------- */
function OutOfPlaneBlock({ inputs, outOfPlane }) {
  const o = outOfPlane || {};
  const hv = o.hroofValidation || {};
  const sc = o.supportConditions || {};
  const add = o.additionalLoads || {};
  const ps = o.partSeismic || {};
  const wsF = sc.windSeismicFactors || { mid: 1 / 8, base: 1 / 8 };
  const fF = sc.fireFactors || { base: 1 / 2 };
  /* ★ 为公式展示推算辅助变量 */
  const hroofEff = safe(hv.hroofEffective);
  const baseLeverArm = Math.max(safe(inputs.wallHeight) - hroofEff - safe(inputs.tf) / 1000, 0);
  const HwMinusTf = safe(inputs.wallHeight) - safe(inputs.tf) / 1000;
  return (
    <CalculationSection number="5" title="Out-of-Plane Design · 平面外设计" chip={<Chip size="small" label="AS/NZS 1170.5 Ch.8 Parts / §8.5.1" />}>
      <CalculationSubsection title="5.1 hroof validation · hroof 校验">
        <CalculationFormula caption="Maximum allowed / 允许最大值"
          formula={`h_{roof,max} = H_w - t_f - d_s - t_s = ${tx(inputs.wallHeight)} - ${tx(safe(inputs.tf) / 1000)} - ${tx(safe(inputs.ds) / 1000)} - ${tx(safe(inputs.ts) / 1000)} = ${tx(hv.hroofMax)}\\,\\mathrm{m}`} />
        <CalculationFormula caption="Effective value used / 实际采用值" highlight
          formula={`h_{roof,eff} = \\min(h_{roof},\\,h_{roof,max}) = \\min(${tx(inputs.hroof)},\\,${tx(hv.hroofMax)}) = ${tx(hv.hroofEffective)}\\,\\mathrm{m}`}
          status={mkStatus(hv.hroofValid, 'VALID', 'CLAMPED')} />
      </CalculationSubsection>
      <CalculationSubsection title="5.2 OOP lateral actions (AS/NZS 1170.5 Ch.8 parts) · 平面外水平作用（第 8 章 parts）">
        <CalculationFormula caption="Part height amplification factor / part 高度放大系数 (§8.4.2.3)"
          formula={`H = 1 + 2\\frac{h_x}{h_n} = 1 + 2\\times\\frac{${tx(ps.hx)}}{${tx(ps.hn)}} = ${tx(ps.H, 3)}`} />
        <CalculationFormula caption="Wall panel tributary weight / 墙板重量（每延米，沿 OOP 计算高度 hroof）"
          formula={`W_p = \\gamma_c\\,t_w\\,h_{roof} = (${tx(inputs.concreteDensity)})(${tx(safe(inputs.wallThickness))})(${tx(hv.hroofEffective)}) = ${tx(ps.Wp)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Part seismic force (§8.4.2.2) / part 地震作用" highlight
          formula={`F_p = C_p\\,H\\,W_p = (${tx(ps.Cp)})(${tx(ps.H, 3)})(${tx(ps.Wp)}) = ${tx(ps.Fp)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="OOP seismic pressure (uniform over hroof) / 平面外地震压力" highlight
          formula={`W_E = \\frac{F_p}{h_{roof}} = C_p\\,H\\,\\gamma_c\\,t_w = ${tx(o.WE)}\\,\\mathrm{kPa}`} />
        <CalculationFormula caption="Governing wind pressure / 控制风压"
          formula={`W_{pressure} = \\max(w_{wd},\\,w_{wf}) = \\max(${tx(inputs.wwd)},\\,${tx(inputs.wwf)}) = ${tx(o.WindPressure)}\\,\\mathrm{kPa}`} />
        <CalculationFormula caption="Max-moment height / 最大弯矩高度"
          formula={`x_m = \\frac{h_{roof}}{2} = \\frac{${tx(hroofEff)}}{2} = ${tx(o.x_m)}\\,\\mathrm{m}`} />
        <CalculationFormula caption="Seismic mid-height moment / 地震中部弯矩"
          formula={`M_E = \\frac{W_E\\,x_m(h^2-x_m h)}{2h} = \\frac{${tx(o.WE)}\\times${tx(o.x_m)}\\times(${tx(hroofEff)}^2-${tx(o.x_m)}\\times${tx(hroofEff)})}{2\\times${tx(hroofEff)}} = ${tx(o.ME)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Wind mid-height moment / 风中部弯矩"
          formula={`M_W = \\frac{W_{pressure}\\,x_m(h^2-x_m h)}{2h} = \\frac{${tx(o.WindPressure)}\\times${tx(o.x_m)}\\times(${tx(hroofEff)}^2-${tx(o.x_m)}\\times${tx(hroofEff)})}{2\\times${tx(hroofEff)}} = ${tx(o.MW)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Additional point-load mid contribution / 附加点荷载中部贡献"
          formula={`\\Delta M_{add,mid} = F_{add}\\max(h_F-x_m,0)+M_{add} = ${tx(add.F_add)}\\times\\max(${tx(add.h_force)}-${tx(o.x_m)},0)+${tx(add.M_add)} = ${tx(add.M_add_mid_F)}+${tx(add.M_add_mid_M)}\\,\\mathrm{kN\\cdot m/m}`} />
      </CalculationSubsection>
      <CalculationSubsection title={`5.3 Support condition factors · 支承条件弯矩系数 (W&S: ${sc.windSeismic || 'Pinned-Pinned'}; Fire: ${sc.fire || 'Fixed-Free'})`}>
        <Box sx={{ overflowX: 'auto', mb: 1.5 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Support condition', 'Mid-height k', 'Base k', 'Assigned to'].map(hd => (
                  <th key={hd} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '2px solid #e5e7eb', fontWeight: 800 }}>{hd}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SUPPORT_MOMENT_TABLE.map(row => {
                const isWS = (sc.windSeismic || 'Pinned-Pinned') === row.key;
                const isFire = (sc.fire || 'Fixed-Free') === row.key;
                return (
                  <tr key={row.key} style={{ background: (isWS || isFire) ? '#f0f7ff' : 'transparent' }}>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee', fontWeight: 600 }}>{row.label}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{row.mid} = {row.midVal.toFixed(4)}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{row.base} = {row.baseVal.toFixed(4)}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>
                      {isWS && <Chip size="small" color="primary" label="Wind & Seismic" sx={{ mr: 0.5 }} />}
                      {isFire && <Chip size="small" color="error" label="Fire" />}
                      {!isWS && !isFire && <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
        <CalculationFormula caption="Adjustment factors (vs baseline wL²/8 & wL²/2) / 中部/底部/火灾调整系数" highlight
          formula={`k_{mid} = \\frac{${tx(wsF.mid, 4)}}{1/8} = ${tx(sc.wsMidAdjust, 3)},\\qquad k_{base} = \\frac{${tx(wsF.base, 4)}}{1/8} = ${tx(sc.wsBaseAdjust, 3)},\\qquad k_{fire} = \\frac{${tx(fF.base, 4)}}{1/2} = ${tx(sc.fireAdjust, 3)}`} />
        <CalculationFormula caption="Mid-height design moment / 中部设计弯矩 (incl. support factor & additional loads)" highlight
          formula={`M_a = \\max(M_E,M_W)\\,k_{mid} + \\Delta M_{add,mid} = \\max(${tx(o.ME)},${tx(o.MW)})\\times${tx(sc.wsMidAdjust, 3)}+${tx(safe(add.M_add_mid_F) + safe(add.M_add_mid_M))} = ${tx(o.Ma)}\\,\\mathrm{kN\\cdot m/m}`} />
      </CalculationSubsection>
      <CalculationSubsection title="5.4 Flexural capacity · 抗弯承载力">
        <CalculationFormula caption="Steel tension / 钢筋拉力"
          formula={`T_s = L_w A_{WV} f_y/1000 = ${tx(o.Ts)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Stress block depth / 应力块高度"
          formula={`a = \\frac{T_s\\times1000}{0.85 f'_c L_w\\times1000} = ${tx(o.a, 1)}\\,\\mathrm{mm},\\qquad d = 0.5t_w = ${tx(o.d, 0)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Flexural capacity / 抗弯承载力" highlight
          formula={`\\phi M_n = 0.85\\,A_{WV}f_y\\left(d-\\frac{a}{2}\\right)/10^6 = ${tx(o.phiMn)}\\,\\mathrm{kN\\cdot m/m}`} />
      </CalculationSubsection>
      <CalculationSubsection title="5.5 P-Delta mid-height check (UR1) · P-Δ 中部验算">
        <CalculationFormula caption="Concrete modulus / 混凝土弹性模量"
          formula={`E_c = 3320\\sqrt{f'_c}+6900 = ${tx(o.Ec, 0)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Equivalent steel area / 换算钢筋面积"
          formula={`A_{se} = \\frac{N_{GE}\\times1000 + A_{WV}f_y}{f_y} = ${tx(o.Ase, 0)}\\,\\mathrm{mm^2/m}`} />
        <CalculationFormula caption="Cracked second moment / 开裂截面惯性矩"
          formula={`I_{cr} = nA_{se}(d-kd)^2 + \\frac{(kd)^3}{3} = ${tx(o.Icr, 0)}\\,\\mathrm{mm^4/m}`} />
        <CalculationFormula caption="P-Δ magnified moment / P-Δ 放大弯矩" highlight
          formula={`M' = \\frac{M_a}{1-\\dfrac{5N_a h_{roof}^2}{0.75\\times48\\,E_c I_{cr}}} = \\frac{${tx(o.Ma)}}{1-\\dfrac{5\\times${tx(o.Na)}\\times${tx(hroofEff * 1000, 0)}^2}{0.75\\times48\\times${tx(o.Ec, 0)}\\times${tx(o.Icr, 0)}}} = ${tx(o.M_prime)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Ultimate deflection / 极限挠度"
          formula={`\\Delta_u = \\frac{5M' h_{roof}^2}{0.75\\times48\\,E_c I_{cr}} = \\frac{5\\times${tx(o.M_prime)}\\times${tx(hroofEff * 1000, 0)}^2}{0.75\\times48\\times${tx(o.Ec, 0)}\\times${tx(o.Icr, 0)}} = ${tx(o.delta_u, 1)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Mid-height utilisation / 中部利用率" highlight
          formula={`UR_1 = \\frac{M'}{\\phi M_n} = ${txUR(o.UR1)} = ${txPct(o.UR1)}\\%`}
          status={mkStatus(Number.isFinite(o.UR1) && o.UR1 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>
      <CalculationSubsection title="5.6 Base moment check (UR2) · 底部弯矩验算">
        <CalculationFormula caption="Base moments (incl. support factor & additional loads) / 底部弯矩"
          formula={`M_{bE} = \\frac{W_E(h^2-2a^2)}{8}k_{base} + \\Delta M_{add,base} = \\frac{${tx(o.WE)}\\times(${tx(hroofEff)}^2-2\\times${tx(baseLeverArm)}^2)}{8}\\times${tx(sc.wsBaseAdjust, 3)}+${tx(safe(add.M_add_base_F) + safe(add.M_add_base_M))} = ${tx(o.MbE)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Wind base moment / 风底部弯矩"
          formula={`M_{bW} = \\frac{W_{pressure}(h^2-2a^2)}{8}k_{base} + \\Delta M_{add,base} = \\frac{${tx(o.WindPressure)}\\times(${tx(hroofEff)}^2-2\\times${tx(baseLeverArm)}^2)}{8}\\times${tx(sc.wsBaseAdjust, 3)}+${tx(safe(add.M_add_base_F) + safe(add.M_add_base_M))} = ${tx(o.MbW)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Base utilisation / 底部利用率" highlight
          formula={`UR_2 = \\frac{\\max(M_{bE},M_{bW})}{\\phi M_n} = ${txUR(o.UR2)} = ${txPct(o.UR2)}\\%`}
          status={mkStatus(Number.isFinite(o.UR2) && o.UR2 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>
      <CalculationSubsection title="5.7 Fire check (UR3) · 火灾验算 (support: Fire option)">
        <CalculationFormula caption="Axis distance / 钢筋轴向距离"
          formula={`x_t = \\frac{t_w}{2}-\\frac{\\phi_v}{2}-\\phi_h = ${tx(o.xt, 1)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Reduction factors / 温度折减系数"
          formula={`\\eta_x = 0.16\\ln(t_h x_t^{-2})-0.65 = ${tx(o.etax, 3)},\\qquad \\eta_w = 1-0.162\\,t_h^{-0.6} = ${tx(o.etaw, 3)}`} />
        <CalculationFormula caption="Steel temperature & reduced yield / 钢筋温度与折减屈服"
          formula={`T_{fs} = \\eta_x\\eta_w\\times660 = ${tx(o.Tfs, 0)}\\,^{\\circ}\\mathrm{C},\\qquad f_{yt} = \\frac{720-T_{fs}}{470}f_y\\,(clamped) = ${tx(o.fyt, 0)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Fire moment (wL²/2 × k_fire) / 火灾弯矩"
          formula={`M_{bf} = \\frac{w_f(H_w-t_f)^2}{2}\\,k_{fire} = \\frac{${tx(inputs.wf)}\\times(${tx(HwMinusTf)})^2}{2}\\times${tx(sc.fireAdjust, 3)} = ${tx(o.Mbf)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Fire utilisation / 火灾利用率" highlight
          formula={`UR_3 = \\frac{M_{bf}}{\\phi M_{n,fire}} = ${txUR(o.UR3)} = ${txPct(o.UR3)}\\%`}
          status={mkStatus(Number.isFinite(o.UR3) && o.UR3 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>
      <CalculationSubsection title="5.8 OOP shear (UR4) · 平面外抗剪">
        <CalculationFormula caption="Seismic shear / 地震剪力"
          formula={`V_E = \\frac{5}{8}W_E(H_w-t_f)+F_{add} = \\frac{5}{8}\\times${tx(o.WE)}\\times${tx(HwMinusTf)}+${tx(add.F_add)} = ${tx(o.VE)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Wind shear / 风剪力"
          formula={`V_w = \\frac{5}{8}W_{pressure}(H_w-t_f)+F_{add} = \\frac{5}{8}\\times${tx(o.WindPressure)}\\times${tx(HwMinusTf)}+${tx(add.F_add)} = ${tx(o.Vw)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Concrete shear contribution / 混凝土抗剪贡献"
          formula={`V_c = \\left(0.25\\sqrt{f'_c}+\\frac{N'}{4A_g}\\right)\\frac{d}{1000} = \\left(0.25\\sqrt{${tx(inputs.fc)}}+\\frac{${tx(o.Na)}}{4\\times${tx(o.Ag, 0)}}\\right)\\times\\frac{${tx(o.d, 0)}}{1000} = ${tx(o.Vc)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Horizontal steel contribution / 水平筋抗剪贡献"
          formula={`V_s = \\frac{A_{wh}f_y d}{s_h\\times1000} = \\frac{${tx(o.AWH, 1)}\\times${tx(inputs.fy)}\\times${tx(o.d, 0)}}{${tx(inputs.HbarSpace, 0)}\\times1000} = ${tx(o.Vs)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Shear utilisation / 抗剪利用率" highlight
          formula={`UR_4 = \\frac{\\max(V_E,V_w)}{0.75(V_c+V_s)} = \\frac{\\max(${tx(o.VE)},${tx(o.Vw)})}{0.75(${tx(o.Vc)}+${tx(o.Vs)})} = ${txUR(o.UR4)} = ${txPct(o.UR4)}\\%`}
          status={mkStatus(Number.isFinite(o.UR4) && o.UR4 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   6. Base Connection Design（连接计算）
--------------------------------------------------------------------------- */
function ConnectionBlock({ inputs, connection }) {
  const c = connection || {};
  const dm = c.demand || {};
  const dw = c.dowel || {};
  const fr = c.friction || {};
  const cap = c.capacity || {};
  const be = c.bearing || {};
  const rt = c.ratios || {};
  const ch = c.checks || {};
  return (
    <CalculationSection number="6" title="Base Connection Design · 连接计算" chip={<Chip size="small" label="Dowel / Grouted Connection" />}>
      <CalculationSubsection title="6.1 Shear demand · 剪力需求">
        <CalculationFormula caption="OOP shear over wall width / 平面外剪力换算为整墙"
          formula={`V_{oop,total} = V'\\times b = ${tx(dm.VoutPerM)}\\times${tx(inputs.wallWidth)} = ${tx(dm.VoutTotal)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Connection shear demand / 连接剪力需求" highlight
          formula={`V^*_{conn} = \\max(V^*_{in},\\,V_{oop,total}) = \\max(${tx(dm.VinPlane)},\\,${tx(dm.VoutTotal)}) = ${tx(dm.Vstar)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>
      <CalculationSubsection title="6.2 Dowel shear capacity · 锚筋抗剪">
        <CalculationFormula caption="Area of one dowel / 单根锚筋面积"
          formula={`A_d = \\frac{\\pi\\phi_d^2}{4} = \\frac{\\pi(${tx(dw.dDowel, 0)})^2}{4} = ${tx(dw.Ad, 1)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Steel shear capacity (0.6fy) / 钢材抗剪"
          formula={`V_{steel} = n\\times0.6A_df_y/1000 = (${tx(dw.nDowel, 0)})(0.6)(${tx(dw.Ad, 1)})(${tx(inputs.fy)})/1000 = ${tx(dw.VdowelSteel)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Grout bond anchorage / 灌浆粘结锚固"
          formula={`V_{bond} = n\\pi\\phi_d l_{emb}\\times0.35\\sqrt{f'_g}/1000 = (${tx(dw.nDowel, 0)})\\pi(${tx(dw.dDowel, 0)})(${tx(dw.embedment, 0)})(0.35\\sqrt{${tx(inputs.groutStrength)}})/1000 = ${tx(dw.VgroutBond)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Governing dowel shear / 锚筋抗剪取小" highlight
          formula={`V_{dowel} = \\min(V_{steel},V_{bond}) = ${tx(dw.Vdowel)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>
      <CalculationSubsection title="6.3 Shear friction & shear key · 剪切摩擦与剪力键">
        <CalculationFormula caption="Shear friction / 剪切摩擦"
          formula={`V_{fric} = \\mu N^* = (${tx(fr.muFriction)})(${tx(dm.Nstar)}) = ${tx(fr.Vfriction)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Shear key contribution (simplified +15%×V_steel) / 剪力键贡献"
          formula={`V_{key} = ${fr.shearKey ? `0.15\\times${tx(dw.VdowelSteel)} = ${tx(fr.VshearKey)}` : '0'}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Connection shear capacity / 连接抗剪承载力" highlight
          formula={`\\phi V_{conn} = \\phi_c(V_{dowel}+V_{fric}+V_{key}) = (${tx(c.phiConn)})(${tx(dw.Vdowel)}+${tx(fr.Vfriction)}+${tx(fr.VshearKey)}) = ${tx(cap.phiVconn)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Connection shear utilisation / 连接抗剪利用率" highlight
          formula={`UR_{V,conn} = \\frac{V^*_{conn}}{\\phi V_{conn}} = \\frac{${tx(dm.Vstar)}}{${tx(cap.phiVconn)}} = ${txUR(rt.shearRatio)} = ${txPct(rt.shearRatio)}\\%`}
          status={mkStatus(ch.shearPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>
      <CalculationSubsection title="6.4 Uplift & grout bed bearing · 抗拔与灌浆垫承压">
        <CalculationFormula caption="Dowel tension capacity / 锚筋抗拔承载力"
          formula={`\\phi T_{conn} = \\phi_c\\,nA_df_y/1000 = (${tx(c.phiConn)})(${tx(dw.nDowel, 0)})(${tx(dw.Ad, 1)})(${tx(inputs.fy)})/1000 = ${tx(cap.phiTconn)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Uplift utilisation / 抗拔利用率" highlight
          formula={`UR_{T,conn} = \\frac{T^*}{\\phi T_{conn}} = \\frac{${tx(dm.Tstar)}}{${tx(cap.phiTconn)}} = ${txUR(rt.tensionRatio)}`}
          status={mkStatus(ch.tensionPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Grout bed bearing / 灌浆垫承压" highlight
          formula={`\\sigma = \\frac{N^*}{b\\times t} = \\frac{${tx(dm.Nstar)}\\times1000}{${tx(safe(inputs.wallWidth) * 1000, 0)}\\times${tx(safe(inputs.wallThickness) * 1000, 0)}} = ${tx(be.sigmaBearing, 4)}\\,\\mathrm{MPa}\\le 0.6\\sqrt{f'_g} = 0.6\\sqrt{${tx(inputs.groutStrength)}} = ${tx(be.bearingCapacity, 4)}\\,\\mathrm{MPa}\\quad\\Rightarrow\\quad UR = ${txUR(rt.bearingRatio)}`}
          status={mkStatus(ch.bearingPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   7. Foundation Design（基础计算）
--------------------------------------------------------------------------- */
function FoundationBlock({ inputs, inPlane, outOfPlane, foundation }) {
  const o = outOfPlane || {};
  const f = foundation || {};
  const fc = f.checks || {};
  const hv = o.hroofValidation || {};
  const Mstar = safe(inPlane?.sectionActions?.Mtotal);
  const Vstar = safe(inPlane?.sectionActions?.Vtotal);
  return (
    <CalculationSection number="7" title="Foundation Design · 基础计算" chip={<Chip size="small" label="OOP UR5/UR6 + In-Plane Footing" />}>
      <CalculationSubsection title="7.1 OOP foundation (UR5 bearing / UR6 footing flexure) · 平面外基础">
        <CalculationFormula caption="Overturning moment / 倾覆弯矩"
          formula={`M_O = M_a\\,h_{roof} = ${tx(o.Ma)}\\times${tx(safe(hv.hroofEffective))} = ${tx(o.Mo)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Total weight & resisting moment / 总重力与抗倾覆力矩"
          formula={`W_{sum} = ${tx(o.Wsum)}\\,\\mathrm{kN/m},\\qquad M_R = W_{sum}\\frac{L_f+2f_o}{2} = ${tx(o.Wsum)}\\times\\frac{${tx(inputs.Lf, 0)}+2\\times${tx(inputs.fo, 0)}}{2} = ${tx(o.MR_weight)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Effective bearing length / 有效承压长度"
          formula={`X = \\frac{M_R-M_O}{W_{sum}}\\times1000 = \\frac{${tx(o.MR_weight)}-${tx(o.Mo)}}{${tx(o.Wsum)}}\\times1000 = ${tx(o.X, 0)}\\,\\mathrm{mm},\\qquad L_{BR} = 2\\min(X,L/2) = ${tx(o.LBR, 0)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Bearing pressure utilisation (UR5) / 基底压力利用率" highlight
          formula={`UR_5 = \\frac{q_d}{q_D} = \\frac{${tx(o.qd, 0)}}{0.5\\,q_U = ${tx(o.qD, 0)}} = ${txUR(o.UR5)} = ${txPct(o.UR5)}\\%`}
          status={mkStatus(Number.isFinite(o.UR5) && o.UR5 <= 1, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Footing flexure utilisation (UR6) / 基础抗弯利用率" highlight
          formula={`UR_6 = \\frac{M_O}{\\phi M_{n,foot}} = \\frac{${tx(o.Mo)}}{${tx(o.phiMn_foot)}} = ${txUR(o.UR6)} = ${txPct(o.UR6)}\\%`}
          status={mkStatus(Number.isFinite(o.UR6) && o.UR6 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>
      <CalculationSubsection title="7.2 In-plane footing checks · 平面内基础（条形基础简化验算）">
        <CalculationFormula caption="Footing self-weight / 基础自重"
          formula={`G_{foot} = \\gamma_c B L t_{foot} = (${tx(inputs.concreteDensity)})(${tx(f.B)})(${tx(f.L)})(${tx(f.tf)}) = ${tx(f.Gfooting)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Total axial force / 总轴力"
          formula={`N_{total} = N^* + G_{foot} = ${tx(safe(f.Ntotal) - safe(f.Gfooting))} + ${tx(f.Gfooting)} = ${tx(f.Ntotal)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Footing area & section modulus / 基底面积与截面模量"
          formula={`A = B\\times L = ${tx(f.A)}\\,\\mathrm{m^2},\\qquad Z = \\frac{BL^2}{6} = ${tx(f.Z)}\\,\\mathrm{m^3}`} />
        <CalculationFormula caption="Base pressure (max/min) / 基底最大/最小压力" highlight
          formula={`q_{max} = \\frac{N_{total}}{A}+\\frac{M^*}{Z} = \\frac{${tx(f.Ntotal)}}{${tx(f.A)}}+\\frac{${tx(Mstar)}}{${tx(f.Z)}} = ${tx(f.qMax, 0)}\\,\\mathrm{kPa},\\qquad q_{min} = \\frac{${tx(f.Ntotal)}}{${tx(f.A)}}-\\frac{${tx(Mstar)}}{${tx(f.Z)}} = ${tx(f.qMin, 0)}\\,\\mathrm{kPa}`}
          status={mkStatus(fc.bearingPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Bearing utilisation / 基底承压利用率" highlight
          formula={`UR_{foot,q} = \\frac{q_{max}}{q_{allow}} = \\frac{${tx(f.qMax, 0)}}{${tx(f.qAllow, 0)}} = ${txUR(f.bearingRatio)}`}
          status={mkStatus(fc.bearingPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Sliding resistance / 抗滑移" highlight
          formula={`UR_{slide} = \\frac{V^*}{\\mu N_{total}} = \\frac{${tx(Vstar)}}{${tx(f.mu)}\\times${tx(f.Ntotal)}} = ${txUR(f.slidingRatio)}`}
          status={mkStatus(fc.slidingPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   8. Utilisation Summary（利用率汇总）
   v0.6.2 —— 新增边缘构件局部压弯 N-M 利用率行
--------------------------------------------------------------------------- */
function UtilisationSummaryBlock({ inPlane, outOfPlane, connection, foundation }) {
  const ip = inPlane || {};
  const op = outOfPlane || {};
  const cn = connection || {};
  const fd = foundation || {};
  const rows = [
    ["In-plane: Compression stress σmax ≤ 0.6f'c (平面内：受压应力)", null, ip.checks?.stressCompressionPass],
    ['In-plane: Lintel bearing UR (平面内：过梁承压)', ip.bearing?.bearingRatio, ip.checks?.bearingPass],
    ['In-plane: N-M interaction UR (平面内：N-M 交互)', ip.interaction?.interactionRatio, ip.checks?.interactionPass],
    /* v0.6.2 —— 边缘构件局部压弯 N-M（Lintel 作用于墙边） */
    ['In-plane: Boundary element local N-M UR (边缘构件局部压弯)', ip.boundaryNM?.checks?.governingUR ?? null, ip.checks?.boundaryNMPass],
    ['In-plane: Shear UR (平面内：抗剪)', ip.shear?.shearRatio, ip.checks?.shearPass],
    ['In-plane: Tension / boundary steel (平面内：受拉/边缘钢筋)', null, ip.checks?.tensionPass],
    ['OOP: UR1 Mid-height P-Δ (平面外：中部)', op.UR1, Number.isFinite(op.UR1) && op.UR1 <= 1],
    ['OOP: UR2 Base moment (平面外：底部弯矩)', op.UR2, Number.isFinite(op.UR2) && op.UR2 <= 1],
    ['OOP: UR3 Fire (平面外：火灾)', op.UR3, Number.isFinite(op.UR3) && op.UR3 <= 1],
    ['OOP: UR4 Shear (平面外：抗剪)', op.UR4, Number.isFinite(op.UR4) && op.UR4 <= 1],
    ['OOP: UR5 Foundation bearing (平面外：基底承压)', op.UR5, Number.isFinite(op.UR5) && op.UR5 <= 1],
    ['OOP: UR6 Footing flexure (平面外：基础抗弯)', op.UR6, Number.isFinite(op.UR6) && op.UR6 <= 1],
    ['Connection: Shear UR (连接：抗剪)', cn.ratios?.shearRatio, cn.checks?.shearPass],
    ['Connection: Uplift UR (连接：抗拔)', cn.ratios?.tensionRatio, cn.checks?.tensionPass],
    ['Connection: Grout bearing UR (连接：灌浆承压)', cn.ratios?.bearingRatio, cn.checks?.bearingPass],
    ['In-plane footing: Bearing UR (平面内基础：基底承压)', fd.bearingRatio, fd.checks?.bearingPass],
    ['In-plane footing: Sliding UR (平面内基础：抗滑移)', fd.slidingRatio, fd.checks?.slidingPass],
    ['OOP slenderness h/t (warning item) (平面外长细比，警告项)', null, !(ip.checks?.slendernessWarning)]
  ];
  return (
    <CalculationSection number="8" title="Utilisation Summary · 利用率汇总" chip={<Chip size="small" label="UR ≤ 1.00" />}>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.100' }}>
              <TableCell sx={{ fontWeight: 800 }}>Check Item</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800 }}>UR</TableCell>
              <TableCell align="center" sx={{ fontWeight: 800 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(([label, ur, pass], idx) => (
              <TableRow key={idx}>
                <TableCell>{label}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                  {ur === null ? '—' : `${txPct(ur)}%`}
                </TableCell>
                <TableCell align="center">
                  <Chip
                    size="small"
                    label={pass ? 'PASS' : 'CHECK'}
                    color={pass ? 'success' : 'warning'}
                    icon={pass ? <CheckCircleIcon /> : <WarningAmberIcon />}
                    sx={{ fontWeight: 700 }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   CALCULATION TAB main component
--------------------------------------------------------------------------- */
function CalculationTab({ inputs, results }) {
  const inPlane = results.inPlane || {};
  const outOfPlane = results.outOfPlane || {};
  const connection = results.connection || {};
  const foundation = results.foundation || {};
  const summary = results.summary || {};
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Calculation steps displayed in sectional KaTeX blocks. Engine: PrecastPanelCalculation v0.6.2.
        In-plane aligned with PanelWallInPlaneDesign.jsx; OOP aligned with PrecastPanelOOPDesign.jsx
        (support condition coefficients applied); Connection and In-Plane Foundation are v0.5 additions.
        v0.6: OOP seismic action now follows AS/NZS 1170.5:2004 Chapter 8 (parts): Fp = Cp × H × Wp
        (replaces the former CdT1/CdTE coefficient inputs).
        v0.6.2: Boundary element local N-M interaction check added for lintel reaction acting at wall edge —
        full strain-compatibility interaction curve with φ(N) envelope; capacity curve and demand envelope
        plotted in Section 4.7 (SVG chart).
        UR = Demand / Capacity; all checks require UR ≤ 1.00.
        （计算过程按分段分块 KaTeX 方式显示。v0.6：平面外地震作用改按 AS/NZS 1170.5 第 8 章 parts 计算：
        Fp = Cp × H × Wp（取代原 CdT1/CdTE 系数输入）。v0.6.2：新增 Lintel 反力作用于墙边时边缘构件的
        局部压弯 N-M 验算——完整平截面 N-M 承载力曲线与 ϕ(N) 设计包络，4.7 节以 SVG 图表显示承载力曲线
        与需求包络。UR = 需求 / 承载力，所有验算要求 UR ≤ 1.00。）
      </Alert>
      <Alert severity={summary.overallPass ? 'success' : 'warning'} sx={{ mb: 2, fontWeight: 700 }}>
        {summary.overallPass
          ? '✓ All implemented checks pass under current inputs. (当前输入下全部检查通过。)'
          : '✗ Some checks did not pass. Review the sections and status labels below. (存在未通过的检查项，请查看下方各分段。)'}
      </Alert>
      <CalculationSection number="0" title="Input Data Used · 输入参数汇总" chip={<Chip size="small" label="Live inputs" />}>
        <InputSummaryTable inputs={inputs} />
      </CalculationSection>
      <LoadDerivationBlock inputs={inputs} inPlane={inPlane} outOfPlane={outOfPlane} />
      <InPlaneSeismicBlock inputs={inputs} inPlane={inPlane} />
      <InPlaneActionsBlock inputs={inputs} inPlane={inPlane} />
      <InPlaneChecksBlock inputs={inputs} inPlane={inPlane} />
      <OutOfPlaneBlock inputs={inputs} outOfPlane={outOfPlane} />
      <ConnectionBlock inputs={inputs} connection={connection} />
      <FoundationBlock inputs={inputs} inPlane={inPlane} outOfPlane={outOfPlane} foundation={foundation} />
      <UtilisationSummaryBlock inPlane={inPlane} outOfPlane={outOfPlane} connection={connection} foundation={foundation} />
      <Alert severity="warning" sx={{ mt: 1 }}>
        The formulas above reflect the actual calculation engine implementation. Final design must be
        verified against NZS 3101, AS/NZS 1170 series and project-specific requirements by a qualified engineer.
        （以上公式为计算引擎实际实现的公式。最终设计必须由合格工程师按规范及项目要求复核。）
      </Alert>
    </Box>
  );
}

/* ============================================================================
   RESULTS TAB
========================================================================== */
function ResultsTab({ inputs, results }) {
  const inPlane = results.inPlane || {};
  const outOfPlane = results.outOfPlane || {};
  const connection = results.connection || {};
  const foundation = results.foundation || {};
  const summary = results.summary || {};
  const pass = summary.overallPass;
  const sc = outOfPlane.supportConditions || {};
  /* v0.6.2 —— 边缘构件局部 N-M 数据 */
  const bn = inPlane.boundaryNM || {};
  return (
    <Box>
      <Alert severity={pass ? 'success' : 'error'} sx={{ mb: 2, fontWeight: 700 }}>
        {pass
          ? '✓ Current calculation result satisfies the implemented checks.'
          : '✗ Current calculation result requires review.'}
      </Alert>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
          Structural Model Diagram
        </Typography>
        <PrecastPanelSVG inputs={inputs} results={results} />
      </Paper>
      {summary.hroofWarning && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          hroof clamped to {fmt(outOfPlane.hroofValidation?.hroofEffective, 2)} m.
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>In-Plane Design Summary</Typography>
        <ResultRow label="N (Compression)" value={fmt(inPlane.sectionActions?.NseismicCompression, 2)} unit="kN" />
        <ResultRow label="V* (Shear)" value={fmt(inPlane.sectionActions?.Vtotal, 2)} unit="kN" pass={inPlane.checks?.shearPass} />
        <ResultRow label="M* (Moment)" value={fmt(inPlane.sectionActions?.Mtotal, 2)} unit="kN·m" />
        <ResultRow label="N-M Interaction Ratio" value={fmt(inPlane.interaction?.interactionRatio, 3)} unit="UR" pass={inPlane.checks?.interactionPass} highlight />
        <ResultRow label="Shear Ratio" value={fmt(inPlane.shear?.shearRatio, 3)} unit="UR" pass={inPlane.checks?.shearPass} />
        <ResultRow label="Bearing Ratio" value={fmt(inPlane.bearing?.bearingRatio, 3)} unit="UR" pass={inPlane.checks?.bearingPass} />
        <ResultRow label="Slenderness h/t" value={fmt(inPlane.slenderness?.outOfPlaneSlenderness, 2)} unit="" pass={!inPlane.checks?.slendernessWarning} warning={inPlane.checks?.slendernessWarning} />
      </Paper>
      {/* v0.6.2 —— 边缘构件局部压弯 N-M 结果与图表 */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
          Boundary Element Local N-M Interaction (Lintel Edge Load)
        </Typography>
        {bn.available === false ? (
          <Alert severity="info">
            Boundary element local N-M check not applicable with current inputs.
            （当前输入下边缘构件局部压弯验算不适用。）
          </Alert>
        ) : (
          <>
            <ResultRow label="Boundary section (b × h)" value={`${fmt(bn.section?.bc, 0)} × ${fmt(bn.section?.hc, 0)}`} unit="mm" />
            <ResultRow label="Boundary steel As,total (两层对称近似)" value={fmt(bn.section?.AsTotal, 0)} unit="mm²" />
            <ResultRow label="φP0 (pure compression)" value={fmt(bn.keyPoints?.phiP0, 0)} unit="kN" />
            <ResultRow label="Balanced point (φNb, φMb)" value={`${fmt(bn.keyPoints?.phiNb, 0)} / ${fmt(bn.keyPoints?.phiMb, 1)}`} unit="kN / kN·m" />
            <ResultRow label="φM0 (pure bending)" value={fmt(bn.keyPoints?.phiM0, 1)} unit="kN·m" />
            <ResultRow label="Governing demand (N*, M*)" value={`${fmt(bn.governing?.N, 1)} / ${fmt(bn.governing?.M, 2)}`} unit="kN / kN·m" />
            <ResultRow label="Boundary N-M UR" value={fmt((bn.checks?.governingUR || 0) * 100, 1)} unit="%" pass={inPlane.checks?.boundaryNMPass} highlight />
            <Box sx={{ mt: 1.5 }}>
              <NMInteractionChart boundary={bn} />
            </Box>
          </>
        )}
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Out-of-Plane Design Summary</Typography>
        <ResultRow label="Support (Wind & Seismic)" value={sc.windSeismic || 'Pinned-Pinned'} unit="" />
        <ResultRow label="Support (Fire)" value={sc.fire || 'Fixed-Free'} unit="" />
        <ResultRow label="Mid-Height UR (UR1)" value={fmt((outOfPlane.UR1 || 0) * 100, 1)} unit="%" pass={outOfPlane.UR1 <= 1} />
        <ResultRow label="Base Moment UR (UR2)" value={fmt((outOfPlane.UR2 || 0) * 100, 1)} unit="%" pass={outOfPlane.UR2 <= 1} />
        <ResultRow label="Fire UR (UR3)" value={fmt((outOfPlane.UR3 || 0) * 100, 1)} unit="%" pass={outOfPlane.UR3 <= 1} />
        <ResultRow label="Shear UR (UR4)" value={fmt((outOfPlane.UR4 || 0) * 100, 1)} unit="%" pass={outOfPlane.UR4 <= 1} />
        <ResultRow label="Bearing UR (UR5)" value={fmt((outOfPlane.UR5 || 0) * 100, 1)} unit="%" pass={outOfPlane.UR5 <= 1} />
        <ResultRow label="Footing UR (UR6)" value={fmt((outOfPlane.UR6 || 0) * 100, 1)} unit="%" pass={outOfPlane.UR6 <= 1} />
        <ResultRow label="Overall OOP" value={outOfPlane.overallOK ? 'PASS' : 'FAIL'} pass={outOfPlane.overallOK} highlight />
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>OOP Part Seismic Action (AS/NZS 1170.5 Ch.8)</Typography>
        <ResultRow label="Part coefficient Cp" value={fmt(outOfPlane.partSeismic?.Cp, 3)} unit="" />
        <ResultRow label="Part height hx / building hn" value={`${fmt(outOfPlane.partSeismic?.hx, 2)} / ${fmt(outOfPlane.partSeismic?.hn, 2)}`} unit="m" />
        <ResultRow label="Height factor H = 1 + 2hx/hn" value={fmt(outOfPlane.partSeismic?.H, 3)} unit="" />
        <ResultRow label="Wall panel weight Wp (per metre)" value={fmt(outOfPlane.partSeismic?.Wp, 3)} unit="kN/m" />
        <ResultRow label="Part seismic force Fp = Cp·H·Wp" value={fmt(outOfPlane.partSeismic?.Fp, 3)} unit="kN/m" highlight />
        <ResultRow label="Uniform seismic pressure WE" value={fmt(outOfPlane.WE, 3)} unit="kPa" />
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Support Condition Moment Adjustments</Typography>
        <ResultRow label="W&S Mid-height factor" value={fmt(sc.windSeismicFactors?.mid, 4)} unit="×wL²" />
        <ResultRow label="W&S Base factor" value={fmt(sc.windSeismicFactors?.base, 4)} unit="×wL²" />
        <ResultRow label="Fire factor" value={fmt(sc.fireFactors?.base, 4)} unit="×wL²" />
        <ResultRow label="W&S mid adjustment" value={fmt(sc.wsMidAdjust, 3)} unit="×" />
        <ResultRow label="W&S base adjustment" value={fmt(sc.wsBaseAdjust, 3)} unit="×" />
        <ResultRow label="Fire adjustment" value={fmt(sc.fireAdjust, 3)} unit="×" />
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Connection Design Summary (Base Connection)</Typography>
        <ResultRow label="Shear demand V*" value={fmt(connection.demand?.Vstar, 2)} unit="kN" />
        <ResultRow label="Dowel shear capacity V_dowel" value={fmt(connection.dowel?.Vdowel, 2)} unit="kN" />
        <ResultRow label="Friction + key contribution" value={fmt(safe(connection.friction?.Vfriction) + safe(connection.friction?.VshearKey), 2)} unit="kN" />
        <ResultRow label="Connection shear capacity φV" value={fmt(connection.capacity?.phiVconn, 2)} unit="kN" />
        <ResultRow label="Connection shear UR" value={fmt((connection.ratios?.shearRatio || 0) * 100, 1)} unit="%" pass={connection.checks?.shearPass} highlight />
        <ResultRow label="Uplift demand T*" value={fmt(connection.demand?.Tstar, 2)} unit="kN" />
        <ResultRow label="Uplift capacity φT" value={fmt(connection.capacity?.phiTconn, 2)} unit="kN" />
        <ResultRow label="Connection tension UR" value={fmt((connection.ratios?.tensionRatio || 0) * 100, 1)} unit="%" pass={connection.checks?.tensionPass} />
        <ResultRow label="Grout bearing UR" value={fmt((connection.ratios?.bearingRatio || 0) * 100, 1)} unit="%" pass={connection.checks?.bearingPass} />
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>In-Plane Foundation Summary</Typography>
        <ResultRow label="Footing self-weight" value={fmt(foundation.Gfooting, 2)} unit="kN" />
        <ResultRow label="Total axial N_total" value={fmt(foundation.Ntotal, 2)} unit="kN" />
        <ResultRow label="q_max" value={fmt(foundation.qMax, 0)} unit="kPa" pass={foundation.checks?.bearingPass} />
        <ResultRow label="q_min" value={fmt(foundation.qMin, 0)} unit="kPa" pass={foundation.checks?.noUplift} warning={!foundation.checks?.noUplift} />
        <ResultRow label="Allowable bearing" value={fmt(foundation.qAllow, 0)} unit="kPa" />
        <ResultRow label="Bearing UR" value={fmt((foundation.bearingRatio || 0) * 100, 1)} unit="%" pass={foundation.checks?.bearingPass} highlight />
        <ResultRow label="Sliding resistance μN" value={fmt(foundation.slidingResistance, 2)} unit="kN" />
        <ResultRow label="Sliding UR" value={fmt((foundation.slidingRatio || 0) * 100, 1)} unit="%" pass={foundation.checks?.slidingPass} />
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Gravity Load Conversion</Typography>
        <ResultRow label="G Pressure" value={fmt(inPlane.gravity?.gPressure, 3)} unit="kPa" />
        <ResultRow label="Q Pressure" value={fmt(inPlane.gravity?.qPressure, 3)} unit="kPa" />
        <ResultRow label="Tributary Range" value={fmt(inPlane.gravity?.Sr, 2)} unit="m" />
        <ResultRow label="G Line Load" value={fmt(inPlane.gravity?.gLineLoad, 3)} unit="kN/m" />
        <ResultRow label="Q Line Load" value={fmt(inPlane.gravity?.qLineLoad, 3)} unit="kN/m" />
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>OOP Additional Point Load Effects</Typography>
        <ResultRow label="Additional Force" value={fmt(outOfPlane.additionalLoads?.F_add, 2)} unit="kN" />
        <ResultRow label="Force Height" value={fmt(outOfPlane.additionalLoads?.h_force, 2)} unit="m" />
        <ResultRow label="Additional Moment" value={fmt(outOfPlane.additionalLoads?.M_add, 2)} unit="kN·m" />
        <ResultRow label="Moment Height" value={fmt(outOfPlane.additionalLoads?.h_moment, 2)} unit="m" />
      </Paper>
      <Accordion sx={{ mb: 1.5 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography sx={{ fontWeight: 800 }}>In-Plane Reinforcement</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <ResultRow label="Number of vertical bars" value={fmt(inPlane.reinforcement?.nVerticalBars, 0)} unit="bars" />
          <ResultRow label="Distributed vertical As" value={fmt(inPlane.reinforcement?.AsDistributed, 1)} unit="mm²" />
          <ResultRow label="Vertical ρ" value={fmt(safe(inPlane.reinforcement?.rhoVertical) * 100, 3)} unit="%" />
          <ResultRow label="Boundary As" value={fmt(inPlane.reinforcement?.AsBoundary, 1)} unit="mm²" />
          <ResultRow label="Boundary tension capacity" value={fmt(inPlane.reinforcement?.boundarySteelTensionCapacity, 2)} unit="kN" />
        </AccordionDetails>
      </Accordion>
      <Accordion sx={{ mb: 1.5 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography sx={{ fontWeight: 800 }}>Out-of-Plane Properties</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <ResultRow label="Ec" value={fmt(outOfPlane.Ec, 0)} unit="MPa" />
          <ResultRow label="AWV" value={fmt(outOfPlane.AWV, 1)} unit="mm²/m" />
          <ResultRow label="AWH" value={fmt(outOfPlane.AWH, 1)} unit="mm²/m" />
          <ResultRow label="AWF" value={fmt(outOfPlane.AWF, 1)} unit="mm²/m" />
          <ResultRow label="φMn" value={fmt(outOfPlane.phiMn, 2)} unit="kN·m/m" />
          <ResultRow label="M' (P-Delta)" value={fmt(outOfPlane.M_prime, 2)} unit="kN·m/m" />
          <ResultRow label="Δu" value={fmt(outOfPlane.delta_u, 1)} unit="mm" />
        </AccordionDetails>
      </Accordion>
      <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
        The UI displays results from the calculation engine. Final design must be verified
        against applicable NZ Standards and project-specific requirements.
      </Alert>
    </Box>
  );
}

/* ============================================================================
   MAIN COMPONENT
========================================================================== */
export default function PrecastPanel() {
  const [activeTab, setActiveTab] = useState(0);
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [reportOpen, setReportOpen] = useState(false);
  /* v0.6.1 —— Detail Report 打开状态 */
  const [detailReportOpen, setDetailReportOpen] = useState(false);
  const calculationInput = useMemo(() => ({
    ...inputs,
    wallWidth: safe(inputs.wallWidth),
    wallHeight: safe(inputs.wallHeight),
    wallThickness: safe(inputs.wallThickness),
    tf: safe(inputs.tf),
    Lf: safe(inputs.Lf),
    ts: safe(inputs.ts),
    fo: safe(inputs.fo),
    ds: safe(inputs.ds),
    hroof: safe(inputs.hroof),
    concreteDensity: safe(inputs.concreteDensity),
    fc: safe(inputs.fc),
    fy: safe(inputs.fy),
    fyMesh: safe(inputs.fyMesh),
    Es: safe(inputs.Es, 200000),
    gs: safe(inputs.gs),
    cover: safe(inputs.cover),
    gLine: safe(inputs.gLine),
    qLine: safe(inputs.qLine),
    wwd: safe(inputs.wwd),
    Sr: safe(inputs.Sr),
    diaphragmWindForce: safe(inputs.diaphragmWindForce),
    diaphragmSeismicForce: safe(inputs.diaphragmSeismicForce),
    lintelReaction: safe(inputs.lintelReaction),
    lintelEccentricity: safe(inputs.lintelEccentricity),
    wwf: safe(inputs.wwf),
    wf: safe(inputs.wf),
    th: safe(inputs.th),
    additionalForce: safe(inputs.additionalForce),
    additionalForceHeight: safe(inputs.additionalForceHeight),
    additionalMoment: safe(inputs.additionalMoment),
    additionalMomentHeight: safe(inputs.additionalMomentHeight),
    hazardFactor: safe(inputs.hazardFactor),
    returnPeriodFactor: safe(inputs.returnPeriodFactor),
    ductility: safe(inputs.ductility),
    structuralPerformanceFactor: safe(inputs.structuralPerformanceFactor),
    period: safe(inputs.period),
    siteCoefficient: safe(inputs.siteCoefficient),
    nearFaultFactor: safe(inputs.nearFaultFactor),
    seismicWeight: safe(inputs.seismicWeight),
    seismicDistributionFactor: safe(inputs.seismicDistributionFactor),
    psiE: safe(inputs.psiE),
    /* v0.6 —— OOP part 地震参数（取代 CdT1 / CdTE） */
    partResponseCoefficient: safe(inputs.partResponseCoefficient, 0.75),
    partHeightHx: safe(inputs.partHeightHx),
    buildingHeightHn: safe(inputs.buildingHeightHn),
    VbarDia: safe(inputs.VbarDia),
    VbarSpace: safe(inputs.VbarSpace),
    HbarDia: safe(inputs.HbarDia),
    HbarSpace: safe(inputs.HbarSpace),
    FootBarDia: safe(inputs.FootBarDia),
    FootBarSpace: safe(inputs.FootBarSpace),
    MeshArea: safe(inputs.MeshArea),
    boundaryWidth: safe(inputs.boundaryWidth),
    boundaryThickness: safe(inputs.boundaryThickness, safe(inputs.wallThickness)),
    boundaryBarDiameter: safe(inputs.boundaryBarDiameter),
    boundaryBarCount: safe(inputs.boundaryBarCount),
    boundaryTieDiameter: safe(inputs.boundaryTieDiameter),
    boundaryTieSpacing: safe(inputs.boundaryTieSpacing),
    bearingWidth: safe(inputs.bearingWidth),
    bearingLength: safe(inputs.bearingLength),
    supportWindSeismic: inputs.supportWindSeismic || 'Pinned-Pinned',
    supportFire: inputs.supportFire || 'Fixed-Free',
    effectiveLengthFactor: safe(inputs.effectiveLengthFactor, 1),
    phiFlexure: safe(inputs.phiFlexure, 0.8),
    phiShear: safe(inputs.phiShear, 0.75),
    phiCompression: safe(inputs.phiCompression, 0.75),
    qU: safe(inputs.qU),
    baseDowelDiameter: safe(inputs.baseDowelDiameter),
    baseDowelCount: safe(inputs.baseDowelCount),
    baseDowelEmbedment: safe(inputs.baseDowelEmbedment),
    groutStrength: safe(inputs.groutStrength),
    shearKey: inputs.shearKey === true || inputs.shearKey === 'yes',
    shearKeyDepth: safe(inputs.shearKeyDepth),
    frictionCoefficient: safe(inputs.frictionCoefficient, 0.5),
    phiConnection: safe(inputs.phiConnection, 0.75),
    footingWidth: safe(inputs.footingWidth),
    footingLength: safe(inputs.footingLength),
    footingThickness: safe(inputs.footingThickness),
    allowableBearingPressure: safe(inputs.allowableBearingPressure, 150)
  }), [inputs]);
  const results = useMemo(() => {
    try {
      return calculatePrecastPanelDesign(calculationInput);
    } catch (error) {
      console.error('PrecastPanelCalculation error:', error);
      return { summary: { overallPass: false }, calculationError: error?.message || 'Calculation engine error.' };
    }
  }, [calculationInput]);
  const handleReset = () => {
    setInputs({ ...DEFAULT_INPUTS, date: new Date().toISOString().split('T')[0] });
    setActiveTab(0);
  };
  const statusLabel = results.calculationError ? 'CALCULATION ERROR'
    : results.summary?.overallPass ? 'DESIGN PASS' : 'CHECK REQUIRED';
  const statusColor = results.calculationError ? 'error'
    : results.summary?.overallPass ? 'success' : 'warning';
  return (
    <Box sx={{ width: '100%', minHeight: '100%', bgcolor: '#f5f7fa', py: 2 }}>
      <Box sx={{ width: '100%', maxWidth: 1600, mx: 'auto', px: { xs: 1, sm: 2, md: 3 } }}>
        <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={1.5}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main' }}>
                Precast Concrete Slender Panel
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Unified In-Plane + Out-of-Plane + Connection + Foundation Design
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip
                label={statusLabel}
                color={statusColor}
                icon={results.summary?.overallPass ? <CheckCircleIcon /> : <WarningAmberIcon />}
                sx={{ fontWeight: 800 }}
              />
              {/* v0.6.1 —— 原 "PDF Report" 改名为 "Summary Report" */}
              <Button
                variant="contained"
                size="small"
                startIcon={<PictureAsPdfIcon />}
                onClick={() => setReportOpen(true)}
              >
                Summary Report
              </Button>
              {/* v0.6.1 —— 新增 "Detail Report" 按钮：
                  打印与 Calculation Tab 一致的完整公式推导 + SVG 图表，
                  采用与简易报告相同的打印排版（非屏幕截图）。
                  v0.6.2 —— Detail Report 将自动包含 4.7 节 N-M 交互图（SVG 矢量打印）。 */}
              <Button
                variant="contained"
                size="small"
                color="secondary"
                startIcon={<PictureAsPdfIcon />}
                onClick={() => setDetailReportOpen(true)}
              >
                Detail Report
              </Button>
              <Button variant="outlined" size="small" startIcon={<RestartAltIcon />} onClick={handleReset}>
                Reset
              </Button>
            </Stack>
          </Stack>
        </Paper>
        <Paper elevation={1} sx={{ mb: 2 }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto">
            <Tab icon={<EngineeringIcon />} iconPosition="start" label="Input & Model"
              sx={{ textTransform: 'none', fontWeight: activeTab === 0 ? 800 : 500 }} />
            <Tab icon={<CalculateIcon />} iconPosition="start" label="Calculation"
              sx={{ textTransform: 'none', fontWeight: activeTab === 1 ? 800 : 500 }} />
            <Tab icon={<AssessmentIcon />} iconPosition="start" label="Results"
              sx={{ textTransform: 'none', fontWeight: activeTab === 2 ? 800 : 500 }} />
          </Tabs>
        </Paper>
        {activeTab === 0 && <InputTab inputs={inputs} setInputs={setInputs} previewResults={results} />}
        {activeTab === 1 && <CalculationTab inputs={calculationInput} results={results} />}
        {activeTab === 2 && <ResultsTab inputs={calculationInput} results={results} />}
      </Box>
      {/* Summary Report Dialog（简易报告，两栏公式） */}
      <PrecastPanelReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        inputs={calculationInput}
        results={results}
      />
      {/* v0.6.1 —— Detail Report Dialog（详细报告，打印排版，完整公式 + SVG） */}
      <PrecastPanelDetailReportDialog
        open={detailReportOpen}
        onClose={() => setDetailReportOpen(false)}
        inputs={calculationInput}
        results={results}
      />
    </Box>
  );
}