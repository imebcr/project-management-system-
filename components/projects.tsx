'use client';

import { motion } from 'framer-motion';
import { CalendarDays, Check, Crown, FileText, Globe, Smartphone, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { cardHover, cardSpring, staggerChildY } from '@/lib/motion';
import type { Project, ProjectType, User } from '@/lib/types';
import { cn, daysUntil, fmtDate, healthMeta, isHead, projectHead, projectHealth, projectProgress, projectStatusMeta, projectTypeLabel } from '@/lib/utils';
import { Avatar, AvatarStack, Button, DeptBadge, ErrorNote, Field, MetaBadge, Modal, ProgressBar, Segmented, Toggle } from './ui';
import { Combobox } from './combobox';
import { Select } from './select';

export function useProjectMetrics(project: Project) {
  const { state } = useStore();
  return {
    progress: projectProgress(project.id, state.tasks),
    health: projectHealth(project, state.tasks, state.milestones),
    head: projectHead(project),
  };
}

export const typeIcon: Record<ProjectType, typeof Smartphone> = { mobile: Smartphone, web: Globe };

/** v1.2 : le responsable repère ses projets au premier coup d'œil (bandeau doré + couronne). */
export function HeadRibbon({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm shadow-amber-500/30', className)}>
      <Crown size={12} /> Vous êtes responsable
    </span>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  const { me } = useStore();
  const { progress, health } = useProjectMetrics(project);
  const days = daysUntil(project.dueDate);
  const tone = health === 'LATE' ? 'red' : health === 'AT_RISK' ? 'amber' : 'brand';
  const mine = isHead(project, me.id);
  const TypeIcon = typeIcon[project.type];
  return (
    <motion.div variants={staggerChildY}>
      <Link href={`/projects/${project.id}`} className="block">
        <motion.div whileHover={cardHover} transition={cardSpring} className={cn('glass h-full rounded-2xl p-4', mine && 'ring-2 ring-amber-400/70')}>
          {mine && <HeadRibbon className="mb-2" />}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-ocean">{project.code}</div>
              <div className="truncate font-bold text-navy">{project.name}</div>
              <div className="flex items-center gap-1 truncate text-xs text-navy/45"><TypeIcon size={12} /> {projectTypeLabel[project.type]} · {project.clientName}</div>
            </div>
            <MetaBadge meta={projectStatusMeta[project.status]} />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <span className="text-2xl font-bold text-navy">{progress}<span className="text-sm text-navy/45">%</span></span>
            <MetaBadge meta={healthMeta[health]} />
          </div>
          <ProgressBar value={progress} tone={tone} className="mt-2" />
          <div className="mt-3 flex items-center justify-between text-xs text-navy/45">
            <span className="flex items-center gap-1">
              <CalendarDays size={13} /> {fmtDate(project.dueDate)}
              <span className={days < 0 ? 'font-semibold text-red-500' : undefined}>· {days < 0 ? `${-days} j de retard` : `${days} j restants`}</span>
            </span>
            <AvatarStack ids={project.members.map((m) => m.userId)} size={22} />
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

const iso = (d: string) => new Date(d + 'T09:00:00Z').toISOString();

/** v1.2 : projet de développement, client saisi librement, cahier des charges déposable dès la création. */
export function NewProjectModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { state, me, createProject } = useStore();
  const candidates = state.users.filter((u) => u.active);
  const knownClients = Array.from(new Set(state.projects.map((p) => p.clientName).filter(Boolean))).sort();
  const blank = {
    name: '', clientName: '', clientPhone: '', type: 'mobile' as ProjectType,
    startDate: new Date().toISOString().slice(0, 10), dueDate: new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10),
    description: '', headId: '', memberIds: [] as string[],
  };
  const [form, setForm] = useState(blank);
  const [cdcFile, setCdcFile] = useState<File | null>(null);
  const [cdcAccepted, setCdcAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => { setForm((f) => ({ ...f, [k]: v })); setError(null); };

  const close = () => { setForm(blank); setCdcFile(null); setCdcAccepted(false); setError(null); onClose(); };

  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const res = await createProject(
      {
        name: form.name, clientName: form.clientName, clientPhone: form.clientPhone.trim(), type: form.type, startDate: iso(form.startDate), dueDate: iso(form.dueDate),
        description: form.description, headId: form.headId || null, memberIds: form.memberIds.filter((id) => id !== form.headId),
      },
      cdcFile ? { file: cdcFile, accepted: cdcAccepted } : null,
    );
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    close();
    if (res.id) onCreated(res.id);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nouveau projet"
      wide
      footer={<><Button variant="secondary" onClick={close}>Annuler</Button><Button disabled={busy || !form.name.trim() || !form.clientName.trim()} onClick={submit}>{busy ? 'Création…' : 'Créer le projet'}</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom du projet"><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex. App livraison Sahel" autoFocus /></Field>
        <Field label="Client">
          <Combobox value={form.clientName} onChange={(v) => set('clientName', v)} suggestions={knownClients} placeholder="Saisir ou choisir un client" />
        </Field>
      </div>
      <Field label="Téléphone du client (optionnel)">
        <input type="tel" value={form.clientPhone} onChange={(e) => set('clientPhone', e.target.value)} placeholder="Ex. +213 555 12 34 56" autoComplete="off" />
      </Field>
      <div>
        <span className="mb-1 block text-xs font-medium text-navy/50">Type de projet</span>
        <Segmented<ProjectType>
          value={form.type}
          onChange={(v) => set('type', v)}
          options={[{ value: 'mobile', label: <><Smartphone size={14} /> Mobile</> }, { value: 'web', label: <><Globe size={14} /> Web</> }]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début"><input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Livraison prévue"><input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
      </div>
      <Field label="Chef de projet (optionnel)" hint="Sans chef de projet, le projet est géré directement par l'admin. Un seul chef par projet.">
        <Select value={form.headId} onChange={(e) => set('headId', e.target.value)}>
          <option value="">Aucun — géré par l&apos;admin</option>
          {candidates.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.department === 'Design' ? 'Design' : 'Dev'}{u.id === me.id ? ' (vous)' : ''}</option>)}
        </Select>
      </Field>

      <TeamPicker
        users={candidates.filter((u) => u.id !== form.headId)}
        value={form.memberIds.filter((id) => id !== form.headId)}
        onChange={(ids) => set('memberIds', ids)}
      />

      <div className="glass-sm space-y-3 rounded-2xl p-3">
        <div className="text-xs font-semibold text-navy">Cahier des charges (optionnel)</div>
        {cdcFile ? (
          <div className="flex items-center gap-3 rounded-xl bg-white/60 p-2.5">
            <FileText size={18} className="shrink-0 text-brand" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy">{cdcFile.name}</span>
            <Button variant="icon-danger" aria-label="Retirer le fichier" onClick={() => setCdcFile(null)}><X size={16} /></Button>
          </div>
        ) : (
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setCdcFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-navy/60 file:mr-3 file:rounded-xl file:border-0 file:bg-brand/15 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ocean"
            aria-label="Déposer le cahier des charges"
          />
        )}
        {cdcFile && <Toggle checked={cdcAccepted} onChange={setCdcAccepted} label="Déjà validé par le client" />}
        <p className="text-[11px] text-navy/45">Le fichier devient la version 1 du cahier des charges du projet. Les versions suivantes se déposent dans l&apos;onglet Cahier des charges.</p>
      </div>

      <Field label="Description"><textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
      {error && <ErrorNote>{error}</ErrorNote>}
    </Modal>
  );
}

/** Choix de l'équipe : cartes membres avec leur métier (Dev / Design), filtrables. */
export function TeamPicker({ users, value, onChange }: { users: User[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [filter, setFilter] = useState<'all' | 'Développement' | 'Design'>('all');
  const shown = users.filter((u) => filter === 'all' || u.department === filter);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const count = (d: string) => users.filter((u) => u.department === d && value.includes(u.id)).length;
  return (
    <div className="glass-sm space-y-3 rounded-2xl p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-navy"><Users size={14} className="text-brand" /> Équipe du projet · {value.length}</div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Tous' },
            { value: 'Développement', label: `Dev${count('Développement') ? ` · ${count('Développement')}` : ''}` },
            { value: 'Design', label: `Design${count('Design') ? ` · ${count('Design')}` : ''}` },
          ]}
        />
      </div>
      {shown.length ? (
        <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {shown.map((u) => {
            const on = value.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(u.id)}
                className={cn('flex items-center gap-2.5 rounded-xl border p-2 text-left transition-colors', on ? 'border-brand/50 bg-brand/10' : 'border-white/70 bg-white/50 hover:bg-white/75')}
              >
                <Avatar userId={u.id} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-navy">{u.name}</span>
                  <DeptBadge department={u.department} />
                </span>
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', on ? 'border-brand bg-brand text-white' : 'border-navy/20 bg-white')}>{on && <Check size={13} />}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="py-3 text-center text-xs text-navy/45">Aucun membre {filter === 'Design' ? 'design' : filter === 'all' ? '' : 'dev'} disponible.</div>
      )}
      <p className="text-[11px] text-navy/45">Le chef de projet fait déjà partie de l&apos;équipe. Chaque membre choisi reçoit une notification ; l&apos;équipe reste modifiable dans l&apos;onglet Membres.</p>
    </div>
  );
}
