'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Building2, Phone, Check, FileText, Package, Pause, Server, Users } from 'lucide-react';
import { useState } from 'react';
import { SegmentedBar, SERIES, STATUS_COLOR } from '@/components/charts';
import { TaskDetailModal, TaskRow } from '@/components/tasks';
import { Avatar, AvatarStack, Badge, DeptBadge, Card, MetaBadge, ProgressBar, SectionLabel } from '@/components/ui';
import { pageTransition, staggerChildY, staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { Project, TaskStatus } from '@/lib/types';
import {
  canUploadDeliverables,
  canManage,
  cdcStatusMeta,
  cn,
  DAY,
  daysUntil,
  fmtBytes,
  fmtDate,
  isAdmin,
  milestoneStatus,
  milestoneStatusMeta,
  projectHead,
  projectProgress,
  projectRoleLabel,
  projectTypeLabel,
  relDays,
  sprintProgress,
  taskStatusMeta,
} from '@/lib/utils';

export type ProjectTab = 'overview' | 'sprints' | 'cdc' | 'deliverables' | 'feedback' | 'meetings' | 'vault' | 'notes' | 'members';

function More({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs font-semibold text-brand hover:text-ocean">
      {children} <ArrowRight size={12} />
    </button>
  );
}

/** Personnes qui ont au moins une tâche (ou sous-tâche) dans le sprint. */
export function useSprintPeople() {
  const { state } = useStore();
  return (sprintId: string) => Array.from(new Set(state.tasks.filter((t) => t.sprintId === sprintId).flatMap((t) => t.assignees)));
}

export function OverviewTab({ project, goTo }: { project: Project; goTo: (t: ProjectTab) => void }) {
  const { state, me } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const sprintPeople = useSprintPeople();
  const headId = projectHead(project);
  const sprints = state.sprints.filter((s) => s.projectId === project.id).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const milestones = state.milestones.filter((m) => m.projectId === project.id).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  const roots = state.tasks.filter((t) => t.projectId === project.id && !t.parentId && t.status !== 'CANCELLED');
  const openTasks = roots.filter((t) => t.status !== 'DONE').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const versions = state.cdcVersions.filter((v) => v.projectId === project.id).sort((a, b) => b.number - a.number);
  const deliverables = canUploadDeliverables(me, project) ? state.deliverables.filter((d) => d.projectId === project.id) : null;
  const meetings = state.meetings.filter((m) => m.projectId === project.id).sort((a, b) => b.date.localeCompare(a.date));

  const statusParts: { s: TaskStatus; color: string }[] = [
    { s: 'TODO', color: SERIES[0] }, { s: 'IN_PROGRESS', color: SERIES[1] }, { s: 'IN_REVIEW', color: SERIES[2] }, { s: 'BLOCKED', color: SERIES[3] }, { s: 'DONE', color: SERIES[5] },
  ];

  const deadlines = [
    ...openTasks.map((t) => ({ id: t.id, label: t.title, kind: 'Tâche', date: t.dueDate, taskId: t.id })),
    ...milestones.filter((m) => m.status !== 'DONE').map((m) => ({ id: m.id, label: m.name, kind: 'Jalon', date: m.targetDate, taskId: undefined })),
    { id: 'delivery', label: 'Livraison finale', kind: 'Projet', date: project.dueDate, taskId: undefined },
  ]
    .filter((d) => daysUntil(d.date) <= 30)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  return (
    <motion.div className="space-y-6" variants={staggerParent} initial="hidden" animate="show">
      {/* Client + étape */}
      <motion.div variants={staggerChildY} className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card>
          <SectionLabel>Client et cadrage</SectionLabel>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-brand/10 p-2.5 text-brand"><Building2 size={20} /></div>
            <div className="min-w-0">
              <div className="truncate font-bold text-navy">{project.clientName}</div>
              <div className="text-xs text-navy/45">Projet {projectTypeLabel[project.type].toLowerCase()} · développement</div>
              {project.clientPhone && <a href={`tel:${project.clientPhone.replace(/[^0-9+]/g, '')}`} className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-ocean"><Phone size={12} /> {project.clientPhone}</a>}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div><dt className="text-navy/45">Début</dt><dd className="font-semibold text-navy">{fmtDate(project.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>
            <div><dt className="text-navy/45">Livraison prévue</dt><dd className="font-semibold text-navy">{fmtDate(project.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>
            <div className="col-span-2"><dt className="text-navy/45">Responsable du projet</dt><dd className="mt-1 flex items-center gap-2 font-semibold text-navy">{headId ? <><Avatar userId={headId} size={22} />{state.users.find((u) => u.id === headId)?.name}</> : <span className="font-medium text-navy/50">Aucun — géré par l&apos;admin</span>}</dd></div>
          </dl>
          {project.description && <p className="mt-3 text-sm text-navy/70">{project.description}</p>}
        </Card>
        <Card>
          <SectionLabel>Étape du projet</SectionLabel>
          <StatusStepper project={project} />
        </Card>
      </motion.div>

      {/* Chronologie */}
      <motion.div variants={staggerChildY}>
        <Card>
          <SectionLabel action={<More onClick={() => goTo('sprints')}>Sprints</More>}>Chronologie du projet</SectionLabel>
          <Timeline project={project} />
        </Card>
      </motion.div>

      <motion.div variants={staggerChildY} className="grid gap-6 lg:grid-cols-2">
        {/* Sprints */}
        <section>
          <SectionLabel action={<More onClick={() => goTo('sprints')}>Tableau des sprints</More>}>Sprints · {sprints.length}</SectionLabel>
          <div className="space-y-2">
            {sprints.map((s) => {
              const people = sprintPeople(s.id);
              const pr = sprintProgress(s.id, state.tasks);
              return (
                <div key={s.id} className={cn('glass-sm rounded-2xl p-3', s.status === 'ACTIVE' && 'ring-2 ring-brand/50', s.status === 'CLOSED' && 'opacity-60')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-bold text-navy">
                      {s.name}
                      {s.status === 'ACTIVE' ? <Badge tone="brand">Phase actuelle</Badge> : s.status === 'CLOSED' ? <Badge tone="muted">Clôturé</Badge> : <Badge tone="navy">Planifié</Badge>}
                    </span>
                    <span className="text-xs text-navy/45">{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-navy/50">{s.goal}</div>
                  <div className="mt-2 flex items-center gap-3">
                    <ProgressBar value={pr} />
                    <span className="text-xs font-semibold text-navy">{pr}%</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-navy/45">
                    <Users size={12} /> {people.length ? <><AvatarStack ids={people} max={5} size={20} /><span className="truncate">{people.map((id) => state.users.find((u) => u.id === id)?.name.split(' ')[0]).join(', ')}</span></> : 'Aucune tâche planifiée'}
                  </div>
                </div>
              );
            })}
            {!sprints.length && <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45">Aucun sprint</div>}
          </div>
        </section>

        {/* Échéances */}
        <section>
          <SectionLabel>Échéances à 30 jours</SectionLabel>
          <div className="space-y-2">
            {deadlines.map((d) => {
              const n = daysUntil(d.date);
              const body = (
                <>
                  <div className="w-11 shrink-0 text-center">
                    <div className="text-[10px] font-semibold uppercase text-navy/45">{fmtDate(d.date, { month: 'short' })}</div>
                    <div className="text-base font-bold leading-none text-navy">{fmtDate(d.date, { day: 'numeric' })}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-navy">{d.label}</div>
                    <div className="text-xs text-navy/45">{d.kind}</div>
                  </div>
                  <Badge tone={n < 0 ? 'red' : n <= 7 ? 'amber' : 'muted'}>{n < 0 ? `${-n} j de retard` : relDays(d.date)}</Badge>
                </>
              );
              return d.taskId ? (
                <button key={d.id} onClick={() => setOpen(d.taskId!)} className="glass-sm flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-white/50">{body}</button>
              ) : (
                <div key={d.id} className="glass-sm flex items-center gap-3 rounded-2xl p-3">{body}</div>
              );
            })}
            {!deadlines.length && <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45">Aucune échéance dans les 30 jours</div>}
          </div>
        </section>
      </motion.div>

      {/* Tâches */}
      <motion.section variants={staggerChildY}>
        <SectionLabel action={<More onClick={() => goTo('sprints')}>Tableau des sprints</More>}>Tâches · {roots.length}</SectionLabel>
        <Card>
          <SegmentedBar parts={statusParts.map(({ s, color }) => ({ label: taskStatusMeta[s][0], value: roots.filter((t) => t.status === s).length, color }))} />
        </Card>
        <div className="mt-3 space-y-2">
          {openTasks.slice(0, 5).map((t) => <TaskRow key={t.id} task={t} onOpen={setOpen} />)}
        </div>
      </motion.section>

      <motion.div variants={staggerChildY} className="grid gap-6 lg:grid-cols-2">
        {/* Membres */}
        <section>
          <SectionLabel action={<More onClick={() => goTo('members')}>Gérer</More>}>Équipe · {project.members.length}</SectionLabel>
          <div className="glass-sm divide-y divide-white/50 rounded-2xl">
            {project.members.map((m) => {
              const u = state.users.find((x) => x.id === m.userId)!;
              const active = state.tasks.filter((t) => t.projectId === project.id && t.assignees.includes(u.id) && t.status !== 'DONE' && t.status !== 'CANCELLED').length;
              return (
                <div key={m.userId} className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar userId={u.id} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold text-navy">{u.name}</span><DeptBadge department={u.department} /></div>
                    <div className="text-xs text-navy/45">{active} tâche(s) en cours</div>
                  </div>
                  <Badge tone={m.role === 'HEAD' ? 'amber' : 'muted'}>{projectRoleLabel[m.role]}</Badge>
                </div>
              );
            })}
          </div>
        </section>

        {/* CDC */}
        <section>
          <SectionLabel action={<More onClick={() => goTo('cdc')}>Comparer</More>}>Cahier des charges · {versions.length} version(s)</SectionLabel>
          <div className="space-y-2">
            {versions.map((v) => (
              <div key={v.id} className="glass-sm flex items-center gap-3 rounded-2xl p-3">
                <FileText size={18} className="shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="text-sm font-bold text-navy">v{v.number}</span><MetaBadge meta={cdcStatusMeta[v.status]} /></div>
                  <div className="truncate text-xs text-navy/45">{v.changeSummary} · {fmtDate(v.date)}</div>
                </div>
              </div>
            ))}
            {!versions.length && <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45">Aucune version</div>}
          </div>
        </section>
      </motion.div>

      <motion.div variants={staggerChildY} className={cn('grid gap-6', deliverables && 'lg:grid-cols-2')}>
        {deliverables && (
          <section>
            <SectionLabel action={<More onClick={() => goTo('deliverables')}>Ouvrir</More>}>Livrables déposés · {deliverables.length}</SectionLabel>
            <div className="space-y-2">
              {deliverables.map((d) => {
                const v = d.versions[d.versions.length - 1];
                return (
                  <div key={d.id} className="glass-sm flex items-center gap-3 rounded-2xl p-3">
                    <Package size={18} className="shrink-0 text-brand" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-navy">{d.name} · v{v.number}</div>
                      <div className="truncate text-xs text-navy/45">{v.fileName} · {fmtBytes(v.size)} · {relDays(v.date)}</div>
                    </div>
                  </div>
                );
              })}
              {!deliverables.length && <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45">Aucun livrable</div>}
            </div>
          </section>
        )}
        <section>
          <SectionLabel action={<More onClick={() => goTo('meetings')}>Toutes les réunions</More>}>Notes de réunion · {meetings.length}</SectionLabel>
          <div className="space-y-2">
            {meetings.slice(0, 3).map((m) => (
              <button key={m.id} onClick={() => goTo('meetings')} className="glass-sm block w-full rounded-2xl p-3 text-left hover:bg-white/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-navy">{m.title}</span>
                  <Badge tone={m.kind === 'Client' ? 'amber' : 'muted'}>{m.kind}</Badge>
                </div>
                <div className="mt-0.5 text-xs text-navy/45">{fmtDate(m.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {m.decisions.length} décision(s)</div>
              </button>
            ))}
            {!meetings.length && <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45">Aucune réunion</div>}
          </div>
        </section>
      </motion.div>

      <motion.div variants={staggerChildY}><RecentFeedback project={project} onOpen={() => goTo('feedback')} /></motion.div>

      {canManage(me, project) && <motion.div variants={staggerChildY}><ProjectServers project={project} /></motion.div>}

      <TaskDetailModal taskId={open} onClose={() => setOpen(null)} />
    </motion.div>
  );
}

/** Derniers retours à traiter (texte + photos), avec accès à l'onglet Retours. */
function RecentFeedback({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const { state } = useStore();
  const pending = state.feedbacks.filter((f) => f.projectId === project.id && (f.status === 'OPEN' || f.status === 'ACCEPTED')).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section>
      <SectionLabel action={<More onClick={onOpen}>Tous les retours</More>}>Retours à traiter · {pending.length}</SectionLabel>
      <div className="grid gap-2 md:grid-cols-3">
        {pending.slice(0, 3).map((f) => (
          <button key={f.id} onClick={onOpen} className="glass-sm flex gap-3 rounded-2xl p-3 text-left hover:bg-white/50">
            {f.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.images[0].url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><FileText size={20} /></span>
            )}
            <span className="min-w-0">
              <span className="line-clamp-2 text-sm font-semibold text-navy">{f.content}</span>
              <span className="text-[11px] text-navy/45">{relDays(f.date)}{f.images.length > 1 && ` · ${f.images.length} photos`}</span>
            </span>
          </button>
        ))}
        {!pending.length && <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45 md:col-span-3">Aucun retour en attente</div>}
      </div>
    </section>
  );
}

/** Serveurs du projet : l'admin ou le chef de projet les choisit dans la liste des serveurs de l'agence. */
function ProjectServers({ project }: { project: Project }) {
  const { state, me, setProjectServers } = useStore();
  const chosen = project.serverIds ?? [];
  const toggle = (id: string) => setProjectServers(project.id, chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  return (
    <section>
      <SectionLabel>Serveurs du projet · {chosen.length}</SectionLabel>
      <div className="glass-sm flex flex-wrap gap-2 rounded-2xl p-3">
        {!state.serverOptions.length && <span className="text-xs text-navy/45">Aucun serveur enregistré : l&apos;admin les ajoute dans l&apos;onglet Serveurs.</span>}
        {state.serverOptions.map((s) => {
          const on = chosen.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              aria-pressed={on}
              className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors', on ? 'bg-brand text-white shadow-sm shadow-brand/25' : 'bg-white/50 text-navy/60 hover:text-navy')}
            >
              <Server size={14} />
              <span>{s.label}<span className={cn('block text-[10px] font-medium', on ? 'text-white/80' : 'text-navy/40')}>{s.provider} · {s.type}</span></span>
              {on && <Check size={14} />}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-navy/40">Cliquez pour ajouter ou retirer un serveur. {isAdmin(me) ? 'Serveurs, domaines et échéances se gèrent dans la page Serveurs.' : 'Vous serez prévenu 7, 3 et 1 jour avant leur renouvellement.'}</p>
    </section>
  );
}

// ---------- Étapes (PRJ-02) ----------

const STEPS = [
  { key: 'DRAFT', label: 'Brouillon' },
  { key: 'ACTIVE', label: 'En cours' },
  { key: 'DELIVERED', label: 'Livré' },
  { key: 'CLOSED', label: 'Clôturé' },
] as const;

function StatusStepper({ project }: { project: Project }) {
  const { state } = useStore();
  const effective = project.status === 'ON_HOLD' ? 'ACTIVE' : project.status;
  const current = STEPS.findIndex((s) => s.key === effective);
  const progress = projectProgress(project.id, state.tasks);
  const activeSprint = state.sprints.find((s) => s.projectId === project.id && s.status === 'ACTIVE');
  const nextMs = state.milestones.filter((m) => m.projectId === project.id && m.status !== 'DONE').sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0];

  return (
    <div>
      {project.status === 'ARCHIVED' ? (
        <div className="rounded-xl bg-navy/5 p-3 text-sm font-semibold text-navy/60">Projet archivé — consultation seule.</div>
      ) : (
        <ol className="flex items-start">
          {STEPS.map((s, i) => {
            const done = i < current;
            const here = i === current;
            const paused = here && project.status === 'ON_HOLD';
            return (
              <li key={s.key} className="relative flex flex-1 flex-col items-center text-center">
                {i > 0 && <span className={cn('absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2', i <= current ? 'bg-brand' : 'bg-navy/10')} />}
                <span
                  className={cn(
                    'relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white/60',
                    done ? 'bg-brand text-white' : here ? (paused ? 'bg-amber-400 text-white' : 'bg-ocean text-white') : 'bg-white/70 text-navy/40',
                  )}
                >
                  {done ? <Check size={15} /> : paused ? <Pause size={14} /> : i + 1}
                </span>
                <span className={cn('mt-1.5 text-[11px] font-semibold', here ? 'text-navy' : 'text-navy/45')}>{paused ? 'En pause' : s.label}</span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/40 p-2"><div className="text-[11px] text-navy/45">Avancement</div><div className="text-lg font-bold text-navy">{progress}%</div></div>
        <div className="rounded-xl bg-white/40 p-2"><div className="text-[11px] text-navy/45">Phase</div><div className="truncate text-sm font-bold text-navy">{activeSprint?.name ?? '—'}</div></div>
        <div className="rounded-xl bg-white/40 p-2"><div className="text-[11px] text-navy/45">Prochain jalon</div><div className="truncate text-sm font-bold text-navy">{nextMs ? relDays(nextMs.targetDate) : '—'}</div></div>
      </div>
      {project.status === 'ON_HOLD' && project.holdReason && <p className="mt-2 text-xs font-medium text-amber-700">Motif : {project.holdReason}</p>}
    </div>
  );
}

// ---------- Chronologie : période du projet, sprints, jalons, aujourd'hui ----------

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
      <span className="text-[11px] font-medium text-navy/50">{label}</span>
      <div className="relative h-8">{children}</div>
    </div>
  );
}

function Timeline({ project }: { project: Project }) {
  const { state } = useStore();
  const [hover, setHover] = useState<string | null>(null);
  const sprints = state.sprints.filter((s) => s.projectId === project.id).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const milestones = state.milestones.filter((m) => m.projectId === project.id).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  const dates = [project.startDate, project.dueDate, ...sprints.flatMap((s) => [s.startDate, s.endDate]), ...milestones.map((m) => m.targetDate)].map((d) => Date.parse(d));
  const min = Math.min(...dates) - 3 * DAY;
  const max = Math.max(...dates) + 3 * DAY;
  const x = (iso: string | number) => `${(((typeof iso === 'string' ? Date.parse(iso) : iso) - min) / (max - min)) * 100}%`;
  const width = (a: string, b: string) => `${((Date.parse(b) - Date.parse(a)) / (max - min)) * 100}%`;
  const now = Date.now();
  const progress = projectProgress(project.id, state.tasks);

  // Repères mensuels
  const months: number[] = [];
  const m0 = new Date(min);
  for (let d = new Date(m0.getFullYear(), m0.getMonth() + 1, 1); d.getTime() < max; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d.getTime());

  const msColor = (s: ReturnType<typeof milestoneStatus>) => (s === 'DONE' ? STATUS_COLOR.good : s === 'LATE' ? STATUS_COLOR.critical : s === 'IN_PROGRESS' ? SERIES[0] : 'rgba(12,34,75,0.3)');

  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-[560px] space-y-1">
        {/* Mois */}
        <div className="grid grid-cols-[4.5rem_1fr] gap-2">
          <span />
          <div className="relative h-4 text-[10px] text-navy/40">
            {months.map((m) => <span key={m} className="absolute -translate-x-1/2 capitalize" style={{ left: x(m) }}>{new Date(m).toLocaleDateString('fr-FR', { month: 'short' })}</span>)}
          </div>
        </div>
        <div className="relative">
          {/* Grille mensuelle + aujourd'hui */}
          <div className="pointer-events-none absolute inset-y-0 left-[5rem] right-0">
            {months.map((m) => <div key={m} className="absolute inset-y-0 w-px bg-navy/[0.06]" style={{ left: x(m) }} />)}
            {now > min && now < max && (
              <div className="absolute inset-y-[-6px] z-10 w-0.5 bg-ocean" style={{ left: x(now) }}>
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-ocean px-1.5 text-[9px] font-bold text-white">Aujourd&apos;hui</span>
              </div>
            )}
          </div>

          <Row label={<>Projet<span className="block font-bold text-navy">{progress} %</span></>}>
            <div className="absolute top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-r bg-brand/20" style={{ left: x(project.startDate), width: width(project.startDate, project.dueDate) }}>
              <motion.div className="h-full bg-brand" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={pageTransition} />
            </div>
          </Row>

          <Row label="Sprints">
            {sprints.map((s) => (
              <div
                key={s.id}
                tabIndex={0}
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(s.id)}
                onBlur={() => setHover(null)}
                className={cn(
                  'absolute top-1/2 flex h-6 -translate-y-1/2 items-center overflow-hidden rounded px-1.5 text-[10px] font-semibold outline-none',
                  s.status === 'ACTIVE' ? 'bg-ocean text-white' : s.status === 'CLOSED' ? 'bg-navy/15 text-navy/60' : 'border border-dashed border-ocean/50 bg-white/50 text-ocean',
                )}
                style={{ left: x(s.startDate), width: `calc(${width(s.startDate, s.endDate)} - 2px)` }}
              >
                <span className="truncate">{s.name}</span>
              </div>
            ))}
          </Row>

          <Row label="Jalons">
            {milestones.map((m) => {
              const st = milestoneStatus(m);
              return (
                <div
                  key={m.id}
                  tabIndex={0}
                  onMouseEnter={() => setHover(m.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(m.id)}
                  onBlur={() => setHover(null)}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 outline-none"
                  style={{ left: x(m.targetDate) }}
                  aria-label={`${m.name} — ${milestoneStatusMeta[st][0]} — ${fmtDate(m.targetDate)}`}
                >
                  <span className="block h-3.5 w-3.5 rotate-45 rounded-[3px] ring-2 ring-white" style={{ background: msColor(st) }} />
                </div>
              );
            })}
          </Row>

          <div className="grid grid-cols-[4.5rem_1fr] gap-2">
            <span />
            <div className="relative h-8">
              {milestones.map((m, i) => (
                <span key={m.id} className={cn('absolute max-w-[8rem] -translate-x-1/2 truncate text-center text-[10px]', hover === m.id ? 'font-bold text-navy' : 'text-navy/50')} style={{ left: x(m.targetDate), top: i % 2 ? 14 : 0 }}>
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Détail au survol */}
        <div className="h-5 text-xs text-navy/60">
          {(() => {
            const s = sprints.find((x) => x.id === hover);
            const m = milestones.find((x) => x.id === hover);
            if (s) return <span><b className="text-navy">{s.name}</b> · {fmtDate(s.startDate)} → {fmtDate(s.endDate)} · {s.goal}</span>;
            if (m) return <span><b className="text-navy">◆ {m.name}</b> · {milestoneStatusMeta[milestoneStatus(m)][0]} · {fmtDate(m.targetDate, { day: 'numeric', month: 'long' })}</span>;
            return <span className="text-navy/40">Survolez un sprint ou un jalon pour le détail.</span>;
          })()}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-navy/55">
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-ocean" /> Sprint actif</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border border-dashed border-ocean/60" /> Planifié</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-navy/15" /> Clôturé</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ background: STATUS_COLOR.good }} /> Jalon atteint</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ background: STATUS_COLOR.critical }} /> Jalon en retard</li>
        </ul>
      </div>
    </div>
  );
}
