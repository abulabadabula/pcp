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
import calculatePrecastPanelDesign, { validateHroof } from './PrecastPanelCalculation-revised';
import { INPUT_SECTIONS, DEFAULT_INPUTS, SUPPORT_CONDITIONS } from './PrecastPanelConfig';
import NMInteractionChart from './NMInteractionChart';
import PrecastPanelSVG from './PrecastPanelSVG';
import PrecastPanelReportDialog, { PrecastPanelDetailReportDialog, CalculationReportContext } from './PrecastPanelReport';

/* ============================================================================
   HELPERS
   ============================================================================ */
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
   ============================================================================ */
function FormulaBlock({ children }) {
  return (
    <Box sx={{
      py: 0.5, overflowX: 'auto',
      '& .katex-display': { my: 0.5, textAlign: 'left' },
      '& .katex-display > .katex': { textAlign: 'left', marginLeft: 0 },
      '& .katex .msupsub': { fontSize: '0.68em' }
    }}>
      <BlockMath math={String(children)} />
    </Box>
  );
}

function CalculationFormula({ caption, formula, status, highlight = false }) {
  const emphasized = highlight || Boolean(status);
  return (
    <Box sx={{
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
    }}>
      {caption && (
        <Typography variant="caption" sx={{
          display: 'block', mb: 0.5, fontWeight: 800,
          color: emphasized ? 'text.primary' : 'text.secondary'
        }}>
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
      <Paper variant="outlined" sx={{
        mb: 1.5, borderRadius: 1, overflow: 'hidden',
        breakInside: 'avoid', pageBreakInside: 'avoid'
      }}>
        <Box sx={{ px: 2, py: 1, bgcolor: '#f3f4f6', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 800 }}>{number}. {title}</Typography>
          {chip}
        </Box>
        <Box sx={{ px: 2.5, py: 2, bgcolor: '#fff' }}>{children}</Box>
      </Paper>
    );
  }
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters
      sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: '6px !important', overflow: 'hidden', '&:before': { display: 'none' } }}>
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
      <Typography variant="subtitle2" sx={{
        mb: 1, color: 'text.secondary', fontWeight: 800,
        borderLeft: '3px solid', borderColor: 'primary.main', pl: 1
      }}>
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
   INPUT COMPONENTS
   ============================================================================ */
function NumberInput({ label, value, onChange, unit, step, min, helperText, error }) {
  return (
    <TextField fullWidth size="small" label={label}
      value={value === undefined || value === null ? '' : value}
      onChange={event => onChange(event.target.value)}
      type="text" placeholder="0.00"
      error={error} helperText={helperText}
      slotProps={{
        input: {
          endAdornment: unit ? (
            <Typography variant="caption" sx={{ ml: 1, whiteSpace: 'nowrap', color: 'text.secondary' }}>
              {unit}
            </Typography>
          ) : null
        },
        htmlInput: { inputMode: "decimal", min: min, step: step }
      }}
    />
  );
}

function SelectInput({ label, value, onChange, options }) {
  return (
    <TextField select fullWidth size="small" label={label}
      value={value ?? ''} onChange={event => onChange(event.target.value)}
      slotProps={{ select: { native: true } }}>
      {options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </TextField>
  );
}

function InputSection({ title, children, defaultExpanded = true }) {
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters
      sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: '6px !important', overflow: 'hidden', '&:before': { display: 'none' } }}>
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
    <Chip size="small"
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
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {value}{unit ? ` ${unit}` : ''}
        </Typography>
        {(pass !== undefined || warning !== undefined) && <StatusChip pass={pass} warning={warning} />}
      </Stack>
    </Box>
  );
}

/* ============================================================================
   INPUT TAB
   ============================================================================ */
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
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={field.key}>
                <NumberInput
                  label={field.label}
                  value={inputs[field.key]}
                  onChange={field.key === 'ductility' ? updateDuctility : update(field.key)}
                  unit={field.unit} step={field.step} min={field.min}
                  error={field.key === 'hroof' && !hroofCheck.hroofValid}
                  helperText={field.key === 'hroof' && !hroofCheck.hroofValid ? `Max allowed: ${fmt(hroofCheck.hroofMax, 2)} m` : undefined}
                />
              </Grid>
            ))}
            {section.id === 'seismic' && (
              <>
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <SelectInput label="Subsoil class" value={inputs.subsoilClass} onChange={update('subsoilClass')}
                    options={[{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }, { value: 'D', label: 'D' }, { value: 'E', label: 'E' }]} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <SelectInput label="Importance level" value={inputs.importanceLevel} onChange={update('importanceLevel')}
                    options={[{ value: 'IL1', label: 'IL1' }, { value: 'IL2', label: 'IL2' }, { value: 'IL3', label: 'IL3' }, { value: 'IL4', label: 'IL4' }]} />
                </Grid>
              </>
            )}
            {section.id === 'support' && (
              <>
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <SelectInput label="Support: Wind & Seismic" value={inputs.supportWindSeismic} onChange={update('supportWindSeismic')} options={SUPPORT_CONDITIONS} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <SelectInput label="Support: Fire" value={inputs.supportFire} onChange={update('supportFire')} options={SUPPORT_CONDITIONS} />
                </Grid>
              </>
            )}
            {section.id === 'connection' && (
              <>
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <SelectInput label="Base connection type" value={inputs.baseConnectionType} onChange={update('baseConnectionType')}
                    options={[{ value: 'Dowel / Grouted Connection', label: 'Dowel / Grouted Connection' }, { value: 'Welded Connection', label: 'Welded Connection' }, { value: 'Bolted Connection', label: 'Bolted Connection' }]} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <SelectInput label="Shear key" value={inputs.shearKey ? 'yes' : 'no'}
                    onChange={value => update('shearKey')(value === 'yes')}
                    options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
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
              Connection check model: Shear friction per NZS 3101 Cl 7.7 (Vn = μ(Avf·fy + N*)) + Shear key (optional),
              plus uplift and grout bed bearing checks. Dowel steel shear and grout bond as supplementary checks.
              Development length per Cl 8.6.3 / 8.7.2.5.
            </Alert>
          )}
          {section.id === 'inPlaneFoundation' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              In-plane footing checks: Base pressure q = N/A + M/Z ≤ allowable bearing; Sliding V* ≤ μN.
              Z = B·L²/6 (pressure varies along wall length). OOP bearing and footing flexure covered by UR5/UR6.
            </Alert>
          )}
          {section.id === 'boundary' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Boundary element parameters feed the local compression-bending N-M check (Section 9.2):
              lintel reaction at wall edge + tributary gravity, with interaction curve plotted.
            </Alert>
          )}
        </InputSection>
      ))}
    </Box>
  );
}

/* ============================================================================
   CALCULATION TAB
   ============================================================================ */
const SUPPORT_MOMENT_TABLE = [
  { key: 'Pinned-Pinned', label: 'Pinned – Pinned', mid: '1/8', midVal: 0.125, base: '0', baseVal: 0 },
  { key: 'Fixed-Free', label: 'Fixed – Free (Cantilever)', mid: '1/8', midVal: 0.125, base: '1/2', baseVal: 0.5 },
  { key: 'Fixed-Fixed', label: 'Fixed – Fixed', mid: '1/24', midVal: 0.0417, base: '1/12', baseVal: 0.0833 },
  { key: 'Fixed-Pinned', label: 'Fixed – Pinned', mid: '9/128', midVal: 0.0703, base: '1/8', baseVal: 0.125 }
];

/* ---------------------------------------------------------------------------
   0. Input Summary Table
   --------------------------------------------------------------------------- */
