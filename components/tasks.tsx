'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertOctagon, ChevronDown, MessageSquare, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { cardHover, cardSpring, staggerChildY } from '@/lib/motion';
import type { Priority, Project, Task, TaskStatus, User } from '@/lib/types';
import {
  canManage,
  childrenOf,
  cn,
  daysUntil,
  fmtDate,
  fmtDateTime,
  isMember,
  priorityMeta,
  relDays,
  taskProgress,
  taskStatusMeta,
} from '@/lib/utils';
import { Avatar, AvatarStack, Badge, Button, ErrorNote, Field, MetaBadge, Modal, ProgressBar } from './ui';
import { Select } from './select';

export const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED', 'CANCELLED'];
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

// ---------- Droits sur une tâche (matrice v1.1) ----------

/** Admin / responsable : tout. Dev membre : ses tâches assignées et les sous-tâches de ses tâches. */
export function taskRights(user: User, project: Project, task: Task, all: Task[]) {
  const manage = canManage(user, project);
  const parent = task.parentId ? all.find((t) => t.id === task.parentId) : null;
  const assigned = task.assignees.includes(user.id);
  const ownsParent = !!parent?.assignees.includes(user.id);
  return {
    edit: manage || ownsParent,
    update: manage || assigned,
    addSubtask: !task.parentId && (manage || assigned),
    comment: manage || isMember(project, user.id),
  };
}

// ---------- Row ----------

export function TaskRow({ task, onOpen, showProject }: { task: Task; onOpen: (id: string) => void; showProject?: boolean }) {
  const { state } = useStore();
  const progress = taskProgress(task, state.tasks);
  const kids = childrenOf(task, state.tasks);
  const project = state.projects.find((p) => p.id === task.projectId);
  const days = daysUntil(task.dueDate);
  const overdue = days < 0 && task.status !== 'DONE' && task.status !== 'CANCELLED';
  return (
    <motion.button
      variants={staggerChildY}
      whileHover={{ y: -2 }}
      transition={cardSpring}
      onClick={() => onOpen(task.id)}
      className="glass-sm flex w-full items-center gap-3 rounded-2xl p-3 text-left"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {task.status === 'BLOCKED' && <AlertOctagon size={14} className="shrink-0 text-red-500" />}
          <span className={cn('truncate text-sm font-semibold text-navy', task.status === 'CANCELLED' && 'line-through opacity-50')}>{task.title}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy/45">
          {showProject && project && <span className="font-medium text-ocean">{project.code}</span>}
          <span className={cn(overdue && 'font-semibold text-red-500')}>{fmtDate(task.dueDate)} · {relDays(task.dueDate)}</span>
          {kids.length > 0 && <span>{kids.filter((k) => k.status === 'DONE').length}/{kids.length} sous-tâches</span>}
        </div>
        <ProgressBar value={progress} className="mt-2" tone={task.status === 'BLOCKED' ? 'red' : progress === 100 ? 'green' : 'brand'} />
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <MetaBadge meta={taskStatusMeta[task.status]} />
        <AvatarStack ids={task.assignees} size={22} />
      </div>
    </motion.button>
  );
}

// ---------- Detail modal ----------

