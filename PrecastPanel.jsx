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
/* 所有的输入内容都在config内定义 */
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
        <Typography variant="caption"
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
      <Paper variant="outlined"
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
      <Typography variant="subtitle2"
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
   INPUT COMPONENTS
============================================================================ */
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
      {/* <Alert severity="info" sx={{ mb: 2 }}>
        Wall Geometry, Reinforcement and Gravity Loads are shared between In-Plane and OOP.
        Section 12 provides two separate support conditions: one for Wind & Seismic checks,
        one for the Fire check. Section 14 / 15 feed the v0.5 connection and in-plane
        foundation calculation modules.
      </Alert> */}
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
              Connection check model: Dowel shear (min of steel & grout bond) + Shear friction μN + Shear key (optional),
              plus uplift and grout bed bearing checks. All capacities multiplied by ϕ Connection.
            </Alert>
          )}
          {section.id === 'inPlaneFoundation' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              In-plane footing checks: Base pressure q = N/A + M/Z ≤ allowable bearing; Sliding V* ≤ μN.
              OOP bearing and footing flexure covered by UR5/UR6 (Section 13 qU).
            </Alert>
          )}
          {/* v0.6.2 —— 提示 Lintel 偏心反力将触发边缘构件局部压弯 N-M 验算（Section 10 + 11 参数） */}
          {section.id === 'boundary' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Boundary element parameters feed the local compression-bending N-M check (Section 4.7):
              lintel reaction at wall edge + tributary gravity, with interaction curve plotted.
            </Alert>
          )}
        </InputSection>
      ))}
    </Box>
  );
}

