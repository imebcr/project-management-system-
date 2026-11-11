'use client';

import { motion } from 'framer-motion';
import { Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { pageTransition } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Palette catégorielle validée (ordre fixe, jamais cyclé) — scripts/validate_palette.js :
 * 6 slots PASS sur la surface verre (#f3fbfd) ; contraste < 3:1 pour aqua/jaune/magenta,
 * d'où légende + vue tableau systématiques.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const;
/** Couleurs de statut réservées : toujours accompagnées d'une icône ou d'un libellé. */
export const STATUS_COLOR = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' } as const;
/** Série unique : la couleur de marque. */
export const SINGLE = '#2AA4E7';

const GRID = 'rgba(12,34,75,0.08)';

function Tooltip({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style} className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/80 bg-white/95 px-2.5 py-1.5 text-xs text-navy shadow-lg shadow-ocean/10 backdrop-blur">
      {children}
    </div>
  );
}

export function ChartCard({ title, subtitle, children, table }: { title: string; subtitle?: string; children: ReactNode; table?: { head: string[]; rows: (string | number)[][] } }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="glass rounded-2xl p-4">
      <header className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-navy">{title}</h3>
          {subtitle && <p className="text-xs text-navy/45">{subtitle}</p>}
        </div>
        {table && (
          <button
            onClick={() => setShowTable((s) => !s)}
            aria-pressed={showTable}
            className={cn('flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors', showTable ? 'bg-brand text-white' : 'text-navy/45 hover:bg-white/60 hover:text-navy')}
          >
            <Table2 size={13} /> Tableau
          </button>
        )}
      </header>
      {showTable && table ? (
        <table className="w-full text-left text-xs">
          <thead><tr className="text-navy/45">{table.head.map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i} className="border-t border-white/60">
                {r.map((c, j) => <td key={j} className={cn('py-1.5 text-navy', j > 0 && 'tabular-nums')}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        children
      )}
    </section>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].find((s) => s * pow >= v / 4)! * pow;
  return Math.ceil(v / step) * step;
}

// ---------- Colonnes (évolution dans le temps, série unique) ----------

export function ColumnChart({ data, format = (v) => String(v), height = 160 }: { data: { label: string; value: number }[]; format?: (v: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const ticks = [0, max / 2, max];
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  const labelled = new Set([maxIdx, data.length - 1]);

  return (
    <div className="flex gap-2">
      <div className="relative w-8 shrink-0 text-right text-[10px] text-navy/40" style={{ height }}>
        {ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: height - (t / max) * height }}>{format(t)}</span>)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => <div key={t} className="absolute inset-x-0 h-px" style={{ top: height - (t / max) * height, background: GRID }} />)}
          <div className="absolute inset-0 flex">
            {data.map((d, i) => {
              const h = (d.value / max) * height;
              return (
                <div
                  key={d.label}
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.label} : ${format(d.value)}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="relative flex flex-1 items-end justify-center outline-none"
                >
                  {hover === i && <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2" style={{ background: GRID }} />}
                  {labelled.has(i) && d.value > 0 && hover !== i && (
                    <span className="absolute text-[10px] font-semibold text-navy" style={{ bottom: h + 4 }}>{format(d.value)}</span>
                  )}
                  <motion.div
                    className="w-full max-w-[24px] rounded-t"
                    style={{ background: SINGLE, opacity: hover === null || hover === i ? 1 : 0.55 }}
                    initial={{ height: 0 }}
                    animate={{ height: Math.max(d.value > 0 ? 2 : 0, h) }}
                    transition={pageTransition}
                  />
                  {hover === i && <Tooltip style={{ left: '50%', top: height - h - 6 }}><b>{d.label}</b> · {format(d.value)}</Tooltip>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1.5 flex">
          {data.map((d) => <span key={d.label} className="flex-1 truncate text-center text-[10px] text-navy/45">{d.label}</span>)}
        </div>
      </div>
    </div>
  );
}

// ---------- Barres horizontales (comparaison entre entités) ----------

export interface HBar {
  label: string;
  value: number;
  color?: string;
  /** Repère (ex. avancement attendu) dessiné comme un trait vertical. */
  marker?: number;
  /** Libellé accompagnant une couleur de statut (jamais la couleur seule). */
  note?: ReactNode;
}

export function HBarChart({ data, format = (v) => String(v), max: forcedMax, reference, markerLabel }: { data: HBar[]; format?: (v: number) => string; max?: number; reference?: { value: number; label: string }; markerLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = forcedMax ?? niceMax(Math.max(...data.map((d) => Math.max(d.value, d.marker ?? 0)), (reference?.value ?? 0) * 1.25));
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;

  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div
          key={d.label}
          tabIndex={0}
          role="img"
          aria-label={`${d.label} : ${format(d.value)}${d.marker !== undefined ? ` (${markerLabel} ${format(d.marker)})` : ''}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          className="relative grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-3 outline-none"
        >
          <span className="truncate text-xs font-medium text-navy/70">{d.label}</span>
          <div className="relative flex h-5 items-center">
            {reference && <div className="absolute inset-y-[-4px] w-px" style={{ left: pct(reference.value), background: 'rgba(12,34,75,0.35)' }} />}
            <motion.div
              className="h-3.5 rounded-r"
              style={{ background: d.color ?? SINGLE, opacity: hover === null || hover === i ? 1 : 0.55 }}
              initial={{ width: 0 }}
              animate={{ width: pct(d.value) }}
              transition={pageTransition}
            />
            {d.marker !== undefined && <div className="absolute h-5 w-0.5 rounded-full bg-navy" style={{ left: pct(d.marker) }} />}
            <span className="ml-2 shrink-0 text-[11px] font-semibold tabular-nums text-navy">{format(d.value)}</span>
            {d.note && <span className="ml-1.5 shrink-0 text-[11px] text-navy/50">{d.note}</span>}
            {hover === i && (
              <Tooltip style={{ left: pct(d.value / 2), top: -4 }}>
                <b>{d.label}</b> · {format(d.value)}
                {d.marker !== undefined && <> · {markerLabel} {format(d.marker)}</>}
              </Tooltip>
            )}
          </div>
        </div>
      ))}
      {reference && (
        <div className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-3 text-[10px] text-navy/40">
          <span />
          <span className="relative h-3"><span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(reference.value) }}>{reference.label}</span></span>
        </div>
      )}
    </div>
  );
}

// ---------- Barre segmentée (un tout réparti en parts) ----------

export function SegmentedBar({ parts, format = (v) => String(v) }: { parts: { label: string; value: number; color: string }[]; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const visible = parts.map((p, i) => ({ ...p, i })).filter((p) => p.value > 0);

  return (
    <div>
      <div className="relative flex h-2 gap-[2px]" role="img" aria-label={parts.map((p) => `${p.label} ${format(p.value)} (${Math.round((p.value / total) * 100)} %)`).join(', ')}>
        {visible.map((p) => (
          <motion.div
            key={p.label}
            tabIndex={0}
            onMouseEnter={() => setHover(p.i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(p.i)}
            onBlur={() => setHover(null)}
            className="relative h-full rounded-full outline-none first:rounded-l-full last:rounded-r-full"
            style={{ background: p.color, opacity: hover === null || hover === p.i ? 1 : 0.5 }}
            initial={{ flexGrow: 0 }}
            animate={{ flexGrow: p.value }}
            transition={pageTransition}
          >
            {hover === p.i && (
              <Tooltip style={{ left: '50%', top: -6 }}>
                <b>{p.label}</b> · {format(p.value)} · {Math.round((p.value / total) * 100)} %
              </Tooltip>
            )}
          </motion.div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {parts.map((p, i) => (
          <li key={p.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="flex items-center gap-1.5 text-xs text-navy/70">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            {p.label} <b className="font-semibold tabular-nums text-navy">{format(p.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
