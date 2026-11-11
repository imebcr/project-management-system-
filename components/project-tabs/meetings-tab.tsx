'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, CalendarDays, CalendarPlus, ChevronDown, ClipboardList, Clock, MapPin, NotebookPen, Pencil, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Select } from '@/components/select';
import { Avatar, AvatarStack, Badge, Button, DeptBadge, Empty, ErrorNote, Field, Modal, SectionLabel } from '@/components/ui';
import { staggerChildY, staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { Meeting, Project } from '@/lib/types';
import { cn, fmtDate, isAdmin, isMember } from '@/lib/utils';

function md(s: string) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const fmtDuration = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`);
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const isUpcoming = (m: Meeting) => Date.parse(m.date) + m.durationMinutes * 60_000 > Date.now();

/** Réunions : planification (avec notification et rappel 3 h avant), puis compte rendu une fois passée. */
export function MeetingsTab({ project }: { project: Project }) {
  const { state, me, cancelMeeting } = useStore();
  const meetings = state.meetings.filter((m) => m.projectId === project.id);
  const upcoming = meetings.filter(isUpcoming).sort((a, b) => a.date.localeCompare(b.date));
  const past = meetings.filter((m) => !isUpcoming(m)).sort((a, b) => b.date.localeCompare(a.date));
  const [expanded, setExpanded] = useState<string | null>(past[0]?.id ?? null);
  const [editing, setEditing] = useState<Meeting | 'new' | null>(null);
  const [minutes, setMinutes] = useState<Meeting | null>(null);
  const [cancelling, setCancelling] = useState<Meeting | null>(null);
  const canWrite = isAdmin(me) || isMember(project, me.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="space-y-3">
        <SectionLabel action={canWrite && <Button onClick={() => setEditing('new')}><CalendarPlus size={15} /> Planifier une réunion</Button>}>À venir · {upcoming.length}</SectionLabel>
        {!upcoming.length ? (
          <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45">Aucune réunion prévue. Les participants reçoivent une notification à la planification, puis un rappel 3 heures avant.</div>
        ) : (
          <motion.ul className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
            {upcoming.map((m) => {
              const mine = m.attendees.includes(me.id);
              const startsIn = Date.parse(m.date) - Date.now();
              return (
                <motion.li key={m.id} variants={staggerChildY} className={cn('glass flex flex-wrap items-center gap-3 rounded-2xl p-3', startsIn <= 3 * 3_600_000 && startsIn > 0 && 'ring-2 ring-amber-400/60')}>
                  <div className="w-14 shrink-0 rounded-xl bg-brand/10 py-1.5 text-center">
                    <div className="text-[10px] font-semibold uppercase text-ocean/70">{fmtDate(m.date, { month: 'short' })}</div>
                    <div className="text-lg font-bold leading-none text-ocean">{fmtDate(m.date, { day: 'numeric' })}</div>
                    <div className="mt-0.5 text-[10px] font-semibold text-ocean">{timeOf(m.date)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-bold text-navy">{m.title}</span>
                      <Badge tone={m.kind === 'Client' ? 'amber' : 'muted'}>{m.kind}</Badge>
                      {mine && <Badge tone="brand">Vous êtes invité</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy/50">
                      <span className="flex items-center gap-1"><Clock size={12} /> {fmtDate(m.date, { weekday: 'long' })} · {timeOf(m.date)} · {fmtDuration(m.durationMinutes)}</span>
                      {m.location && <span className="flex items-center gap-1"><MapPin size={12} /> {m.location}</span>}
                      <span className="flex items-center gap-1"><AvatarStack ids={m.attendees} size={18} max={5} />{m.clientAttendees && <span className="truncate">+ {m.clientAttendees}</span>}</span>
                    </div>
                  </div>
                  {canWrite && (
                    <span className="flex shrink-0 gap-1">
                      <Button variant="icon" title="Modifier" aria-label={`Modifier ${m.title}`} onClick={() => setEditing(m)}><Pencil size={16} /></Button>
                      <Button variant="icon-danger" title="Annuler la réunion" aria-label={`Annuler ${m.title}`} onClick={() => setCancelling(m)}><X size={16} /></Button>
                    </span>
                  )}
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel>Passées · comptes rendus · {past.length}</SectionLabel>
        {!past.length && <Empty icon={<ClipboardList />} title="Aucune réunion passée" hint="Après une réunion, ajoutez son compte rendu et les décisions prises." />}
        <motion.div className="space-y-3" variants={staggerParent} initial="hidden" animate="show">
          {past.map((m) => {
            const open = expanded === m.id;
            return (
              <motion.article key={m.id} layout variants={staggerChildY} className="glass overflow-hidden rounded-2xl">
                <button onClick={() => setExpanded(open ? null : m.id)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
                  <div className="w-12 shrink-0 rounded-xl bg-white/50 py-1.5 text-center">
                    <div className="text-[10px] font-semibold uppercase text-navy/45">{fmtDate(m.date, { month: 'short' })}</div>
                    <div className="text-lg font-bold leading-none text-navy">{fmtDate(m.date, { day: 'numeric' })}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold text-navy">{m.title}</span>
                      <Badge tone={m.kind === 'Client' ? 'amber' : 'muted'}>{m.kind}</Badge>
                      {!m.notes.trim() && <Badge tone="red">Compte rendu à faire</Badge>}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-navy/45">
                      <AvatarStack ids={m.attendees} size={18} max={4} />
                      {m.clientAttendees && <span className="truncate">+ {m.clientAttendees}</span>}
                    </div>
                  </div>
                  <ChevronDown size={18} className={cn('shrink-0 text-navy/40 transition-transform', open && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="space-y-3 border-t border-white/60 px-4 py-4">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy/50">
                          <span className="flex items-center gap-1"><CalendarDays size={12} /> {fmtDate(m.date, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
                          {m.location && <span className="flex items-center gap-1"><MapPin size={12} /> {m.location}</span>}
                          <span className="flex items-center gap-1"><Users size={12} /> {m.attendees.map((id) => state.users.find((u) => u.id === id)?.name).filter(Boolean).join(', ')}</span>
                        </div>
                        {m.notes.trim() ? <div className="text-sm leading-relaxed text-navy" dangerouslySetInnerHTML={{ __html: md(m.notes) }} /> : <div className="text-sm text-navy/45">Pas encore de compte rendu.</div>}
                        {m.decisions.length > 0 && (
                          <div className="rounded-xl bg-white/45 p-3">
                            <div className="mb-1.5 text-xs font-medium text-navy/50">Décisions</div>
                            <ul className="space-y-1">
                              {m.decisions.map((d) => <li key={d} className="flex gap-2 text-sm text-navy"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{d}</li>)}
                            </ul>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-[11px] text-navy/40"><Avatar userId={m.authorId} size={16} /> Organisée par {state.users.find((u) => u.id === m.authorId)?.name}</div>
                          {canWrite && <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => setMinutes(m)}><NotebookPen size={14} /> {m.notes.trim() ? 'Modifier le compte rendu' : 'Rédiger le compte rendu'}</Button>}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </motion.div>
      </section>

      {editing && <MeetingModal project={project} meeting={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {minutes && <MinutesModal meeting={minutes} onClose={() => setMinutes(null)} />}
      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Annuler la réunion ?"
        footer={<><Button variant="secondary" onClick={() => setCancelling(null)}>Garder</Button><Button variant="danger" onClick={() => { if (cancelling) cancelMeeting(cancelling.id); setCancelling(null); }}>Annuler la réunion</Button></>}
      >
        <p className="text-sm text-navy">« {cancelling?.title} » sera supprimée et ses participants seront prévenus.</p>
      </Modal>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
function localParts(iso: string) {
  const d = new Date(iso);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/**
 * Planifier ou modifier une réunion. Utilisée dans l'onglet Réunions et depuis le calendrier
 * (projet à choisir quand `project` est absent, date pré-remplie avec `defaultDate`).
 */
export function MeetingModal({ project, meeting, defaultDate, onClose }: { project?: Project | null; meeting?: Meeting | null; defaultDate?: string; onClose: () => void }) {
  const { state, me, addMeeting, updateMeeting } = useStore();
  const writable = state.projects.filter((p) => !['CLOSED', 'ARCHIVED'].includes(p.status) && (isAdmin(me) || isMember(p, me.id)));
  const [projectId, setProjectId] = useState(project?.id ?? meeting?.projectId ?? writable[0]?.id ?? '');
  const current = state.projects.find((p) => p.id === projectId);
  // Par défaut : demain 10:00 ; si le jour choisi est aujourd'hui, la prochaine heure pleine (jamais dans le passé).
  const start = (() => {
    if (meeting) return localParts(meeting.date);
    const date = defaultDate ?? localParts(new Date(Date.now() + 86_400_000).toISOString()).date;
    const now = new Date();
    if (date !== localParts(now.toISOString()).date) return { date, time: '10:00' };
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
    return localParts(next.toISOString());
  })();
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [duration, setDuration] = useState(meeting?.durationMinutes ?? 60);
  const [location, setLocation] = useState(meeting?.location ?? '');
  const [kind, setKind] = useState<Meeting['kind']>(meeting?.kind ?? 'Interne');
  const [attendees, setAttendees] = useState<string[]>(meeting?.attendees ?? [me.id]);
  const [clientAttendees, setClientAttendees] = useState(meeting?.clientAttendees ?? '');
  const [agenda, setAgenda] = useState(meeting?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invitables : l'équipe du projet, puis les admins.
  const teamIds = current?.members.map((m) => m.userId) ?? [];
  const admins = state.users.filter((u) => u.active && u.roles.includes('ADMIN') && !teamIds.includes(u.id)).map((u) => u.id);
  const invitable = [...teamIds, ...admins].filter((id) => state.users.find((u) => u.id === id)?.active);
  const startsAt = new Date(`${date}T${time || '00:00'}`);
  const inPast = !meeting && startsAt.getTime() < Date.now();
  const toggle = (id: string) => setAttendees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const submit = async () => {
    setBusy(true);
    setError(null);
    const fields = {
      title: title.trim(), date: startsAt.toISOString(), durationMinutes: duration, location: location.trim(), kind,
      attendees: attendees.filter((id) => invitable.includes(id)), clientAttendees: kind === 'Client' ? clientAttendees.trim() : '',
    };
    const r = meeting
      ? await updateMeeting(meeting.id, fields)
      : await addMeeting({ projectId, ...fields, notes: agenda.trim(), decisions: [] });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={meeting ? 'Modifier la réunion' : 'Planifier une réunion'}
      wide
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={busy || !title.trim() || !projectId || !date || !time || !attendees.length} onClick={submit}><CalendarPlus size={15} /> {busy ? 'Enregistrement…' : meeting ? 'Enregistrer' : 'Planifier'}</Button></>}
    >
      {!project && !meeting && (
        <Field label="Projet">
          <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setAttendees([me.id]); }}>
            {writable.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Titre"><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Revue de sprint, démo client…" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Heure"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} step={300} /></Field>
        <Field label="Durée"><Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{DURATIONS.map((d) => <option key={d} value={d}>{fmtDuration(d)}</option>)}</Select></Field>
        <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value as Meeting['kind'])}><option>Interne</option><option>Client</option></Select></Field>
      </div>
      {inPast && <div className="rounded-xl bg-amber-400/15 px-3 py-2 text-xs text-amber-800">Cette date est passée : la réunion sera enregistrée sans notification ni rappel (pour un compte rendu).</div>}
      <Field label="Lieu ou lien (optionnel)"><input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex. Salle de réunion, Google Meet…" /></Field>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-navy/50">
          <span>Participants concernés · {attendees.length}</span>
          {invitable.length > 1 && (
            <button type="button" onClick={() => setAttendees(attendees.length === invitable.length ? [me.id] : invitable)} className="font-semibold text-brand hover:text-ocean">
              {attendees.length === invitable.length ? 'Retirer tout le monde' : 'Toute l’équipe'}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {invitable.map((id) => {
            const u = state.users.find((x) => x.id === id)!;
            const on = attendees.includes(id);
            return (
              <button key={id} type="button" aria-pressed={on} onClick={() => toggle(id)} className={cn('flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-xs font-semibold transition-colors', on ? 'border-brand/40 bg-brand/15 text-ocean' : 'border-white/70 bg-white/50 text-navy/50 hover:text-navy')}>
                <Avatar userId={id} size={20} /> {u.name.split(' ')[0]}{id === me.id && ' (vous)'} <DeptBadge department={u.department} />
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-navy/45"><BellRing size={12} className="text-brand" /> Chaque participant reçoit une notification et un e-mail maintenant, puis un rappel 3 heures avant.</p>
      </div>
      {kind === 'Client' && <Field label="Côté client"><input type="text" value={clientAttendees} onChange={(e) => setClientAttendees(e.target.value)} placeholder="Ex. M. Belkacem (DG)" /></Field>}
      {!meeting && <Field label="Ordre du jour (optionnel)"><textarea rows={3} value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="Points à aborder…" /></Field>}
      {error && <ErrorNote>{error}</ErrorNote>}
    </Modal>
  );
}

/** Compte rendu d'une réunion passée : notes et décisions. */
function MinutesModal({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const { updateMeeting } = useStore();
  const [notes, setNotes] = useState(meeting.notes);
  const [decisions, setDecisions] = useState(meeting.decisions.join('\n'));
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const r = await updateMeeting(meeting.id, { notes, decisions: decisions.split('\n').map((d) => d.trim()).filter(Boolean) });
    if (!r.ok) { setError(r.error); return; }
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Compte rendu · ${meeting.title}`} wide footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!notes.trim()} onClick={submit}>Enregistrer</Button></>}>
      <Field label="Notes (**gras** accepté)"><textarea rows={7} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus /></Field>
      <Field label="Décisions (une par ligne)"><textarea rows={3} value={decisions} onChange={(e) => setDecisions(e.target.value)} /></Field>
      {error && <ErrorNote>{error}</ErrorNote>}
    </Modal>
  );
}
