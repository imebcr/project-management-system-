'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CalendarRange, Diamond, Flag, ListPlus, Lock, Pencil, Play, Plus, Square, Target } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FULL_COLUMNS, Kanban, NewTaskModal, TaskDetailModal } from '@/components/tasks';
import { AvatarStack, Badge, Button, Empty, ErrorNote, Field, MetaBadge, Modal, ProgressBar } from '@/components/ui';
import { cardHover, cardSpring, staggerChildY, staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { Milestone, Project, Sprint, Task } from '@/lib/types';
import {
  canManage,
  childrenOf,
  cn,
  daysUntil,
  fmtDate,
  milestoneProgress,
  milestoneStatus,
  milestoneStatusMeta,
  priorityMeta,
  sprintProgress,
  taskProgress,
  taskStatusMeta,
} from '@/lib/utils';
import { Select } from './select';

const sprintStatusMeta: Record<Sprint['status'], [string, 'brand' | 'navy' | 'muted']> = {
  ACTIVE: ['Actif', 'brand'],
  PLANNED: ['Planifié', 'navy'],
  CLOSED: ['Clôturé', 'muted'],
};

/** Personnes qui ont au moins une tâche (ou sous-tâche) dans le sprint. */
function sprintPeople(tasks: Task[], sprintId: string) {
  return Array.from(new Set(tasks.filter((t) => t.sprintId === sprintId).flatMap((t) => t.assignees)));
}

// ================= Niveau 1 : tableau des sprints =================

export function SprintBoard({ project }: { project: Project }) {
  const store = useStore();
  const { state, me } = store;
  const manage = canManage(me, project);
  const [milestone, setMilestone] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [form, setForm] = useState<Sprint | 'new' | null>(null);
  const [closing, setClosing] = useState<Sprint | null>(null);
  const [newTaskSprint, setNewTaskSprint] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const sprints = state.sprints.filter((s) => s.projectId === project.id).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const milestones = state.milestones.filter((m) => m.projectId === project.id).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  const roots = state.tasks.filter((t) => t.projectId === project.id && !t.parentId && t.status !== 'CANCELLED' && (!milestone || t.milestoneId === milestone));
  const columns: { key: string; sprint: Sprint | null }[] = [{ key: 'backlog', sprint: null }, ...sprints.map((s) => ({ key: s.id, sprint: s }))];

  /** Planifier = déplacer une tâche (et ses sous-tâches) vers un sprint ou le backlog (MIL-04). */
  const move = (taskId: string, sprint: Sprint | null) => {
    if (sprint?.status === 'CLOSED') { setError('Ce sprint est clôturé : il ne reçoit plus de tâches.'); return; }
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || task.sprintId === (sprint?.id ?? null)) return;
    setError(null);
    [task, ...childrenOf(task, state.tasks)].forEach((t) => store.updateTask(t.id, { sprintId: sprint?.id ?? null }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={milestone} onChange={(e) => setMilestone(e.target.value)} className="!w-auto" aria-label="Filtrer par jalon">
            <option value="">Tous les jalons</option>
            {milestones.map((m) => <option key={m.id} value={m.id}>◆ {m.name}</option>)}
          </Select>
        </div>
        {manage && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setNewTaskSprint(null)}><ListPlus size={15} /> Tâche</Button>
            <Button onClick={() => setForm('new')}><Plus size={15} /> Sprint</Button>
          </div>
        )}
      </div>
      {manage && <p className="text-xs text-navy/45">Glissez une tâche du backlog vers un sprint pour la planifier. Ouvrez un sprint pour suivre ses tâches par statut.</p>}
      <AnimatePresence>{error && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><ErrorNote>{error}</ErrorNote></motion.div>}</AnimatePresence>

      <div className="scrollbar-none -mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-2">
        {columns.map(({ key, sprint }) => {
          const items = roots.filter((t) => t.sprintId === (sprint?.id ?? null)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
          const closed = sprint?.status === 'CLOSED';
          const active = sprint?.status === 'ACTIVE';
          const canDrop = manage && dragging !== null && !closed;
          const progress = sprint ? sprintProgress(sprint.id, state.tasks) : 0;
          const people = sprint ? sprintPeople(state.tasks, sprint.id) : [];
          return (
            <section
              key={key}
              onDragOver={(e) => { if (canDrop) { e.preventDefault(); setOver(key); } }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); setDragging(null); if (manage) move(id, sprint); }}
              className={cn(
                'glass-sm flex w-72 shrink-0 snap-start flex-col rounded-2xl p-3 transition-all',
                active && 'ring-2 ring-brand/60',
                closed && 'opacity-60',
                canDrop && 'ring-2 ring-brand/30',
                over === key && canDrop && 'bg-brand/10',
              )}
              aria-label={sprint ? sprint.name : 'Backlog'}
            >
              <header className="mb-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  {sprint ? (
                    <Link href={`/projects/${project.id}/sprints/${sprint.id}`} className="flex min-w-0 items-center gap-1.5 font-bold text-navy hover:text-brand">
                      {closed && <Lock size={13} className="shrink-0 text-navy/40" />}
                      <span className="truncate">{sprint.name}</span>
                    </Link>
                  ) : (
                    <span className="font-bold text-navy">Backlog</span>
                  )}
                  <span className="flex shrink-0 items-center gap-1.5">
                    {sprint && <Badge tone={sprintStatusMeta[sprint.status][1]}>{active ? 'En cours' : sprintStatusMeta[sprint.status][0]}</Badge>}
                    <span className="text-xs font-semibold text-navy/40">{items.length}</span>
                  </span>
                </div>
                {sprint ? (
                  <>
                    <div className="flex items-center gap-1 text-[11px] text-navy/50"><CalendarRange size={12} /> {fmtDate(sprint.startDate)} → {fmtDate(sprint.endDate)}</div>
                    {sprint.goal && <div className="flex items-start gap-1 text-[11px] text-navy/60"><Target size={12} className="mt-0.5 shrink-0" /> {sprint.goal}</div>}
                    <div className="flex items-center gap-2"><ProgressBar value={progress} /><span className="text-[11px] font-semibold text-navy">{progress}%</span></div>
                    <div className="flex items-center justify-between gap-2">
                      {people.length ? <AvatarStack ids={people} size={20} max={4} /> : <span className="text-[11px] text-navy/40">Aucune tâche</span>}
                      <span className="flex gap-0.5">
                        {manage && !closed && (
                          <Button variant="icon" className="!p-1.5" aria-label={`Modifier ${sprint.name}`} onClick={() => setForm(sprint)}><Pencil size={13} /></Button>
                        )}
                        {manage && sprint.status === 'PLANNED' && (
                          <Button variant="icon" className="!p-1.5" aria-label={`Démarrer ${sprint.name}`} onClick={async () => { const r = await store.startSprint(sprint.id); setError(r.ok ? null : r.error); }}><Play size={13} /></Button>
                        )}
                        {manage && active && (
                          <Button variant="icon" className="!p-1.5" aria-label={`Clôturer ${sprint.name}`} onClick={() => setClosing(sprint)}><Square size={13} /></Button>
                        )}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-navy/50">Tâches sans sprint (MIL-04)</div>
                )}
              </header>

              <motion.div className="flex-1 space-y-2" variants={staggerParent} initial="hidden" animate="show">
                {items.map((t) => (
                  <div
                    key={t.id}
                    draggable={manage}
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); setDragging(t.id); }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                  >
                    <SprintTaskCard task={t} onOpen={() => setOpenTask(t.id)} draggable={manage} />
                  </div>
                ))}
                {!items.length && <div className="rounded-xl border border-dashed border-navy/10 py-6 text-center text-xs text-navy/35">{closed ? 'Sprint clôturé' : 'Déposez une tâche ici'}</div>}
              </motion.div>
              {sprint && (
                <Link href={`/projects/${project.id}/sprints/${sprint.id}`} className="mt-3 text-center text-xs font-semibold text-brand hover:text-ocean">Ouvrir le sprint →</Link>
              )}
            </section>
          );
        })}
      </div>
      {!sprints.length && <Empty icon={<CalendarRange />} title="Aucun sprint" hint={manage ? 'Créez un premier sprint puis planifiez-y des tâches du backlog.' : 'Le responsable du projet n’a pas encore planifié de sprint.'} />}

      <MilestonesPanel project={project} selected={milestone} onSelect={(id) => setMilestone((cur) => (cur === id ? '' : id))} />

      <TaskDetailModal taskId={openTask} onClose={() => setOpenTask(null)} />
      {newTaskSprint !== undefined && <NewTaskModal open onClose={() => setNewTaskSprint(undefined)} project={project} defaults={newTaskSprint ? { sprintId: newTaskSprint } : undefined} />}
      {form && <SprintFormModal project={project} sprint={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {closing && <CloseSprintModal sprint={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}

function SprintTaskCard({ task, onOpen, draggable }: { task: Task; onOpen: () => void; draggable: boolean }) {
  const { state } = useStore();
  const kids = childrenOf(task, state.tasks);
  const late = daysUntil(task.dueDate) < 0 && task.status !== 'DONE';
  return (
    <motion.div variants={staggerChildY} whileHover={cardHover} transition={cardSpring} onClick={onOpen} className={cn('glass cursor-pointer rounded-xl p-3', draggable && 'active:cursor-grabbing')}>
      <div className="flex items-start justify-between gap-2">
        <span className={cn('text-sm font-semibold text-navy', task.status === 'DONE' && 'text-navy/50 line-through')}>{task.title}</span>
        <MetaBadge meta={priorityMeta[task.priority]} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <MetaBadge meta={taskStatusMeta[task.status]} />
        {kids.length > 0 && <span className="text-[11px] text-navy/45">{kids.filter((k) => k.status === 'DONE').length}/{kids.length} sous-tâches</span>}
      </div>
      <ProgressBar value={taskProgress(task, state.tasks)} className="mt-2" tone={task.status === 'BLOCKED' ? 'red' : 'brand'} />
      <div className="mt-2 flex items-center justify-between text-[11px] text-navy/45">
        <span className={cn(late && 'font-semibold text-red-500')}>{fmtDate(task.dueDate)}</span>
        <AvatarStack ids={task.assignees} size={20} />
      </div>
    </motion.div>
  );
}

// ================= Niveau 2 : un sprint, kanban par statut =================

export function SprintTasks({ project, sprintId }: { project: Project; sprintId: string }) {
  const store = useStore();
  const { state, me } = store;
  const manage = canManage(me, project);
  const sprint = state.sprints.find((s) => s.id === sprintId && s.projectId === project.id);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!sprint) {
    return <Empty icon={<CalendarRange />} title="Sprint introuvable" action={<Link href={`/projects/${project.id}/sprints`} className="text-sm font-semibold text-brand">Retour au tableau des sprints</Link>} />;
  }
  const roots = state.tasks.filter((t) => t.projectId === project.id && t.sprintId === sprint.id && !t.parentId && t.status !== 'CANCELLED');
  const progress = sprintProgress(sprint.id, state.tasks);
  const people = sprintPeople(state.tasks, sprint.id);
  const done = roots.filter((t) => t.status === 'DONE').length;

  return (
    <div className="space-y-4">
      <Link href={`/projects/${project.id}/sprints`} className="inline-flex items-center gap-1 text-xs font-semibold text-navy/50 hover:text-navy"><ArrowLeft size={14} /> Tableau des sprints</Link>
      <div className={cn('glass rounded-2xl p-4', sprint.status === 'ACTIVE' && 'ring-2 ring-brand/50')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-navy">{sprint.name}</h2>
              <Badge tone={sprintStatusMeta[sprint.status][1]}>{sprint.status === 'ACTIVE' ? 'En cours' : sprintStatusMeta[sprint.status][0]}</Badge>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-navy/50">
              <span className="flex items-center gap-1"><CalendarRange size={12} /> {fmtDate(sprint.startDate)} → {fmtDate(sprint.endDate)}</span>
              {sprint.goal && <span className="flex items-center gap-1"><Target size={12} /> {sprint.goal}</span>}
            </div>
          </div>
          {manage && (
            <div className="flex flex-wrap gap-2">
              {sprint.status !== 'CLOSED' && <Button variant="secondary" onClick={() => setForm(true)}><Pencil size={14} /> Modifier</Button>}
              {sprint.status === 'PLANNED' && <Button variant="secondary" onClick={async () => { const r = await store.startSprint(sprint.id); setError(r.ok ? null : r.error); }}><Play size={14} /> Démarrer</Button>}
              {sprint.status === 'ACTIVE' && <Button variant="secondary" onClick={() => setClosing(true)}><Square size={14} /> Clôturer</Button>}
              {sprint.status !== 'CLOSED' && <Button onClick={() => setCreating(true)}><Plus size={15} /> Tâche</Button>}
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><div className="text-[11px] text-navy/45">Avancement</div><div className="flex items-center gap-2"><ProgressBar value={progress} /><b className="text-sm text-navy">{progress}%</b></div></div>
          <div><div className="text-[11px] text-navy/45">Tâches</div><div className="text-sm font-bold text-navy">{done} / {roots.length} terminées</div></div>
          <div className="col-span-2"><div className="text-[11px] text-navy/45">Équipe du sprint</div><div className="mt-0.5 flex items-center gap-2">{people.length ? <><AvatarStack ids={people} size={22} max={6} /><span className="truncate text-xs text-navy/60">{people.map((id) => state.users.find((u) => u.id === id)?.name.split(' ')[0]).join(', ')}</span></> : <span className="text-xs text-navy/40">—</span>}</div></div>
        </div>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {roots.length ? (
        <Kanban tasks={roots} onOpen={setOpenTask} columns={FULL_COLUMNS} />
      ) : (
        <Empty icon={<ListPlus />} title="Aucune tâche dans ce sprint" hint={manage ? 'Ajoutez une tâche ou planifiez-en depuis le backlog.' : undefined} />
      )}
      <TaskDetailModal taskId={openTask} onClose={() => setOpenTask(null)} />
      {creating && <NewTaskModal open onClose={() => setCreating(false)} project={project} defaults={{ sprintId: sprint.id }} />}
      {form && <SprintFormModal project={project} sprint={sprint} onClose={() => setForm(false)} />}
      {closing && <CloseSprintModal sprint={sprint} onClose={() => setClosing(false)} />}
    </div>
  );
}

// ================= Modales =================

function SprintFormModal({ project, sprint, onClose }: { project: Project; sprint: Sprint | null; onClose: () => void }) {
  const { state, createSprint, updateSprint } = useStore();
  const n = state.sprints.filter((s) => s.projectId === project.id).length + 1;
  const [name, setName] = useState(sprint?.name ?? '');
  const [goal, setGoal] = useState(sprint?.goal ?? '');
  const [start, setStart] = useState((sprint?.startDate ?? new Date().toISOString()).slice(0, 10));
  const [end, setEnd] = useState((sprint?.endDate ?? new Date(Date.now() + 14 * 86_400_000).toISOString()).slice(0, 10));
  const invalid = end < start;
  const submit = () => {
    const data = { name: name.trim() || `Sprint ${n}`, goal: goal.trim(), startDate: new Date(start + 'T08:00:00Z').toISOString(), endDate: new Date(end + 'T17:00:00Z').toISOString() };
    if (sprint) updateSprint(sprint.id, data);
    else createSprint({ projectId: project.id, ...data });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={sprint ? `Modifier ${sprint.name}` : 'Nouveau sprint'} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={invalid} onClick={submit}>{sprint ? 'Enregistrer' : 'Créer'}</Button></>}>
      <Field label="Nom"><input type="text" value={name} placeholder={`Sprint ${n}`} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label="Objectif"><input type="text" value={goal} onChange={(e) => setGoal(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Fin" hint="Durée libre, 2 semaines par défaut"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      {invalid && <ErrorNote>La date de fin doit suivre la date de début.</ErrorNote>}
    </Modal>
  );
}

/** MIL-05 : tâches non terminées → sprint suivant ou backlog, avec résumé de clôture. */
function CloseSprintModal({ sprint, onClose }: { sprint: Sprint; onClose: () => void }) {
  const { state, closeSprint } = useStore();
  const tasks = state.tasks.filter((t) => t.sprintId === sprint.id && t.status !== 'CANCELLED');
  const done = tasks.filter((t) => t.status === 'DONE');
  const open = tasks.filter((t) => t.status !== 'DONE');
  const next = state.sprints.filter((s) => s.projectId === sprint.projectId && s.status === 'PLANNED').sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const [target, setTarget] = useState<string>(next?.id ?? '');
  return (
    <Modal open onClose={onClose} title={`Clôturer ${sprint.name}`} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={() => { closeSprint(sprint.id, target || null); onClose(); }}>Clôturer</Button></>}>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Prévu', tasks.length], ['Terminé', done.length], ['Restant', open.length]].map(([l, v]) => (
          <div key={l} className="glass-sm rounded-2xl p-3"><div className="text-xs text-navy/50">{l}</div><div className="text-lg font-bold text-navy">{v}</div></div>
        ))}
      </div>
      {open.length > 0 && (
        <>
          <div className="text-sm text-navy">{open.length} tâche(s) non terminée(s) :</div>
          <ul className="space-y-1 text-sm text-navy/70">{open.map((t) => <li key={t.id} className="flex items-center gap-2"><Flag size={12} className="text-amber-500" />{t.title}</li>)}</ul>
          <Field label="Les déplacer vers">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              {next && <option value={next.id}>{next.name} (sprint suivant)</option>}
              <option value="">Backlog</option>
            </Select>
          </Field>
        </>
      )}
    </Modal>
  );
}

/** Jalons (MIL-01), affichés en permanence sous les sprints : suivi, création, et filtre du tableau au clic. */
function MilestonesPanel({ project, selected, onSelect }: { project: Project; selected: string; onSelect: (id: string) => void }) {
  const { state, me, createMilestone, setMilestoneStatus } = useStore();
  const manage = canManage(me, project);
  const milestones = state.milestones.filter((m) => m.projectId === project.id).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10));
  const next: Record<Milestone['status'], Milestone['status'] | null> = { PLANNED: 'IN_PROGRESS', IN_PROGRESS: 'DONE', DONE: null };
  const done = milestones.filter((m) => m.status === 'DONE').length;
  return (
    <section className="space-y-3 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-navy"><Diamond size={16} className="text-brand" /> Jalons <span className="text-xs font-medium text-navy/45">{done} / {milestones.length} atteint(s)</span></h2>
        {selected && <button onClick={() => onSelect(selected)} className="text-xs font-semibold text-brand hover:text-ocean">Afficher toutes les tâches</button>}
      </div>
      <motion.ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" variants={staggerParent} initial="hidden" animate="show">
        {milestones.map((m) => {
          const st = milestoneStatus(m);
          const to = next[m.status];
          const progress = milestoneProgress(m.id, state.tasks);
          const tasks = state.tasks.filter((t) => t.milestoneId === m.id && !t.parentId && t.status !== 'CANCELLED').length;
          const on = selected === m.id;
          return (
            <motion.li key={m.id} variants={staggerChildY}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={on}
                onClick={() => onSelect(m.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(m.id); } }}
                title={on ? 'Retirer le filtre' : 'Filtrer le tableau sur ce jalon'}
                className={cn('glass-sm h-full cursor-pointer rounded-2xl p-3 transition-colors hover:bg-white/55', on && 'ring-2 ring-brand/60')}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-navy">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]', st === 'DONE' ? 'bg-emerald-500' : st === 'LATE' ? 'bg-red-500' : 'bg-brand')} />
                    <span className="truncate">{m.name}</span>
                  </span>
                  <MetaBadge meta={milestoneStatusMeta[st]} />
                </div>
                <div className="mt-2 flex items-center gap-2"><ProgressBar value={progress} tone={st === 'DONE' ? 'green' : st === 'LATE' ? 'red' : 'brand'} /><span className="text-[11px] font-semibold text-navy">{progress}%</span></div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-navy/50">
                  <span className="flex items-center gap-1"><CalendarRange size={12} /> {fmtDate(m.targetDate, { day: 'numeric', month: 'long' })} · {tasks} tâche(s)</span>
                  {manage && to && (
                    <button onClick={(e) => { e.stopPropagation(); setMilestoneStatus(m.id, to); }} className="rounded-lg px-1.5 py-0.5 font-semibold text-brand hover:bg-brand/10 hover:text-ocean">
                      {to === 'IN_PROGRESS' ? 'Démarrer' : 'Marquer atteint'}
                    </button>
                  )}
                </div>
              </div>
            </motion.li>
          );
        })}
        {manage && (
          <motion.li variants={staggerChildY}>
            <form
              className="h-full space-y-2 rounded-2xl border border-dashed border-brand/30 bg-white/25 p-3"
              onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; createMilestone({ projectId: project.id, name: name.trim(), description: '', targetDate: new Date(date + 'T09:00:00Z').toISOString() }); setName(''); }}
            >
              <div className="text-xs font-semibold text-navy">Nouveau jalon</div>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du jalon" aria-label="Nom du jalon" />
              <div className="flex gap-2">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date cible" />
                <Button type="submit" disabled={!name.trim()} className="shrink-0"><Plus size={14} /> Ajouter</Button>
              </div>
            </form>
          </motion.li>
        )}
      </motion.ul>
      {!milestones.length && !manage && <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45">Aucun jalon pour ce projet.</div>}
    </section>
  );
}
