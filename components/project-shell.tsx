'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Archive, ArrowLeft, CalendarDays, CheckCheck, ChevronDown, Crown, Lock, PauseCircle, PlayCircle, Send } from 'lucide-react';
import Link from 'next/link';
import { notFound, useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { ProjectTab } from '@/components/project-tabs/overview-tab';
import { HeadRibbon, typeIcon, useProjectMetrics } from '@/components/projects';
import { Button, ErrorNote, Field, MetaBadge, Modal, Page, ProgressRing } from '@/components/ui';
import { cardSpring } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { Project, ProjectStatus } from '@/lib/types';
import { canManage, canPostFeedback, canTransition, canUploadDeliverables, cn, daysUntil, fmtDateLong, healthMeta, isAdmin, isHead, projectHead, projectStatusMeta, projectTypeLabel, visibleProjects } from '@/lib/utils';

const TABS: { id: ProjectTab; label: string }[] = [
  { id: 'overview', label: 'Aperçu' },
  { id: 'sprints', label: 'Sprints' },
  { id: 'cdc', label: 'Cahier des charges' },
  { id: 'deliverables', label: 'Livrables' },
  { id: 'feedback', label: 'Retours' },
  { id: 'meetings', label: 'Réunions' },
  { id: 'vault', label: 'Accès' },
  { id: 'notes', label: 'Notes' },
  { id: 'members', label: 'Membres' },
];

/** Anciens onglets (avant v1.1) redirigés vers l'onglet Sprints. */
const LEGACY_SPRINT_TABS = ['tasks', 'milestones'];

const transitions: Partial<Record<ProjectStatus, { to: ProjectStatus; label: string; icon: typeof Send }[]>> = {
  DRAFT: [{ to: 'ACTIVE', label: 'Démarrer', icon: PlayCircle }],
  ACTIVE: [{ to: 'ON_HOLD', label: 'Mettre en pause', icon: PauseCircle }, { to: 'DELIVERED', label: 'Marquer livré', icon: Send }],
  ON_HOLD: [{ to: 'ACTIVE', label: 'Reprendre', icon: PlayCircle }],
  DELIVERED: [{ to: 'CLOSED', label: 'Clôturer', icon: CheckCheck }],
};

export function useCurrentProject(): Project {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const project = state.projects.find((p) => p.id === id);
  if (!project) notFound();
  return project;
}

export function projectTabHref(projectId: string, tab: ProjectTab) {
  if (tab === 'sprints') return `/projects/${projectId}/sprints`;
  return tab === 'overview' ? `/projects/${projectId}` : `/projects/${projectId}?tab=${tab}`;
}

export function useActiveTab(): ProjectTab {
  const pathname = usePathname();
  const search = useSearchParams();
  if (pathname.includes('/sprints')) return 'sprints';
  return (search.get('tab') as ProjectTab | null) ?? 'overview';
}

export function ProjectShell({ children }: { children: ReactNode }) {
  const project = useCurrentProject();
  const store = useStore();
  const { state, me } = store;
  const router = useRouter();
  const search = useSearchParams();
  const active = useActiveTab();
  const metrics = useProjectMetrics(project);
  const [menu, setMenu] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = search.get('tab');
    if (t && LEGACY_SPRINT_TABS.includes(t)) router.replace(`/projects/${project.id}/sprints`);
  }, [search, project.id, router]);

  const allowed = visibleProjects(me, state.projects).some((p) => p.id === project.id);
  if (!allowed) {
    return (
      <Page>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
          <Lock className="text-navy/30" size={36} />
          <div className="font-bold text-navy">Accès refusé</div>
          <div className="text-sm text-navy/45">Vous n&apos;êtes pas membre de ce projet.</div>
          <Link href="/projects" className="text-sm font-semibold text-brand">Retour aux projets</Link>
        </div>
      </Page>
    );
  }

  const manage = canManage(me, project);
  const tabs = TABS.filter((t) => {
    if (t.id === 'members') return manage;
    if (t.id === 'deliverables') return canUploadDeliverables(me, project);
    if (t.id === 'feedback') return canPostFeedback(me, project);
    return true;
  });
  const days = daysUntil(project.dueDate);
  // Changement d'étape : admin ou chef du projet ; l'archivage reste réservé à l'admin.
  const actions = (transitions[project.status] ?? []).filter((a) => canTransition(project.status, a.to, manage) && (a.to !== 'ARCHIVED' || isAdmin(me)));
  const canArchive = isAdmin(me) && project.status !== 'ARCHIVED';
  const headId = projectHead(project);
  const TypeIcon = typeIcon[project.type];
  const run = async (to: ProjectStatus, why?: string) => {
    const r = await store.transitionProject(project.id, to, why);
    setError(r.ok ? null : r.error);
  };

  return (
    <Page>
      <header className="border-b border-white/50 bg-white/20 px-6 py-5 backdrop-blur-sm">
        <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-navy/50 hover:text-navy">
          <ArrowLeft size={14} /> Projets
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <ProgressRing value={metrics.progress} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ocean">{project.code}</span>
              <MetaBadge meta={projectStatusMeta[project.status]} />
              <MetaBadge meta={healthMeta[metrics.health]} />
              <span className="flex items-center gap-1 text-[11px] font-semibold text-navy/45"><TypeIcon size={12} /> {projectTypeLabel[project.type]}</span>
              {isHead(project, me.id) && <HeadRibbon />}
            </div>
            <h1 className="mt-1 text-xl font-bold text-navy">{project.name}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-navy/45">
              <span>{project.clientName}</span>
              <span className="flex items-center gap-1"><CalendarDays size={14} /> {fmtDateLong(project.dueDate)}</span>
              <span className={cn(days < 0 && 'font-semibold text-red-500')}>{days < 0 ? `${-days} j de retard` : `${days} j restants`}</span>
              <span className="flex items-center gap-1"><Crown size={13} className="text-amber-500" /> {headId ? state.users.find((u) => u.id === headId)?.name : 'Sans responsable'}</span>
            </div>
            {project.status === 'ON_HOLD' && project.holdReason && <div className="mt-2 text-xs font-medium text-amber-700">⏸ {project.holdReason}</div>}
          </div>
          {(actions.length > 0 || canArchive) && (
            <div className="relative">
              <Button variant="secondary" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>Statut <ChevronDown size={14} /></Button>
              <AnimatePresence>
                {menu && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={cardSpring}
                    className="absolute right-0 top-full z-30 mt-2 w-52 rounded-2xl border border-white/70 bg-white/85 p-1.5 shadow-xl backdrop-blur-2xl"
                  >
                    {actions.map(({ to, label, icon: Icon }) => (
                      <button
                        key={to}
                        onClick={() => { setMenu(false); if (to === 'ON_HOLD') setHoldOpen(true); else run(to); }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-navy hover:bg-brand/10"
                      >
                        <Icon size={16} className="text-brand" /> {label}
                      </button>
                    ))}
                    {canArchive && (
                      <button onClick={() => { setMenu(false); run('ARCHIVED'); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-red-500 hover:bg-red-50">
                        <Archive size={16} /> Archiver
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

        <nav className="scrollbar-none -mx-6 mt-5 flex gap-1 overflow-x-auto px-6" aria-label="Sections du projet">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={projectTabHref(project.id, t.id)}
              scroll={false}
              aria-current={active === t.id ? 'page' : undefined}
              className={cn('relative shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition-colors', active === t.id ? 'text-navy' : 'text-navy/45 hover:text-navy')}
            >
              {active === t.id && <motion.span layoutId="project-tab" transition={cardSpring} className="absolute inset-0 rounded-xl bg-white/70 shadow-sm shadow-ocean/10" />}
              <span className="relative">{t.label}</span>
            </Link>
          ))}
        </nav>
      </header>

      <div className="p-6">{children}</div>

      <Modal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        title="Mettre le projet en pause"
        footer={<><Button variant="secondary" onClick={() => setHoldOpen(false)}>Annuler</Button><Button disabled={!reason.trim()} onClick={() => { run('ON_HOLD', reason); setHoldOpen(false); setReason(''); }}>Confirmer</Button></>}
      >
        <Field label="Motif (obligatoire)"><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
      </Modal>
    </Page>
  );
}
