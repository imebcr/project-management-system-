'use client';

import { motion } from 'framer-motion';
import { Crown, UserMinus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Badge, Button, Card, DeptBadge, ErrorNote, SectionLabel } from '@/components/ui';
import { staggerChildX, staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { Project } from '@/lib/types';
import { canManage, isAdmin, projectHead } from '@/lib/utils';
import { Select } from '@/components/select';

/** PRJ-06 v1.1 : l'admin désigne le responsable ; le responsable (ou l'admin) compose l'équipe. */
export function MembersTab({ project }: { project: Project }) {
  const { state, me, setMember } = useStore();
  const [pick, setPick] = useState('');
  const [headPick, setHeadPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const admin = isAdmin(me);
  const manage = canManage(me, project);
  const headId = projectHead(project);
  const head = state.users.find((u) => u.id === headId);
  const candidates = state.users.filter((u) => u.active && !project.members.some((m) => m.userId === u.id));
  const run = async (pending: Promise<{ ok: boolean; error?: string }>) => {
    const r = await pending;
    setError(r.ok ? null : r.error ?? null);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card>
        <SectionLabel>Responsable du projet</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
          {head ? (
            <>
              <Avatar userId={head.id} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-semibold text-navy"><Crown size={15} className="text-amber-500" />{head.name}<DeptBadge department={head.department} /></div>
                <div className="text-xs text-navy/45">Chef de projet · fixe les sprints et jalons, choisit l&apos;équipe, crée et assigne les tâches</div>
              </div>
            </>
          ) : (
            <div className="flex-1 text-sm text-navy/55">Aucun responsable : le projet est géré directement par l&apos;admin.</div>
          )}
        </div>
        {admin && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/60 pt-3">
            <Select value={headPick} onChange={(e) => setHeadPick(e.target.value)} className="!w-auto flex-1" aria-label="Désigner le responsable">
              <option value="">{head ? 'Changer de responsable…' : 'Désigner un responsable…'}</option>
              {state.users.filter((u) => u.active && u.id !== headId).map((u) => <option key={u.id} value={u.id}>{u.name} · {u.department === 'Design' ? 'Design' : 'Dev'}</option>)}
            </Select>
            <Button disabled={!headPick} onClick={() => { run(setMember(project.id, headPick, 'HEAD')); setHeadPick(''); }}><Crown size={15} /> Désigner</Button>
            {head && <Button variant="secondary" onClick={() => run(setMember(project.id, head.id, 'CONTRIBUTOR'))}>Retirer le rôle</Button>}
          </div>
        )}
      </Card>

      {manage && (
        <div className="glass flex gap-2 rounded-2xl p-3">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Ajouter un membre">
            <option value="">Ajouter un membre à l&apos;équipe…</option>
            {candidates.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.department === 'Design' ? 'Design' : 'Dev'}</option>)}
          </Select>
          <Button disabled={!pick} onClick={() => { run(setMember(project.id, pick, 'CONTRIBUTOR')); setPick(''); }}><UserPlus size={16} /> Ajouter</Button>
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}

      <SectionLabel>Équipe · {project.members.length}</SectionLabel>
      <motion.ul className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
        {project.members.map((m) => {
          const u = state.users.find((x) => x.id === m.userId)!;
          const isTheHead = m.role === 'HEAD';
          return (
            <motion.li key={m.userId} layout variants={staggerChildX} className="glass-sm flex items-center gap-3 rounded-2xl p-3">
              <Avatar userId={u.id} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold text-navy">{u.name}</span><DeptBadge department={u.department} /></div>
                <div className="text-xs text-navy/45">{u.email}{!u.active && ' · compte désactivé'}</div>
              </div>
              <Badge tone={isTheHead ? 'amber' : 'muted'}>{isTheHead ? 'Responsable' : 'Contributeur'}</Badge>
              {manage && (
                <Button
                  variant="icon-danger"
                  disabled={isTheHead && !admin}
                  title={isTheHead && !admin ? "Seul l'admin retire le responsable" : undefined}
                  aria-label={`Retirer ${u.name}`}
                  onClick={() => run(setMember(project.id, u.id, null))}
                >
                  <UserMinus size={17} />
                </Button>
              )}
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}