/* ============================================================================
   CALCULATION TAB — 如下是被Calculation Tab调用的各个模块
============================================================================ */
const SUPPORT_MOMENT_TABLE = [
  { key: 'Pinned-Pinned', label: 'Pinned – Pinned', mid: '1/8', midVal: 0.125, base: '1/8', baseVal: 0.125 },
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
    /* v0.6 —— overal 地震参数 */
    ['Z (危险系数)', tx(inputs.hazardFactor), ''],
    ['Ru (重现期系数)', tx(inputs.returnPeriodFactor), ''],
    ['μ (延性系数)', tx(inputs.ductility), ''],
    ['Sp (结构性能系数)', tx(inputs.structuralPerformanceFactor), ''],
    ['Ch(T) (反应谱形状系数)', tx(inputs.spectralShapeFactor), ''],
    ['N(T,D) (近断层系数)', tx(inputs.nearFaultFactor), ''],
    ['ψe (抗震组合系数)', tx(inputs.psiE), ''],
    /* v0.7 —— OOP part 地震参数 */
    ['OOP part coefficient Cp (平面外 part 系数, Table 8.1)', tx(inputs.partResponseCoefficient), ''],
    ['OOP part hx / hn → H (part 高度放大系数)', `${tx(inputs.partHeightHx)} / ${tx(inputs.buildingHeightHn)} → ${tx(safe(inputs.buildingHeightHn) > 0 ? 1 + 2 * Math.min(safe(inputs.partHeightHx) / safe(inputs.buildingHeightHn), 1) : 1, 3)}`, 'm'],
    ['OOP Part ap (Importance)', tx(inputs.partImportanceFactor), ''],
    ['OOP Part Rp (Modification)', tx(inputs.partResponseModification), ''],
    ['OOP Part μp (Ductility)', tx(inputs.partDuctility), ''],
    ['OOP Part Tp (Period)', tx(inputs.partPeriod), 's'],
    ['Building Tn (Period)', tx(inputs.buildingPeriod), 's'],
    ['Building Importance I', tx(inputs.importanceFactor), ''],
    /* bar and others */
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
   Geometry
--------------------------------------------------------------------------- */
function GeoBlock({ inputs, ResinPlane, ResoutOfPlane }) {
  const inplanegravity = ResinPlane.gravity || {};
  const geo = ResinPlane.geometry || {};
  const oopdata = ResoutOfPlane || {};
  const re = ResinPlane.reinforcement || {};
  const nV = re.nVerticalBars ?? 0;
  const sl = ResinPlane.slenderness || {};
  const ch = ResinPlane.checks || {};

  return (
    <CalculationSection number="1" title="Geometry & Properities · 几何与特性" chip={<Chip size="small" label="AS/NZS 1170.0 / 1170.1" />}>
      <CalculationSubsection title="1.1 In-plane section properties · 平面内截面特性">
        <CalculationFormula caption="Gross area / 毛截面面积"
          formula={`A_g = (b\\times1000)(t\\times1000) = (${tx(geo.bwall)}\\times1000)(${tx(geo.twall)}\\times1000) = ${tx(geo.Ag, 0)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Second moment of area / 惯性矩"
          formula={`I = \\frac{(b\\times1000)^3(t\\times1000)}{12} = \\frac{(${tx(geo.bwall)}\\times1000)^3(${tx(geo.twall)}\\times1000)}{12} = ${tx(geo.I, 0)}\\,\\mathrm{mm^4}`} />
        <CalculationFormula caption="Section modulus / 截面模量"
          formula={`Z_g = \\frac{(b\\times1000)^2(t\\times1000)}{6} = \\frac{(${tx(geo.bwall)}\\times1000)^2(${tx(geo.twall)}\\times1000)}{6} = ${tx(geo.Zg, 0)}\\,\\mathrm{mm^3}`} />
      </CalculationSubsection>

      <CalculationSubsection title="1.2 Reinforcement properties · 配筋特性 (bar count from spacing)">
        <CalculationFormula caption="Number of vertical bars / 竖向分布筋根数"
          formula={`n_v = \\left\\lfloor\\frac{b\\times1000}{s_v}\\right\\rfloor + 1 = \\left\\lfloor\\frac{${tx(geo.bwall, 2)}\\times1000}{${tx(inputs.VbarSpace, 0)}}\\right\\rfloor + 1 = ${tx(nV, 0)}`} />
        <CalculationFormula caption="Distributed vertical steel / 竖向分布筋面积"
          formula={`A_{v,dist} = n_v\\pi\\phi_v^2/4 = ${tx(nV, 0)}\\times\\pi\\times${tx(inputs.VbarDia, 0)}^2/4 = ${tx(re.AsDistributed, 1)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Vertical reinforcement ratio / 竖向配筋率"
          formula={`\\rho_v = A_{s,dist}/A_g = \\frac{${tx(re.AsDistributed, 1)}}{${tx(geo.Ag, 0)}} = ${tx(safe(re.rhoVertical) * 100, 3)}\\%`} />
        <CalculationFormula caption="Boundary steel / 边缘构件纵筋"
          formula={`A_{s,b} = n_b\\pi\\phi_b^2/4 = ${tx(inputs.boundaryBarCount, 0)}\\times\\pi\\times${tx(inputs.boundaryBarDiameter, 0)}^2/4 = ${tx(re.AsBoundary, 1)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Boundary reinforcement ratio / 边缘构件配筋率"
          formula={`\\rho_b = \\frac{A_{s,b}}{A_{boundary}} = \\frac{${tx(re.AsBoundary, 1)}}{${tx(inputs.boundaryWidth)} \\times1000 \\times ${tx(inputs.boundaryThickness)} \\times1000} = ${tx(safe(re.rhoBoundary) * 100, 3)}\\%`} />
        <CalculationFormula caption="Boundary steel tensile capacity / 边缘钢筋抗拉能力"
          formula={`T_{s,b} = A_{s,b}f_y/1000 = ${tx(re.AsBoundary, 1)}\\times${tx(inputs.fy)}/1000 = ${tx(re.boundarySteelTensionCapacity)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>

      <CalculationSubsection title="5.2 Slenderness classification · 长细比与分类">
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
   2. In-Plane Seismic Action (Load Derivation)
--------------------------------------------------------------------------- */
function LoadDerivationBlock({ inputs, ResinPlane, ResoutOfPlane }) {
  const inplanegravity = ResinPlane.gravity || {};
  const geo = ResinPlane.geometry || {};
  const oopdata = ResoutOfPlane || {};
  const re = ResinPlane.reinforcement || {};
  const nV = re.nVerticalBars ?? 0;

  return (
    <CalculationSection number="2" title="Load Derivation · 荷载推算" chip={<Chip size="small" label="AS/NZS 1170.0 / 1170.1" />}>
      <CalculationSubsection title="2.1 Roof pressures → line loads · 屋面压力 → 线荷载 (line load = pressure × Sr)">
        <CalculationFormula caption="Dead line load / 永久荷载线荷载"
          formula={`g_{line} = g\\times S_r = (${tx(inputs.gUniform)}\\,\\mathrm{kPa})(${tx(inputs.Sr)}\\,\\mathrm{m}) = ${tx(inplanegravity.gLineLoad)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Live line load / 活荷载线荷载"
          formula={`q_{line} = q\\times S_r = (${tx(inputs.qUniform)}\\,\\mathrm{kPa})(${tx(inputs.Sr)}\\,\\mathrm{m}) = ${tx(inplanegravity.qLineLoad)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Roof wind line load / 屋面风压线荷载"
          formula={`w_{wd,line} = w_{wd}\\times S_r = (${tx(inputs.wwd)}\\,\\mathrm{kPa})(${tx(inputs.Sr)}\\,\\mathrm{m}) = ${tx(safe(inputs.wwd) * safe(inputs.Sr, 1))}\\,\\mathrm{kN/m}`} />
      </CalculationSubsection>

      <CalculationSubsection title="2.2 In-plane self-weight & gravity ULS · 平面内自重与重力组合">
        <CalculationFormula caption="Wall self-weight / 墙体自重"
          formula={`G_{wall} = \\gamma_c\\,t\\,h\\,b = ${tx(inputs.concreteDensity)}\\times${tx(inputs.wallThickness)}\\times${tx(inputs.wallHeight)}\\times${tx(inputs.wallWidth)} = ${tx(inplanegravity.Gwall)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Total permanent line load / 顶部永久线荷载合计"
          formula={`G_{line,total} = g_{line}\\times b = ${tx(inplanegravity.gLineLoad)}\\times${tx(geo.bwall)} = ${tx(inplanegravity.GlineTotal)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Total imposed line load / 顶部活线荷载合计"
          formula={`Q_{line,total} = q_{line}\\times b = ${tx(inplanegravity.qLineLoad)}\\times${tx(geo.bwall)} = ${tx(inplanegravity.QlineTotal)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Gravity ULS axial force / 重力 ULS 轴力" highlight
          formula={`N^*_{gravity} = 1.2(G_{wall}+G_{line,total}+N_{lintel}) + 1.5\\,Q_{line,total} = 1.2\\times(${tx(inplanegravity.Gwall)}+${tx(inplanegravity.GlineTotal)}+${tx(inplanegravity.lintelReaction)}) + 1.5\\times(${tx(inplanegravity.QlineTotal)}) = ${tx(inplanegravity.Ngravity)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>

      <CalculationSubsection title="2.3 OOP gravity axial force · 平面外重力轴力">
        <CalculationFormula caption="Roof dead line load / 屋面恒载"
          formula={`W_d = S_r\\,w_d = ${tx(inputs.Sr)}\\times${tx(inputs.gUniform)} = ${tx(oopdata.Wd_line)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Wall self-weight above mid-height / 墙体自重（半高以上）"
          formula={`N_{SW} = \\gamma_ct_w\\cdot\\frac{H_w-t_f}{2} = ${tx(inputs.concreteDensity, 0)}\\cdot${tx(inputs.wallThickness)}\\cdot\\frac{${tx(inputs.wallHeight, 0)}-${tx(inputs.tf, 2)}}{2} = ${tx(oopdata.NSW)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Footing weight / 基础自重"
          formula={`N_{FF} = \\gamma_cL_ft_f = ${tx(inputs.concreteDensity, 0)}\\cdot${tx(inputs.Lf, 1)}\\cdot${tx(inputs.tf, 1)} = ${tx(oopdata.NFF)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Slab weight / 地面板自重"
          formula={`N_{SF} = \\gamma_c(L_f+2f_o)t_s = ${tx(inputs.concreteDensity, 0)}\\cdot(${tx(inputs.Lf, 0)}+2\\times${tx(inputs.fo, 2)})\\cdot${tx(inputs.ts, 2)} = ${tx(oopdata.NSF)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Hardfill weight / 硬填层自重"
          formula={`N_{HF} = \\gamma_s(L_f+2f_o)d_s = ${tx(inputs.gs, 0)}\\cdot(${tx(inputs.Lf, 0)}+2\\times${tx(inputs.fo, 2)})\\cdot${tx(inputs.ds, 2)} = ${tx(oopdata.NHF)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Effective gravity axial force / 有效重力轴力" highlight
          formula={`N_{GE} = N_{SW}+N_{FF}+N_{SF}+N_{HF}+W_d = ${tx(oopdata.NSW)}+${tx(oopdata.NFF)}+${tx(oopdata.NSF)}+${tx(oopdata.NHF)}+${tx(oopdata.Wd_line)} = ${tx(oopdata.N_GE)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="ULS gravity envelope / ULS 重力包络"
          formula={`N_{max} = \\max(1.35\\,N_{GE},\\;1.2\\,N_{GE}+1.5\\,W_q) = \\max(1.35\\times${tx(oopdata.N_GE)},\\;1.2\\times${tx(oopdata.N_GE)}+1.5\\times(${tx(inputs.qUniform)})(${tx(inputs.Sr)})) = ${tx(oopdata.Nmax)}\\,\\mathrm{kN/m}`} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   3. In-Plane Seismic Action
--------------------------------------------------------------------------- */
function InPlaneSeismicBlock({ inputs, inPlane, ResoutOfPlane }) {
  const inplaneseismic = inPlane.seismic || {};
  const gravity = inPlane.gravity || {};

  return (
    <CalculationSection number="3" title="In-Plane Seismic Action · 平面内抗震作用" chip={<Chip size="small" label="AS/NZS 1170.5 §3.2.2" />}>
      <CalculationFormula caption="Elastic site hazard coefficient / 弹性场地危险系数"
        formula={`C(T_1) = C_h(T_1)\\,Z\\,R_u\\,N(T,D) = ${tx(inplaneseismic.Ch)}\\times${tx(inplaneseismic.Z)}\\times${tx(inplaneseismic.Ru)}\\times${tx(inplaneseismic.Nt)} = ${tx(inplaneseismic.CT1, 4)}`} />
      <CalculationFormula caption="Structural performance factor ULS / 结构性能系数"
        formula={`S_p = 1.3 - 0.3\\mu = 1.3 - 0.3\\times${tx(inplaneseismic.mu)} = ${tx(inplaneseismic.Sp)}`} />
      <CalculationFormula caption="Design action coefficient ULS / 设计作用系数"
        formula={`C_d(T_1) = \\frac{C(T_1)S_p}{k_\\mu} = ${tx(inplaneseismic.CT1, 4)}\\times\\frac{${tx(inplaneseismic.Sp)}}{${tx(inplaneseismic.mu)}} = ${tx(inplaneseismic.Cd, 4)}`} />
      <CalculationFormula caption="Seismic SelfWeight / 地震重力荷载"
        formula={`W_i = G_i + \\sum_{i=1}^{n} \\psi_E Q = ${tx(gravity.Gwall, 2)}+${tx(gravity.GlineTotal, 2)}+${tx(inplaneseismic.psiE)}\\times${tx(gravity.QlineTotal)} = ${tx(inplaneseismic.seismicGravity)}\\mathrm{kN}`} />
      <CalculationFormula caption="Seismic Wall In-plane base shear / 地震平面内基底剪力" highlight
        formula={`V^*_{seismic} = C_d\\,W_i = ${tx(inplaneseismic.Cd, 4)}\\times${tx(inplaneseismic.seismicGravity)} = ${tx(inplaneseismic.Vseismic)}\\,\\mathrm{kN}`} />
      <CalculationFormula caption="Seismic Wall overturning moment / 抗震倾覆弯矩" highlight
        formula={`M^*_{seismic} = V^*_{seismic}\\,h = ${tx(inplaneseismic.Vseismic)}\\times${tx(inputs.wallHeight)} = ${tx(inplaneseismic.Mseismic)}\\,\\mathrm{kN\\cdot m}`} />
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   4. Combined In-Plane Actions
--------------------------------------------------------------------------- */
function InPlaneActionsBlock({ inputs, inPlane }) {
  const gravity = inPlane.gravity || {};
  const seismic = inPlane.seismic || {};
  const diaphragm = inPlane.diaphragm || {};
  const sectionactions = inPlane.sectionActions || {};
  const diaV = Math.max(safe(diaphragm.VdiaphragmWind), safe(diaphragm.VdiaphragmSeismic));
  const diaM = Math.max(safe(diaphragm.MdiaphragmWind), safe(diaphragm.MdiaphragmSeismic));

  return (
    <CalculationSection number="4" title="Combined In-Plane Actions · 平面内组合内力" chip={<Chip size="small" label="Seismic + Diaphragm + Lintel" />}>
      <CalculationSubsection title="4.1 Roof diaphragm horizontal forces · 屋盖隔膜水平传力 (at wall top)">
        <CalculationFormula caption="Diaphragm introduced force / 隔膜水平力包络"
          formula={`V_{dia} = \\max(V_{wd},\\,V_{es}) = \\max(${tx(diaphragm.VdiaphragmWind)},\\,${tx(diaphragm.VdiaphragmSeismic)}) = ${tx(diaV)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Diaphragm introduced moment at base / 隔膜底部弯矩"
          formula={`M_{dia} = V_{dia}\\times h = ${tx(diaV)}\\times${tx(inputs.wallHeight)} = ${tx(diaM)}\\,\\mathrm{kN\\cdot m}`} />
      </CalculationSubsection>

      <CalculationSubsection title="4.2 Lintel reaction & eccentricity · 过梁反力与偏心">
        <CalculationFormula caption="Lintel eccentric moment / 过梁偏心弯矩"
          formula={`M_{lintel} = R_{lintel}\\,e = ${tx(inputs.lintelReaction)}\\times(${tx(inputs.lintelEccentricity)}+${tx(inputs.wallWidth)}/2) = ${tx(sectionactions.Mlintel)}\\,\\mathrm{kN\\cdot m}`} />
      </CalculationSubsection>

      <CalculationSubsection title="4.3 In Plane total actions · 总内力">
        <CalculationFormula caption="Gravity Axial Force / 重力组合轴力"
          formula={`N^*_{gravity} = ${tx(gravity.Ngravity)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Total in-plane moment / 总弯矩" highlight
          formula={`M^* = M^*_{seismic}+M_{dia}+M_{lintel} = ${tx(seismic.Mseismic)}+${tx(diaM)}+${tx(sectionactions.Mlintel)} = ${tx(sectionactions.Mtotal)}\\,\\mathrm{kN\\cdot m}`} />
        <CalculationFormula caption="Total in-plane shear / 总剪力" highlight
          formula={`V^* = V^*_{seismic}+V_{dia} = ${tx(seismic.Vseismic)}+${tx(diaV)} = ${tx(sectionactions.Vtotal)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   5. In-Plane Section Checks (UI & Data Reading ONLY)
   计算逻辑已完全移至 PrecastPanelCalculation-revised.js
--------------------------------------------------------------------------- */
function InPlaneChecksBlock({ inputs, inPlane }) {
  const sc = inPlane.sectionChecks || {};
  const ch = inPlane.checks || {};
  const sh = inPlane.shear || {};

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
      chip={<Chip size="small" label="NZS 3101 + Strain Compatibility" />} >
      
      {/* 5.1 ELASTIC STRESS */}
      <CalculationSubsection title="5.1 First-order elastic stress distribution · 一阶弹性应力分布" >
        <CalculationFormula
          caption="Uniform axial stress / 均匀轴压应力"
          formula={`\\sigma_N = \\frac{N^*}{A_g} =\\frac{${tx(Nstar)}\\times1000}{${tx(Ag, 0)}} =${tx(sigmaN, 4)} \\,\\mathrm{MPa}`} />
        <CalculationFormula
          caption="Elastic bending stress / 弹性弯曲应力"
          formula={`\\sigma_M = \\frac{M^*}{Z_g} = \\frac{${tx(Mstar)}\\times10^6}{${tx(Zg, 0)}} = ${tx(sigmaM, 4)} \\,\\mathrm{MPa}`} />
        <CalculationFormula
          caption="Maximum edge compression / 最大边缘压应力"
          formula={`\\sigma_{max} = \\sigma_N+\\sigma_M = ${tx(sigmaMax, 4)} \\,\\mathrm{MPa}`}
          highlight
          status={mkStatus(ch.stressCompressionPass !== false, 'PASS', 'CHECK')} />
        <CalculationFormula
          caption="Minimum edge stress / 最小边缘应力"
          formula={`\\sigma_{min} = \\sigma_N-\\sigma_M = ${tx(sigmaMin, 4)} \\,\\mathrm{MPa}`}
          status={mkStatus(sigmaMin >= 0, 'NO TENSION', 'TENSION / CRACKING')} />
      </CalculationSubsection>

      {/* 5.2 ECCENTRICITY */}
      <CalculationSubsection title="5.2 Resultant eccentricity & cracking classification · 偏心距与开裂判断" >
        <CalculationFormula
          caption="Resultant eccentricity / 合力偏心距"
          formula={`e = \\frac{M^*}{N^*} = \\frac{${tx(Mstar)}}{${tx(Nstar)}} = ${tx(eccentricity, 4)} \\,\\mathrm{m} = ${tx(eccentricity * 1000, 1)} \\,\\mathrm{mm}`}
          highlight />
        <CalculationFormula
          caption="Middle-third kern limit / 矩形截面核心区"
          formula={`e_k = \\frac{l_w}{6} = \\frac{${tx(lw)}}{6} = ${tx(kernLimit, 4)} \\,\\mathrm{m}`} />
        <CalculationFormula
          caption="Section stress condition / 截面应力状态"
          formula={`\\begin{cases} e\\leq l_w/6 & \\Rightarrow \\text{Entire section in compression} \\\\ e>l_w/6 & \\Rightarrow \\text{Tensile stress and cracking} \\end{cases}`} />
        <CalculationFormula
          caption="Cracking classification / 开裂状态"
          formula={`${tx(eccentricity, 4)} \\; ${eccentricity <= kernLimit ? '\\leq' : '>'} \\; ${tx(kernLimit, 4)} \\quad\\Rightarrow\\quad \\text{${cracked ? 'CRACKED SECTION — STRAIN COMPATIBILITY REQUIRED' : 'UNCRACKED SECTION'}}`}
          highlight
          status={mkStatus(!cracked, 'UNCRACKED', 'CRACKED SECTION')} />
      </CalculationSubsection>

      {/* 5.3 REINFORCEMENT */}
      <CalculationSubsection title="5.3 Vertical reinforcement model · 竖向钢筋截面模型" >
        <CalculationFormula
          caption="Distributed reinforcement bar area / 分布钢筋单根面积"
          formula={`A_{s,v} = \\frac{\\pi\\phi_v^2}{4} = \\frac{\\pi(${tx(VbarDia)})^2}{4} = ${tx(AsDistributedBar, 1)} \\,\\mathrm{mm^2}`} />
        <CalculationFormula
          caption="Boundary reinforcement bar area / 边缘钢筋单根面积"
          formula={`A_{s,b} = \\frac{\\pi\\phi_b^2}{4} = \\frac{\\pi(${tx(boundaryBarDia)})^2}{4} = ${tx(AsBoundaryBar, 1)} \\,\\mathrm{mm^2}`} />
        <CalculationFormula
          caption="Total vertical reinforcement used in section / 截面参与计算的竖向钢筋"
          formula={`n_{bars} = ${bars.length}, \\qquad A_{s,total} = ${tx(AsTotal, 1)} \\,\\mathrm{mm^2}`}
          highlight />
      </CalculationSubsection>

      {/* 5.4 STRAIN COMPATIBILITY */}
      <CalculationSubsection title="5.4 NZS 3101 strain compatibility · 应变协调与中性轴求解" >
        <CalculationFormula
          caption="Ultimate concrete strain / 极限混凝土压应变"
          formula={`\\varepsilon_{cu} = ${tx(epsCu, 4)}`} />
        <CalculationFormula
          caption="Plane section strain distribution / 平截面应变分布"
          formula={`\\varepsilon_s(x) = \\varepsilon_{cu} \\left(1-\\frac{x}{c}\\right)`} />
        <CalculationFormula
          caption="Steel stress from strain compatibility / 钢筋应力"
          formula={`f_s = \\max \\left( -f_y, \\min (E_s\\varepsilon_s,f_y) \\right)`} />
        <CalculationFormula
          caption="Equivalent compression block / 等效矩形压应力块"
          formula={`a = \\beta_1c = ${tx(beta1, 3)} \\times ${tx(neutralAxis, 1)} = ${tx(compressionBlockDepth, 1)} \\,\\mathrm{mm}`} />
        <CalculationFormula
          caption="Concrete compression resultant / 混凝土压缩合力"
          formula={`C_c = \\alpha_1f'_cba = ${tx(alpha1, 3)} \\times ${tx(fc)} \\times ${tx(t, 0)} \\times ${tx(compressionBlockDepth, 1)} = ${tx(concreteCompression / 1000, 2)} \\,\\mathrm{kN}`} />
        <CalculationFormula
          caption="Axial force equilibrium / 轴力平衡"
          formula={`P_n(c) = C_c + \\sum F_s = N^*`} />
        <CalculationFormula
          caption="Solved neutral axis depth / 迭代求得中性轴深度"
          formula={`c = ${tx(neutralAxis, 1)} \\,\\mathrm{mm}`}
          highlight />
        <CalculationFormula
          caption="Steel force state / 钢筋受力状态"
          formula={`n_c = ${compressionBars}, \\qquad n_t = ${tensionBars}, \\qquad n_y = ${yieldedBars}`} />
        <CalculationFormula
          caption="Compression and tension steel resultants / 钢筋合力"
          formula={`C_s = ${tx(compressionSteelForce / 1000, 2)} \\,\\mathrm{kN}, \\qquad T_s = ${tx(tensionSteelForce / 1000, 2)} \\,\\mathrm{kN}`} />
      </CalculationSubsection>

      {/* 5.5 MOMENT CAPACITY */}
      <CalculationSubsection title="5.5 Section N-M capacity at applied axial load · 给定轴力下截面抗弯承载力" >
        <CalculationFormula
          caption="Nominal axial force equilibrium / 名义轴力"
          formula={`P_n = C_c + \\sum F_s = ${tx(nominalAxial, 2)} \\,\\mathrm{kN} \\approx N^* = ${tx(Nstar, 2)} \\,\\mathrm{kN}`} />
        <CalculationFormula
          caption="Nominal moment about section centroid / 截面名义弯矩"
          formula={`M_n = \\left| \\sum F_ix_i - P_n\\frac{l_w}{2} \\right| = ${tx(nominalMoment, 2)} \\,\\mathrm{kN\\cdot m}`} />
        <CalculationFormula
          caption="Design moment capacity / 设计抗弯承载力"
          formula={`\\phi M_n(N^*) = \\phi M_n = ${tx(phiFlexure, 3)} \\times ${tx(nominalMoment, 2)} = ${tx(phiMn, 2)} \\,\\mathrm{kN\\cdot m}`}
          highlight />
        <CalculationFormula
          caption="Moment utilisation at applied axial load / 给定轴力下抗弯利用率"
          formula={`UR_M = \\frac{M^*}{\\phi M_n(N^*)} = \\frac{${tx(Mstar, 2)}}{${tx(phiMn, 2)}} = ${txUR(momentRatio)} = ${txPct(momentRatio)} \\%`}
          highlight
          status={mkStatus(momentRatio <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      {/* 5.6 AXIAL LOAD LEVEL */}
      <CalculationSubsection title="5.6 Axial load level · 轴压水平与低轴力特征" >
        <CalculationFormula
          caption="Gross-section axial load ratio / 毛截面轴压比"
          formula={`\\eta_N = \\frac{N^*}{f'_cA_g} = \\frac{${tx(Nstar)}\\times1000}{${tx(fc)} \\times ${tx(Ag, 0)}} = ${tx(lowAxialRatio, 5)}`}
          highlight />
        <CalculationFormula
          caption="Design interpretation / 设计解释"
          formula={`\\eta_N = ${tx(lowAxialRatio, 5)} \\quad\\Rightarrow\\quad \\text{${lowAxialRatio <= 0.01 ? 'LOW AXIAL LOAD — FLEXURE DOMINATED PANEL' : 'HIGHER AXIAL LOAD — N-M EFFECT SIGNIFICANT'}}`}
          status={mkStatus(lowAxialRatio <= 0.01, 'LOW AXIAL LOAD', 'REVIEW AXIAL LOAD')} />
        <CalculationFormula
          caption="Reference pure compression capacity / 参考纯压承载力"
          formula={`\\phi P_0 = \\phi (\\alpha_1f'_cA_g + A_sf_y) = ${tx(phiPn, 2)} \\,\\mathrm{kN}`} />
        <CalculationFormula
          caption="Reference axial utilisation / 参考轴压利用率"
          formula={`UR_N = \\frac{N^*}{\\phi P_0} = ${tx(axialRatio, 4)} = ${txPct(axialRatio)} \\%`} />
      </CalculationSubsection>

      {/* 5.7 IN-PLANE SHEAR */}
      <CalculationSubsection title="5.7 In-plane shear · 平面内抗剪" >
        <CalculationFormula
          caption="Web width & shear depth / 腹板宽度与有效剪深"
          formula={`b_w = ${tx(sh.bw, 0)} \\,\\mathrm{mm}, \\qquad d_v = ${tx(sh.dv, 0)} \\,\\mathrm{mm}`} />
        <CalculationFormula
          caption="Concrete shear capacity / 混凝土抗剪"
          formula={`V_c = ${tx(sh.vc)} \\,\\mathrm{kN}, \\qquad \\phi V_c = ${tx(sh.phiVc)} \\,\\mathrm{kN}`} />
        <CalculationFormula
          caption="Horizontal reinforcement contribution / 水平钢筋抗剪贡献"
          formula={`V_s = ${tx(sh.VsProvided)} \\,\\mathrm{kN}`} />
        <CalculationFormula
          caption="Design shear capacity / 设计抗剪承载力"
          formula={`\\phi V_n = ${tx(sh.shearCapacity)} \\,\\mathrm{kN}`}
          highlight />
        <CalculationFormula
          caption="Shear utilisation / 抗剪利用率"
          formula={`UR_V = \\frac{V^*}{\\phi V_n} = \\frac{${tx(Vstar)}}{${tx(sh.shearCapacity)}} = ${txUR(sh.shearRatio)} = ${txPct(sh.shearRatio)} \\%`}
          highlight
          status={mkStatus(ch.shearPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   6. OUT-OF-PLANE DESIGN (WIND & SEISMIC)
--------------------------------------------------------------------------- */
function OutOfPlaneWindSeismicBlock({ inputs, outOfPlane }) {
  const oopResult = outOfPlane || {};
  const hv = oopResult.hroofValidation || {};
  const sc = oopResult.supportConditions || {};
  const add = oopResult.additionalLoads || {};
  const ps = oopResult.partSeismic || {};
  const wsF = sc.windSeismicFactors || { mid: 1 / 8, base: 1 / 8 };
  const hroofEff = safe(hv.hroofEffective);

  return (
    <CalculationSection number="6" title="Out-of-Plane Design (Wind & Seismic) · 平面外设计（风与地震）" chip={<Chip size="small" label="AS/NZS 1170.5 Ch.8 / NZS 3101" />}>
      <CalculationSubsection title="6.1 hroof validation & Lateral Actions · hroof 校验与水平作用">
        <CalculationFormula caption="Effective hroof used / 实际采用值" highlight
          formula={`h_{roof,eff} = \\min(h_{roof},\\,h_{roof,max}) = ${tx(hv.hroofEffective)}\\,\\mathrm{m}`}
          status={mkStatus(hv.hroofValid, 'VALID', 'CLAMPED')} />
        <CalculationFormula caption="Part height amplification factor H / part 高度放大系数 (§8.4.2.3)"
          formula={`H = 1 + 2\\frac{h_x}{h_n} = 1 + 2\\times\\frac{${tx(ps.hx)}}{${tx(ps.hn)}} = ${tx(ps.H, 3)}`} />
        <CalculationFormula caption="Wall panel weight Wp / 墙板重量（每延米）"
          formula={`W_p = \\gamma_c\\,t_w\\,h_{roof} = ${tx(ps.Wp)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="Part component factor Cp / Part 构件系数 (§8.4.2.1)"
          formula={`C_p = \\frac{a_p\\,S_p}{R_p\\,\\mu_p} = ${tx(ps.Cp, 3)}`} />
        <CalculationFormula caption="Design seismic force Fp,design / 控制设计地震力" highlight
          formula={`F_{p,design} = \\max(C_p H W_p,\\,0.3 S_p I W_p) = ${tx(ps.Fp_design)}\\,\\mathrm{kN/m}`} />
        <CalculationFormula caption="OOP seismic pressure WE / 平面外地震压力"
          formula={`W_E = \\frac{F_{p,design}}{h_{roof}} = ${tx(oopResult.WE)}\\,\\mathrm{kPa}`} />
        <CalculationFormula caption="Governing wind pressure / 控制风压"
          formula={`W_{pressure} = \\max(w_{wd},\\,w_{wf}) = ${tx(oopResult.WindPressure)}\\,\\mathrm{kPa}`} />
      </CalculationSubsection>

      <CalculationSubsection title="6.2 Bending Moments & Support Conditions · 弯矩与支承条件">
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
        <CalculationFormula caption="Mid-height design moment Ma / 中部设计弯矩" highlight
          formula={`M_a = \\max(M_E,M_W)\\,k_{mid} + \\Delta M_{add,mid} = ${tx(oopResult.Ma)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Base design moments MbE, MbW / 底部设计弯矩"
          formula={`M_{bE} = ${tx(oopResult.MbE)}\\,\\mathrm{kN\\cdot m/m},\\quad M_{bW} = ${tx(oopResult.MbW)}\\,\\mathrm{kN\\cdot m/m}`} />
      </CalculationSubsection>

      <CalculationSubsection title="6.3 Flexural Capacity & P-Delta · 抗弯承载力与 P-Δ 效应">
        <CalculationFormula caption="Flexural capacity φMn / 抗弯承载力" highlight
          formula={`\\phi M_n = 0.85\\,A_{WV}f_y\\left(d-\\frac{a}{2}\\right)/10^6 = ${tx(oopResult.phiMn)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="P-Delta magnified moment M' / P-Δ 放大弯矩" highlight
          formula={`M' = \\frac{M_a}{1-\\dfrac{5N_a h_{roof}^2}{0.75\\times48\\,E_c I_{cr}}} = ${tx(oopResult.M_prime)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Mid-height utilisation UR1 / 中部利用率" highlight
          formula={`UR_1 = \\frac{M'}{\\phi M_n} = ${txPct(oopResult.UR1)}\\%`}
          status={mkStatus(Number.isFinite(oopResult.UR1) && oopResult.UR1 <= 1, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Base utilisation UR2 / 底部利用率" highlight
          formula={`UR_2 = \\frac{\\max(M_{bE},M_{bW})}{\\phi M_n} = ${txPct(oopResult.UR2)}\\%`}
          status={mkStatus(Number.isFinite(oopResult.UR2) && oopResult.UR2 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      <CalculationSubsection title="6.4 Shear Capacity · 抗剪承载力">
        <CalculationFormula caption="Shear utilisation UR4 / 抗剪利用率" highlight
          formula={`UR_4 = \\frac{\\max(V_E,V_w)}{0.75(V_c+V_s)} = ${txPct(oopResult.UR4)}\\%`}
          status={mkStatus(Number.isFinite(oopResult.UR4) && oopResult.UR4 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   7. OUT-OF-PLANE FIRE RESISTANCE DESIGN
--------------------------------------------------------------------------- */
function OutOfPlaneFireBlock({ inputs, outOfPlane }) {
  const oopResult = outOfPlane || {};
  const sc = oopResult.supportConditions || {};
  const HwMinusTf = safe(inputs.wallHeight) - safe(inputs.tf) / 1000;

  return (
    <CalculationSection number="7" title="Out-of-Plane Fire Resistance Design · 平面外抗火设计" chip={<Chip size="small" label="NZS 3101 / BRANZ Guide" />}>
      <CalculationSubsection title="7.1 Fire Actions & Material Properties · 火灾作用与材料折减">
        <CalculationFormula caption="Axis distance xt / 钢筋轴向距离"
          formula={`x_t = \\frac{t_w}{2}-\\frac{\\phi_v}{2}-\\phi_h = ${tx(oopResult.xt, 1)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Reduction factors / 温度折减系数"
          formula={`\\eta_x = 0.16\\ln(t_h x_t^{-2})-0.65 = ${tx(oopResult.etax, 3)},\\qquad \\eta_w = 1-0.162\\,t_h^{-0.6} = ${tx(oopResult.etaw, 3)}`} />
        <CalculationFormula caption="Steel temperature & reduced yield / 钢筋温度与折减屈服"
          formula={`T_{fs} = \\eta_x\\eta_w\\times660 = ${tx(oopResult.Tfs, 0)}\\,^{\\circ}\\mathrm{C},\\qquad f_{yt} = ${tx(oopResult.fyt, 0)}\\,\\mathrm{MPa}`} />
      </CalculationSubsection>

      <CalculationSubsection title="7.2 Fire Moment & Capacity · 火灾弯矩与承载力">
        <CalculationFormula caption="Fire moment Mbf / 火灾弯矩 (Support: Fire option)"
          formula={`M_{bf} = \\frac{w_f(H_w-t_f)^2}{2}\\,k_{fire} = ${tx(oopResult.Mbf)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Fire utilisation UR3 / 火灾利用率" highlight
          formula={`UR_3 = \\frac{M_{bf}}{\\phi M_{n,fire}} = ${txPct(oopResult.UR3)}\\%`}
          status={mkStatus(Number.isFinite(oopResult.UR3) && oopResult.UR3 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   8. Wall Stability Check
--------------------------------------------------------------------------- */
function StabilityBlock({ inputs, inPlane }) {
  const gravity = inPlane.gravity || {};
  const seismic = inPlane.seismic || {};
  const diaphragm = inPlane.diaphragm || {};
  const re = inPlane.reinforcement || {};

  const H = safe(inputs.wallHeight);
  const L = safe(inputs.wallWidth);
  const t = safe(inputs.wallThickness);
  const fc = safe(inputs.fc);
  const fy = safe(inputs.fy);

  const support = inputs.supportWindSeismic || 'Pinned-Pinned';
  const kBySupport = {
    'Pinned-Pinned': 1.0,
    'Fixed-Pinned': 1.0,
    'Fixed-Free': 1.4,
    'Fixed-Fixed': 1.0
  };
  const k = kBySupport[support] ?? 1.0;

  const H_over_t = t > 0 ? H / t : Infinity;
  const kH_over_t = t > 0 ? k * H / t : Infinity;
  const HtLimit = 75;
  const kHtLimit = 65;
  const HtPass = Number.isFinite(H_over_t) && H_over_t <= HtLimit + 1e-9;
  const kHtPass = Number.isFinite(kH_over_t) && kH_over_t <= kHtLimit + 1e-9;

  const Ag = L > 0 && t > 0 ? L * 1000 * t * 1000 : 0;

  const P = safe(gravity.GlineTotal, safe(inputs.gUniform) * safe(inputs.Sr, 1) * L);
  const W = safe(gravity.Gwall, safe(inputs.concreteDensity) * t * H * L);

  const rhoT = Number.isFinite(Number(re.rhoVertical))
    ? Math.max(Number(re.rhoVertical), 0)
    : (() => {
      const sv = safe(inputs.VbarSpace);
      const dv = safe(inputs.VbarDia);
      const nV = sv > 0 && L > 0 ? Math.floor((L * 1000) / sv) + 1 : 0;
      const AsV = nV * Math.PI * dv ** 2 / 4;
      return Ag > 0 ? AsV / Ag : 0;
    })();

  const axialLoadTerm = fc > 0 && Ag > 0 ? (P + 0.5 * W) * 1000 / (fc * Ag) : Infinity;
  const steelEulerTerm = fc > 0 ? 0.4 * rhoT * fy / fc : Infinity;
  const eulerLoadTerm = axialLoadTerm + steelEulerTerm;
  const eulerLimit = Number.isFinite(eulerLoadTerm) && eulerLoadTerm > 0 ? 15 / eulerLoadTerm : Infinity;
  const eulerPass = Number.isFinite(kH_over_t) && kH_over_t <= eulerLimit + 1e-9;

  const CdCurrent = safe(seismic.Cd);
  const CdElastic = safe(seismic.CT1);
  const elasticScale = CdCurrent > 0 && CdElastic > 0 ? CdElastic / CdCurrent : 1;
  const MseismicCurrent = safe(seismic.Mseismic);
  const MdiaphragmSeismicCurrent = safe(diaphragm.MdiaphragmSeismic);
  const MeStar = Math.abs((MseismicCurrent + MdiaphragmSeismicCurrent) * elasticScale);

  const ltbGeometry = L > 0 && H > 0 && Number.isFinite(kH_over_t) ? kH_over_t * Math.sqrt(H / L) : Infinity;
  const ltbLoadA = fc > 0 && Ag > 0 ? rhoT * fy / fc + (P + 0.5 * W) * 1000 / (fc * Ag) : Infinity;
  const ltbLoadB = fc > 0 && Ag > 0 && L > 0 ? 2.2 * MeStar * 1e6 / (L * fc * Ag) : Infinity;
  const ltbProductA = ltbGeometry * ltbLoadA;
  const ltbProductB = ltbGeometry * ltbLoadB;
  const ltbPassA = Number.isFinite(ltbProductA) && ltbProductA <= 12 + 1e-9;
  const ltbPassB = Number.isFinite(ltbProductB) && ltbProductB <= 12 + 1e-9;
  const ltbPass = ltbPassA && ltbPassB;
  const overallOK = HtPass && kHtPass && eulerPass && ltbPass;

  const stabilityRows = [
    ['8.4.1 H/t ≤ 75', `H/t = ${tx(H_over_t)} ≤ ${tx(HtLimit, 0)}`, HtPass],
    ['8.4.2 kH/t ≤ 65', `k = ${tx(k, 2)}, kH/t = ${tx(kH_over_t)} ≤ ${tx(kHtLimit, 0)}`, kHtPass],
    ['8.4.3 Euler buckling stability', `kH/t = ${tx(kH_over_t)} ≤ ${tx(eulerLimit, 2)}`, eulerPass],
    ['8.4.4 Lateral torsional buckling', `Case (a): ${tx(ltbProductA, 3)} ≤ 12; Case (b): ${tx(ltbProductB, 3)} ≤ 12`, ltbPass]
  ];

  return (
    <CalculationSection number="8" title="Wall Stability Check · 稳定计算" chip={<Chip size="small" label="BRANZ Guide §8.4" />}>
      <Alert severity={overallOK ? 'success' : 'warning'} sx={{ mb: 2 }}>
        BRANZ §8.4 wall panel stability checks: H/t limit, effective-height slenderness kH/t, Euler buckling stability and Vlasov/Timoshenko lateral torsional buckling.
      </Alert>
      <Box sx={{ overflowX: 'auto', mb: 2 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Stability check', 'Result', 'Status'].map((hd) => (
                <th key={hd} style={{ textAlign: hd === 'Stability check' ? 'left' : 'right', padding: '6px 10px', borderBottom: '2px solid #e5e7eb', fontWeight: 800 }}>
                  {hd}
                </th>
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
      
      <CalculationSubsection title="8.4.1 H/t limit · 高厚比限值">
        <CalculationFormula caption="Wall height / 墙高" formula={`H = ${tx(H)}\\,\\mathrm{m},\\qquad t = ${tx(t)}\\,\\mathrm{m}`} />
        <CalculationFormula caption="H/t ≤ 75" formula={`\\frac{H}{t} = \\frac{${tx(H)}}{${tx(t)}} = ${tx(H_over_t)} \\le 75`} status={mkStatus(HtPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      <CalculationSubsection title="8.4.2 Effective height coefficient k · 有效高度系数 k">
        <CalculationFormula caption="Support condition / 支承条件" formula={`\\text{Support} = ${support},\\qquad k = ${tx(k, 2)}`} />
        <CalculationFormula caption="Effective slenderness kH/t / 有效长细比" formula={`\\frac{kH}{t} = ${tx(k, 2)}\\times\\frac{${tx(H)}}{${tx(t)}} = ${tx(kH_over_t)} \\le 65`} status={mkStatus(kHtPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      <CalculationSubsection title="8.4.3 Euler buckling stability · Euler 屈曲稳定">
        <CalculationFormula caption="Gross wall area / 墙体毛截面面积" formula={`A_g = (${tx(L)}\\times1000)(${tx(t)}\\times1000) = ${tx(Ag, 0)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Roof gravity load P / 屋面重力荷载 P" formula={`P = ${tx(P)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Wall self-weight W / 墙体自重 W" formula={`W = ${tx(W)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Euler load parameter / Euler 荷载参数" formula={`\\Lambda_E = \\frac{P+0.5W}{f'_cA_g} + 0.4\\rho_t\\frac{f_y}{f'_c} = ${tx(eulerLoadTerm, 4)}`} />
        <CalculationFormula caption="Euler stability inequality / Euler 稳定不等式" formula={`\\frac{kH}{t} \\le \\frac{15}{\\Lambda_E} = \\frac{15}{${tx(eulerLoadTerm, 4)}} = ${tx(eulerLimit, 2)}`} status={mkStatus(eulerPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      <CalculationSubsection title="8.4.4 Lateral torsional buckling · 侧向扭转屈曲">
        <CalculationFormula caption="Geometry term / 几何项" formula={`X = \\frac{kH}{t}\\left(\\frac{H}{L}\\right)^{1/2} = ${tx(kH_over_t)}\\left(\\frac{${tx(H)}}{${tx(L)}}\\right)^{1/2} = ${tx(ltbGeometry, 3)}`} />
        <CalculationFormula caption="Case (a) load parameter / 情况 (a) 荷载参数" formula={`\\lambda_a = \\rho_t\\frac{f_y}{f'_c}+\\frac{P+0.5W}{f'_cA_g} = ${tx(ltbLoadA, 4)},\\qquad X\\lambda_a = ${tx(ltbProductA, 3)} \\le 12`} status={mkStatus(ltbPassA, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Case (b) elastic moment parameter / 情况 (b) 弹性弯矩参数" formula={`M_e^* = ${tx(MeStar)}\\,\\mathrm{kN\\cdot m},\\qquad \\lambda_b = \\frac{2.2M_e^*}{Lf'_cA_g} = ${tx(ltbLoadB, 4)},\\qquad X\\lambda_b = ${tx(ltbProductB, 3)} \\le 12`} status={mkStatus(ltbPassB, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Overall lateral torsional stability / 总体侧向扭转稳定" highlight formula={`\\text{Case (a)}\\;X\\lambda_a = ${tx(ltbProductA, 3)}\\le12,\\qquad \\text{Case (b)}\\;X\\lambda_b = ${tx(ltbProductB, 3)}\\le12`} status={mkStatus(ltbPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Overall stability result / 总体稳定结果" highlight formula={`\\text{Overall stability} = ${overallOK ? 'PASS' : 'CHECK'}`} status={mkStatus(overallOK, 'PASS', 'CHECK')} />
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   9. Lintel Boundary Element Check
--------------------------------------------------------------------------- */
function LintelBoundaryElementBlock({ inputs, inPlane, outOfPlane }) {
  const be = inPlane.bearing || {};
  const re = inPlane.reinforcement || {};
  const it = inPlane.interaction || {};
  const sh = inPlane.shear || {};
  const ch = inPlane.checks || {};
  const minBlock = Math.min(safe(re.d), safe(inputs.boundaryWidth) * 1000);

  const bn = inPlane.boundaryNM || {};
  const bns = bn.section || {};
  const bnk = bn.keyPoints || {};
  const bng = bn.gravityShare || {};
  const bnd = Array.isArray(bn.demands) ? bn.demands : [];
  const bnc = bn.checks || {};
  const bngov = bn.governing || {};

  return (
    <CalculationSection number="9" title="Lintel Bearing & Boundary Element · 过梁和边缘构件计算" chip={<Chip size="small" label="Lintel Bearing / Boundary Element" />}>
      <CalculationSubsection title="5.4 Lintel bearing (D-region) · 过梁局部承压">
        <CalculationFormula caption="Bearing area / 承压面积"
          formula={`A_b = b_b\\times l_b = \\frac{${tx(inputs.bearingWidth, 0)}}{1000}\\times\\frac{${tx(inputs.bearingLength, 0)}}{1000} = ${tx(safe(inputs.bearingWidth) * safe(inputs.bearingLength) / 1e6, 4)}\\,\\mathrm{m^2} = ${tx(safe(inputs.bearingWidth) * safe(inputs.bearingLength), 0)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Bearing stress / 承压应力"
          formula={`\\sigma_b = \\frac{R_{lintel}}{A_b} = \\frac{${tx(inputs.lintelReaction)}\\times1000}{${tx(safe(inputs.bearingWidth) * safe(inputs.bearingLength), 0)}} = ${tx(be.bearingStress, 4)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Bearing capacity / 承压承载力限值"
          formula={`\\sigma_{b,cap} = 0.6\\sqrt{f'_c} = 0.6\\sqrt{${tx(inputs.fc)}} = ${tx(safe(be.bearingCapacity) / 1000, 4)}\\,\\mathrm{MPa}`} />
        <CalculationFormula caption="Bearing utilisation / 承压利用率" highlight
          formula={`UR_{bearing} = \\frac{\\sigma_b}{\\sigma_{b,cap}} = ${txUR(be.bearingRatio)} = ${txPct(be.bearingRatio)}\\%`}
          status={mkStatus(ch.bearingPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      <CalculationSubsection title="5.5 Boundary element local N-M (lintel at wall edge) · 边缘构件局部压弯 N-M（v0.6.2 新增）">
        {bn.available === false ? (
          <Alert severity="info">
            Boundary element local N-M check skipped (no boundary element or incomplete data).
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
            <NMInteractionChart boundary={bn} />
          </>
        )}
      </CalculationSubsection>
    </CalculationSection>
  );
}

/* ---------------------------------------------------------------------------
   10. Base Connection Design
--------------------------------------------------------------------------- */
function BaseConnectionBlock({ inputs, connection }) {
  const resConnection = connection || {};
  const dm = resConnection.demand || {};
  const dw = resConnection.dowel || {};
  const fr = resConnection.friction || {};
  const cap = resConnection.capacity || {};
  const be = resConnection.bearing || {};
  const rt = resConnection.ratios || {};
  const ch = resConnection.checks || {};

  return (
    <CalculationSection number="8" title="Base Connection Design · 连接计算" chip={<Chip size="small" label="Dowel / Grouted Connection" />}>
      <CalculationSubsection title="8.1 Shear demand · 剪力需求">
        <CalculationFormula caption="OOP shear over wall width / 平面外剪力换算为整墙"
          formula={`V_{oop,total} = V'\\times b = ${tx(dm.VoutPerM)}\\times${tx(inputs.wallWidth)} = ${tx(dm.VoutTotal)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Connection shear demand / 连接剪力需求" highlight
          formula={`V^*_{conn} = \\max(V^*_{in},\\,V_{oop,total}) = \\max(${tx(dm.VinPlane)},\\,${tx(dm.VoutTotal)}) = ${tx(dm.Vstar)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>

      <CalculationSubsection title="8.2 Dowel shear capacity · 锚筋抗剪">
        <CalculationFormula caption="Area of one dowel / 单根锚筋面积"
          formula={`A_d = \\frac{\\pi\\phi_d^2}{4} = \\frac{\\pi(${tx(dw.dDowel, 0)})^2}{4} = ${tx(dw.Ad, 1)}\\,\\mathrm{mm^2}`} />
        <CalculationFormula caption="Steel shear capacity (0.6fy) / 钢材抗剪"
          formula={`V_{steel} = n\\times0.6A_df_y/1000 = (${tx(dw.nDowel, 0)})(0.6)(${tx(dw.Ad, 1)})(${tx(inputs.fy)})/1000 = ${tx(dw.VdowelSteel)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Grout bond anchorage / 灌浆粘结锚固"
          formula={`V_{bond} = n\\pi\\phi_d l_{emb}\\times0.35\\sqrt{f'_g}/1000 = (${tx(dw.nDowel, 0)})\\pi(${tx(dw.dDowel, 0)})(${tx(dw.embedment, 0)})(0.35\\sqrt{${tx(inputs.groutStrength)}})/1000 = ${tx(dw.VgroutBond)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Governing dowel shear / 锚筋抗剪取小" highlight
          formula={`V_{dowel} = \\min(V_{steel},V_{bond}) = ${tx(dw.Vdowel)}\\,\\mathrm{kN}`} />
      </CalculationSubsection>

      <CalculationSubsection title="8.3 Shear friction & shear key · 剪切摩擦与剪力键">
        <CalculationFormula caption="Shear friction / 剪切摩擦"
          formula={`V_{fric} = \\mu N^* = (${tx(fr.muFriction)})(${tx(dm.Nstar)}) = ${tx(fr.Vfriction)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Shear key contribution (simplified +15%×V_steel) / 剪力键贡献"
          formula={`V_{key} = ${fr.shearKey ? `0.15\\times${tx(dw.VdowelSteel)} = ${tx(fr.VshearKey)}` : '0'}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Connection shear capacity / 连接抗剪承载力" highlight
          formula={`\\phi V_{conn} = \\phi_c(V_{dowel}+V_{fric}+V_{key}) = (${tx(resConnection.phiConn)})(${tx(dw.Vdowel)}+${tx(fr.Vfriction)}+${tx(fr.VshearKey)}) = ${tx(cap.phiVconn)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Connection shear utilisation / 连接抗剪利用率" highlight
          formula={`UR_{V,conn} = \\frac{V^*_{conn}}{\\phi V_{conn}} = \\frac{${tx(dm.Vstar)}}{${tx(cap.phiVconn)}} = ${txUR(rt.shearRatio)} = ${txPct(rt.shearRatio)}\\%`}
          status={mkStatus(ch.shearPass, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      <CalculationSubsection title="8.4 Uplift & grout bed bearing · 抗拔与灌浆垫承压">
        <CalculationFormula caption="Dowel tension capacity / 锚筋抗拔承载力"
          formula={`\\phi T_{conn} = \\phi_c\\,nA_df_y/1000 = (${tx(resConnection.phiConn)})(${tx(dw.nDowel, 0)})(${tx(dw.Ad, 1)})(${tx(inputs.fy)})/1000 = ${tx(cap.phiTconn)}\\,\\mathrm{kN}`} />
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
   11. Foundation Design
--------------------------------------------------------------------------- */
function FoundationBlock({ inputs, inPlane, outOfPlane, foundation }) {
  const resOOP = outOfPlane || {};
  const resFoundation = foundation || {};
  const fc = resFoundation.checks || {};
  const hv = resOOP.hroofValidation || {};
  const Mstar = safe(inPlane?.sectionActions?.Mtotal);
  const Vstar = safe(inPlane?.sectionActions?.Vtotal);

  return (
    <CalculationSection number="9" title="Foundation Design · 基础计算" chip={<Chip size="small" label="OOP UR5/UR6 + In-Plane Footing" />}>
      <CalculationSubsection title="9.1 OOP foundation (UR5 bearing / UR6 footing flexure) · 平面外基础">
        <CalculationFormula caption="Overturning moment / 倾覆弯矩"
          formula={`M_O = M_a\\,h_{roof} = ${tx(resOOP.Ma)}\\times${tx(safe(hv.hroofEffective))} = ${tx(resOOP.Mo)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Total weight & resisting moment / 总重力与抗倾覆力矩"
          formula={`W_{sum} = ${tx(resOOP.Wsum)}\\,\\mathrm{kN/m},\\qquad M_R = W_{sum}\\frac{L_f+2f_o}{2} = ${tx(resOOP.Wsum)}\\times\\frac{${tx(inputs.Lf, 0)}+2\\times${tx(inputs.fo, 0)}}{2} = ${tx(resOOP.MR_weight)}\\,\\mathrm{kN\\cdot m/m}`} />
        <CalculationFormula caption="Effective bearing length / 有效承压长度"
          formula={`X = \\frac{M_R-M_O}{W_{sum}}\\times1000 = \\frac{${tx(resOOP.MR_weight)}-${tx(resOOP.Mo)}}{${tx(resOOP.Wsum)}}\\times1000 = ${tx(resOOP.X, 0)}\\,\\mathrm{mm},\\qquad L_{BR} = 2\\min(X,L/2) = ${tx(resOOP.LBR, 0)}\\,\\mathrm{mm}`} />
        <CalculationFormula caption="Bearing pressure utilisation (UR5) / 基底压力利用率" highlight
          formula={`UR_5 = \\frac{q_d}{q_D} = \\frac{${tx(resOOP.qd, 0)}}{0.5\\,q_U = ${tx(resOOP.qD, 0)}} = ${txUR(resOOP.UR5)} = ${txPct(resOOP.UR5)}\\%`}
          status={mkStatus(Number.isFinite(resOOP.UR5) && resOOP.UR5 <= 1, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Footing flexure utilisation (UR6) / 基础抗弯利用率" highlight
          formula={`UR_6 = \\frac{M_O}{\\phi M_{n,foot}} = \\frac{${tx(resOOP.Mo)}}{${tx(resOOP.phiMn_foot)}} = ${txUR(resOOP.UR6)} = ${txPct(resOOP.UR6)}\\%`}
          status={mkStatus(Number.isFinite(resOOP.UR6) && resOOP.UR6 <= 1, 'PASS', 'CHECK')} />
      </CalculationSubsection>

      <CalculationSubsection title="9.2 In-plane footing checks · 平面内基础（条形基础简化验算）">
        <CalculationFormula caption="Footing self-weight / 基础自重"
          formula={`G_{foot} = \\gamma_c B L t_{foot} = (${tx(inputs.concreteDensity)})(${tx(resFoundation.B)})(${tx(resFoundation.L)})(${tx(resFoundation.tf)}) = ${tx(resFoundation.Gfooting)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Total axial force / 总轴力"
          formula={`N_{total} = N^* + G_{foot} = ${tx(safe(resFoundation.Ntotal) - safe(resFoundation.Gfooting))} + ${tx(resFoundation.Gfooting)} = ${tx(resFoundation.Ntotal)}\\,\\mathrm{kN}`} />
        <CalculationFormula caption="Footing area & section modulus / 基底面积与截面模量"
          formula={`A = B\\times L = ${tx(resFoundation.A)}\\,\\mathrm{m^2},\\qquad Z = \\frac{BL^2}{6} = ${tx(resFoundation.Z)}\\,\\mathrm{m^3}`} />
        <CalculationFormula caption="Base pressure (max/min) / 基底最大/最小压力" highlight
          formula={`q_{max} = \\frac{N_{total}}{A}+\\frac{M^*}{Z} = \\frac{${tx(resFoundation.Ntotal)}}{${tx(resFoundation.A)}}+\\frac{${tx(Mstar)}}{${tx(resFoundation.Z)}} = ${tx(resFoundation.qMax, 0)}\\,\\mathrm{kPa},\\qquad q_{min} = \\frac{${tx(resFoundation.Ntotal)}}{${tx(resFoundation.A)}}-\\frac{${tx(Mstar)}}{${tx(resFoundation.Z)}} = ${tx(resFoundation.qMin, 0)}\\,\\mathrm{kPa}`}
          status={mkStatus(fc.bearingPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Bearing utilisation / 基底承压利用率" highlight
          formula={`UR_{foot,q} = \\frac{q_{max}}{q_{allow}} = \\frac{${tx(resFoundation.qMax, 0)}}{${tx(resFoundation.qAllow, 0)}} = ${txUR(resFoundation.bearingRatio)}`}
          status={mkStatus(fc.bearingPass, 'PASS', 'CHECK')} />
        <CalculationFormula caption="Sliding resistance / 抗滑移" highlight
          formula={`UR_{slide} = \\frac{V^*}{\\mu N_{total}} = \\frac{${tx(Vstar)}}{${tx(resFoundation.mu)}\\times${tx(resFoundation.Ntotal)}} = ${txUR(resFoundation.slidingRatio)}`}
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
    ["In-plane: Compression stress σmax ≤ 0.6f'c (平面内：受压应力)", null, ip.checks?.stressCompressionPass],
    ['In-plane: Lintel bearing UR (平面内：过梁承压)', ip.bearing?.bearingRatio, ip.checks?.bearingPass],
    ['In-plane: N-M interaction UR (平面内：N-M 交互)', ip.interaction?.interactionRatio, ip.checks?.interactionPass],
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
    <CalculationSection number="10" title="Utilisation Summary · 利用率汇总" chip={<Chip size="small" label="UR ≤ 1.00" />}>
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
  const ResultInPlane = results.inPlane || {};
  const ResultOutOfPlane = results.outOfPlane || {};
  const ResultConnection = results.connection || {};
  const ResultFoundation = results.foundation || {};
  const ResultSummary = results.summary || {};

  return (
    <Box>
      <Alert severity={ResultSummary.overallPass ? 'success' : 'warning'} sx={{ mb: 2, fontWeight: 700 }}>
        {ResultSummary.overallPass
          ? '✓ All implemented checks pass under current inputs. (当前输入下全部检查通过。)'
          : '✗ Some checks did not pass. Review the sections and status labels below. (存在未通过的检查项，请查看下方各分段。)'}
      </Alert>

      <CalculationSection number="0" title="Input Data Used · 输入参数汇总" chip={<Chip size="small" label="Live inputs" />}>
        <InputSummaryTable inputs={inputs} />
      </CalculationSection>

      <GeoBlock inputs={inputs} ResinPlane={ResultInPlane} ResoutOfPlane={ResultOutOfPlane} />
      <LoadDerivationBlock inputs={inputs} ResinPlane={ResultInPlane} ResoutOfPlane={ResultOutOfPlane} />
      <InPlaneSeismicBlock inputs={inputs} inPlane={ResultInPlane} ResoutOfPlane={ResultOutOfPlane} />
      <InPlaneActionsBlock inputs={inputs} inPlane={ResultInPlane} />
      <InPlaneChecksBlock inputs={inputs} inPlane={ResultInPlane} />
      
      {/* 拆分后的平面外设计：风与地震 */}
      <OutOfPlaneWindSeismicBlock inputs={inputs} outOfPlane={ResultOutOfPlane} />
      {/* 拆分后的平面外设计：抗火 */}
      <OutOfPlaneFireBlock inputs={inputs} outOfPlane={ResultOutOfPlane} />
      
      <StabilityBlock inputs={inputs} inPlane={ResultInPlane} outOfPlane={ResultOutOfPlane} />
      <LintelBoundaryElementBlock inputs={inputs} inPlane={ResultInPlane} outOfPlane={ResultOutOfPlane} />
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

  return (
    <Box>
      <Alert severity={pass ? 'success' : 'error'} sx={{ mb: 2, fontWeight: 700 }}>
        {pass
          ? '✓ Current calculation result satisfies the implemented checks.'
          : '✗ Current calculation result requires review.'}
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
      </Paper>

      {/* v0.6.2 —— 边缘构件局部压弯 N-M 结果与图表 */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Boundary Element Local N-M Interaction (Lintel Edge Load)</Typography>
        {bn.available === false ? (
          <Alert severity="info">Boundary element local N-M check not applicable with current inputs.</Alert>
        ) : (
          <>
            <ResultRow label="Boundary section (b × h)" value={`${fmt(bn.section?.bc, 0)} × ${fmt(bn.section?.hc, 0)}`} unit="mm" />
            <ResultRow label="Boundary steel As,total (两层对称近似)" value={fmt(bn.section?.AsTotal, 0)} unit="mm²" />
            <ResultRow label="φP0 (pure compression)" value={fmt(bn.keyPoints?.phiP0, 0)} unit="kN" />
            <ResultRow label="Balanced point (φNb, φMb)" value={`${fmt(bn.keyPoints?.phiNb, 0)} / ${fmt(bn.keyPoints?.phiMb, 1)}`} unit="kN / kN·m" />
            <ResultRow label="φM0 (pure bending)" value={fmt(bn.keyPoints?.phiM0, 1)} unit="kN·m" />
            <ResultRow label="Governing demand (N , M*)" value={`${fmt(bn.governing?.N, 1)} / ${fmt(bn.governing?.M, 2)}`} unit="kN / kN·m" />
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
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>OOP Part Seismic Action (AS/NZS 1170.5 Ch.8 - Full Compliance)</Typography>
        <ResultRow label="Part Factors (ap / Rp / μp)" value={`${fmt(outOfPlane.partSeismic?.ap, 2)} / ${fmt(outOfPlane.partSeismic?.Rp, 2)} / ${fmt(outOfPlane.partSeismic?.mu_p, 2)}`} unit="" />
        <ResultRow label="Periods (Tp / Tn)" value={`${fmt(outOfPlane.partSeismic?.Tp, 2)} / ${fmt(outOfPlane.partSeismic?.Tn, 2)}`} unit="s" />
        <ResultRow label="Importance Factor I" value={fmt(outOfPlane.partSeismic?.I, 2)} unit="" />
        <ResultRow label="Response Coefficient Sp" value={fmt(outOfPlane.partSeismic?.Sp, 3)} unit="" />
        <ResultRow label="Component Factor Cp" value={fmt(outOfPlane.partSeismic?.Cp, 3)} unit="" />
        <ResultRow label="Height factor H" value={fmt(outOfPlane.partSeismic?.H, 3)} unit="" />
        <ResultRow label="Wall panel weight Wp" value={fmt(outOfPlane.partSeismic?.Wp, 3)} unit="kN/m" />
        <ResultRow label="Calculated Fp" value={fmt(outOfPlane.partSeismic?.Fp, 3)} unit="kN/m" />
        <ResultRow label="Minimum Fp,min (Safety Net)" value={fmt(outOfPlane.partSeismic?.Fp_min, 3)} unit="kN/m" />
        <ResultRow label="Design Fp (Governing)" value={fmt(outOfPlane.partSeismic?.Fp_design, 3)} unit="kN/m" highlight />
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
        The UI displays results from the calculation engine. Final design must be verified against applicable NZ Standards and project-specific requirements.
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
    partResponseCoefficient: safe(inputs.partResponseCoefficient),
    partHeightHx: safe(inputs.partHeightHx),
    buildingHeightHn: safe(inputs.buildingHeightHn),
    partImportanceFactor: safe(inputs.partImportanceFactor),
    partResponseModification: safe(inputs.partResponseModification),
    partDuctility: safe(inputs.partDuctility),
    partPeriod: safe(inputs.partPeriod),
    buildingPeriod: safe(inputs.buildingPeriod),
    importanceFactor: safe(inputs.importanceFactor),
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
              <Chip label={statusLabel} color={statusColor}
                icon={results.summary?.overallPass ? <CheckCircleIcon /> : <WarningAmberIcon />}
                sx={{ fontWeight: 800 }}
              />
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

      {/* Summary Report Dialog */}
      <PrecastPanelReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        inputs={calculationInput}
        results={results}
      />

      {/* v0.6.1 —— Detail Report Dialog */}
      <PrecastPanelDetailReportDialog
        open={detailReportOpen}
        onClose={() => setDetailReportOpen(false)}
        inputs={calculationInput}
        results={results}
      />
    </Box>
  );
}