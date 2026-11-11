'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, CalendarClock, CheckCircle2, DatabaseBackup, FolderKanban, ListChecks, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ChartCard, HBarChart, SegmentedBar, SERIES, STATUS_COLOR } from '@/components/charts';
import { ProjectCard } from '@/components/projects';
import { TaskDetailModal, TaskRow } from '@/components/tasks';
import { Badge, Card, Empty, MetaBadge, Page, PageHeader, ProgressBar, SectionLabel, Stat } from '@/components/ui';
import { deliveryDeadlines, expirations, lateBackups, type ExpiryItem } from '@/lib/expirations';
import { cardHover, cardSpring, staggerChildX, staggerChildY, staggerParent } from '@/lib/motion';
import { useStore, type AppState } from '@/lib/store';
import type { Health, Project, ProjectStatus, TaskStatus } from '@/lib/types';
import {
  daysUntil,
  expiryTone,
  fmtDate,
  fmtDateLong,
  headedProjects,
  healthMeta,
  isAdmin,
  milestoneStatus,
  projectHealth,
  projectProgress,
  projectStatusMeta,
  relDays,
  rolesLabel,
  sprintProgress,
  taskStatusMeta,
  visibleProjects,
} from '@/lib/utils';

export default function DashboardPage() {
  const { me } = useStore();
  const hour = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Algiers', hour: 'numeric', hour12: false }).format(new Date()));
  return (
    <Page>
      <PageHeader
        title={`${hour < 18 ? 'Bonjour' : 'Bonsoir'}, ${me.name.split(' ')[0]}`}
        subtitle={<span className="inline-block first-letter:uppercase">{fmtDateLong(new Date().toISOString())} · {rolesLabel(me)}</span>}
      />
      <div className="p-6">
        {isAdmin(me) ? <AdminDashboard /> : <DevDashboard />}
      </div>
    </Page>
  );
}

// ---------- Helpers ----------

function ExpiryList({ items, empty }: { items: ExpiryItem[]; empty: string }) {
  const { state } = useStore();
  if (!items.length) return <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45">{empty}</div>;
  return (
    <motion.ul className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
      {items.map((i) => (
        <motion.li key={i.kind + i.id} variants={staggerChildX} className="glass-sm flex items-center gap-3 rounded-2xl p-3">
          <Badge tone="muted">{i.kind}</Badge>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-navy">{i.label}</div>
            <div className="truncate text-xs text-navy/45">{state.projects.find((p) => p.id === i.projectId)?.name ?? '—'} · {fmtDate(i.date)}</div>
          </div>
          <Badge tone={expiryTone(i.days)}>{i.days < 0 ? `expiré ${relDays(i.date)}` : relDays(i.date)}</Badge>
        </motion.li>
      ))}
    </motion.ul>
  );
}

const PROJECT_STATUSES: ProjectStatus[] = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'DELIVERED', 'CLOSED', 'ARCHIVED'];
const TASK_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'];

function taskStatusParts(state: AppState, filter: (t: AppState['tasks'][number]) => boolean) {
  const tasks = state.tasks.filter((t) => t.status !== 'CANCELLED' && filter(t));
  return TASK_STATUSES.map((s, i) => ({ label: taskStatusMeta[s][0], value: tasks.filter((t) => t.status === s).length, color: SERIES[i] }));
}

// ---------- DSH-01 : tableau de bord statistique (admin) ----------

