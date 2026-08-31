// src/features/design/modules/NMInteractionChart.jsx
import React from 'react';
import { Box, Alert } from '@mui/material';

/* 辅助函数：由于原文件中的 txPct 还被其他组件使用，这里单独为图表组件定义一份 */
const txPct = (value) => {
  const v = Number(value);
  return Number.isFinite(v) ? (v * 100).toFixed(1) : '—';
};

/**
 * BOUNDARY ELEMENT N-M INTERACTION CHART
 * 绘制内容：
 * · 名义 N-M 曲线（虚线，灰色）
 * · ϕ(N) 设计包络（实线，蓝色）：受压控制区 ϕc，向受弯区过渡至 ϕf
 * · 特征点：φP0（纯压）、Balanced（φNb, φMb）、φM0（纯弯）
 * · 需求点包络 D0, D1, D2（1.35G; 1.2G+1.5Q; 地震组合，含 Lintel 偏心弯矩）
 * · 各需求点沿等轴力方向内插到设计曲线的承载力示意线（UR = M* per φMb + N* per φNb）
 */
export default function NMInteractionChart({ boundary, height = 460 }) {
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