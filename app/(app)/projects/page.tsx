'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Columns3, Crown, FolderKanban, List, Plus, Search, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { HeadRibbon, NewProjectModal, typeIcon } from '@/components/projects';
import { AvatarStack, Button, Empty, ErrorNote, Field, MetaBadge, Modal, Page, PageHeader, ProgressBar, Segmented } from '@/components/ui';
import { cardHover, cardSpring, staggerChildX, staggerChildY, staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { Health, Project, ProjectStatus } from '@/lib/types';
import {
  canManage,
  canTransition,
  cn,
  daysUntil,
  fmtDate,
  healthMeta,
  isAdmin,
  isHead,
  projectHead,
  projectHealth,
  projectProgress,
  projectStatusMeta,
  visibleProjects,
} from '@/lib/utils';
import { Select } from '@/components/select';

type View = 'kanban' | 'list';
/** PRJ-05 v1.1 : une colonne par statut ; les projets archivés sont masqués. */
const COLUMNS: ProjectStatus[] = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'DELIVERED', 'CLOSED'];

export default function ProjectsPage() {
  const { state, me, setProjectsView } = useStore();
  const router = useRouter();
  const admin = isAdmin(me);
  // Choix Liste / Kanban mémorisé par utilisateur.
  const view: View = state.prefs[me.id]?.projectsView ?? 'list';
  const [q, setQ] = useState('');
  const [health, setHealth] = useState<Health | ''>('');
  const [lead, setLead] = useState('');
  const [client, setClient] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return visibleProjects(me, state.projects)
      .filter((p) => p.status !== 'ARCHIVED')
      .filter((p) => {
        if (term && !`${p.name} ${p.code} ${p.clientName}`.toLowerCase().includes(term)) return false;
        if (health && projectHealth(p, state.tasks, state.milestones) !== health) return false;
        if (client && p.clientName !== client) return false;
        if (lead && projectHead(p) !== lead) return false;
        if (onlyMine && !isHead(p, me.id)) return false;
        return true;
      })
      // Les projets dont l'utilisateur est responsable passent en tête.
      .sort((a, b) => Number(isHead(b, me.id)) - Number(isHead(a, me.id)) || a.dueDate.localeCompare(b.dueDate));
  }, [state, me, q, health, lead, client, onlyMine]);
  const headedCount = visibleProjects(me, state.projects).filter((p) => p.status !== 'ARCHIVED' && isHead(p, me.id)).length;
  const clientNames = Array.from(new Set(state.projects.map((p) => p.clientName).filter(Boolean))).sort();

  const leads = state.users.filter((u) => state.projects.some((p) => projectHead(p) === u.id));
  const activeFilters = [health, lead, client].filter(Boolean).length;

  return (
    <Page>
      <PageHeader
        title={admin ? 'Projets' : 'Mes projets'}
        subtitle={`${list.length} projet${list.length > 1 ? 's' : ''}`}
        actions={
          <>
            <Segmented value={view} onChange={setProjectsView} options={[{ value: 'list', label: <><List size={14} /> Liste</> }, { value: 'kanban', label: <><Columns3 size={14} /> Kanban</> }]} />
            {admin && <Button onClick={() => setCreating(true)}><Plus size={16} /> <span className="hidden sm:inline">Nouveau</span></Button>}
          </>
        }
      />
      <div className="space-y-4 p-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy/35" />
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un projet, un code, un client…" className="!pl-9" />
          </div>
          {headedCount > 0 && (
            <Button variant={onlyMine ? 'primary' : 'secondary'} onClick={() => setOnlyMine((v) => !v)} aria-pressed={onlyMine} className={onlyMine ? '!bg-amber-400 hover:!bg-amber-500' : undefined}>
              <Crown size={15} /> <span className="hidden sm:inline">Je suis responsable</span> <span className="rounded-full bg-white/30 px-1.5 text-[10px] font-bold">{headedCount}</span>
            </Button>
          )}
          {admin && (
            <Button variant="secondary" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
              <SlidersHorizontal size={16} /> <span className="hidden sm:inline">Filtres</span>
              {activeFilters > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{activeFilters}</span>}
            </Button>
          )}
        </div>

        {admin && (
          <motion.div initial={false} animate={{ height: showFilters ? 'auto' : 0, opacity: showFilters ? 1 : 0 }} className="overflow-hidden">
            <div className="glass-sm grid grid-cols-1 gap-3 rounded-2xl p-3 sm:grid-cols-3">
              <Select value={health} onChange={(e) => setHealth(e.target.value as Health | '')} aria-label="Santé">
                <option value="">Toute santé</option>
                {Object.entries(healthMeta).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </Select>
              <Select value={lead} onChange={(e) => setLead(e.target.value)} aria-label="Responsable">
                <option value="">Tous responsables</option>
                {leads.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
              <Select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client">
                <option value="">Tous clients</option>
                {clientNames.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </motion.div>
        )}

        {!list.length ? (
          <Empty icon={<FolderKanban />} title="Aucun projet" hint="Modifiez la recherche ou les filtres." />
        ) : view === 'kanban' ? (
          <ProjectKanban projects={list} />
        ) : (
          <ProjectList projects={list} />
        )}
      </div>
      {admin && <p className="text-xs text-navy/40">Les projets archivés sont masqués de la liste.</p>}
      <NewProjectModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/projects/${id}`)} />
    </Page>
  );
}

// ---------- Kanban des statuts (PRJ-02) ----------

function ProjectKanban({ projects }: { projects: Project[] }) {
  const { me, transitionProject } = useStore();
  const admin = isAdmin(me);
  const [over, setOver] = useState<ProjectStatus | null>(null);
  const [dragging, setDragging] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hold, setHold] = useState<Project | null>(null);
  const [reason, setReason] = useState('');

  const drop = async (to: ProjectStatus) => {
    const p = dragging;
    setOver(null);
    setDragging(null);
    if (!p || p.status === to) return;
    // Transition invalide : la carte reste dans sa colonne et le message s'affiche.
    if (!canTransition(p.status, to, canManage(me, p))) {
      setError(`Transition impossible : ${projectStatusMeta[p.status][0]} → ${projectStatusMeta[to][0]}.`);
      return;
    }
    if (to === 'ON_HOLD') { setError(null); setHold(p); return; }
    const r = await transitionProject(p.id, to);
    setError(r.ok ? null : r.error);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-navy/45">
        Brouillon → Actif → En pause ↔ Actif → Livré → Clôturé.{' '}
        {admin ? "Glissez une carte pour changer son statut ; l'archivage se fait depuis la fiche projet." : 'Glissez les projets dont vous êtes chef pour changer leur étape ; les autres sont en lecture seule.'}
      </p>
      <AnimatePresence>{error && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><ErrorNote>{error}</ErrorNote></motion.div>}</AnimatePresence>
      <div className="scrollbar-none -mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-2">
        {COLUMNS.map((status) => {
          const items = projects.filter((p) => p.status === status);
          const allowed = dragging ? canTransition(dragging.status, status, canManage(me, dragging)) : false;
          return (
            <div
              key={status}
              onDragOver={(e) => { if (dragging && canManage(me, dragging)) { e.preventDefault(); setOver(status); } }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); drop(status); }}
              className={cn(
                'glass-sm min-w-[15rem] flex-1 shrink-0 snap-start rounded-2xl p-3 transition-all xl:min-w-0',
                dragging && allowed && 'ring-2 ring-brand/30',
                dragging && !allowed && dragging.status !== status && 'opacity-50',
                over === status && allowed && 'bg-brand/10 ring-brand/60',
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <MetaBadge meta={projectStatusMeta[status]} />
                <span className="text-xs font-semibold text-navy/40">{items.length}</span>
              </div>
              <motion.div className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
                {items.map((p) => (
                  <div key={p.id} draggable={canManage(me, p)} onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.id); setDragging(p); }} onDragEnd={() => setDragging(null)}>
                    <KanbanCard project={p} />
                  </div>
                ))}
                {!items.length && <div className="rounded-xl border border-dashed border-navy/10 py-6 text-center text-xs text-navy/35">Aucun projet</div>}
              </motion.div>
            </div>
          );
        })}
      </div>

      <Modal
        open={!!hold}
        onClose={() => setHold(null)}
        title={`Mettre en pause · ${hold?.name ?? ''}`}
        footer={<><Button variant="secondary" onClick={() => setHold(null)}>Annuler</Button><Button disabled={!reason.trim()} onClick={async () => { const r = await transitionProject(hold!.id, 'ON_HOLD', reason); setError(r.ok ? null : r.error); setHold(null); setReason(''); }}>Confirmer</Button></>}
      >
        <Field label="Motif (obligatoire)"><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
      </Modal>
    </div>
  );
}

function KanbanCard({ project }: { project: Project }) {
  const { state, me } = useStore();
  const mine = isHead(project, me.id);
  const TypeIcon = typeIcon[project.type];
  const progress = projectProgress(project.id, state.tasks);
  const health = projectHealth(project, state.tasks, state.milestones);
  const days = daysUntil(project.dueDate);
  const running = project.status === 'ACTIVE' || project.status === 'ON_HOLD';
  return (
    <motion.div variants={staggerChildY}>
      <Link href={`/projects/${project.id}`} draggable={false} className="block">
        <motion.div whileHover={cardHover} transition={cardSpring} className={cn('glass rounded-xl p-3', mine && 'ring-2 ring-amber-400/70')}>
          {mine && <HeadRibbon className="mb-1.5" />}
          <div className="text-[10px] font-semibold text-ocean">{project.code}</div>
          <div className="truncate text-sm font-bold text-navy">{project.name}</div>
          <div className="flex items-center gap-1 truncate text-xs text-navy/45"><TypeIcon size={11} /> {project.clientName}</div>
          {running && (
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar value={progress} tone={health === 'LATE' ? 'red' : health === 'AT_RISK' ? 'amber' : 'brand'} />
              <span className="text-[11px] font-semibold text-navy">{progress}%</span>
            </div>
          )}
          {project.status === 'ON_HOLD' && project.holdReason && <div className="mt-1 truncate text-[11px] text-amber-700">⏸ {project.holdReason}</div>}
          <div className="mt-2 flex items-center justify-between text-[11px] text-navy/45">
            <span className={cn('flex items-center gap-1', running && days < 0 && 'font-semibold text-red-500')}><CalendarDays size={12} /> {fmtDate(project.dueDate)}</span>
            <AvatarStack ids={project.members.map((m) => m.userId)} size={20} />
          </div>
          {running && <div className="mt-2"><MetaBadge meta={healthMeta[health]} /></div>}
        </motion.div>
      </Link>
    </motion.div>
  );
}

// ---------- Liste compacte : nom, échéance, équipe ----------

function ProjectList({ projects }: { projects: Project[] }) {
  const { me } = useStore();
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="hidden grid-cols-[1fr_11rem_8rem] gap-4 border-b border-white/60 px-4 py-2 text-xs font-medium text-navy/50 sm:grid">
        <span>Projet</span><span>Échéance</span><span>Équipe</span>
      </div>
      <motion.ul variants={staggerParent} initial="hidden" animate="show">
        {projects.map((p) => {
          const days = daysUntil(p.dueDate);
          const running = p.status === 'ACTIVE' || p.status === 'ON_HOLD';
          const mine = isHead(p, me.id);
          return (
            <motion.li key={p.id} variants={staggerChildX} className={cn('border-b border-white/40 last:border-0', mine && 'border-l-4 border-l-amber-400 bg-amber-50/40')}>
              <Link href={`/projects/${p.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-white/40 sm:grid-cols-[1fr_11rem_8rem]">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-navy">{p.name}</span>
                  {mine && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white"><Crown size={11} /> Responsable</span>}
                </span>
                <span className={cn('order-3 text-xs text-navy/50 sm:order-none', running && days < 0 && 'font-semibold text-red-500')}>
                  {fmtDate(p.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                  {running && <span className="ml-1">· {days < 0 ? `${-days} j de retard` : `J-${days}`}</span>}
                </span>
                <span className="row-span-2 sm:row-span-1"><AvatarStack ids={p.members.map((m) => m.userId)} max={4} size={22} /></span>
              </Link>
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}