export function TaskDetailModal({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const store = useStore();
  const { state, me } = store;
  const task = taskId ? state.tasks.find((t) => t.id === taskId) : null;
  const [blockReason, setBlockReason] = useState('');
  const [askBlock, setAskBlock] = useState(false);
  const [subTitle, setSubTitle] = useState('');
  const [comment, setComment] = useState('');

  if (!task) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const project = state.projects.find((p) => p.id === task.projectId)!;
  const rights = taskRights(me, project, task, state.tasks);
  const kids = childrenOf(task, state.tasks);
  const progress = taskProgress(task, state.tasks);
  const comments = state.comments.filter((c) => c.taskId === task.id);
  const milestone = state.milestones.find((m) => m.id === task.milestoneId);
  const sprint = state.sprints.find((s) => s.id === task.sprintId);
  const projectMembers = project.members.map((m) => m.userId);

  const changeStatus = (s: TaskStatus) => {
    if (s === 'BLOCKED') { setAskBlock(true); return; }
    store.setTaskStatus(task.id, s);
  };

  return (
    <Modal open onClose={onClose} title={task.parentId ? 'Sous-tâche' : 'Tâche'} wide>
      <div>
        <div className="text-xs font-medium text-ocean">{project.code} · {project.name}</div>
        {rights.edit ? (
          <input type="text" value={task.title} onChange={(e) => store.updateTask(task.id, { title: e.target.value })} className="mt-1 !text-base !font-bold" aria-label="Titre" />
        ) : (
          <h3 className="mt-1 text-lg font-bold text-navy">{task.title}</h3>
        )}
        {task.description && <p className="mt-2 whitespace-pre-line text-sm text-navy/70">{task.description}</p>}
        {task.blockedReason && <div className="mt-2"><ErrorNote>Bloquée : {task.blockedReason}</ErrorNote></div>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Statut">
          <Select value={task.status} disabled={!rights.update} onChange={(e) => changeStatus(e.target.value as TaskStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{taskStatusMeta[s][0]}</option>)}
          </Select>
        </Field>
        <Field label="Priorité">
          <Select value={task.priority} disabled={!rights.edit} onChange={(e) => store.updateTask(task.id, { priority: e.target.value as Priority })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{priorityMeta[p][0]}</option>)}
          </Select>
        </Field>
        <Field label="Échéance">
          <input type="date" disabled={!rights.edit} value={task.dueDate.slice(0, 10)} onChange={(e) => e.target.value && store.updateTask(task.id, { dueDate: new Date(e.target.value + 'T09:00:00Z').toISOString() })} />
        </Field>
        <Field label="Jalon">
          <Select disabled={!rights.edit || !!task.parentId} value={task.milestoneId ?? ''} onChange={(e) => store.updateTask(task.id, { milestoneId: e.target.value || null })}>
            <option value="">—</option>
            {state.milestones.filter((m) => m.projectId === project.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="Sprint">
          <Select disabled={!rights.edit} value={task.sprintId ?? ''} onChange={(e) => store.updateTask(task.id, { sprintId: e.target.value || null })}>
            <option value="">Backlog</option>
            {state.sprints.filter((s) => s.projectId === project.id && s.status !== 'CLOSED').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </div>

      <AnimatePresence>
        {askBlock && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="glass-sm space-y-2 overflow-hidden rounded-2xl p-3">
            <Field label="Motif du blocage (obligatoire)">
              <input type="text" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Ex. en attente des accès client" autoFocus />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAskBlock(false)}>Annuler</Button>
              <Button variant="danger" disabled={!blockReason.trim()} onClick={() => { store.setTaskStatus(task.id, 'BLOCKED', blockReason.trim()); setAskBlock(false); setBlockReason(''); }}>Bloquer</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="glass-sm rounded-2xl p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-navy/50">Avancement {kids.length > 0 && '(calculé depuis les sous-tâches)'}</span>
          <span className="text-sm font-bold text-navy">{progress} %</span>
        </div>
        {kids.length === 0 && rights.update ? (
          <input type="range" min={0} max={100} step={10} value={progress} onChange={(e) => store.setTaskProgress(task.id, Number(e.target.value))} className="w-full" aria-label="Avancement" />
        ) : (
          <ProgressBar value={progress} />
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-navy/50">Assignés</div>
        <div className="flex flex-wrap gap-2">
          {(rights.edit ? projectMembers : task.assignees).map((id) => {
            const on = task.assignees.includes(id);
            const u = state.users.find((x) => x.id === id)!;
            return (
              <button
                key={id}
                disabled={!rights.edit}
                onClick={() => {
                  const next = on ? task.assignees.filter((a) => a !== id) : [...task.assignees, id];
                  if (next.length) store.updateTask(task.id, { assignees: next });
                }}
                className={cn('flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-medium transition-colors', on ? 'bg-brand/15 text-ocean' : 'bg-white/40 text-navy/40')}
              >
                <Avatar userId={id} size={20} /> {u.name.split(' ')[0]}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-navy/45">
          {milestone && <Badge tone="navy">◆ {milestone.name}</Badge>}
          {sprint && <Badge tone="ocean">{sprint.name}</Badge>}
          {task.labels.map((l) => <Badge key={l} tone="muted">#{l}</Badge>)}
        </div>
      </div>

      {!task.parentId && (
        <div>
          <div className="mb-2 text-xs font-medium text-navy/50">Sous-tâches</div>
          <div className="space-y-1.5">
            {kids.map((k) => {
              const r = taskRights(me, project, k, state.tasks);
              return (
                <div key={k.id} className="glass-sm flex items-center gap-2 rounded-xl px-3 py-2">
                  <input
                    type="checkbox"
                    disabled={!r.update}
                    checked={k.status === 'DONE'}
                    onChange={(e) => store.setTaskStatus(k.id, e.target.checked ? 'DONE' : 'IN_PROGRESS')}
                    className="h-4 w-4 accent-brand"
                    aria-label={`Terminer ${k.title}`}
                  />
                  <span className={cn('flex-1 truncate text-sm text-navy', k.status === 'DONE' && 'text-navy/40 line-through')}>{k.title}</span>
                  <span className="text-xs text-navy/45">{taskProgress(k, state.tasks)} %</span>
                  <AvatarStack ids={k.assignees} size={20} />
                  {r.edit && (
                    <button onClick={() => store.deleteTask(k.id)} aria-label="Supprimer la sous-tâche" className="rounded-lg p-1 text-navy/30 hover:bg-red-50 hover:text-red-500"><Trash2 size={14} /></button>
                  )}
                </div>
              );
            })}
          </div>
          {rights.addSubtask && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!subTitle.trim()) return;
                store.createTask({ projectId: task.projectId, parentId: task.id, title: subTitle.trim(), assignees: [me.id], dueDate: task.dueDate, sprintId: task.sprintId });
                setSubTitle('');
              }}
            >
              <input type="text" value={subTitle} onChange={(e) => setSubTitle(e.target.value)} placeholder="Nouvelle sous-tâche…" />
              <Button type="submit" variant="secondary" aria-label="Ajouter la sous-tâche"><Plus size={16} /></Button>
            </form>
          )}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-navy/50"><MessageSquare size={13} /> Commentaires</div>
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <Avatar userId={c.userId} size={26} />
              <div className="glass-sm flex-1 rounded-2xl rounded-tl-sm px-3 py-2">
                <div className="text-[11px] text-navy/45">{state.users.find((u) => u.id === c.userId)?.name} · {fmtDateTime(c.date)}</div>
                <div className="text-sm text-navy" dangerouslySetInnerHTML={{ __html: escapeAndMention(c.body) }} />
              </div>
            </div>
          ))}
        </div>
        {rights.comment && (
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) { store.addComment(task.id, comment.trim()); setComment(''); } }}>
            <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Écrire un commentaire, @membre pour mentionner…" />
            <Button type="submit" aria-label="Envoyer"><Send size={15} /></Button>
          </form>
        )}
      </div>

      {rights.edit && (
        <div className="flex justify-end">
          <Button variant="ghost" className="!text-red-500 hover:!bg-red-50" onClick={() => { store.deleteTask(task.id); onClose(); }}>
            <Trash2 size={15} /> Supprimer
          </Button>
        </div>
      )}
    </Modal>
  );
}

function escapeAndMention(s: string) {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/@([\p{L}]+(?: [\p{L}]+)?)/gu, '<span class="font-semibold text-ocean">@$1</span>');
}

// ---------- New task ----------

export function NewTaskModal({ open, onClose, project, defaults }: { open: boolean; onClose: () => void; project: Project; defaults?: Partial<Task> }) {
  const { state, createTask } = useStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState(project.members[0]?.userId ?? '');
  const [due, setDue] = useState(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [milestoneId, setMilestoneId] = useState('');
  const [sprintId, setSprintId] = useState(defaults?.sprintId ?? '');

  const submit = () => {
    createTask({
      projectId: project.id, title: title.trim(), description, assignees: assignee ? [assignee] : [], dueDate: new Date(due + 'T09:00:00Z').toISOString(),
      priority, milestoneId: milestoneId || null, sprintId: sprintId || null, ...defaults,
    });
    setTitle(''); setDescription('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouvelle tâche"
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!title.trim()} onClick={submit}>Créer</Button></>}
    >
      <Field label="Titre"><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
      <Field label="Description (markdown simple)"><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Assigné">
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            {project.members.map((m) => <option key={m.userId} value={m.userId}>{state.users.find((u) => u.id === m.userId)?.name}</option>)}
          </Select>
        </Field>
        <Field label="Échéance"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Priorité">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{priorityMeta[p][0]}</option>)}
          </Select>
        </Field>
        <Field label="Jalon">
          <Select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
            <option value="">—</option>
            {state.milestones.filter((m) => m.projectId === project.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="Sprint">
          <Select value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
            <option value="">Backlog</option>
            {state.sprints.filter((s) => s.projectId === project.id && s.status !== 'CLOSED').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

// ---------- Kanban (TSK-07) ----------

export interface KanbanColumn {
  key: string;
  label: string;
  statuses: TaskStatus[];
  /** Statut appliqué quand on dépose une carte dans la colonne. */
  drop: TaskStatus;
}

export const FULL_COLUMNS: KanbanColumn[] = STATUSES.filter((s) => s !== 'CANCELLED').map((s) => ({ key: s, label: taskStatusMeta[s][0], statuses: [s], drop: s }));

export const SIMPLE_COLUMNS: KanbanColumn[] = [
  { key: 'todo', label: 'À faire', statuses: ['TODO'], drop: 'TODO' },
  { key: 'doing', label: 'En cours', statuses: ['IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'], drop: 'IN_PROGRESS' },
  { key: 'done', label: 'Terminé', statuses: ['DONE'], drop: 'DONE' },
];

const columnTone: Record<string, 'muted' | 'brand' | 'green'> = { todo: 'muted', doing: 'brand', done: 'green' };

export function Kanban({ tasks, onOpen, columns = FULL_COLUMNS, showProject }: { tasks: Task[]; onOpen: (id: string) => void; columns?: KanbanColumn[]; showProject?: boolean }) {
  const store = useStore();
  const [over, setOver] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const projectOf = (t: Task) => store.state.projects.find((p) => p.id === t.projectId)!;
  const canMove = (t: Task) => taskRights(store.me, projectOf(t), t, store.state.tasks).update;

  return (
    <div className="scrollbar-none -mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-2">
      {columns.map((col) => {
        const items = tasks.filter((t) => col.statuses.includes(t.status));
        return (
          <div
            key={col.key}
            onDragOver={(e) => { e.preventDefault(); setOver(col.key); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/plain');
              const t = store.state.tasks.find((x) => x.id === id);
              if (!t || col.statuses.includes(t.status) || !canMove(t)) return;
              if (col.drop === 'BLOCKED') { onOpen(id); return; }
              store.setTaskStatus(id, col.drop);
            }}
            className={cn('glass-sm min-w-[17rem] flex-1 shrink-0 snap-start rounded-2xl p-3 transition-colors', columns.length <= 3 ? 'lg:min-w-0' : columns.length <= 5 && 'xl:min-w-[12rem]', over === col.key && 'bg-brand/10 ring-2 ring-brand/40')}
          >
            <div className="mb-3 flex items-center justify-between">
              {col.statuses.length === 1 ? <MetaBadge meta={taskStatusMeta[col.statuses[0]]} /> : <Badge tone={columnTone[col.key] ?? 'brand'}>{col.label}</Badge>}
              <span className="text-xs font-semibold text-navy/40">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((t) => {
                const kids = childrenOf(t, store.state.tasks);
                const movable = canMove(t);
                const project = projectOf(t);
                return (
                  <div key={t.id} draggable={movable} onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}>
                    <motion.div
                      layout
                      whileHover={cardHover}
                      transition={cardSpring}
                      onClick={() => onOpen(t.id)}
                      className={cn('glass cursor-pointer rounded-xl p-3', movable && 'active:cursor-grabbing')}
                    >
                      {showProject && <div className="mb-1 truncate text-[10px] font-semibold text-ocean">{project.code} · {project.name}</div>}
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-navy">{t.title}</span>
                        <MetaBadge meta={priorityMeta[t.priority]} />
                      </div>
                      {col.statuses.length > 1 && t.status !== 'IN_PROGRESS' && <div className="mt-1"><MetaBadge meta={taskStatusMeta[t.status]} /></div>}
                      <ProgressBar value={taskProgress(t, store.state.tasks)} className="mt-2" tone={t.status === 'BLOCKED' ? 'red' : 'brand'} />
                      <div className="mt-2 flex items-center justify-between text-xs text-navy/45">
                        <span className={cn(daysUntil(t.dueDate) < 0 && t.status !== 'DONE' && 'font-semibold text-red-500')}>{fmtDate(t.dueDate)}</span>
                        <AvatarStack ids={t.assignees} size={20} />
                      </div>
                      {kids.length > 0 && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpanded((x) => ({ ...x, [t.id]: !x[t.id] })); }}
                            className="mt-2 flex items-center gap-1 text-[11px] font-medium text-ocean"
                          >
                            <ChevronDown size={12} className={cn('transition-transform', expanded[t.id] && 'rotate-180')} />
                            {kids.length} sous-tâches
                          </button>
                          <AnimatePresence>
                            {expanded[t.id] && (
                              <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-1 space-y-1 overflow-hidden">
                                {kids.map((k) => (
                                  <li key={k.id} className="flex items-center justify-between rounded-lg bg-white/50 px-2 py-1 text-xs text-navy">
                                    <span className={cn('truncate', k.status === 'DONE' && 'line-through opacity-50')}>{k.title}</span>
                                    <span className="text-navy/45">{taskProgress(k, store.state.tasks)}%</span>
                                  </li>
                                ))}
                              </motion.ul>
                            )}
                          </AnimatePresence>
                        </>
                      )}
                    </motion.div>
                  </div>
                );
              })}
              {!items.length && <div className="rounded-xl border border-dashed border-navy/10 py-6 text-center text-xs text-navy/35">Déposez une tâche ici</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