function InputSummaryTable({ inputs }) {
  const rows = [
    ['Wall width b (墙宽)', tx(inputs.wallWidth), 'm'],
    ['Wall height h (墙高)', tx(inputs.wallHeight), 'm'],
    ['Wall thickness t (墙厚)', tx(inputs.wallThickness), 'm'],
    ['Concrete weight density γc (混凝土密度)', tx(inputs.concreteDensity), 'kN/m³'],
    ["Concrete strength f'c (混凝土强度)", tx(inputs.fc), 'MPa'],
    ['Steel yield fy (钢筋屈服)', tx(inputs.fy), 'MPa'],
    ['Cover (保护层)', tx(inputs.cover, 0), 'mm'],
    ['Roof dead pressure g (屋面恒载压力)', tx(inputs.gUniform), 'kPa'],
    ['Roof live pressure q (屋面活载压力)', tx(inputs.qUniform), 'kPa'],
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
    ['Ch(T) (反应谱形状系数)', tx(inputs.spectralShapeFactor), ''],
    ['N(T,D) (近断层系数)', tx(inputs.nearFaultFactor), ''],
    ['ψe (抗震组合系数)', tx(inputs.psiE), ''],
    ['OOP part coefficient Cp (Table 8.1)', tx(inputs.partSpectralShapeFactorT0), ''],
    ['OOP part hx / hn', `${tx(inputs.partHeightHx)} / ${tx(inputs.buildingHeightHn)}`, 'm'],
    ['OOP Part ap (Importance)', tx(inputs.partImportanceFactor), ''],
    ['OOP Part Rp (Modification)', tx(inputs.partRiskFactor), ''],
    ['OOP Part μp (Ductility)', tx(inputs.partDuctility), ''],
    ['OOP Part Tp (Period)', tx(inputs.partPeriod), 's'],
    ['Building Tn (Period)', tx(inputs.buildingPeriod), 's'],
    ['Building Importance I', tx(inputs.importanceFactor), ''],
    ['Vertical bar φV@Sv (竖向筋)', `${tx(inputs.VbarDia, 0)} @ ${tx(inputs.VbarSpace, 0)}`, 'mm'],
    ['Horizontal bar φH@Sh (水平筋)', `${tx(inputs.HbarDia, 0)} @ ${tx(inputs.HbarSpace, 0)}`, 'mm'],
    ['BarLayers (纵筋层数)', tx(inputs.BarLayers, 0), 'layers'],
    ['Footing bar φF@Sf (基础筋)', `${tx(inputs.FootBarDia, 0)} @ ${tx(inputs.FootBarSpace, 0)}`, 'mm'],
    ['Boundary width (边缘构件宽)', tx(inputs.boundaryWidth), 'm'],
    ['Boundary bars (边缘纵筋)', `${tx(inputs.boundaryBarCount, 0)}-φ${tx(inputs.boundaryBarDiameter, 0)}`, ''],
    ['Bearing W×L (承压宽×长)', `${tx(inputs.bearingWidth, 0)} × ${tx(inputs.bearingLength, 0)}`, 'mm'],
    ['hroof (屋面高度)', tx(inputs.hroof), 'm'],
    ['tf / Lf (基础厚/长)', `${tx(inputs.tf, 0)} / ${tx(inputs.Lf, 0)}`, 'mm'],
    ['ts / fo / ds (板厚/挑出/硬填)', `${tx(inputs.ts, 0)} / ${tx(inputs.fo, 0)} / ${tx(inputs.ds, 0)}`, 'mm'],
    ['qU (OOP bearing)', tx(inputs.qU), 'kPa'],
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
   1. Geometry & Properties
   --------------------------------------------------------------------------- */
function GeoBlock({ inputs, ResinPlane, ResoutOfPlane }) {
  const geo = ResinPlane.geometry || {};
  const re = ResinPlane.reinforcement || {};
  const sl = ResinPlane.slenderness || {};
  const ch = ResinPlane.checks || {};
  const nV = re.nVerticalBars ?? 0;

  return (
    <CalculationSection number="1" title="Geometry & Properties · 几何与特性" chip={<Chip size="small" label="AS/NZS 1170.0 / 1170.1" />}>
      <CalculationSubsection title="1.1 In-plane section properties · 平面内截面特性">
        <CalculationFormula caption="Gross area / 毛截面面积"
          formula={`A_g = (b\\times1000)(t\\times1000) = (${tx(geo.bwall)}\\times1000)(${tx(geo.twall)}\\times1000) = ${tx(geo.Ag, 0)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Second moment of area / 惯性矩"
          formula={`I = \\frac{(t\\times1000)(b\\times1000)^3}{12} = \\frac{(${tx(geo.twall)}\\times1000)(${tx(geo.bwall)}\\times1000)^3}{12} = ${tx(geo.I, 0)}\\,\\mathrm{mm^4}`} />
        <CalculationFormula caption="Section modulus / 截面模量"
          formula={`Z_g = \\frac{(t\\times1000)(b\\times1000)^2}{6} = \\frac{(${tx(geo.twall)}\\times1000)(${tx(geo.bwall)}\\times1000)^2}{6} = ${tx(geo.Zg, 0)}\\,\\mathrm{mm^3}`} />
      </CalculationSubsection>

      <CalculationSubsection title="1.2 Reinforcement properties · 配筋特性">
        <CalculationFormula caption="Number of layers / 配筋层数"
          formula={`n_{layers} = ${tx(re.numLayers, 0)} \\quad (t ${safe(inputs.wallThickness) > 0.2 ? '>' : '≤'} 200\\,\\mathrm{mm} \\Rightarrow ${re.numLayers >= 2 ? '\\text{double layer}' : '\\text{single layer}'})`} />
        <CalculationFormula caption="Number of vertical bars / 竖向分布筋根数"
          formula={`n_v = \\left\\lfloor\\frac{b\\times1000}{s_v}\\right\\rfloor + 1 = \\left\\lfloor\\frac{${tx(geo.bwall, 2)}\\times1000}{${tx(inputs.VbarSpace, 0)}}\\right\\rfloor + 1 = ${tx(nV, 0)}`} />
        <CalculationFormula caption="Distributed vertical steel / 竖向分布筋面积"
          formula={`A_{v,dist} = n_v\\pi\\phi_v^2/4 = ${tx(nV, 0)}\\times\\pi\\times${tx(inputs.VbarDia, 0)}^2/4 = ${tx(re.AsDistributed, 1)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Vertical reinforcement ratio / 竖向配筋率"
          formula={`\\rho_v = A_{s,dist}/A_g = \\frac{${tx(re.AsDistributed, 1)}}{${tx(geo.Ag, 0)}} = ${tx(safe(re.rhoVertical) * 100, 3)}\\%`} />
        <CalculationFormula caption="Horizontal steel per metre / 水平筋每米面积"
          formula={`A_{h,m} = \\frac{\\pi\\phi_h^2}{4}\\times\\frac{n_{layers}\\times1000}{s_h} = ${tx(re.AsHorizontalPerM, 1)}\\,\\mathrm{mm^2/m}`} />
        <CalculationFormula caption="Horizontal reinforcement ratio / 水平配筋率"
          formula={`\\rho_h = ${tx(safe(re.rhoHorizontal) * 100, 3)}\\%`} />
        <CalculationFormula caption="Boundary steel / 边缘构件纵筋"
          formula={`A_{s,b} = n_b\\pi\\phi_b^2/4 = ${tx(inputs.boundaryBarCount, 0)}\\times\\pi\\times${tx(inputs.boundaryBarDiameter, 0)}^2/4 = ${tx(re.AsBoundary, 1)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Boundary reinforcement ratio / 边缘构件配筋率"
          formula={`\\rho_b = \\frac{A_{s,b}}{A_{boundary}} = \\frac{${tx(re.AsBoundary, 1)}}{${tx(inputs.boundaryWidth)}\\times1000\\times${tx(inputs.boundaryThickness)}\\times1000} = ${tx(safe(re.rhoBoundary) * 100, 3)}\\%`} />
        <CalculationFormula caption="Boundary steel tensile capacity / 边缘钢筋抗拉能力"
          formula={`T_{s,b} = A_{s,b}f_y/1000 = ${tx(re.AsBoundary, 1)}\\times${tx(inputs.fy)}/1000 = ${tx(re.boundarySteelTensionCapacity)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>

      <CalculationSubsection title="1.3 Slenderness classification · 长细比与分类">
        <CalculationFormula caption="In-plane aspect ratio / 平面内高宽比"
          formula={`\\frac{h}{l_w} = \\frac{${tx(inputs.wallHeight)}}{${tx(inputs.wallWidth)}} = ${tx(sl.aspectRatio)}\\quad\\Rightarrow\\quad\\text{${sl.wallClassification || '-'}}`} />
        <CalculationFormula caption="Out-of-plane slenderness / 平面外长细比"
          formula={`\\frac{h}{t} = \\frac{${tx(inputs.wallHeight)}}{${tx(inputs.wallThickness)}} = ${tx(sl.outOfPlaneSlenderness)}`}
          status={mkStatus(!ch.slendernessWarning, 'h/t ≤ 25', 'h/t > 25 — CHECK')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   2. Load Derivation
   --------------------------------------------------------------------------- */
function LoadDerivationBlock({ inputs, ResinPlane, ResoutOfPlane }) {
  const g = ResinPlane.gravity || {};
  const geo = ResinPlane.geometry || {};
  const oop = ResoutOfPlane || {};

  return (
    <CalculationSection number="2" title="Load Derivation · 荷载推算" chip={<Chip size="small" label="AS/NZS 1170.0 / 1170.1" />}>
      <CalculationSubsection title="2.1 Roof pressures → line loads · 屋面压力 → 线荷载">
        <CalculationFormula caption="Dead line load / 永久荷载线荷载"
          formula={`g_{line} = g\\times S_r = (${tx(inputs.gUniform)}\\,\\mathrm{kPa})(${tx(inputs.Sr)}\\,\\mathrm{m}) = ${tx(g.gLineLoad)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Live line load / 活荷载线荷载"
          formula={`q_{line} = q\\times S_r = (${tx(inputs.qUniform)}\\,\\mathrm{kPa})(${tx(inputs.Sr)}\\,\\mathrm{m}) = ${tx(g.qLineLoad)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Roof wind line load / 屋面风压线荷载"
          formula={`w_{wd,line} = w_{wd}\\times S_r = (${tx(inputs.wwd)}\\,\\mathrm{kPa})(${tx(inputs.Sr)}\\,\\mathrm{m}) = ${tx(safe(inputs.wwd) * safe(inputs.Sr, 1))}\\,\\mathrm{kN/m}`} />
      </CalculationSubsection>

      <CalculationSubsection title="2.2 In-plane self-weight & gravity ULS · 平面内自重与重力组合">
        <CalculationFormula caption="Wall self-weight / 墙体自重"
          formula={`G_{wall} = \\gamma_c\\,t\\,h\\,b = ${tx(inputs.concreteDensity)}\\times${tx(inputs.wallThickness)}\\times${tx(inputs.wallHeight)}\\times${tx(inputs.wallWidth)} = ${tx(g.Gwall)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Total permanent line load / 顶部永久线荷载合计"
          formula={`G_{line,total} = g_{line}\\times b = ${tx(g.gLineLoad)}\\times${tx(geo.bwall)} = ${tx(g.GlineTotal)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Total imposed line load / 顶部活线荷载合计"
          formula={`Q_{line,total} = q_{line}\\times b = ${tx(g.qLineLoad)}\\times${tx(geo.bwall)} = ${tx(g.QlineTotal)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Gravity ULS axial force / 重力 ULS 轴力" highlight
          formula={`N^*_{gravity} = 1.2(G_{wall}+G_{line,total}+N_{lintel}) + 1.5\\,Q_{line,total} = 1.2\\times(${tx(g.Gwall)}+${tx(g.GlineTotal)}+${tx(g.lintelReaction)}) + 1.5\\times(${tx(g.QlineTotal)}) = ${tx(g.Ngravity)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>

      <CalculationSubsection title="2.3 OOP gravity axial force · 平面外重力轴力 (per metre)">
        <CalculationFormula caption="Roof dead line load / 屋面恒载"
          formula={`W_d = S_r\\,g = ${tx(inputs.Sr)}\\times${tx(inputs.gUniform)} = ${tx(oop.Wd_line)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Wall self-weight above mid-height (P-Δ) / 半高以上墙重"
          formula={`N_{SW} = t_w\\cdot\\frac{H_w-t_f}{2}\\cdot\\gamma_c = ${tx(inputs.wallThickness)}\\times\\frac{${tx(inputs.wallHeight)}-${tx(inputs.tf, 3)}}{2}\\times${tx(inputs.concreteDensity)} = ${tx(oop.NSW)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Footing weight (stability only) / 基础自重（仅稳定）"
          formula={`N_{FF} = L_f\\cdot t_f\\cdot\\gamma_c = ${tx(inputs.Lf, 3)}\\times${tx(inputs.tf, 3)}\\times${tx(inputs.concreteDensity)} = ${tx(oop.NFF)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Slab weight (stability only) / 地面板自重（仅稳定）"
          formula={`N_{SF} = (L_f+2f_o)\\cdot t_s\\cdot\\gamma_c = (${tx(inputs.Lf, 3)}+2\\times${tx(inputs.fo, 3)})\\times${tx(inputs.ts, 3)}\\times${tx(inputs.concreteDensity)} = ${tx(oop.NSF)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Hardfill weight (stability only) / 硬填层自重（仅稳定）"
          formula={`N_{HF} = (L_f+2f_o)\\cdot d_s\\cdot\\gamma_s = (${tx(inputs.Lf, 3)}+2\\times${tx(inputs.fo, 3)})\\times${tx(inputs.ds, 3)}\\times${tx(inputs.gs, 0)} = ${tx(oop.NHF)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Effective gravity for P-Δ / 有效重力轴力（P-Δ 用）" highlight
          formula={`N_{GE} = W_d + N_{SW} = ${tx(oop.Wd_line)}+${tx(oop.NSW)} = ${tx(oop.N_GE)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Stability weight / 稳定重量（抗倾覆用）"
          formula={`N_{stab} = N_{FF}+N_{SF}+N_{HF} = ${tx(oop.NFF)}+${tx(oop.NSF)}+${tx(oop.NHF)} = ${tx(oop.N_stab)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="ULS gravity envelope / ULS 重力包络"
          formula={`N_{max} = \\max(1.35\\,N_{GE},\\;1.2\\,N_{GE}+1.5\\,W_q) = \\max(1.35\\times${tx(oop.N_GE)},\\;1.2\\times${tx(oop.N_GE)}+1.5\\times${tx(oop.Wq_line)}) = ${tx(oop.Nmax)}\\,\\mathrm{kN/m}`} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   3. In-Plane Seismic Action
   --------------------------------------------------------------------------- */
function InPlaneSeismicBlock({ inputs, inPlane }) {
  const s = inPlane.seismic || {};
  const g = inPlane.gravity || {};

  return (
    <CalculationSection number="3" title="In-Plane Seismic Action · 平面内抗震作用" chip={<Chip size="small" label="AS/NZS 1170.5 §3.2.2" />}>
      <CalculationFormula caption="Elastic site hazard coefficient / 弹性场地危险系数"
        formula={`C(T_1) = C_h(T_1)\\,Z\\,R_u\\,N(T,D) = ${tx(s.Ch)}\\times${tx(s.Z)}\\times${tx(s.Ru)}\\times${tx(s.Nt)} = ${tx(s.CT1, 4)}`} />
      <CalculationFormula caption="Structural performance factor / 结构性能系数"
        formula={`S_p = \\max(0.7,\\;1.3 - 0.3\\mu) = \\max(0.7,\\;1.3 - 0.3\\times${tx(s.mu)}) = ${tx(s.Sp)}`} />
      <CalculationFormula caption="Ductility modification kμ / 延性修正系数"
        formula={`k_\\mu = ${tx(s.kmu, 3)} \\quad (T_1 = ${tx(inputs.period)}\\,\\mathrm{s},\\;\\mu = ${tx(s.mu)})`} />
      <CalculationFormula caption="Design action coefficient / 设计作用系数"
        formula={`C_d(T_1) = \\frac{C(T_1)\\,S_p}{k_\\mu} = \\frac{${tx(s.CT1, 4)}\\times${tx(s.Sp)}}{${tx(s.kmu, 3)}} = ${tx(s.Cd, 4)}`} />
      <CalculationFormula caption="Seismic weight / 地震重力荷载"
        formula={`W_i = G_i + \\psi_E Q = ${tx(s.Gi, 2)}+${tx(s.psiE)}\\times${tx(g.QlineTotal)} = ${tx(s.seismicGravity)}\\,\\mathrm{kN}`} />
      <CalculationFormula caption="Seismic force at top (roof inertia) / 顶部地震力"
        formula={`F_{top} = C_d\\times(G_{line}+\\psi_E Q) = ${tx(s.Cd, 4)}\\times(${tx(g.GlineTotal)}+${tx(s.psiE)}\\times${tx(g.QlineTotal)}) = ${tx(s.FseismicTop)}\\,\\mathrm{kN}`} />
      <CalculationFormula caption="Seismic force from wall self-weight / 墙体自重地震力"
        formula={`F_{wall} = C_d\\times G_{wall} = ${tx(s.Cd, 4)}\\times${tx(g.Gwall)} = ${tx(s.FseismicWall)}\\,\\mathrm{kN}`} />
      <CalculationFormula caption="Total base shear / 基底总剪力" highlight
        formula={`V^*_{seismic} = F_{top}+F_{wall} = ${tx(s.FseismicTop)}+${tx(s.FseismicWall)} = ${tx(s.Vseismic)}\\,\\mathrm{kN}`} />
      <CalculationFormula caption="Overturning moment / 倾覆弯矩" highlight
        formula={`M^*_{seismic} = F_{top}\\,h + F_{wall}\\,\\frac{h}{2} = ${tx(s.FseismicTop)}\\times${tx(inputs.wallHeight)}+${tx(s.FseismicWall)}\\times\\frac{${tx(inputs.wallHeight)}}{2} = ${tx(s.Mseismic)}\\,\\mathrm{kN\\cdot m}`} />
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   4. Combined In-Plane Actions
   --------------------------------------------------------------------------- */
function InPlaneActionsBlock({ inputs, inPlane }) {
  const g = inPlane.gravity || {};
  const s = inPlane.seismic || {};
  const dia = inPlane.diaphragm || {};
  const sa = inPlane.sectionActions || {};
  const diaV = Math.max(safe(dia.VdiaphragmWind), safe(dia.VdiaphragmSeismic));
  const diaM = Math.max(safe(dia.MdiaphragmWind), safe(dia.MdiaphragmSeismic));

  return (
    <CalculationSection number="4" title="Combined In-Plane Actions · 平面内组合内力" chip={<Chip size="small" label="Seismic + Diaphragm + Lintel" />}>
      <CalculationSubsection title="4.1 Roof diaphragm horizontal forces · 屋盖隔膜水平传力">
        <CalculationFormula caption="Diaphragm force envelope / 隔膜水平力包络"
          formula={`V_{dia} = \\max(V_{wd},\\,V_{es}) = \\max(${tx(dia.VdiaphragmWind)},\\,${tx(dia.VdiaphragmSeismic)}) = ${tx(diaV)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Diaphragm moment at base / 隔膜底部弯矩"
          formula={`M_{dia} = V_{dia}\\times h = ${tx(diaV)}\\times${tx(inputs.wallHeight)} = ${tx(diaM)}\\,\\mathrm{kN\\cdot m}`} />
      </CalculationSubsection>
      <CalculationSubsection title="4.2 Lintel reaction & eccentricity · 过梁反力与偏心">
        <CalculationFormula caption="Lintel eccentric moment / 过梁偏心弯矩"
          formula={`M_{lintel} = R_{lintel}\\times e_{centroid} = ${tx(inputs.lintelReaction)}\\times${tx(sa.lintelEcc)} = ${tx(sa.Mlintel)}\\,\\mathrm{kN\\cdot m}`} />
      </CalculationSubsection>
      <CalculationSubsection title="4.3 Total in-plane actions · 总内力">
        <CalculationFormula caption="Gravity axial force / 重力组合轴力"
          formula={`N^*_{gravity} = ${tx(g.Ngravity)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Total in-plane moment / 总弯矩" highlight
          formula={`M^* = M^*_{seismic}+M_{dia}+M_{lintel} = ${tx(s.Mseismic)}+${tx(diaM)}+${tx(sa.Mlintel)} = ${tx(sa.Mtotal)}\\,\\mathrm{kN\\cdot m}`} />
        <CalculationFormula caption="Total in-plane shear / 总剪力" highlight
          formula={`V^* = V^*_{seismic}+V_{dia} = ${tx(s.Vseismic)}+${tx(diaV)} = ${tx(sa.Vtotal)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   5. In-Plane Section Checks
   --------------------------------------------------------------------------- */
function InPlaneChecksBlock({ inputs, inPlane }) {
  const sc = inPlane.sectionChecks || {};
  const ch = inPlane.checks || {};
  const sh = inPlane.shear || {};
  const es = inPlane.elasticStress || {};
  const {
    lw, tw, L, t,
    Nstar, Mstar, Vstar,
    fc, fy, Es, epsCu, alpha1, beta1, phiFlexure,
    Ag, Zg, Ig, eccentricity, kernLimit, cracked,
    sigmaN, sigmaM, sigmaMax, sigmaMin,
    cover, VbarDia, VbarSpace, boundaryBarCount, boundaryBarDia, boundaryWidth,
    AsDistributedBar, AsBoundaryBar, bars, AsTotal,
    neutralAxis, compressionBlockDepth, concreteCompression,
    nominalAxial, nominalMoment, phiMn, momentRatio,
    P0, phiPn, axialRatio, interactionRatio,
    grossConcreteCapacity, lowAxialRatio,
    steelResults, compressionSteelForce, tensionSteelForce,
    yieldedBars, compressionBars, tensionBars
  } = sc;

  return (
    <CalculationSection number="5" title="In-Plane Section Checks · 平面内截面验算"
      chip={<Chip size="small" label="NZS 3101 + Strain Compatibility" />}>

      {/* 5.1 ELASTIC STRESS (SLS) */}
      <CalculationSubsection title="5.1 Serviceability elastic stress · 使用阶段弹性应力 (SLS)">
        <CalculationFormula caption="SLS axial force / 使用阶段轴力"
          formula={`N_{ser} = G_{wall}+G_{line}+N_{lintel}+Q_{line} = ${tx(es.Nservice)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="SLS moment (ULS/1.5) / 使用阶段弯矩"
          formula={`M_{ser} = M^*/1.5 = ${tx(es.Mservice)}\\,\\mathrm{kN\\cdot m}`} />
        <CalculationFormula caption="Uniform axial stress / 均匀轴压应力"
          formula={`\\sigma_N = \\frac{N_{ser}}{A_g} = \\frac{${tx(es.Nservice)}\\times1000}{${tx(Ag, 0)}} = ${tx(es.sigmaN_service, 4)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Elastic bending stress / 弹性弯曲应力"
          formula={`\\sigma_M = \\frac{M_{ser}}{Z_g} = \\frac{${tx(es.Mservice)}\\times10^6}{${tx(Zg, 0)}} = ${tx(es.sigmaM_service, 4)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Maximum edge compression / 最大边缘压应力"
          formula={`\\sigma_{max,ser} = \\sigma_N+\\sigma_M = ${tx(es.sigmaMax_service, 4)}\\,\\mathrm{MPa} \\le 0.6f'_c = ${tx(0.6 * safe(fc), 2)}\\,\\mathrm{MPa}`}
          highlight
          status={mkStatus(ch.stressCompressionPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Minimum edge stress / 最小边缘应力"
          formula={`\\sigma_{min,ser} = \\sigma_N-\\sigma_M = ${tx(es.sigmaMin >= 0 ? es.sigmaN - es.sigmaM : es.sigmaN_service - es.sigmaM_service, 4)}\\,\\mathrm{MPa}`}
          status={mkStatus(safe(es.sigmaMin) >= 0, 'NO TENSION', 'TENSION / CRACKING')} />
      </CalculationSubsection>

      {/* 5.2 ECCENTRICITY */}
      <CalculationSubsection title="5.2 Resultant eccentricity & cracking · 偏心距与开裂判断">
        <CalculationFormula caption="Resultant eccentricity / 合力偏心距 (ULS)"
          formula={`e = \\frac{M^*}{N^*} = \\frac{${tx(Mstar)}}{${tx(Nstar)}} = ${tx(eccentricity, 4)}\\,\\mathrm{m} = ${tx(eccentricity * 1000, 1)}\\,\\mathrm{mm}`}
          highlight />
        <CalculationFormula caption="Middle-third kern limit / 核心区"
          formula={`e_k = \\frac{l_w}{6} = \\frac{${tx(lw)}}{6} = ${tx(kernLimit, 4)}\\,\\mathrm{m}`} />
        <CalculationFormula caption="Cracking classification / 开裂状态"
          formula={`${tx(eccentricity, 4)} \\; ${eccentricity <= kernLimit ? '\\leq' : '>'} \\; ${tx(kernLimit, 4)} \\quad\\Rightarrow\\quad \\text{${cracked ? 'CRACKED — STRAIN COMPATIBILITY REQUIRED' : 'UNCRACKED'}}`}
          highlight
          status={mkStatus(!cracked, 'UNCRACKED', 'CRACKED')} />
      </CalculationSubsection>

      {/* 5.3 REINFORCEMENT */}
      <CalculationSubsection title="5.3 Vertical reinforcement model · 竖向钢筋截面模型">
        <CalculationFormula caption="Distributed bar area / 分布钢筋单根面积"
          formula={`A_{s,v} = \\frac{\\pi\\phi_v^2}{4} = ${tx(AsDistributedBar, 1)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Boundary bar area / 边缘钢筋单根面积"
          formula={`A_{s,b} = \\frac{\\pi\\phi_b^2}{4} = ${tx(AsBoundaryBar, 1)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Total bars in section / 截面参与计算的竖向钢筋"
          formula={`n_{bars} = ${bars.length}, \\qquad A_{s,total} = ${tx(AsTotal, 1)}\\,\\mathrm{mm^2}`}
          highlight />
      </CalculationSubsection>

      {/* 5.4 STRAIN COMPATIBILITY */}
      <CalculationSubsection title="5.4 NZS 3101 strain compatibility · 应变协调与中性轴求解">
        <CalculationFormula caption="Ultimate concrete strain / 极限混凝土压应变"
          formula={`\\varepsilon_{cu} = ${tx(epsCu, 4)}`} />
        <CalculationFormula caption="Beta1 factor / 等效矩形应力块系数"
          formula={`\\beta_1 = \\max(0.85-0.008(f'_c-30),\\;0.65) = \\max(0.85-0.008(${tx(fc)}-30),\\;0.65) = ${tx(beta1, 3)}`} />
        <CalculationFormula caption="Equivalent compression block / 等效矩形压应力块"
          formula={`a = \\beta_1 c = ${tx(beta1, 3)}\\times${tx(neutralAxis, 1)} = ${tx(compressionBlockDepth, 1)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Concrete compression resultant / 混凝土压缩合力"
          formula={`C_c = \\alpha_1 f'_c b a = ${tx(alpha1, 3)}\\times${tx(fc)}\\times${tx(t, 0)}\\times${tx(compressionBlockDepth, 1)} = ${tx(concreteCompression / 1000, 2)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Solved neutral axis depth / 中性轴深度"
          formula={`c = ${tx(neutralAxis, 1)}\\,\\mathrm{mm}`} highlight />
        <CalculationFormula caption="Steel force state / 钢筋受力状态"
          formula={`n_c = ${compressionBars}, \\qquad n_t = ${tensionBars}, \\qquad n_y = ${yieldedBars}`} />
        <CalculationFormula caption="Compression and tension resultants / 钢筋合力"
          formula={`C_s = ${tx(compressionSteelForce / 1000, 2)}\\,\\mathrm{kN}, \\qquad T_s = ${tx(tensionSteelForce / 1000, 2)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>

      {/* 5.5 MOMENT CAPACITY */}
      <CalculationSubsection title="5.5 Section N-M capacity · 给定轴力下截面抗弯承载力">
        <CalculationFormula caption="Nominal axial / 名义轴力"
          formula={`P_n = C_c + \\sum F_s = ${tx(nominalAxial, 2)}\\,\\mathrm{kN} \\approx N^*/\\phi = ${tx(Nstar, 2)}/${tx(phiFlexure, 2)} = ${tx(Nstar / safe(phiFlexure, 0.85), 2)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Nominal moment / 名义弯矩"
          formula={`M_n = ${tx(nominalMoment, 2)}\\,\\mathrm{kN\\cdot m}`} />
        <CalculationFormula caption="Design moment capacity / 设计抗弯承载力"
          formula={`\\phi M_n = ${tx(phiFlexure, 3)}\\times${tx(nominalMoment, 2)} = ${tx(phiMn, 2)}\\,\\mathrm{kN\\cdot m}`}
          highlight />
        <CalculationFormula caption="Moment utilisation / 抗弯利用率"
          formula={`UR_M = \\frac{M^*}{\\phi M_n} = \\frac{${tx(Mstar, 2)}}{${tx(phiMn, 2)}} = ${txUR(momentRatio)} = ${txPct(momentRatio)}\\%`}
          highlight
          status={mkStatus(momentRatio <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      {/* 5.6 AXIAL LOAD LEVEL */}
      <CalculationSubsection title="5.6 Axial load level · 轴压水平">
        <CalculationFormula caption="Gross-section axial ratio / 毛截面轴压比"
          formula={`\\eta_N = \\frac{N^*}{f'_c A_g} = \\frac{${tx(Nstar)}\\times1000}{${tx(fc)}\\times${tx(Ag, 0)}} = ${tx(lowAxialRatio, 5)}`}
          highlight />
        <CalculationFormula caption="Design interpretation / 设计解释"
          formula={`\\eta_N = ${tx(lowAxialRatio, 5)} \\Rightarrow \\text{${lowAxialRatio <= 0.01 ? 'LOW AXIAL — FLEXURE DOMINATED' : 'N-M EFFECT SIGNIFICANT'}}`}
          status={mkStatus(lowAxialRatio <= 0.01, 'LOW AXIAL', 'REVIEW')} />
        <CalculationFormula caption="Pure compression capacity / 纯压承载力"
          formula={`\\phi P_0 = ${tx(phiPn, 2)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Axial utilisation / 轴压利用率"
          formula={`UR_N = \\frac{N^*}{\\phi P_0} = ${tx(axialRatio, 4)} = ${txPct(axialRatio)}\\%`} />
      </CalculationSubsection>

      {/* 5.7 IN-PLANE SHEAR — NZS 3101 Cl 11.3.10 */}
      <CalculationSubsection title="5.7 In-plane shear · 平面内抗剪 (NZS 3101 Cl 11.3.10)">
        <CalculationFormula caption="Web width, shear depth & area / 腹板宽度、有效剪深"
          formula={`b_w = t = ${tx(sh.bw, 0)}\\,\\mathrm{mm}, \\quad d_v = 0.8l_w = ${tx(sh.dv, 0)}\\,\\mathrm{mm}, \\quad A_{cv} = ${tx(sh.Acv, 0)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Axial stress parameter / 轴压应力参数"
          formula={`\\nu = N^*/A_g = ${tx(sh.nu, 4)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Method / 计算方法"
          formula={`\\text{${sh.vcMethod}} \\quad (\\rho_v = ${tx(safe(inPlane.reinforcement?.rhoVertical) * 100, 3)}\\% ${sh.simplifiedOK ? '\\ge 0.3\\%,\\;\\text{simplified OK}' : '< 0.3\\% \\text{ or spacing > 300, detailed}'})`} />
        <CalculationFormula caption="Concrete shear vc / 混凝土抗剪应力"
          formula={`v_c = ${tx(sh.vc, 4)}\\,\\mathrm{MPa} \\quad (v_{c,1112}=${tx(sh.vc_1112, 3)},\\; v_{c,1113}=${tx(sh.vc_1113, 3)},\\; v_{c,1114}=${tx(sh.vc_1114, 3)},\\; v_{c,1115}=${tx(sh.vc_1115, 3)})`} />
        <CalculationFormula caption="Concrete shear capacity / 混凝土抗剪承载力"
          formula={`V_c = v_c A_{cv} = ${tx(sh.Vc)}\\,\\mathrm{kN}, \\quad \\phi V_c = ${tx(sh.phiVc)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Shear limit & section size / 抗剪上限"
          formula={`v_{n,max} = \\min(0.2f'_c,\\;8) = ${tx(sh.vmax_MPa, 2)}\\,\\mathrm{MPa}, \\quad V_{n,max} = ${tx(sh.Vn_max)}\\,\\mathrm{kN}`}
          status={mkStatus(sh.sectionSizeOK, 'SIZE OK', 'SIZE FAIL')} />
        <CalculationFormula caption="Horizontal steel shear / 水平钢筋抗剪"
          formula={`V_s = \\frac{A_{sh}f_y d_v}{s_h} = ${tx(sh.VsProvided)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Total design shear capacity / 总设计抗剪承载力"
          formula={`\\phi V_n = \\phi(V_c+V_s) = ${tx(sh.shearCapacity)}\\,\\mathrm{kN}`}
          highlight />
        <CalculationFormula caption="Shear utilisation / 抗剪利用率"
          formula={`UR_V = \\frac{V^*}{\\phi V_n} = \\frac{${tx(Vstar)}}{${tx(sh.shearCapacity)}} = ${txUR(sh.shearRatio)} = ${txPct(sh.shearRatio)}\\%`}
          highlight
          status={mkStatus(ch.shearPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Min horizontal steel / 最小水平筋 (Eq 11-19)"
          formula={`A_{sh,req} = 0.7 b_w s_h/f_y = ${tx(sh.Ash_required, 1)}\\,\\mathrm{mm^2}, \\quad A_{sh,act} = ${tx(sh.Ash_actual, 1)}\\,\\mathrm{mm^2}`}
          status={mkStatus(sh.minSteelOK, 'OK', 'INSUFFICIENT')} />
        <CalculationFormula caption="Spacing limits / 间距限值"
          formula={`s_{h,max} = ${tx(sh.maxSpacingH, 0)}\\,\\mathrm{mm}, \\quad s_{v,max} = ${tx(sh.maxSpacingV, 0)}\\,\\mathrm{mm}`}
          status={mkStatus(sh.spacingOK, 'OK', 'EXCEEDS')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   6. Out-of-Plane Design (Wind & Seismic)
   --------------------------------------------------------------------------- */
function OutOfPlaneWindSeismicBlock({ inputs, outOfPlane }) {
  const oop = outOfPlane || {};
  const hv = oop.hroofValidation || {};
  const sc = oop.supportConditions || {};
  const ps = oop.partSeismic || {};
  const pd = oop.pDelta || {};
  const wsF = sc.windSeismicFactors || { mid: 1 / 8, base: 0, shear: 1 / 2 };
  const hroofEff = safe(hv.hroofEffective);
  const oopSh = oop.oopShear || {};

  return (
    <CalculationSection number="6" title="Out-of-Plane Design (Wind & Seismic) · 平面外设计（风与地震）" chip={<Chip size="small" label="AS/NZS 1170.5 Ch.8 / NZS 3101" />}>

      <CalculationSubsection title="6.1 OOP Gravity & Lateral Actions · 平面外作用">
        <CalculationFormula caption="Effective hroof / 实际采用值" highlight
          formula={`h_{roof,eff} = \\min(h_{roof},\\,h_{roof,max}) = ${tx(hv.hroofEffective)}\\,\\mathrm{m}`}
          status={mkStatus(hv.hroofValid, 'VALID', 'CLAMPED')} />
        <CalculationFormula caption="Site hazard coefficient C0 / 场地危险系数"
          formula={`C_0 = C_h(T_0)\\,Z\\,R_u\\,N(T,D) = ${tx(ps.partC0, 3)}`} />
        <CalculationFormula caption="Height amplification CHi / 高度放大系数 (§8.4.2.2)"
          formula={`C_{Hi} = ${tx(ps.CHi, 3)}`} />
        <CalculationFormula caption="Period-dependent factor Ci(Tp) / 周期相关系数"
          formula={`C_i(T_p) = ${tx(ps.partCiTp, 3)} \\quad (T_p = ${tx(ps.partPeriod, 3)}\\,\\mathrm{s})`} />
        <CalculationFormula caption="Cp(Tp) at top / 顶部地震水平系数" highlight
          formula={`C_p(T_p) = C_0\\,C_{Hi}\\,C_i(T_p) = ${tx(ps.partC0, 3)}\\times${tx(ps.CHi, 3)}\\times${tx(ps.partCiTp, 3)} = ${tx(ps.partCpTp, 3)}`} />
        <CalculationFormula caption="Part response factor Cph / 响应系数"
          formula={`C_{ph} = ${tx(ps.partCph, 3)} \\quad (\\mu_p = ${tx(inputs.partDuctility)})`} />
        <CalculationFormula caption="Part risk factor Rp / 风险修正系数"
          formula={`R_p = ${tx(ps.partRp, 3)}`} />
        <CalculationFormula caption="Wall panel weight Wp / 墙板每延米重量"
          formula={`W_p = \\gamma_c\\,t_w = ${tx(inputs.concreteDensity)}\\times${tx(inputs.wallThickness)} = ${tx(ps.Wp_panel)}\\,\\mathrm{kPa}`} />
        <CalculationFormula caption="Design seismic pressure Fp / 设计地震压力" highlight
          formula={`F_p = \\min(C_p C_{ph} R_p,\\;3.6)\\,W_p = \\min(${tx(ps.partCpTp, 3)}\\times${tx(ps.partCph, 3)}\\times${tx(ps.partRp, 3)},\\;3.6)\\times${tx(ps.Wp_panel)} = ${tx(ps.Fp_panel, 3)}\\,\\mathrm{kPa}`} />
        <CalculationFormula caption="OOP wind pressure / OOP风压"
          formula={`w_{wf} = ${tx(oop.wwf)}\\,\\mathrm{kPa}`} />
      </CalculationSubsection>

      <CalculationSubsection title="6.2 Bending Moments & Support Conditions · 弯矩与支承条件">
        <Box sx={{ overflowX: 'auto', mb: 1.5 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Support condition', 'Mid k', 'Base k', 'Assigned'].map(hd => (
                  <th key={hd} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '2px solid #e5e7eb', fontWeight: 800 }}>{hd}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SUPPORT_MOMENT_TABLE.map(row => {
                const isWS = (sc.windSeismic || 'Pinned-Pinned') === row.key;
                return (
                  <tr key={row.key} style={{ background: isWS ? '#f0f7ff' : 'transparent' }}>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee', fontWeight: 600 }}>{row.label}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{row.mid}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{row.base}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>
                      {isWS && <Chip size="small" color="primary" label="Wind & Seismic" />}
                      {!isWS && <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
        <CalculationFormula caption="Seismic moment ME / 地震弯矩"
          formula={`M_E = F_p\\,h_{roof}^2\\,k_{mid} = ${tx(ps.Fp_panel, 3)}\\times${tx(hroofEff)}^2\\times${tx(wsF.mid, 4)} = ${tx(oop.ME, 2)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Wind moment MW / 风弯矩"
          formula={`M_W = w_{wf}\\,h_{roof}^2\\,k_{mid} = ${tx(oop.wwf)}\\times${tx(hroofEff)}^2\\times${tx(wsF.mid, 4)} = ${tx(oop.MW, 2)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Mid-height moment Ma / 中部弯矩" highlight
          formula={`M_a = \\max(M_E, M_W) + \\Delta M_{add} = ${tx(oop.Ma, 2)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Minimum eccentricity moment / 最小偏心弯矩 (Cl 11.3.1.2)"
          formula={`M_{min} = N^*\\times0.05t = ${tx(oop.Nmax)}\\times0.05\\times${tx(inputs.wallThickness)} = ${tx(oop.Mmin_ecc, 3)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Effective moment / 有效弯矩" highlight
          formula={`M_{a,eff} = \\max(|M_a|,\\;M_{min}) = \\max(${tx(oop.Ma, 2)},\\;${tx(oop.Mmin_ecc, 3)}) = ${tx(oop.Ma_eff, 2)}\\,\\mathrm{kN\\cdot m/m}`} />
      </CalculationSubsection>

      <CalculationSubsection title="6.3 Flexural Capacity & P-Delta · 抗弯承载力与 P-Δ (NZS 3101 Cl 11.3.5.1.2)">
        <CalculationFormula caption="Flexural capacity φMn / 抗弯承载力" highlight
          formula={`\\phi M_n = 0.85\\,A_{WV}\\,f_y\\left(d-\\frac{a}{2}\\right)/10^6 = ${tx(oop.phiMn)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Cracked moment of inertia Icr / 开裂惯性矩"
          formula={`I_{cr} = \\frac{b(kd)^3}{3}+nA_{se}(d_{icr}-kd)^2 = ${tx(pd.Icr, 0)}\\,\\mathrm{mm^4/m}`} />
        <CalculationFormula caption="P-Delta factor λ / P-Δ 稳定系数 (0.75 stiffness reduction)"
          formula={`\\lambda = \\frac{N^* h^2}{k_{pd}\\times0.75\\,E_c\\,I_{cr}} = \\frac{${tx(oop.Nmax)}\\times10^3\\times(${tx(hroofEff * 1000, 0)})^2}{${tx(pd.k_pdelta)}\\times0.75\\times${tx(oop.Ec)}\\times${tx(pd.Icr, 0)}} = ${tx(pd.pDeltaFactor, 4)}`}
          status={mkStatus(pd.pDeltaStable, 'STABLE', 'UNSTABLE')} />
        <CalculationFormula caption="P-Delta magnified moment M' / P-Δ 放大弯矩" highlight
          formula={`M' = \\frac{M_{a,eff}}{1-\\lambda} = \\frac{${tx(oop.Ma_eff, 2)}}{1-${tx(pd.pDeltaFactor, 4)}} = ${tx(pd.M_prime, 2)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Mid-height utilisation UR1 / 中部利用率" highlight
          formula={`UR_1 = \\frac{M'}{\\phi M_n} = \\frac{${tx(pd.M_prime, 2)}}{${tx(oop.phiMn)}} = ${txPct(oop.UR1)}\\%`}
          status={mkStatus(Number.isFinite(oop.UR1) && oop.UR1 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      <CalculationSubsection title="6.4 Shear Capacity · 抗剪承载力 (NZS 3101 Cl 12.7)">
        <CalculationFormula caption="OOP shear depth & ratio / 有效剪深与配筋率"
          formula={`d = ${tx(oopSh.d_oop, 0)}\\,\\mathrm{mm}, \\quad \\rho = ${tx(safe(oopSh.rho_oop) * 100, 3)}\\%`} />
        <CalculationFormula caption="Size factor kd / 尺寸效应系数"
          formula={`k_d = (400/d)^{0.25} = (400/${tx(oopSh.d_oop, 0)})^{0.25} = ${tx(oopSh.kd_oop, 3)}`} />
        <CalculationFormula caption="Basic shear stress vb / 基本抗剪应力"
          formula={`v_b = \\min((0.07+10\\rho)\\sqrt{f'_c},\\;0.2\\sqrt{f'_c}) = ${tx(oopSh.vb_oop, 3)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Concrete shear vc / 混凝土抗剪"
          formula={`v_c = k_d\\,v_b = ${tx(oopSh.kd_oop, 3)}\\times${tx(oopSh.vb_oop, 3)} = ${tx(oopSh.vc_oop, 3)}\\,\\mathrm{MPa}, \\quad V_c = ${tx(oopSh.Vc_oop, 2)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Steel shear Vs / 钢筋抗剪"
          formula={`V_s = ${tx(oopSh.Vs_oop, 2)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Design shear capacity / 设计抗剪承载力"
          formula={`\\phi V_n = ${tx(oopSh.phiVn_oop, 2)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Shear demand / 剪力需求"
          formula={`V' = \\max(V_E,\\,V_w) = ${tx(oop.Vprime, 2)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Shear utilisation UR4 / 抗剪利用率" highlight
          formula={`UR_4 = \\frac{V'}{\\phi V_n} = \\frac{${tx(oop.Vprime, 2)}}{${tx(oopSh.phiVn_oop, 2)}} = ${txPct(oop.UR4)}\\%`}
          status={mkStatus(Number.isFinite(oop.UR4) && oop.UR4 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   7. Out-of-Plane Fire Resistance
   --------------------------------------------------------------------------- */
function OutOfPlaneFireBlock({ inputs, outOfPlane }) {
  const oop = outOfPlane || {};

  return (
    <CalculationSection number="7" title="Out-of-Plane Fire Resistance · 平面外抗火设计" chip={<Chip size="small" label="NZS 3101 / BRANZ Guide" />}>
      <CalculationSubsection title="7.1 Fire Actions & Material Properties · 火灾作用与材料折减">
        <CalculationFormula caption="Axis distance xt / 钢筋轴向距离"
          formula={`x_t = \\frac{t_w}{2}-\\frac{\\phi_v}{2000}-\\frac{\\phi_h}{1000} = ${tx(oop.xt, 4)}\\,\\mathrm{m} = ${tx(safe(oop.xt) * 1000, 1)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Reduction factors / 温度折减系数"
          formula={`\\eta_x = 0.16\\ln(t_h\\,x_t^{-2})-0.65 = ${tx(oop.etax, 3)}, \\qquad \\eta_w = 1-0.162\\,t_h^{-0.6} = ${tx(oop.etaw, 3)}`} />
        <CalculationFormula caption="Steel temperature & reduced yield / 钢筋温度与折减屈服"
          formula={`T_{fs} = \\eta_x\\,\\eta_w\\times660 = ${tx(oop.Tfs, 0)}\\,^{\\circ}\\mathrm{C}, \\qquad f_{yt} = ${tx(oop.fyt, 0)}\\,\\mathrm{MPa}`} />
      </CalculationSubsection>
      <CalculationSubsection title="7.2 Fire Moment & Capacity · 火灾弯矩与承载力 (φ = 1.0)">
        <CalculationFormula caption="Fire moment Mbf / 火灾弯矩"
          formula={`M_{bf} = w_f\\,(H_w-t_f)^2\\,k_{fire} = ${tx(inputs.wf)}\\times${tx(oop.hs)}^2\\times${tx(safe(oop.supportConditions?.fireFactors?.base, 0.5), 4)} = ${tx(oop.Mbf)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Fire flexural capacity / 火灾抗弯承载力 (φ=1.0)"
          formula={`\\phi M_{n,fire} = 1.0\\times A_{WV}\\,f_{yt}\\left(d-\\frac{a_f}{2}\\right)/10^6 = ${tx(oop.phiMn_fire)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Fire utilisation UR3 / 火灾利用率" highlight
          formula={`UR_3 = \\frac{M_{bf}}{\\phi M_{n,fire}} = \\frac{${tx(oop.Mbf)}}{${tx(oop.phiMn_fire)}} = ${txPct(oop.UR3)}\\%`}
          status={mkStatus(Number.isFinite(oop.UR3) && oop.UR3 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   8. Wall Stability Check (from engine)
   --------------------------------------------------------------------------- */
function StabilityBlock({ inputs, inPlane, outOfPlane }) {
  const stab = outOfPlane?.stability || {};
  const kWall = safe(stab.kWall, 1);
  const Ht = safe(stab.Ht_ratio);
  const kHt = safe(stab.kHt_ratio);
  const cond1 = stab.cond1_Ht !== false;
  const cond2 = stab.cond2_kHt !== false;
  const cond3 = stab.cond3_euler !== false;
  const cond4 = stab.cond4_vlasov !== false;
  const allOK = stab.allOK !== false;

  const stabilityRows = [
    ['8.4.1 H/t ≤ 75', `H/t = ${tx(Ht)} ≤ 75`, cond1],
    ['8.4.2 kH/t ≤ 65', `k = ${tx(kWall, 2)}, kH/t = ${tx(kHt)} ≤ 65`, cond2],
    ['8.4.3 Euler buckling', `kH/t = ${tx(kHt)} ≤ ${tx(safe(stab.kHt_eulerCapacity), 2)}`, cond3],
    ['8.4.4 Vlasov LTB', `M_{demand} = ${tx(safe(stab.Mdemand_vlasov) / 1e6, 2)} kN·m ≤ M_{crit} = ${tx(safe(stab.Mcrit_vlasov) / 1e6, 2)} kN·m`, cond4]
  ];

  return (
    <CalculationSection number="8" title="Wall Stability Check · 稳定计算" chip={<Chip size="small" label="BRANZ Guide §8.4" />}>
      <Alert severity={allOK ? 'success' : 'warning'} sx={{ mb: 2 }}>
        BRANZ §8.4 wall panel stability: H/t, kH/t, Euler buckling, Vlasov lateral torsional buckling.
      </Alert>
      <Box sx={{ overflowX: 'auto', mb: 2 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Stability check', 'Result', 'Status'].map(hd => (
                <th key={hd} style={{ textAlign: hd === 'Stability check' ? 'left' : 'right', padding: '6px 10px', borderBottom: '2px solid #e5e7eb', fontWeight: 800 }}>{hd}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stabilityRows.map(([label, value, pass]) => (
              <tr key={label}>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee', fontWeight: 600 }}>{label}</td>
                <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #eee', fontVariantNumeric: 'tabular-nums' }}>{value}</td>
                <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #eee' }}>
                  <Chip size="small" label={pass ? 'PASS' : 'CHECK'} color={pass ? 'success' : 'warning'} sx={{ fontWeight: 700 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
      <CalculationSubsection title="8.4.1–8.4.2 Slenderness limits · 长细比限值">
        <CalculationFormula caption="H/t ≤ 75"
          formula={`\\frac{H}{t} = ${tx(Ht)} \\le 75`}
          status={mkStatus(cond1, 'PASS', 'CHECK')} />
        <CalculationFormula caption="kH/t ≤ 65"
          formula={`k = ${tx(kWall, 2)}, \\quad \\frac{kH}{t} = ${tx(kHt)} \\le 65`}
          status={mkStatus(cond2, 'PASS', 'CHECK')} />
      </CalculationSubsection>
      <CalculationSubsection title="8.4.3 Euler buckling · Euler 屈曲稳定">
        <CalculationFormula caption="Euler parameter λe / Euler 荷载参数"
          formula={`\\lambda_e = ${tx(safe(stab.lambda_euler), 4)}`} />
        <CalculationFormula caption="Euler capacity / Euler 稳定限值"
          formula={`\\left(\\frac{kH}{t}\\right)_{cap} = \\sqrt{185/\\lambda_e} = ${tx(safe(stab.kHt_eulerCapacity), 2)}`}
          status={mkStatus(cond3, 'PASS', 'CHECK')} />
      </CalculationSubsection>
      <CalculationSubsection title="8.4.4 Vlasov lateral torsional buckling · 侧向扭转屈曲">
        <CalculationFormula caption="Critical moment / 临界弯矩"
          formula={`M_{crit} = ${tx(safe(stab.Mcrit_vlasov) / 1e6, 2)}\\,\\mathrm{kN\\cdot m}`} />
        <CalculationFormula caption="Demand moment / 需求弯矩"
          formula={`M_{demand} = ${tx(safe(stab.Mdemand_vlasov) / 1e6, 2)}\\,\\mathrm{kN\\cdot m}`} />
        <CalculationFormula caption="Overall Vlasov check / 弯扭稳定"
          formula={`M_{demand} \\le M_{crit} \\quad\\Rightarrow\\quad ${cond4 ? 'PASS' : 'CHECK'}`}
          highlight status={mkStatus(cond4, 'PASS', 'CHECK')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   9. Lintel Bearing & Boundary Element
   --------------------------------------------------------------------------- */
function LintelBoundaryElementBlock({ inputs, inPlane }) {
  const be = inPlane.bearing || {};
  const ch = inPlane.checks || {};
  const bn = inPlane.boundaryNM || {};
  const bns = bn.section || {};
  const bnk = bn.keyPoints || {};
  const bng = bn.gravityShare || {};
  const bnd = Array.isArray(bn.demands) ? bn.demands : [];
  const bnc = bn.checks || {};
  const bngov = bn.governing || {};

  return (
    <CalculationSection number="9" title="Lintel Bearing & Boundary Element · 过梁和边缘构件" chip={<Chip size="small" label="NZS 3101" />}>
      <CalculationSubsection title="9.1 Lintel bearing (D-region) · 过梁局部承压">
        <CalculationFormula caption="Bearing area / 承压面积"
          formula={`A_b = ${tx(safe(inputs.bearingWidth) * safe(inputs.bearingLength), 0)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Bearing stress / 承压应力"
          formula={`\\sigma_b = \\frac{R_{lintel}}{A_b} = \\frac{${tx(inputs.lintelReaction)}\\times1000}{${tx(safe(inputs.bearingWidth) * safe(inputs.bearingLength), 0)}} = ${tx(be.bearingStress, 4)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Bearing capacity / 承压限值"
          formula={`\\sigma_{b,cap} = 0.6\\sqrt{f'_c} = 0.6\\sqrt{${tx(inputs.fc)}} = ${tx(safe(be.bearingCapacity), 4)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Bearing utilisation / 承压利用率" highlight
          formula={`UR_{bearing} = ${txUR(be.bearingRatio)} = ${txPct(be.bearingRatio)}\\%`}
          status={mkStatus(ch.bearingPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      <CalculationSubsection title="9.2 Boundary element local N-M · 边缘构件局部压弯">
        {bn.available === false ? (
          <Alert severity="info">Boundary element local N-M check skipped (no boundary element or incomplete data).</Alert>
        ) : (
          <>
            <CalculationFormula caption="Boundary section / 边缘构件截面"
              formula={`b_c = ${tx(bns.bc, 0)}\\,\\mathrm{mm}, \\quad h_c = ${tx(bns.hc, 0)}\\,\\mathrm{mm}, \\quad A_{s,b} = ${tx(bns.AsTotal, 0)}\\,\\mathrm{mm^2}, \\quad d = ${tx(bns.d, 0)}\\,\\mathrm{mm}`} />
            <CalculationFormula caption="Strain-compatibility / 平截面参数"
              formula={`\\varepsilon_{cu} = 0.003, \\quad \\beta_1 = ${tx(bns.beta1, 3)}, \\quad \\phi_c = ${tx(inputs.phiCompression)}, \\quad \\phi_f = ${tx(inputs.phiFlexure)}`} />
            <CalculationFormula caption="Pure compression / 纯压承载力"
              formula={`\\phi P_0 = ${tx(bnk.phiP0, 0)}\\,\\mathrm{kN}`} />
            <CalculationFormula caption="Balanced point / 平衡点"
              formula={`c_b = ${tx(bnk.cb, 0)}\\,\\mathrm{mm}, \\quad (\\phi N_b,\\,\\phi M_b) = (${tx(bnk.phiNb, 0)},\\;${tx(bnk.phiMb, 1)})\\,\\mathrm{kN,\\,kN\\cdot m}`} />
            <CalculationFormula caption="Pure bending / 纯弯承载力"
              formula={`\\phi M_0 = ${tx(bnk.phiM0, 1)}\\,\\mathrm{kN\\cdot m}`} />
            <CalculationFormula caption="Gravity share / 重力分担"
              formula={`r = ${tx(bng.r, 4)}, \\quad G_b = ${tx(bng.Gb, 1)}\\,\\mathrm{kN}, \\quad Q_b = ${tx(bng.Qb, 1)}\\,\\mathrm{kN}`} />
            <Box sx={{ overflowX: 'auto', mb: 1.5 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Combination', 'N* (kN)', 'M* (kN·m)', 'φMn(N*) (kN·m)', 'UR', 'Status'].map(hd => (
                      <th key={hd} style={{ textAlign: hd === 'Combination' ? 'left' : 'right', padding: '6px 10px', borderBottom: '2px solid #e5e7eb', fontWeight: 800 }}>{hd}</th>
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
                          {pt.key} · {pt.label}{isGov ? ' (governing)' : ''}
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
            <CalculationFormula caption="Governing N-M UR / 控制利用率" highlight
              formula={`UR_{b,N-M} = \\frac{M^*}{\\phi M_n(N^*)} = \\frac{${tx(bngov.M, 2)}}{${tx(bngov.Mcap, 2)}} = ${txUR(bnc.governingUR)} = ${txPct(bnc.governingUR)}\\%`}
              status={mkStatus(bnc.pass, 'PASS', 'CHECK')} />
            <NMInteractionChart boundary={bn} />
          </>
        )}
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   10. Base Connection Design (NZS 3101 Cl 7.7)
   --------------------------------------------------------------------------- */
function BaseConnectionBlock({ inputs, connection }) {
  const cn = connection || {};
  const dm = cn.demand || {};
  const dw = cn.dowel || {};
  const fr = cn.friction || {};
  const cap = cn.capacity || {};
  const be = cn.bearing || {};
  const rt = cn.ratios || {};
  const ch = cn.checks || {};

  return (
    <CalculationSection number="10" title="Base Connection Design · 连接计算" chip={<Chip size="small" label="NZS 3101 Cl 7.7" />}>
      <CalculationSubsection title="10.1 Shear demand · 剪力需求">
        <CalculationFormula caption="OOP shear over wall width / 平面外剪力换算"
          formula={`V_{oop,total} = V'\\times b = ${tx(dm.VoutPerM)}\\times${tx(inputs.wallWidth)} = ${tx(dm.VoutTotal)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Connection shear demand / 连接剪力需求" highlight
          formula={`V^*_{conn} = \\max(V^*_{in},\\,V_{oop,total}) = \\max(${tx(dm.VinPlane)},\\,${tx(dm.VoutTotal)}) = ${tx(dm.Vstar)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>

      <CalculationSubsection title="10.2 Dowel checks (supplementary) · 锚筋校核（附加）">
        <CalculationFormula caption="Dowel steel shear / 钢材抗剪"
          formula={`V_{steel} = n\\times0.6A_df_y/1000 = ${tx(dw.nDowel, 0)}\\times0.6\\times${tx(dw.Ad, 1)}\\times${tx(inputs.fy)}/1000 = ${tx(dw.VdowelSteel)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Grout bond / 灌浆粘结"
          formula={`V_{bond} = n\\pi\\phi_d l_{emb}\\times0.35\\sqrt{f'_g}/1000 = ${tx(dw.VgroutBond)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Governing dowel shear / 锚筋取小"
          formula={`V_{dowel} = \\min(V_{steel},\\,V_{bond}) = ${tx(dw.Vdowel)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>

      <CalculationSubsection title="10.3 Shear friction (Cl 7.7) · 剪切摩擦">
        <CalculationFormula caption="Friction coefficient / 摩擦系数"
          formula={`\\mu_{used} = ${tx(fr.muUsed, 2)} \\quad (${fr.roughened ? 'roughened ≥ 2mm' : 'unroughened, capped at 0.6'})`} />
        <CalculationFormula caption="Shear friction capacity / 剪切摩擦承载力"
          formula={`V_{sf} = \\mu(A_{vf}f_y + N^*) + V_{key} = ${tx(fr.muUsed, 2)}\\times(${tx(dw.Avf, 1)}\\times${tx(inputs.fy)}/1000+${tx(dm.Nstar)})+${tx(fr.VshearKey)} = ${tx(fr.Vsf)}\\,\\mathrm{kN}`}
          highlight />
        <CalculationFormula caption="Design shear friction / 设计剪切摩擦"
          formula={`\\phi V_{sf} = 0.75\\times${tx(fr.Vsf)} = ${tx(fr.phiVsf)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Connection shear utilisation / 连接抗剪利用率" highlight
          formula={`UR_{V,conn} = \\frac{V^*_{conn}}{\\phi V_{sf}} = \\frac{${tx(dm.Vstar)}}{${tx(cap.phiVsf)}} = ${txUR(rt.shearRatio)} = ${txPct(rt.shearRatio)}\\%`}
          status={mkStatus(ch.shearPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Bond supplementary check / 粘结附加校核"
          formula={`UR_{bond} = ${txUR(rt.bondRatio)}`}
          status={mkStatus(Number.isFinite(rt.bondRatio) && rt.bondRatio <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      <CalculationSubsection title="10.4 Uplift & bearing · 抗拔与承压">
        <CalculationFormula caption="Uplift capacity / 抗拔承载力 (φ=0.85)"
          formula={`\\phi T_{conn} = 0.85\\,nA_df_y/1000 = ${tx(cap.phiTconn)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Uplift utilisation / 抗拔利用率" highlight
          formula={`UR_{T,conn} = \\frac{T^*}{\\phi T_{conn}} = \\frac{${tx(dm.Tstar)}}{${tx(cap.phiTconn)}} = ${txUR(rt.tensionRatio)}`}
          status={mkStatus(ch.tensionPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Grout bed bearing / 灌浆垫承压" highlight
          formula={`\\sigma = ${tx(be.sigmaBearing, 4)}\\,\\mathrm{MPa} \\le 0.65\\times0.85f'_g = ${tx(be.bearingCapacity, 4)}\\,\\mathrm{MPa} \\quad UR = ${txUR(rt.bearingRatio)}`}
          status={mkStatus(ch.bearingPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      <CalculationSubsection title="10.5 Development length · 锚固长度 (Cl 8.6.3)">
        <CalculationFormula caption="Basic development length / 基本锚固长度"
          formula={`l_{d,basic} = ${tx(dw.ld_basic, 0)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Required development length / 要求锚固长度"
          formula={`l_{d,req} = ${tx(dw.ld_required, 0)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Provided embedment / 实际锚固"
          formula={`l_{emb} = ${tx(dw.embedment, 0)}\\,\\mathrm{mm} \\ge l_{d,req} = ${tx(dw.ld_required, 0)}\\,\\mathrm{mm}`}
          highlight
          status={mkStatus(dw.developmentOK, 'PASS', 'INSUFFICIENT')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   11. Foundation Design
   --------------------------------------------------------------------------- */
function FoundationBlock({ inputs, inPlane, outOfPlane, foundation }) {
  const oop = outOfPlane || {};
  const fd = foundation || {};
  const fc = fd.checks || {};
  const hv = oop.hroofValidation || {};
  const Mstar = safe(inPlane?.sectionActions?.Mtotal);
  const Vstar = safe(inPlane?.sectionActions?.Vtotal);

  return (
    <CalculationSection number="11" title="Foundation Design · 基础计算" chip={<Chip size="small" label="OOP UR5/UR6 + In-Plane Footing" />}>
      <CalculationSubsection title="11.1 OOP foundation (UR5/UR6) · 平面外基础">
        <CalculationFormula caption="Overturning moment / 倾覆弯矩"
          formula={`M_O = M_a\\,h_{roof} = ${tx(oop.Ma)}\\times${tx(safe(hv.hroofEffective))} = ${tx(oop.Mo)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Total weight & resisting moment / 总重力与抗倾覆"
          formula={`W_{sum} = ${tx(oop.Wsum)}\\,\\mathrm{kN/m}, \\quad M_R = W_{sum}\\frac{L_f+2f_o}{2} = ${tx(oop.MR_weight)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Effective bearing length / 有效承压长度"
          formula={`X = ${tx(oop.X, 0)}\\,\\mathrm{mm}, \\quad L_{BR} = ${tx(oop.LBR, 0)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Bearing pressure UR5 / 基底压力利用率" highlight
          formula={`UR_5 = \\frac{q_d}{q_D} = \\frac{${tx(oop.qd, 0)}}{${tx(oop.qD, 0)}} = ${txUR(oop.UR5)} = ${txPct(oop.UR5)}\\%`}
          status={mkStatus(Number.isFinite(oop.UR5) && oop.UR5 <= 1, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Footing flexure UR6 / 基础抗弯利用率" highlight
          formula={`UR_6 = \\frac{M_O}{\\phi M_{n,foot}} = \\frac{${tx(oop.Mo)}}{${tx(oop.phiMn_foot)}} = ${txUR(oop.UR6)} = ${txPct(oop.UR6)}\\%`}
          status={mkStatus(Number.isFinite(oop.UR6) && oop.UR6 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      <CalculationSubsection title="11.2 In-plane footing · 平面内基础">
        <CalculationFormula caption="Footing self-weight / 基础自重"
          formula={`G_{foot} = \\gamma_c B L t = ${tx(inputs.concreteDensity)}\\times${tx(fd.B)}\\times${tx(fd.L)}\\times${tx(fd.tf)} = ${tx(fd.Gfooting)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Total axial / 总轴力"
          formula={`N_{total} = N^*+G_{foot} = ${tx(fd.Ntotal)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Footing area & section modulus / 基底面积与截面模量"
          formula={`A = B\\times L = ${tx(fd.A)}\\,\\mathrm{m^2}, \\quad Z = \\frac{B L^2}{6} = ${tx(fd.Z)}\\,\\mathrm{m^3}`} />
        <CalculationFormula caption="Base pressure / 基底压力" highlight
          formula={`q_{max} = \\frac{N}{A}+\\frac{M}{Z} = ${tx(fd.qMax, 0)}\\,\\mathrm{kPa}, \\quad q_{min} = ${tx(fd.qMin, 0)}\\,\\mathrm{kPa}`}
          status={mkStatus(fc.bearingPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Bearing UR / 承压利用率" highlight
          formula={`UR_{foot} = \\frac{q_{max}}{q_{allow}} = \\frac{${tx(fd.qMax, 0)}}{${tx(fd.qAllow, 0)}} = ${txUR(fd.bearingRatio)}`}
          status={mkStatus(fc.bearingPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Sliding / 抗滑移" highlight
          formula={`UR_{slide} = \\frac{V^*}{\\mu N} = \\frac{${tx(Vstar)}}{${tx(fd.mu)}\\times${tx(fd.Ntotal)}} = ${txUR(fd.slidingRatio)}`}
          status={mkStatus(fc.slidingPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   12. Utilisation Summary
   --------------------------------------------------------------------------- */
function UtilisationSummaryBlock({ inPlane, outOfPlane, connection, foundation }) {
  const ip = inPlane || {};
  const op = outOfPlane || {};
  const cn = connection || {};
  const fd = foundation || {};
  const rows = [
    ["In-plane: Compression σmax,ser ≤ 0.6f'c", null, ip.checks?.stressCompressionPass],
    ['In-plane: Lintel bearing UR', ip.bearing?.bearingRatio, ip.checks?.bearingPass],
    ['In-plane: N-M interaction UR', ip.interaction?.interactionRatio, ip.checks?.interactionPass],
    ['In-plane: Boundary N-M UR', ip.boundaryNM?.checks?.governingUR ?? null, ip.checks?.boundaryNMPass],
    ['In-plane: Shear UR', ip.shear?.shearRatio, ip.checks?.shearPass],
    ['In-plane: Tension / boundary steel', null, ip.checks?.tensionPass],
    ['In-plane: Section size (shear)', null, ip.checks?.sectionSizeOK],
    ['In-plane: Min horizontal steel', null, ip.checks?.minSteelOK],
    ['In-plane: Spacing limits', null, ip.checks?.spacingOK],
    ['In-plane: Vertical ratio (shear)', null, ip.checks?.verticalRatioOK],
    ['OOP: UR1 Mid-height P-Δ', op.UR1, Number.isFinite(op.UR1) && op.UR1 <= 1],
    ['OOP: UR2 Base moment', op.UR2, Number.isFinite(op.UR2) && op.UR2 <= 1],
    ['OOP: UR3 Fire', op.UR3, Number.isFinite(op.UR3) && op.UR3 <= 1],
    ['OOP: UR4 Shear', op.UR4, Number.isFinite(op.UR4) && op.UR4 <= 1],
    ['OOP: UR5 Foundation bearing', op.UR5, Number.isFinite(op.UR5) && op.UR5 <= 1],
    ['OOP: UR6 Footing flexure', op.UR6, Number.isFinite(op.UR6) && op.UR6 <= 1],
    ['Connection: Shear UR', cn.ratios?.shearRatio, cn.checks?.shearPass],
    ['Connection: Bond UR', cn.ratios?.bondRatio, Number.isFinite(cn.ratios?.bondRatio) && cn.ratios?.bondRatio <= 1],
    ['Connection: Uplift UR', cn.ratios?.tensionRatio, cn.checks?.tensionPass],
    ['Connection: Grout bearing UR', cn.ratios?.bearingRatio, cn.checks?.bearingPass],
    ['Connection: Development length', null, cn.checks?.developmentOK],
    ['In-plane footing: Bearing UR', fd.bearingRatio, fd.checks?.bearingPass],
    ['In-plane footing: Sliding UR', fd.slidingRatio, fd.checks?.slidingPass],
    ['OOP slenderness h/t (warning)', null, !(ip.checks?.slendernessWarning)]
  ];

  return (
    <CalculationSection number="12" title="Utilisation Summary · 利用率汇总" chip={<Chip size="small" label="UR ≤ 1.00" />}>
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
                  <Chip size="small"
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
   CALCULATION TAB main
   --------------------------------------------------------------------------- */
function CalculationTab({ inputs, results }) {
  const ResultInPlane = results.inPlane || {};
  const ResultOutOfPlane = results.outOfPlane || {};
  const ResultConnection = results.connection || {};
  const ResultFoundation = results.foundation || {};
  const ResultSummary = results.summary || {};

  return (
    <Box>
      <Alert severity={ResultSummary.overallPass ? 'success' : 'warning'} sx={{ mb: 2, fontWeight: 700 }}>
        {ResultSummary.overallPass
          ? '✓ All implemented checks pass under current inputs.'
          : '✗ Some checks did not pass. Review sections below.'}
      </Alert>
      <CalculationSection number="0" title="Input Data Used · 输入参数汇总" chip={<Chip size="small" label="Live inputs" />}>
        <InputSummaryTable inputs={inputs} />
      </CalculationSection>
      <GeoBlock inputs={inputs} ResinPlane={ResultInPlane} ResoutOfPlane={ResultOutOfPlane} />
      <LoadDerivationBlock inputs={inputs} ResinPlane={ResultInPlane} ResoutOfPlane={ResultOutOfPlane} />
      <InPlaneSeismicBlock inputs={inputs} inPlane={ResultInPlane} />
      <InPlaneActionsBlock inputs={inputs} inPlane={ResultInPlane} />
      <InPlaneChecksBlock inputs={inputs} inPlane={ResultInPlane} />
      <OutOfPlaneWindSeismicBlock inputs={inputs} outOfPlane={ResultOutOfPlane} />
      <OutOfPlaneFireBlock inputs={inputs} outOfPlane={ResultOutOfPlane} />
      <StabilityBlock inputs={inputs} inPlane={ResultInPlane} outOfPlane={ResultOutOfPlane} />
      <LintelBoundaryElementBlock inputs={inputs} inPlane={ResultInPlane} />
      <BaseConnectionBlock inputs={inputs} connection={ResultConnection} />
      <FoundationBlock inputs={inputs} inPlane={ResultInPlane} outOfPlane={ResultOutOfPlane} foundation={ResultFoundation} />
      <UtilisationSummaryBlock inPlane={ResultInPlane} outOfPlane={ResultOutOfPlane} connection={ResultConnection} foundation={ResultFoundation} />
    </Box>
  );
}

/* ============================================================================
   RESULTS TAB
   ============================================================================ */
function ResultsTab({ inputs, results }) {
  const inPlane = results.inPlane || {};
  const outOfPlane = results.outOfPlane || {};
  const connection = results.connection || {};
  const foundation = results.foundation || {};
  const summary = results.summary || {};
  const pass = summary.overallPass;
  const sc = outOfPlane.supportConditions || {};
  const bn = inPlane.boundaryNM || {};
  const pd = outOfPlane.pDelta || {};
  const ps = outOfPlane.partSeismic || {};
  const oopSh = outOfPlane.oopShear || {};

  return (
    <Box>
      <Alert severity={pass ? 'success' : 'error'} sx={{ mb: 2, fontWeight: 700 }}>
        {pass ? '✓ Current calculation result satisfies the implemented checks.' : '✗ Current calculation result requires review.'}
      </Alert>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Structural Model Diagram</Typography>
        <PrecastPanelSVG inputs={inputs} results={results} />
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>In-Plane Design Summary</Typography>
        <ResultRow label="N (Compression)" value={fmt(inPlane.sectionActions?.NseismicCompression, 2)} unit="kN" />
        <ResultRow label="V (Shear)" value={fmt(inPlane.sectionActions?.Vtotal, 2)} unit="kN" pass={inPlane.checks?.shearPass} />
        <ResultRow label="M* (Moment)" value={fmt(inPlane.sectionActions?.Mtotal, 2)} unit="kN·m" />
        <ResultRow label="N-M Interaction Ratio" value={fmt(inPlane.interaction?.interactionRatio, 3)} unit="UR" pass={inPlane.checks?.interactionPass} highlight />
        <ResultRow label="Shear Ratio" value={fmt(inPlane.shear?.shearRatio, 3)} unit="UR" pass={inPlane.checks?.shearPass} />
        <ResultRow label="Bearing Ratio" value={fmt(inPlane.bearing?.bearingRatio, 3)} unit="UR" pass={inPlane.checks?.bearingPass} />
        <ResultRow label="Slenderness h/t" value={fmt(inPlane.slenderness?.outOfPlaneSlenderness, 2)} unit="" pass={!inPlane.checks?.slendernessWarning} warning={inPlane.checks?.slendernessWarning} />
        <ResultRow label="Section size OK" value={inPlane.checks?.sectionSizeOK ? 'PASS' : 'CHECK'} unit="" pass={inPlane.checks?.sectionSizeOK} />
        <ResultRow label="Min steel OK" value={inPlane.checks?.minSteelOK ? 'PASS' : 'CHECK'} unit="" pass={inPlane.checks?.minSteelOK} />
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Boundary Element Local N-M</Typography>
        {bn.available === false ? (
          <Alert severity="info">Boundary element local N-M check not applicable.</Alert>
        ) : (
          <>
            <ResultRow label="Boundary section (bc × hc)" value={`${fmt(bn.section?.bc, 0)} × ${fmt(bn.section?.hc, 0)}`} unit="mm" />
            <ResultRow label="Boundary steel As,total" value={fmt(bn.section?.AsTotal, 0)} unit="mm²" />
            <ResultRow label="φP0" value={fmt(bn.keyPoints?.phiP0, 0)} unit="kN" />
            <ResultRow label="Balanced (φNb, φMb)" value={`${fmt(bn.keyPoints?.phiNb, 0)} / ${fmt(bn.keyPoints?.phiMb, 1)}`} unit="kN / kN·m" />
            <ResultRow label="φM0" value={fmt(bn.keyPoints?.phiM0, 1)} unit="kN·m" />
            <ResultRow label="Governing (N, M*)" value={`${fmt(bn.governing?.N, 1)} / ${fmt(bn.governing?.M, 2)}`} unit="kN / kN·m" />
            <ResultRow label="Boundary N-M UR" value={fmt((bn.checks?.governingUR || 0) * 100, 1)} unit="%" pass={inPlane.checks?.boundaryNMPass} highlight />
            <Box sx={{ mt: 1.5 }}><NMInteractionChart boundary={bn} /></Box>
          </>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Out-of-Plane Design Summary</Typography>
        <ResultRow label="Support (Wind & Seismic)" value={sc.windSeismic || 'Pinned-Pinned'} unit="" />
        <ResultRow label="Support (Fire)" value={sc.fire || 'Fixed-Free'} unit="" />
        <ResultRow label="Mid-Height UR1" value={fmt((outOfPlane.UR1 || 0) * 100, 1)} unit="%" pass={outOfPlane.UR1 <= 1} />
        <ResultRow label="Base Moment UR2" value={fmt((outOfPlane.UR2 || 0) * 100, 1)} unit="%" pass={outOfPlane.UR2 <= 1} />
        <ResultRow label="Fire UR3" value={fmt((outOfPlane.UR3 || 0) * 100, 1)} unit="%" pass={outOfPlane.UR3 <= 1} />
        <ResultRow label="Shear UR4" value={fmt((outOfPlane.UR4 || 0) * 100, 1)} unit="%" pass={outOfPlane.UR4 <= 1} />
        <ResultRow label="Bearing UR5" value={fmt((outOfPlane.UR5 || 0) * 100, 1)} unit="%" pass={outOfPlane.UR5 <= 1} />
        <ResultRow label="Footing UR6" value={fmt((outOfPlane.UR6 || 0) * 100, 1)} unit="%" pass={outOfPlane.UR6 <= 1} />
        <ResultRow label="Overall OOP" value={outOfPlane.overallOK ? 'PASS' : 'FAIL'} pass={outOfPlane.overallOK} highlight />
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>OOP Part Seismic (AS/NZS 1170.5 Ch.8)</Typography>
        <ResultRow label="C0 (site hazard)" value={fmt(ps.partC0, 3)} unit="" />
        <ResultRow label="CHi (height amplification)" value={fmt(ps.CHi, 3)} unit="" />
        <ResultRow label="Ci(Tp) (period factor)" value={fmt(ps.partCiTp, 3)} unit="" />
        <ResultRow label="Cp(Tp)" value={fmt(ps.partCpTp, 3)} unit="" />
        <ResultRow label="Cph (response)" value={fmt(ps.partCph, 3)} unit="" />
        <ResultRow label="Rp (risk)" value={fmt(ps.partRp, 3)} unit="" />
        <ResultRow label="Tp (part period)" value={fmt(ps.partPeriod, 3)} unit="s" />
        <ResultRow label="Wp (panel weight)" value={fmt(ps.Wp_panel, 3)} unit="kPa" />
        <ResultRow label="Fp (design pressure)" value={fmt(ps.Fp_panel, 3)} unit="kPa" highlight />
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>P-Delta & OOP Properties</Typography>
        <ResultRow label="Ec" value={fmt(outOfPlane.Ec, 0)} unit="MPa" />
        <ResultRow label="AWV" value={fmt(outOfPlane.AWV, 1)} unit="mm²/m" />
        <ResultRow label="AWH" value={fmt(outOfPlane.AWH, 1)} unit="mm²/m" />
        <ResultRow label="φMn" value={fmt(outOfPlane.phiMn, 2)} unit="kN·m/m" />
        <ResultRow label="Icr" value={fmt(pd.Icr, 0)} unit="mm⁴/m" />
        <ResultRow label="P-Delta factor λ" value={fmt(pd.pDeltaFactor, 4)} unit="" pass={pd.pDeltaStable} />
        <ResultRow label="M' (P-Delta)" value={fmt(pd.M_prime, 2)} unit="kN·m/m" />
        <ResultRow label="Δu" value={fmt(pd.delta_u, 1)} unit="mm" />
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>OOP Shear (Cl 12.7)</Typography>
        <ResultRow label="d (OOP)" value={fmt(oopSh.d_oop, 0)} unit="mm" />
        <ResultRow label="kd" value={fmt(oopSh.kd_oop, 3)} unit="" />
        <ResultRow label="vb" value={fmt(oopSh.vb_oop, 3)} unit="MPa" />
        <ResultRow label="vc" value={fmt(oopSh.vc_oop, 3)} unit="MPa" />
        <ResultRow label="Vc" value={fmt(oopSh.Vc_oop, 2)} unit="kN/m" />
        <ResultRow label="Vs" value={fmt(oopSh.Vs_oop, 2)} unit="kN/m" />
        <ResultRow label="φVn" value={fmt(oopSh.phiVn_oop, 2)} unit="kN/m" />
        <ResultRow label="V'" value={fmt(outOfPlane.Vprime, 2)} unit="kN/m" />
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Connection Design (Cl 7.7)</Typography>
        <ResultRow label="Shear demand V*" value={fmt(connection.demand?.Vstar, 2)} unit="kN" />
        <ResultRow label="Dowel shear V_dowel" value={fmt(connection.dowel?.Vdowel, 2)} unit="kN" />
        <ResultRow label="Shear friction Vsf" value={fmt(connection.friction?.Vsf, 2)} unit="kN" />
        <ResultRow label="φVsf" value={fmt(connection.capacity?.phiVsf, 2)} unit="kN" />
        <ResultRow label="Shear UR" value={fmt((connection.ratios?.shearRatio || 0) * 100, 1)} unit="%" pass={connection.checks?.shearPass} highlight />
        <ResultRow label="Bond UR" value={fmt((connection.ratios?.bondRatio || 0) * 100, 1)} unit="%" pass={Number.isFinite(connection.ratios?.bondRatio) && connection.ratios?.bondRatio <= 1} />
        <ResultRow label="Uplift demand T*" value={fmt(connection.demand?.Tstar, 2)} unit="kN" />
        <ResultRow label="Uplift capacity φT" value={fmt(connection.capacity?.phiTconn, 2)} unit="kN" />
        <ResultRow label="Tension UR" value={fmt((connection.ratios?.tensionRatio || 0) * 100, 1)} unit="%" pass={connection.checks?.tensionPass} />
        <ResultRow label="Grout bearing UR" value={fmt((connection.ratios?.bearingRatio || 0) * 100, 1)} unit="%" pass={connection.checks?.bearingPass} />
        <ResultRow label="Development length" value={`${fmt(connection.dowel?.embedment, 0)} / ${fmt(connection.dowel?.ld_required, 0)}`} unit="mm" pass={connection.checks?.developmentOK} highlight />
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>In-Plane Foundation</Typography>
        <ResultRow label="Footing self-weight" value={fmt(foundation.Gfooting, 2)} unit="kN" />
        <ResultRow label="Total axial N" value={fmt(foundation.Ntotal, 2)} unit="kN" />
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
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>OOP Additional Point Loads</Typography>
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
          <ResultRow label="Layers" value={fmt(inPlane.reinforcement?.numLayers, 0)} unit="" />
          <ResultRow label="Vertical bars" value={fmt(inPlane.reinforcement?.nVerticalBars, 0)} unit="bars" />
          <ResultRow label="Distributed As" value={fmt(inPlane.reinforcement?.AsDistributed, 1)} unit="mm²" />
          <ResultRow label="Vertical ρ" value={fmt(safe(inPlane.reinforcement?.rhoVertical) * 100, 3)} unit="%" />
          <ResultRow label="Horizontal As/m" value={fmt(inPlane.reinforcement?.AsHorizontalPerM, 1)} unit="mm²/m" />
          <ResultRow label="Horizontal ρ" value={fmt(safe(inPlane.reinforcement?.rhoHorizontal) * 100, 3)} unit="%" />
          <ResultRow label="Boundary As" value={fmt(inPlane.reinforcement?.AsBoundary, 1)} unit="mm²" />
          <ResultRow label="Boundary tension" value={fmt(inPlane.reinforcement?.boundarySteelTensionCapacity, 2)} unit="kN" />
        </AccordionDetails>
      </Accordion>

      <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
        The UI displays results from the calculation engine (v0.8). Final design must be verified against applicable NZ Standards and project-specific requirements.
      </Alert>
    </Box>
  );
}

/* ============================================================================
   MAIN COMPONENT
   ============================================================================ */
export default function PrecastPanel() {
  const [activeTab, setActiveTab] = useState(0);
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [reportOpen, setReportOpen] = useState(false);
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
    VbarDia: safe(inputs.VbarDia),
    VbarSpace: safe(inputs.VbarSpace),
    HbarDia: safe(inputs.HbarDia),
    HbarSpace: safe(inputs.HbarSpace),
    BarLayers: safe(inputs.BarLayers),
    FootBarDia: safe(inputs.FootBarDia),
    FootBarSpace: safe(inputs.FootBarSpace),
    MeshArea: safe(inputs.MeshArea),
    boundaryWidth: safe(inputs.boundaryWidth),
    boundaryThickness: safe(inputs.boundaryThickness, safe(inputs.wallThickness)),
    boundaryBarDiameter: safe(inputs.boundaryBarDiameter),
    boundaryBarCount: safe(inputs.boundaryBarCount),
    boundaryTieDiameter: safe(inputs.boundaryTieDiameter),
    boundaryTieSpacing: safe(inputs.boundaryTieSpacing),
    gUniform: safe(inputs.gUniform),
    qUniform: safe(inputs.qUniform),
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
    spectralShapeFactor: safe(inputs.spectralShapeFactor),
    nearFaultFactor: safe(inputs.nearFaultFactor),
    seismicWeight: safe(inputs.seismicWeight),
    seismicDistributionFactor: safe(inputs.seismicDistributionFactor),
    psiE: safe(inputs.psiE),
    partSpectralShapeFactorT0: safe(inputs.partSpectralShapeFactorT0),
    partHeightHx: safe(inputs.partHeightHx),
    buildingHeightHn: safe(inputs.buildingHeightHn),
    partImportanceFactor: safe(inputs.partImportanceFactor),
    partRiskFactor: safe(inputs.partRiskFactor),
    partDuctility: safe(inputs.partDuctility),
    partPeriod: safe(inputs.partPeriod),
    buildingPeriod: safe(inputs.buildingPeriod),
    importanceFactor: safe(inputs.importanceFactor),
    bearingWidth: safe(inputs.bearingWidth),
    bearingLength: safe(inputs.bearingLength),
    supportWindSeismic: inputs.supportWindSeismic || 'Pinned-Pinned',
    supportFire: inputs.supportFire || 'Fixed-Free',
    effectiveLengthFactor: safe(inputs.effectiveLengthFactor, 1),
    phiFlexure: safe(inputs.phiFlexure, 0.85),
    phiShear: safe(inputs.phiShear, 0.75),
    phiCompression: safe(inputs.phiCompression, 0.85),
    qU: safe(inputs.qU),
    baseDowelDiameter: safe(inputs.baseDowelDiameter),
    baseDowelCount: safe(inputs.baseDowelCount),
    baseDowelEmbedment: safe(inputs.baseDowelEmbedment),
    groutStrength: safe(inputs.groutStrength),
    shearKey: inputs.shearKey === true || inputs.shearKey === 'yes',
    shearKeyDepth: safe(inputs.shearKeyDepth),
    frictionCoefficient: safe(inputs.frictionCoefficient),
    phiConnection: safe(inputs.phiConnection),
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
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' } }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main' }}>
                Precast Concrete Slender Panel
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Unified In-Plane + Out-of-Plane + Connection + Foundation Design (v0.8)
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip label={statusLabel} color={statusColor}
                icon={results.summary?.overallPass ? <CheckCircleIcon /> : <WarningAmberIcon />}
                sx={{ fontWeight: 800 }} />
               {/* "Summary Report" 按钮 */}
               <Button variant="contained" size="small" startIcon={<PictureAsPdfIcon />}
                 onClick={() => setReportOpen(true)}> Summary Report
               </Button>
               {/* "Detail Report" 按钮 */}
               <Button variant="contained" size="small" color="secondary" startIcon={<PictureAsPdfIcon />}
                 onClick={() => setDetailReportOpen(true)}> Detail Report
               </Button>
               <Button variant="outlined" size="small" startIcon={<RestartAltIcon />}
                 onClick={handleReset}> Reset
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

      <PrecastPanelReportDialog open={reportOpen} onClose={() => setReportOpen(false)} inputs={calculationInput} results={results} />
      <PrecastPanelDetailReportDialog open={detailReportOpen} onClose={() => setDetailReportOpen(false)} inputs={calculationInput} results={results} />
    </Box>
  );
}