function AdminDashboard() {
  const { state } = useStore();
  const running = state.projects.filter((p) => p.status === 'ACTIVE' || p.status === 'ON_HOLD');
  const healthOf = (p: (typeof running)[number]) => projectHealth(p, state.tasks, state.milestones);
  const byHealth = (h: Health) => running.filter((p) => healthOf(p) === h);
  const openTasks = state.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED' && running.some((p) => p.id === t.projectId));
  const lateTasks = openTasks.filter((t) => daysUntil(t.dueDate) < 0);
  const deliveries = deliveryDeadlines(state, 30);
  const avgProgress = running.length ? Math.round(running.reduce((s, p) => s + projectProgress(p.id, state.tasks), 0) / running.length) : 0;

  const statusParts = PROJECT_STATUSES.map((s, i) => ({ label: projectStatusMeta[s][0], value: state.projects.filter((p) => p.status === s).length, color: SERIES[i] }));
  // Charge : tâches ouvertes par membre et par projet en cours (plus de suivi du temps).
  const perMember = state.users
    .filter((u) => u.active)
    .map((u) => ({ label: u.name, value: openTasks.filter((t) => t.assignees.includes(u.id)).length }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const progressRows = running.map((p) => {
    const start = Date.parse(p.startDate);
    const end = Date.parse(p.dueDate);
    const expected = Math.round(Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)));
    return { label: p.name, value: projectProgress(p.id, state.tasks), marker: expected };
  });
  const perProject = running
    .map((p) => ({
      label: p.name,
      value: openTasks.filter((t) => t.projectId === p.id).length,
      color: lateTasks.some((t) => t.projectId === p.id) ? STATUS_COLOR.warning : undefined,
    }))
    .sort((a, b) => b.value - a.value);
  const taskParts = taskStatusParts(state, (t) => running.some((p) => p.id === t.projectId) && !t.parentId);
  const backups = lateBackups(state);

  const healthTiles: { h: Health; icon: typeof CheckCircle2; color: string }[] = [
    { h: 'ON_TRACK', icon: CheckCircle2, color: STATUS_COLOR.good },
    { h: 'AT_RISK', icon: TrendingUp, color: STATUS_COLOR.warning },
    { h: 'LATE', icon: AlertTriangle, color: STATUS_COLOR.critical },
  ];

  return (
    <div className="space-y-6">
      <motion.div className="grid grid-cols-2 gap-3 lg:grid-cols-4" variants={staggerParent} initial="hidden" animate="show">
        <motion.div variants={staggerChildY}><Stat label="Projets en cours" value={running.length} hint={`${state.projects.filter((p) => p.status !== 'ARCHIVED').length} hors archives`} icon={<FolderKanban size={18} />} /></motion.div>
        <motion.div variants={staggerChildY}><Stat label="Avancement moyen" value={`${avgProgress} %`} hint="projets en cours" icon={<TrendingUp size={18} />} /></motion.div>
        <motion.div variants={staggerChildY}><Stat label="Tâches ouvertes" value={openTasks.length} hint={`${lateTasks.length} en retard`} icon={<ListChecks size={18} />} /></motion.div>
        <motion.div variants={staggerChildY}><Stat label="Échéances à 30 jours" value={deliveries.length} hint="livraisons et jalons" icon={<CalendarClock size={18} />} /></motion.div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        {healthTiles.map(({ h, icon: Icon, color }) => (
          <Card key={h} className="flex items-center gap-3 !p-3">
            <span className="rounded-xl p-2" style={{ background: `${color}22`, color }}><Icon size={18} /></span>
            <div className="flex-1">
              <div className="text-xs font-medium text-navy/50">{healthMeta[h][0]}</div>
              <div className="text-xl font-bold text-navy">{byHealth(h).length} <span className="text-xs font-medium text-navy/45">projet(s)</span></div>
            </div>
            <span className="max-w-[45%] truncate text-right text-xs text-navy/45">{byHealth(h).map((p) => p.name).join(', ') || '—'}</span>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Projets par statut" subtitle={`${state.projects.length} projets au total`} table={{ head: ['Statut', 'Projets'], rows: statusParts.map((p) => [p.label, p.value]) }}>
          <SegmentedBar parts={statusParts} />
        </ChartCard>
        <ChartCard title="Tâches des projets en cours" subtitle="Répartition par statut" table={{ head: ['Statut', 'Tâches'], rows: taskParts.map((p) => [p.label, p.value]) }}>
          <SegmentedBar parts={taskParts} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Tâches ouvertes par membre" subtitle="Projets en cours" table={{ head: ['Membre', 'Tâches'], rows: perMember.map((m) => [m.label, m.value]) }}>
          <HBarChart data={perMember} format={(v) => `${v}`} />
        </ChartCard>
        <ChartCard title="Tâches ouvertes par projet" subtitle="Orange : au moins une tâche en retard" table={{ head: ['Projet', 'Tâches'], rows: perProject.map((r) => [r.label, r.value]) }}>
          <HBarChart data={perProject} format={(v) => `${v}`} />
        </ChartCard>
      </div>

      <div className="grid gap-4">
        <ChartCard title="Avancement réel vs attendu" subtitle="Barre : réel · trait : attendu selon le temps écoulé" table={{ head: ['Projet', 'Réel', 'Attendu'], rows: progressRows.map((r) => [r.label, `${r.value} %`, `${r.marker} %`]) }}>
          <HBarChart data={progressRows} max={100} format={(v) => `${v} %`} markerLabel="attendu" />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section>
          <SectionLabel>Projets en retard / à risque</SectionLabel>
          <motion.div className="grid gap-3" variants={staggerParent} initial="hidden" animate="show">
            {[...byHealth('LATE'), ...byHealth('AT_RISK')].map((p) => <ProjectCard key={p.id} project={p} />)}
            {!byHealth('LATE').length && !byHealth('AT_RISK').length && <Empty icon={<CheckCircle2 />} title="Tout est en bonne voie" />}
          </motion.div>
        </section>
        <section>
          <SectionLabel action={<Link href="/agenda" className="text-xs font-semibold text-brand hover:text-ocean">Calendrier</Link>}>Livraisons et jalons à 30 jours</SectionLabel>
          <ExpiryList items={deliveries} empty="Aucune échéance" />
        </section>
        <section className="space-y-6">
          <div>
            <SectionLabel>Expirations à 30 jours</SectionLabel>
            <ExpiryList items={expirations(state, 30)} empty="Rien n'expire" />
          </div>
          <div>
            <SectionLabel>Sauvegardes en retard</SectionLabel>
            {backups.length ? (
              <div className="space-y-2">
                {backups.map((s) => (
                  <div key={s.id} className="glass-sm flex items-center gap-3 rounded-2xl p-3">
                    <DatabaseBackup size={18} className="text-red-500" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-navy">{s.label}</div>
                      <div className="text-xs text-navy/45">Dernière : {relDays(s.lastBackup)} · attendue tous les {s.backupFrequencyDays} j</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45">Toutes les sauvegardes sont à jour</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------- DSH-03 : accueil dev (+ bloc « Mes projets » s'il est responsable) ----------

function DevDashboard() {
  const { state, me } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const assigned = state.tasks.filter((t) => t.assignees.includes(me.id) && t.status !== 'CANCELLED');
  const pending = assigned.filter((t) => t.status !== 'DONE').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const late = pending.filter((t) => daysUntil(t.dueDate) < 0);
  const today = pending.filter((t) => daysUntil(t.dueDate) <= 0);
  const soon = pending.filter((t) => { const d = daysUntil(t.dueDate); return d > 0 && d <= 7; });
  const done = assigned.filter((t) => t.status === 'DONE').length;
  const rate = assigned.length ? Math.round((done / assigned.length) * 100) : 0;
  const projects = visibleProjects(me, state.projects).filter((p) => p.status === 'ACTIVE' || p.status === 'ON_HOLD');
  const headed = headedProjects(me, state.projects).filter((p) => p.status !== 'CLOSED');
  const parts = taskStatusParts(state, (t) => t.assignees.includes(me.id));
  const myPerProject = projects
    .map((p) => ({ label: p.name, value: pending.filter((t) => t.projectId === p.id).length }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <motion.div className="grid grid-cols-2 gap-3 lg:grid-cols-4" variants={staggerParent} initial="hidden" animate="show">
        <motion.div variants={staggerChildY}><Stat label="Tâches à traiter" value={pending.length} hint={`${late.length} en retard`} icon={<ListChecks size={18} />} /></motion.div>
        <motion.div variants={staggerChildY}><Stat label="Taux d'achèvement" value={`${rate} %`} hint={`${done} / ${assigned.length} terminées`} icon={<CheckCircle2 size={18} />} /></motion.div>
        <motion.div variants={staggerChildY}><Stat label="Cette semaine" value={soon.length} hint="échéances dans les 7 jours" icon={<CalendarClock size={18} />} /></motion.div>
        <motion.div variants={staggerChildY}><Stat label="Projets actifs" value={projects.length} icon={<FolderKanban size={18} />} /></motion.div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Mes tâches par statut" table={{ head: ['Statut', 'Tâches'], rows: parts.map((p) => [p.label, p.value]) }}>
          <SegmentedBar parts={parts} />
        </ChartCard>
        <ChartCard title="Mes tâches ouvertes par projet" table={{ head: ['Projet', 'Tâches'], rows: myPerProject.map((r) => [r.label, r.value]) }}>
          <HBarChart data={myPerProject} format={(v) => `${v}`} />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionLabel action={<Link href="/tasks" className="text-xs font-semibold text-brand hover:text-ocean">Toutes mes tâches</Link>}>Aujourd&apos;hui et en retard</SectionLabel>
          <motion.div className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
            {today.map((t) => <TaskRow key={t.id} task={t} onOpen={setOpen} showProject />)}
            {!today.length && <Empty icon={<CheckCircle2 />} title="Rien pour aujourd'hui" hint="Avancez sur les tâches de la semaine." />}
          </motion.div>
        </section>
        <section>
          <SectionLabel action={<Link href="/agenda" className="text-xs font-semibold text-brand hover:text-ocean">Calendrier</Link>}>7 prochains jours</SectionLabel>
          <motion.div className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
            {soon.map((t) => <TaskRow key={t.id} task={t} onOpen={setOpen} showProject />)}
            {!soon.length && <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45">Aucune échéance cette semaine</div>}
          </motion.div>
        </section>
      </div>

      {headed.length > 0 && <HeadProjects projects={headed} />}
      <TaskDetailModal taskId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Bloc « Mes projets » (v1.1) : projets dont le dev est responsable — avancement, sprint actif, prochain jalon. */
function HeadProjects({ projects }: { projects: Project[] }) {
  const { state } = useStore();
  return (
    <section>
      <SectionLabel action={<Link href="/projects" className="text-xs font-semibold text-brand hover:text-ocean">Tous mes projets</Link>}>Mes projets · responsable</SectionLabel>
      <motion.div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" variants={staggerParent} initial="hidden" animate="show">
        {projects.map((p) => {
          const progress = projectProgress(p.id, state.tasks);
          const health = projectHealth(p, state.tasks, state.milestones);
          const sprint = state.sprints.find((s) => s.projectId === p.id && s.status === 'ACTIVE');
          const next = state.milestones.filter((m) => m.projectId === p.id && m.status !== 'DONE').sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0];
          return (
            <motion.div key={p.id} variants={staggerChildY}>
              <Link href={`/projects/${p.id}/sprints`} className="block">
                <motion.div whileHover={cardHover} transition={cardSpring} className="glass h-full rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-ocean">{p.code}</div>
                      <div className="truncate font-bold text-navy">{p.name}</div>
                    </div>
                    <MetaBadge meta={healthMeta[health]} />
                  </div>
                  <div className="mt-3 flex items-center gap-2"><ProgressBar value={progress} tone={health === 'LATE' ? 'red' : health === 'AT_RISK' ? 'amber' : 'brand'} /><b className="text-sm text-navy">{progress}%</b></div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white/40 p-2">
                      <dt className="text-navy/45">Sprint actif</dt>
                      <dd className="truncate font-semibold text-navy">{sprint ? `${sprint.name} · ${sprintProgress(sprint.id, state.tasks)}%` : '—'}</dd>
                      {sprint && <dd className="text-[11px] text-navy/45">fin {relDays(sprint.endDate)}</dd>}
                    </div>
                    <div className="rounded-xl bg-white/40 p-2">
                      <dt className="text-navy/45">Prochain jalon</dt>
                      <dd className="truncate font-semibold text-navy">{next ? next.name : '—'}</dd>
                      {next && <dd className={milestoneStatus(next) === 'LATE' ? 'text-[11px] font-semibold text-red-500' : 'text-[11px] text-navy/45'}>{relDays(next.targetDate)}</dd>}
                    </div>
                  </dl>
                </motion.div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
