'use client';

import { CalendarPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AGENDA_TYPES, AgendaCalendar, AgendaLegend, AgendaList, localKey, visibleDays } from '@/components/agenda';
import { MeetingModal } from '@/components/project-tabs/meetings-tab';
import { Select } from '@/components/select';
import { TaskDetailModal } from '@/components/tasks';
import { Button, Page, PageHeader, SectionLabel, Segmented } from '@/components/ui';
import type { AgendaItem, AgendaType } from '@/lib/agenda';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { isAdmin, isMember } from '@/lib/utils';

type View = 'month' | 'week' | 'list';

/**
 * Calendrier : l'admin voit tout (tâches, réunions, livrables, sprints, jalons, livraisons, renouvellements) ;
 * un dev voit ses tâches et ses réunions, plus les échéances des projets dont il est chef.
 */
export default function AgendaPage() {
  const { state, me } = useStore();
  const router = useRouter();
  const admin = isAdmin(me);
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [day, setDay] = useState(() => localKey(new Date()));
  const [hidden, setHidden] = useState<AgendaType[]>([]);
  const [projectId, setProjectId] = useState('');
  const [personId, setPersonId] = useState('');
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [items, setItems] = useState<AgendaItem[] | null>(null);

  // Vue Liste : les 30 prochains jours à partir du jour sélectionné.
  const range = useMemo(() => {
    if (view === 'list') {
      const start = new Date(`${day}T00:00:00`);
      return { from: day, to: localKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 30)) };
    }
    const days = visibleDays(cursor, view);
    return { from: localKey(days[0]), to: localKey(days[days.length - 1]) };
  }, [view, cursor, day]);

  // Rechargé quand la période change ou quand l'état global est rafraîchi (toutes les 30 s).
  useEffect(() => {
    let live = true;
    api<AgendaItem[]>(`/me/agenda?from=${range.from}&to=${range.to}`)
      .then((data) => { if (live) setItems(data); })
      .catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [range.from, range.to, state]);

  if (!items) return null;

  const scoped = items.filter((i) => (!projectId || i.project.id === projectId) && (!personId || i.people.includes(personId)));
  const shown = scoped.filter((i) => !hidden.includes(i.type));
  const present = AGENDA_TYPES.filter((t) => admin || items.some((i) => i.type === t) || ['TASK', 'MEETING'].includes(t));
  const counts = Object.fromEntries(present.map((t) => [t, scoped.filter((i) => i.type === t).length])) as Partial<Record<AgendaType, number>>;
  const ofDay = shown.filter((i) => i.date === day);
  const projects = state.projects.filter((p) => p.status !== 'ARCHIVED');
  const people = state.users.filter((u) => u.active);
  const canSchedule = state.projects.some((p) => !['CLOSED', 'ARCHIVED'].includes(p.status) && (admin || isMember(p, me.id)));

  const move = (delta: number) => {
    const next = view === 'month' ? new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1) : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7 * delta);
    setCursor(next);
    setDay(localKey(view === 'month' ? next : visibleDays(next, 'week')[0]));
  };
  const today = () => { setCursor(new Date()); setDay(localKey(new Date())); };

  const open = (i: AgendaItem) => {
    const p = i.project.id;
    if (i.type === 'TASK') setOpenTask(i.id);
    else if (i.type === 'MEETING') router.push(`/projects/${p}?tab=meetings`);
    else if (i.type === 'DELIVERABLE') router.push(`/projects/${p}?tab=deliverables`);
    else if (i.type === 'SPRINT_START' || i.type === 'SPRINT_END') router.push(`/projects/${p}/sprints/${i.id}`);
    else if (i.type === 'MILESTONE') router.push(`/projects/${p}/sprints`);
    else if (i.type === 'RENEWAL') router.push('/servers');
    else router.push(`/projects/${p}`);
  };

  return (
    <Page>
      <PageHeader
        title="Calendrier"
        subtitle={admin ? 'Tâches, réunions, livrables, sprints, jalons, livraisons et renouvellements de tous les projets' : 'Vos tâches et réunions, et les échéances des projets dont vous êtes chef'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<View> value={view} onChange={setView} options={[{ value: 'month', label: 'Mois' }, { value: 'week', label: 'Semaine' }, { value: 'list', label: 'Liste' }]} />
            {canSchedule && <Button onClick={() => setScheduling(true)}><CalendarPlus size={15} /> <span className="hidden sm:inline">Planifier une réunion</span></Button>}
          </div>
        }
      />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="!w-auto min-w-[200px]" aria-label="Filtrer par projet">
            <option value="">Tous les projets</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
          {admin && (
            <Select value={personId} onChange={(e) => setPersonId(e.target.value)} className="!w-auto min-w-[180px]" aria-label="Filtrer par membre">
              <option value="">Tous les membres</option>
              {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
          {(projectId || personId || hidden.length > 0) && (
            <button onClick={() => { setProjectId(''); setPersonId(''); setHidden([]); }} className="text-xs font-semibold text-brand hover:text-ocean">Réinitialiser les filtres</button>
          )}
        </div>
        <AgendaLegend types={present} hidden={hidden} counts={counts} onToggle={(t) => setHidden((h) => (h.includes(t) ? h.filter((x) => x !== t) : [...h, t]))} />

        {view === 'list' ? (
          <section>
            <SectionLabel>À partir du {new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · 30 jours · {shown.length}</SectionLabel>
            <AgendaList items={shown} onOpen={open} empty="Rien de prévu sur cette période" showDate />
          </section>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
            <AgendaCalendar items={shown} cursor={cursor} view={view} selected={day} onSelect={setDay} onMove={move} onToday={today} />
            <section>
              <SectionLabel action={canSchedule && <button onClick={() => setScheduling(true)} className="flex items-center gap-1 text-xs font-semibold text-brand hover:text-ocean"><CalendarPlus size={13} /> Réunion ce jour</button>}>
                <span className="inline-block first-letter:uppercase">{new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span> · {ofDay.length}
              </SectionLabel>
              <AgendaList items={ofDay} onOpen={open} empty="Rien de prévu ce jour" />
            </section>
          </div>
        )}
      </div>
      <TaskDetailModal taskId={openTask} onClose={() => setOpenTask(null)} />
      {scheduling && <MeetingModal project={projectId ? state.projects.find((p) => p.id === projectId) : null} defaultDate={day >= localKey(new Date()) ? day : undefined} onClose={() => setScheduling(false)} />}
    </Page>
  );
}
