'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Columns3, List, Search, SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Kanban, SIMPLE_COLUMNS, STATUSES, TaskDetailModal, TaskRow } from '@/components/tasks';
import { Badge, Button, Empty, Page, PageHeader, SectionLabel, Segmented } from '@/components/ui';
import { staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { Priority, TaskStatus } from '@/lib/types';
import { daysUntil, isDev, priorityMeta, taskStatusMeta, visibleProjects } from '@/lib/utils';
import { Select } from '@/components/select';

type View = 'list' | 'kanban';
type StatusFilter = 'open' | 'all' | TaskStatus;
type Due = 'all' | 'late' | 'week' | 'month';

const buckets = [
  { id: 'late', label: 'En retard', test: (d: number) => d < 0, tone: 'red' as const },
  { id: 'today', label: "Aujourd'hui", test: (d: number) => d === 0, tone: 'brand' as const },
  { id: 'week', label: 'Cette semaine', test: (d: number) => d > 0 && d <= 7, tone: 'navy' as const },
  { id: 'later', label: 'Plus tard', test: (d: number) => d > 7, tone: 'muted' as const },
];

export default function TasksPage() {
  const { state, me } = useStore();
  // v1.1 : « Mes tâches » est réservé aux devs ; l'admin n'a pas cette section.
  const router = useRouter();
  const admin = !isDev(me); // sans rôle Dev : pas de section
  useEffect(() => { if (admin) router.replace('/'); }, [admin, router]);
  const [view, setView] = useState<View>('list');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [project, setProject] = useState('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [due, setDue] = useState<Due>('all');
  const [showFilters, setShowFilters] = useState(false);

  const projects = visibleProjects(me, state.projects).filter((p) => p.status !== 'ARCHIVED');

  const scoped = useMemo(() => {
    const ids = projects.map((p) => p.id);
    const term = q.trim().toLowerCase();
    return state.tasks
      .filter((t) => ids.includes(t.projectId))
      // Tâches et sous-tâches assignées au dev, tous projets confondus (TSK-08).
      .filter((t) => t.assignees.includes(me.id))
      .filter((t) => !project || t.projectId === project)
      .filter((t) => !priority || t.priority === priority)
      .filter((t) => !term || t.title.toLowerCase().includes(term))
      .filter((t) => {
        const d = daysUntil(t.dueDate);
        if (due === 'late') return d < 0 && t.status !== 'DONE';
        if (due === 'week') return d >= 0 && d <= 7;
        if (due === 'month') return d >= 0 && d <= 31;
        return true;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [state.tasks, projects, me.id, project, priority, q, due]);

  const listed = scoped.filter((t) => (status === 'open' ? t.status !== 'DONE' && t.status !== 'CANCELLED' : status === 'all' ? true : t.status === status));
  const kanbanTasks = scoped.filter((t) => t.status !== 'CANCELLED');
  const activeFilters = [project, priority, due !== 'all' ? due : ''].filter(Boolean).length;
  const groupByDue = status === 'open';

  if (admin) return null;

  return (
    <Page>
      <PageHeader
        title="Mes tâches"
        subtitle={`${scoped.filter((t) => t.status !== 'DONE').length} à traiter, tous projets confondus`}
        actions={<Segmented value={view} onChange={setView} options={[{ value: 'list', label: <><List size={14} /> Liste</> }, { value: 'kanban', label: <><Columns3 size={14} /> Kanban</> }]} />}
      />
      <div className="space-y-4 p-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy/35" />
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une tâche…" className="!pl-9" />
          </div>
          <Button variant="secondary" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <SlidersHorizontal size={16} /> <span className="hidden sm:inline">Filtres</span>
            {activeFilters > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{activeFilters}</span>}
          </Button>
        </div>

        <motion.div initial={false} animate={{ height: showFilters ? 'auto' : 0, opacity: showFilters ? 1 : 0 }} className="overflow-hidden">
          <div className="glass-sm grid grid-cols-2 gap-3 rounded-2xl p-3 md:grid-cols-3 xl:grid-cols-5">
            <Select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Projet">
              <option value="">Tous les projets</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} aria-label="Priorité">
              <option value="">Toutes priorités</option>
              {Object.entries(priorityMeta).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Select value={due} onChange={(e) => setDue(e.target.value as Due)} aria-label="Échéance">
              <option value="all">Toutes échéances</option>
              <option value="late">En retard</option>
              <option value="week">7 prochains jours</option>
              <option value="month">30 prochains jours</option>
            </Select>
            {view === 'list' && (
              <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Statut">
                <option value="open">Ouvertes</option>
                <option value="all">Tous statuts</option>
                {STATUSES.map((s) => <option key={s} value={s}>{taskStatusMeta[s][0]}</option>)}
              </Select>
            )}
          </div>
        </motion.div>

        {view === 'kanban' ? (
          <Kanban tasks={kanbanTasks} onOpen={setOpen} columns={SIMPLE_COLUMNS} showProject />
        ) : !listed.length ? (
          <Empty icon={<CheckCircle2 />} title="Aucune tâche" hint="Modifiez la recherche ou les filtres." />
        ) : groupByDue ? (
          <div className="mx-auto max-w-4xl space-y-6">
            {buckets.map((b) => {
              const items = listed.filter((t) => b.test(daysUntil(t.dueDate)));
              if (!items.length) return null;
              return (
                <section key={b.id}>
                  <SectionLabel action={<Badge tone={b.tone}>{items.length}</Badge>}>{b.label}</SectionLabel>
                  <motion.div className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
                    {items.map((t) => <TaskRow key={t.id} task={t} onOpen={setOpen} showProject />)}
                  </motion.div>
                </section>
              );
            })}
          </div>
        ) : (
          <motion.div className="mx-auto max-w-4xl space-y-2" variants={staggerParent} initial="hidden" animate="show" key={status}>
            {listed.map((t) => <TaskRow key={t.id} task={t} onOpen={setOpen} showProject />)}
          </motion.div>
        )}
      </div>
      <TaskDetailModal taskId={open} onClose={() => setOpen(null)} />
    </Page>
  );
}
