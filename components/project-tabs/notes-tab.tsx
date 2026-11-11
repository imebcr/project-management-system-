'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Pin, Send, Users } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Button, Empty, SectionLabel } from '@/components/ui';
import { staggerChildY, staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { Project } from '@/lib/types';
import { cn, fmtDateTime, isAdmin, isMember, visibleNotes } from '@/lib/utils';

/** Markdown minimal : **gras**, *italique*, sauts de ligne. */
function md(s: string) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

export function NotesTab({ project }: { project: Project }) {
  const { state, me, addNote, togglePin } = useStore();
  const [content, setContent] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const notes = visibleNotes(me, state.notes.filter((n) => n.projectId === project.id)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date));
  const others = project.members.map((m) => m.userId).filter((id) => id !== me.id);
  const canWrite = isAdmin(me) || isMember(project, me.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {canWrite && (
        <div className="glass space-y-3 rounded-2xl p-4">
          <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Écrire une note… (**gras**, *italique*)" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => setTargets([])} className={cn('flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold', !targets.length ? 'bg-brand text-white' : 'bg-white/50 text-navy/50')}>
                <Users size={12} /> Toute l&apos;équipe
              </button>
              {others.map((id) => {
                const on = targets.includes(id);
                return (
                  <button key={id} onClick={() => setTargets((t) => (on ? t.filter((x) => x !== id) : [...t, id]))} className={cn('flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-xs font-semibold', on ? 'bg-brand/20 text-ocean' : 'bg-white/50 text-navy/50')}>
                    <Avatar userId={id} size={18} /> {state.users.find((u) => u.id === id)?.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
            <Button disabled={!content.trim()} onClick={() => { addNote(project.id, content.trim(), targets.length ? targets : 'TEAM'); setContent(''); setTargets([]); }}>
              <Send size={15} /> Publier
            </Button>
          </div>
        </div>
      )}

      <SectionLabel>Notes · {notes.length}</SectionLabel>
      {!notes.length && <Empty icon={<Pin />} title="Aucune note" />}
      <motion.div className="space-y-3" variants={staggerParent} initial="hidden" animate="show">
        <AnimatePresence initial={false}>
          {notes.map((n) => {
            const author = state.users.find((u) => u.id === n.authorId);
            const audience = n.audience === 'TEAM' ? 'Toute l’équipe' : `Pour ${n.audience.map((id) => state.users.find((u) => u.id === id)?.name.split(' ')[0]).join(', ')}`;
            return (
              <motion.article key={n.id} layout variants={staggerChildY} className={cn('glass rounded-2xl p-4', n.pinned && 'ring-2 ring-brand/40')}>
                <header className="flex items-center gap-2">
                  <Avatar userId={n.authorId} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-navy">{author?.name}</div>
                    <div className="text-[11px] text-navy/45">{fmtDateTime(n.date)} · <span className={n.audience === 'TEAM' ? undefined : 'font-semibold text-ocean'}>{audience}</span></div>
                  </div>
                  {canWrite && (
                    <button onClick={() => togglePin(n.id)} aria-label={n.pinned ? 'Désépingler' : 'Épingler'} className={cn('rounded-xl p-2 transition-colors', n.pinned ? 'text-brand' : 'text-navy/30 hover:bg-white/60 hover:text-navy')}>
                      <Pin size={16} className={n.pinned ? 'fill-brand' : undefined} />
                    </button>
                  )}
                </header>
                <div className="mt-2 text-sm leading-relaxed text-navy" dangerouslySetInnerHTML={{ __html: md(n.content) }} />
              </motion.article>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
