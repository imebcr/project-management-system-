'use client';

import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Diamond, Flag, ListChecks, MapPin, Package, PlayCircle, RefreshCw, Rocket, Users } from 'lucide-react';
import type { AgendaItem, AgendaType } from '@/lib/agenda';
import { staggerChildX, staggerChildY, staggerParent } from '@/lib/motion';
import { cn, daysUntil, fmtDate, priorityMeta, relDays, taskStatusMeta } from '@/lib/utils';
import { AvatarStack, Badge, Button, MetaBadge } from './ui';

/** Une couleur et une icône par type d'élément du calendrier. */
export const agendaMeta: Record<AgendaType, { label: string; plural: string; color: string; icon: typeof ListChecks }> = {
  MEETING: { label: 'Réunion', plural: 'Réunions', color: '#7c3aed', icon: Users },
  PROJECT_DUE: { label: 'Livraison projet', plural: 'Livraisons projet', color: '#d03b3b', icon: Rocket },
  MILESTONE: { label: 'Jalon', plural: 'Jalons', color: '#eda100', icon: Diamond },
  DELIVERABLE: { label: 'Livrable', plural: 'Livrables', color: '#eb6834', icon: Package },
  SPRINT_START: { label: 'Début de sprint', plural: 'Débuts de sprint', color: '#1baf7a', icon: PlayCircle },
  SPRINT_END: { label: 'Fin de sprint', plural: 'Fins de sprint', color: '#0f8a5f', icon: Flag },
  TASK: { label: 'Tâche', plural: 'Tâches', color: '#2a78d6', icon: ListChecks },
  RENEWAL: { label: 'Renouvellement', plural: 'Renouvellements', color: '#64748b', icon: RefreshCw },
};
export const AGENDA_TYPES = Object.keys(agendaMeta) as AgendaType[];

/** Date locale → YYYY-MM-DD (les jours du calendrier sont construits en heure locale). */
export function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function mondayOf(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

/** Jours affichés : 6 semaines (mois) ou 7 jours (semaine), lundi en premier. */
export function visibleDays(cursor: Date, view: 'month' | 'week') {
  if (view === 'week') {
    const start = mondayOf(cursor);
    return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = mondayOf(first);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function Dot({ type, done }: { type: AgendaType; done?: boolean }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: agendaMeta[type].color, opacity: done ? 0.4 : 1 }} />;
}

export const isDone = (i: AgendaItem) => ['DONE', 'CLOSED', 'VALIDATED', 'DELIVERED'].includes(i.status);

/** Légende cliquable : chaque type peut être masqué ou affiché. */
export function AgendaLegend({ types, hidden, counts, onToggle }: { types: AgendaType[]; hidden: AgendaType[]; counts: Partial<Record<AgendaType, number>>; onToggle: (t: AgendaType) => void }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {types.map((t) => {
        const Icon = agendaMeta[t].icon;
        const off = hidden.includes(t);
        return (
          <li key={t}>
            <button
              type="button"
              aria-pressed={!off}
              onClick={() => onToggle(t)}
              className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors', off ? 'border-white/60 bg-white/25 text-navy/35' : 'border-white/80 bg-white/60 text-navy/70 hover:bg-white/80')}
            >
              <Dot type={t} done={off} /> <Icon size={13} /> {agendaMeta[t].plural}
              {!!counts[t] && <span className="text-[10px] font-semibold text-navy/40">{counts[t]}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function AgendaCalendar({ items, cursor, view, selected, onSelect, onMove, onToday }: {
  items: AgendaItem[];
  cursor: Date;
  view: 'month' | 'week';
  selected: string;
  onSelect: (day: string) => void;
  onMove: (delta: number) => void;
  onToday: () => void;
}) {
  const days = visibleDays(cursor, view);
  const byDay: Record<string, AgendaItem[]> = {};
  for (const i of items) (byDay[i.date] ??= []).push(i);
  const today = localKey(new Date());
  const title = view === 'month'
    ? cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : `Semaine du ${days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  const limit = view === 'week' ? 8 : 3;

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="icon" onClick={() => onMove(-1)} aria-label={view === 'month' ? 'Mois précédent' : 'Semaine précédente'}><ChevronLeft size={18} /></Button>
        <div className="flex items-center gap-2">
          <span className="font-bold text-navy first-letter:uppercase">{title}</span>
          <button onClick={onToday} className="rounded-lg px-2 py-0.5 text-xs font-semibold text-brand hover:bg-brand/10">Aujourd&apos;hui</button>
        </div>
        <Button variant="icon" onClick={() => onMove(1)} aria-label={view === 'month' ? 'Mois suivant' : 'Semaine suivante'}><ChevronRight size={18} /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-navy/45">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => <div key={d}>{d}</div>)}
      </div>
      <motion.div className="mt-1 grid grid-cols-7 gap-1" variants={staggerParent} initial="hidden" animate="show" key={`${view}-${localKey(days[0])}`}>
        {days.map((d) => {
          const k = localKey(d);
          const list = byDay[k] ?? [];
          const outside = view === 'month' && d.getMonth() !== cursor.getMonth();
          return (
            <motion.button
              key={k}
              variants={staggerChildY}
              onClick={() => onSelect(k)}
              aria-pressed={k === selected}
              aria-label={`${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} : ${list.length} élément(s)`}
              className={cn(
                'flex flex-col rounded-xl p-1 text-left transition-colors',
                view === 'week' ? 'min-h-[200px]' : 'min-h-[58px] sm:min-h-[92px]',
                outside ? 'bg-white/10 opacity-50' : 'bg-white/35 hover:bg-white/60',
                k === today && 'ring-2 ring-brand',
                k === selected && 'bg-white/80 shadow-sm shadow-ocean/10',
              )}
            >
              <span className={cn('text-[11px] font-semibold', k === today ? 'text-brand' : 'text-navy/60')}>{d.getDate()}</span>
              <span className={cn('mt-auto flex flex-wrap gap-0.5', view === 'month' && 'sm:hidden')}>
                {view === 'month' && list.slice(0, 5).map((i) => <Dot key={i.type + i.id} type={i.type} done={isDone(i)} />)}
              </span>
              <span className={cn('mt-0.5 w-full space-y-0.5', view === 'month' ? 'hidden sm:block' : 'block')}>
                {list.slice(0, limit).map((i) => (
                  <span
                    key={i.type + i.id}
                    className={cn('flex items-center gap-1 truncate rounded-md px-1 py-0.5 text-[10px] font-medium text-navy', isDone(i) && 'line-through opacity-50')}
                    style={{ background: `${agendaMeta[i.type].color}1f` }}
                  >
                    <Dot type={i.type} />
                    {i.time && <span className="shrink-0 font-bold" style={{ color: agendaMeta[i.type].color }}>{i.time}</span>}
                    <span className="truncate">{i.title}</span>
                  </span>
                ))}
                {list.length > limit && <span className="block text-[10px] font-semibold text-navy/45">+{list.length - limit} autre(s)</span>}
              </span>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}

/** Liste détaillée (jour sélectionné, ou vue Liste) : heure, projet, statut, personnes, lieu. */
export function AgendaList({ items, onOpen, empty, showDate }: { items: AgendaItem[]; onOpen: (i: AgendaItem) => void; empty: string; showDate?: boolean }) {
  if (!items.length) return <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45">{empty}</div>;
  return (
    <motion.ul className="space-y-2" variants={staggerParent} initial="hidden" animate="show" key={items.map((i) => i.type + i.id).join()}>
      {items.map((i) => {
        const meta = agendaMeta[i.type];
        const Icon = meta.icon;
        const iso = `${i.date}T12:00:00Z`;
        const days = daysUntil(iso);
        const done = isDone(i);
        return (
          <motion.li key={i.type + i.id} variants={staggerChildX}>
            <button onClick={() => onOpen(i)} className="glass-sm flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-white/55">
              <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl" style={{ background: `${meta.color}22`, color: meta.color }}>
                <Icon size={16} />
                {i.time && <span className="text-[9px] font-bold leading-none">{i.time}</span>}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn('truncate text-sm font-semibold text-navy', done && 'line-through opacity-50')}>{i.title}</div>
                <div className="truncate text-xs text-navy/50">
                  {meta.label} · {i.project.code !== '—' ? `${i.project.code} · ${i.project.name}` : i.project.name}
                  {showDate && ` · ${fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' })}`}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-navy/50">
                  {i.type === 'MEETING' && (
                    <>
                      {i.duration && <span>{i.duration < 60 ? `${i.duration} min` : `${Math.floor(i.duration / 60)} h${i.duration % 60 ? ` ${i.duration % 60}` : ''}`}</span>}
                      {i.location && <span className="flex items-center gap-0.5"><MapPin size={11} /> {i.location}</span>}
                      {i.meetingKind === 'Client' && <Badge tone="amber">Client</Badge>}
                    </>
                  )}
                  {i.type === 'TASK' && i.priority && i.priority in priorityMeta && <MetaBadge meta={priorityMeta[i.priority as keyof typeof priorityMeta]} />}
                  {i.type === 'TASK' && i.status in taskStatusMeta && <MetaBadge meta={taskStatusMeta[i.status as keyof typeof taskStatusMeta]} />}
                  {i.type === 'RENEWAL' && <span>{i.status === 'AUTO' ? 'renouvellement auto' : i.status === 'MANUAL' ? 'à renouveler' : i.status}</span>}
                  {i.people.length > 0 && <AvatarStack ids={i.people} size={18} max={4} />}
                </div>
              </div>
              {i.type === 'MEETING' ? (
                <Badge tone={done ? 'muted' : days <= 0 ? 'brand' : 'muted'}>{done ? 'Passée' : relDays(iso)}</Badge>
              ) : (
                <Badge tone={done ? 'green' : days < 0 ? 'red' : days <= 1 ? 'amber' : 'muted'}>{done ? 'Terminé' : days < 0 ? `${-days} j de retard` : relDays(iso)}</Badge>
              )}
            </button>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

