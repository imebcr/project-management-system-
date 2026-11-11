'use client';

import { motion } from 'framer-motion';
import { Ban, Check, Copy, Hourglass, KeyRound, Lock, Mail, MailCheck, Pencil, RefreshCw, ScrollText, Search, Send, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Badge, Button, DeptBadge, Empty, ErrorNote, Field, Modal, Page, PageHeader, Segmented } from '@/components/ui';
import { INVITE_TTL_DAYS } from '@/lib/auth';
import { staggerChildX, staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { Department, Invitation, Role, User } from '@/lib/types';
import { ALL_ROLES, cn, daysUntil, fmtDate, fmtDateTime, isAdmin, relDays, roleLabel } from '@/lib/utils';
import { Select } from '@/components/select';

const DEPARTMENTS: Department[] = ['Développement', 'Design'];
type Tab = 'users' | 'invitations' | 'audit';

export default function AdminPage() {
  const { me, state } = useStore();
  const [tab, setTab] = useState<Tab>('users');
  if (!isAdmin(me)) {
    return (
      <Page>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
          <Lock size={32} className="text-navy/30" />
          <div className="font-bold text-navy">Réservé à l&apos;admin</div>
        </div>
      </Page>
    );
  }
  const pending = state.invitations.filter((i) => i.status === 'PENDING' && daysUntil(i.expiresAt) >= 0).length;
  return (
    <Page>
      <PageHeader
        title="Administration"
        subtitle="Comptes, invitations et journal d'audit"
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'users', label: <><Users size={14} /> Comptes</> },
              { value: 'invitations', label: <><Mail size={14} /> Invitations{pending > 0 && <span className="ml-0.5 rounded-full bg-white/30 px-1.5 text-[10px]">{pending}</span>}</> },
              { value: 'audit', label: <><ScrollText size={14} /> Audit</> },
            ]}
          />
        }
      />
      <div className="mx-auto max-w-5xl p-6">
        {tab === 'users' && <UsersPanel />}
        {tab === 'invitations' && <InvitationsPanel />}
        {tab === 'audit' && <AuditPanel />}
      </div>
    </Page>
  );
}

function inviteUrl(token: string) {
  return `${window.location.origin}/invite/${token}`;
}

function CopyButton({ text, label = 'Copier le lien' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copié' : label}
    </Button>
  );
}

// ---------- Comptes ----------

/** Cases à cocher des rôles (cumulables, au moins un). */
function RolesPicker({ value, onChange, lockAdmin }: { value: Role[]; onChange: (v: Role[]) => void; lockAdmin?: boolean }) {
  const hints: Record<Role, string> = { ADMIN: 'Comptes, serveurs, tous les projets', DEV: 'Mes tâches, agenda' };
  const toggle = (r: Role) => onChange(ALL_ROLES.filter((x) => (x === r ? !value.includes(r) : value.includes(x))));
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-navy/50">Rôles (un ou plusieurs)</span>
      <div className="grid grid-cols-2 gap-2">
        {ALL_ROLES.map((r) => {
          const on = value.includes(r);
          const locked = lockAdmin && r === 'ADMIN';
          return (
            <button
              key={r}
              type="button"
              disabled={locked}
              aria-pressed={on}
              onClick={() => toggle(r)}
              title={locked ? 'Vous ne pouvez pas retirer votre propre rôle Admin' : undefined}
              className={cn('flex items-start gap-2 rounded-xl border p-2.5 text-left transition-colors disabled:cursor-not-allowed', on ? 'border-brand/50 bg-brand/10' : 'border-white/70 bg-white/50 hover:bg-white/70')}
            >
              <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-brand bg-brand text-white' : 'border-navy/25 bg-white')}>{on && <Check size={12} />}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-navy">{roleLabel[r]}</span>
                <span className="block text-[11px] text-navy/45">{hints[r]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Row = { kind: 'user'; user: User } | { kind: 'invite'; invitation: Invitation; expired: boolean };

function UsersPanel() {
  const { state, me, toggleUserActive, resetPassword, resendInvitation, revokeInvitation } = useStore();
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<{ mode: 'invite' } | { mode: 'user'; user: User } | { mode: 'invitation'; invitation: Invitation } | null>(null);
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());

  // Membres actifs/désactivés + invitations pas encore acceptées (en attente ou expirées).
  const rows: Row[] = [
    ...state.invitations
      .filter((i) => i.status === 'PENDING')
      .map((i) => ({ kind: 'invite' as const, invitation: i, expired: daysUntil(i.expiresAt) < 0 }))
      .sort((a, b) => b.invitation.createdAt.localeCompare(a.invitation.createdAt)),
    ...state.users.map((u) => ({ kind: 'user' as const, user: u })),
  ].filter((r) => (r.kind === 'user' ? match(`${r.user.name} ${r.user.email}`) : match(`${r.invitation.name} ${r.invitation.email}`)));
  const pendingCount = rows.filter((r) => r.kind === 'invite').length;

  const resend = async (i: Invitation) => {
    const r = await resendInvitation(i.id);
    setNotice(!r.ok ? { ok: false, text: r.error } : r.emailSent ? { ok: true, text: `Nouvelle invitation envoyée à ${i.email}.` } : { ok: false, text: "Nouveau lien créé, mais l'e-mail n'a pas pu partir. Copiez le lien depuis l'onglet Invitations." });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy/35" />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom ou un e-mail…" className="!pl-9" />
        </div>
        <Button onClick={() => setModal({ mode: 'invite' })}><UserPlus size={16} /> <span className="hidden sm:inline">Inviter un membre</span></Button>
      </div>
      <div className="text-xs text-navy/45">{state.users.length} compte(s){pendingCount > 0 && ` · ${pendingCount} invitation(s) en attente`}</div>
      {notice && (notice.ok ? <div className="glass-sm flex items-center gap-2 rounded-2xl p-3 text-sm text-emerald-700"><MailCheck size={16} /> {notice.text}</div> : <ErrorNote>{notice.text}</ErrorNote>)}

      <motion.ul className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
        {rows.map((row) => {
          if (row.kind === 'invite') {
            const i = row.invitation;
            return (
              <motion.li key={`i-${i.id}`} variants={staggerChildX} className="glass-sm flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-brand/30 p-3">
                <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"><Hourglass size={17} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-navy">
                    <span className="truncate">{i.name}</span>
                    <DeptBadge department={i.department} />
                    {row.expired ? <Badge tone="red">Invitation expirée</Badge> : <Badge tone="amber">Invitation en attente</Badge>}
                    {i.roles.map((r) => <Badge key={r} tone="muted">{roleLabel[r]}</Badge>)}
                  </div>
                  <div className="truncate text-xs text-navy/45">{i.email} · {i.department}</div>
                  <div className="text-[11px] text-navy/40">{row.expired ? `Lien expiré ${relDays(i.expiresAt)}` : `Invité ${relDays(i.createdAt)} · lien valable jusqu'au ${fmtDate(i.expiresAt, { day: 'numeric', month: 'short' })}`}</div>
                </div>
                <Button variant="icon" title="Modifier" aria-label={`Modifier l'invitation de ${i.email}`} onClick={() => setModal({ mode: 'invitation', invitation: i })}><Pencil size={16} /></Button>
                <Button variant="icon" title="Renvoyer l'e-mail (nouveau lien)" aria-label={`Renvoyer l'invitation de ${i.email}`} onClick={() => resend(i)}><RefreshCw size={16} /></Button>
                <Button variant="icon-danger" title="Annuler l'invitation" aria-label={`Annuler l'invitation de ${i.email}`} onClick={() => revokeInvitation(i.id)}><Ban size={16} /></Button>
              </motion.li>
            );
          }
          const u = row.user;
          return (
            <motion.li key={u.id} variants={staggerChildX} className={cn('glass-sm flex flex-wrap items-center gap-3 rounded-2xl p-3', !u.active && 'opacity-60')}>
              <Avatar userId={u.id} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-navy">
                  <span className="truncate">{u.name}</span>
                  <DeptBadge department={u.department} />
                  {u.roles.map((r) => <Badge key={r} tone={r === 'ADMIN' ? 'brand' : 'muted'}>{roleLabel[r]}</Badge>)}
                  {!u.active && <Badge tone="muted">Désactivé</Badge>}
                  {u.mustChangePassword && <Badge tone="amber">Mot de passe temporaire</Badge>}
                  {u.id === me.id && <Badge tone="green">Vous</Badge>}
                </div>
                <div className="truncate text-xs text-navy/45">{u.email} · {u.department}</div>
                <div className="text-[11px] text-navy/40">{u.lastLoginAt ? `Dernière connexion ${relDays(u.lastLoginAt)}` : 'Jamais connecté'}</div>
              </div>
              <Button variant="icon" title="Modifier" aria-label={`Modifier ${u.name}`} onClick={() => setModal({ mode: 'user', user: u })}><Pencil size={16} /></Button>
              <Button variant="icon" title="Réinitialiser le mot de passe" aria-label={`Réinitialiser le mot de passe de ${u.name}`} disabled={u.id === me.id || !u.active} onClick={async () => { const password = await resetPassword(u.id); if (password) setTemp({ name: u.name, password }); }}>
                <KeyRound size={17} />
              </Button>
              <Button variant={u.active ? 'secondary' : 'primary'} className="!py-1.5 text-xs" disabled={u.id === me.id} onClick={() => toggleUserActive(u.id)}>{u.active ? 'Désactiver' : 'Réactiver'}</Button>
            </motion.li>
          );
        })}
      </motion.ul>
      {!rows.length && <Empty icon={<Users />} title="Aucun résultat" />}
      <p className="text-xs text-navy/40">Pas d&apos;inscription libre ni de suppression de compte : chaque membre rejoint l&apos;équipe par une invitation envoyée par e-mail, puis peut être désactivé si besoin. Le responsable d&apos;un projet se désigne dans l&apos;onglet Membres du projet.</p>

      {modal?.mode === 'invite' && <AddMemberModal onClose={() => setModal(null)} />}
      {modal && modal.mode !== 'invite' && <EditMemberModal target={modal} onClose={() => setModal(null)} />}
      <Modal open={!!temp} onClose={() => setTemp(null)} title="Mot de passe réinitialisé" footer={<Button onClick={() => setTemp(null)}>Terminé</Button>}>
        {temp && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-navy">Nouveau mot de passe temporaire pour <b>{temp.name}</b> :</p>
            <div className="glass-sm rounded-2xl p-3 font-mono text-lg font-bold tracking-wider text-navy">{temp.password}</div>
            <CopyButton text={temp.password} label="Copier" />
            <p className="text-xs text-navy/45">Transmettez-le par un canal sûr. Il devra être changé à la prochaine connexion.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Modifier un membre ou une invitation en attente : nom, e-mail, département, rôles. */
function EditMemberModal({ target, onClose }: { target: { mode: 'user'; user: User } | { mode: 'invitation'; invitation: Invitation }; onClose: () => void }) {
  const { me, updateUser, updateInvitation } = useStore();
  const src = target.mode === 'user' ? target.user : target.invitation;
  const self = target.mode === 'user' && target.user.id === me.id;
  const [form, setForm] = useState({ name: src.name, email: src.email, roles: src.roles, department: src.department });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => { setForm((f) => ({ ...f, [k]: v })); setError(null); };
  const emailChanged = form.email.trim().toLowerCase() !== src.email;

  const submit = async () => {
    setBusy(true);
    const patch = { name: form.name, email: form.email, roles: form.roles, department: form.department };
    if (target.mode === 'user') {
      const r = await updateUser(target.user.id, patch);
      setBusy(false);
      if (!r.ok) { setError(r.error); return; }
      onClose();
    } else {
      const r = await updateInvitation(target.invitation.id, patch);
      setBusy(false);
      if (!r.ok) { setError(r.error); return; }
      if (r.emailSent === true) setDone(`Invitation renvoyée à ${form.email.trim().toLowerCase()} avec un nouveau lien.`);
      else if (r.emailSent === false) setError("Modifications enregistrées, mais l'e-mail n'a pas pu partir. Utilisez « Renvoyer ».");
      else onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={target.mode === 'user' ? `Modifier ${src.name}` : "Modifier l'invitation"}
      footer={done ? <Button onClick={onClose}>Terminé</Button> : <><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={busy || !form.name.trim() || !form.email.trim() || !form.roles.length} onClick={submit}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Button></>}
    >
      {done ? (
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600"><MailCheck size={24} /></div>
          <p className="text-sm text-navy">{done}</p>
        </div>
      ) : (
        <>
          <Field label="Nom complet"><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
          <Field label="E-mail" hint={target.mode === 'user' ? (emailChanged ? 'La personne se connectera avec cette nouvelle adresse.' : 'Adresse de connexion.') : emailChanged ? "Un nouveau lien sera envoyé à cette adresse ; l'ancien ne fonctionnera plus." : undefined}>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Département"><Select value={form.department} onChange={(e) => set('department', e.target.value as Department)}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</Select></Field>
          <RolesPicker value={form.roles} onChange={(v) => set('roles', v)} lockAdmin={self} />
          {!form.roles.length && <ErrorNote>Choisissez au moins un rôle.</ErrorNote>}
          {error && <ErrorNote>{error}</ErrorNote>}
        </>
      )}
    </Modal>
  );
}

/** Ajout d'un membre : uniquement par invitation envoyée par e-mail (la personne choisit son mot de passe). */
function AddMemberModal({ onClose }: { onClose: () => void }) {
  const { inviteUser } = useStore();
  const [form, setForm] = useState({ name: '', email: '', roles: ['DEV'] as Role[], department: 'Développement' as Department });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ invitation: Invitation; emailSent: boolean } | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => { setForm((f) => ({ ...f, [k]: v })); setError(null); };

  const submit = async () => {
    setBusy(true);
    const r = await inviteUser(form);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setResult({ invitation: r.invitation!, emailSent: !!r.emailSent });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={result ? (result.emailSent ? 'Invitation envoyée' : 'Invitation créée') : 'Inviter un membre'}
      footer={result ? <Button onClick={onClose}>Terminé</Button> : <><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={busy || !form.name.trim() || !form.email.trim() || !form.roles.length} onClick={submit}><Send size={15} /> {busy ? 'Envoi…' : "Envoyer l'invitation"}</Button></>}
    >
      {!result ? (
        <>
          <p className="text-xs text-navy/45">La personne reçoit un e-mail avec un lien personnel (valable {INVITE_TTL_DAYS} jours) pour créer son compte et choisir son mot de passe.</p>
          <Field label="Nom complet"><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
          <Field label="E-mail"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Département"><Select value={form.department} onChange={(e) => set('department', e.target.value as Department)}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</Select></Field>
          <RolesPicker value={form.roles} onChange={(v) => set('roles', v)} />
          {error && <ErrorNote>{error}</ErrorNote>}
        </>
      ) : result.emailSent ? (
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600"><MailCheck size={24} /></div>
          <p className="text-sm text-navy">Un e-mail d&apos;invitation a été envoyé à <b>{result.invitation.email}</b>.</p>
          <p className="text-xs text-navy/45">Le lien expire le {fmtDate(result.invitation.expiresAt, { day: 'numeric', month: 'long' })}. Suivi et renvoi dans l&apos;onglet Invitations.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <ErrorNote>L&apos;invitation est créée mais l&apos;e-mail n&apos;a pas pu partir (configuration SMTP du serveur). Réessayez avec « Renvoyer » dans l&apos;onglet Invitations, ou transmettez ce lien :</ErrorNote>
          <div className="glass-sm break-all rounded-2xl p-3 font-mono text-xs text-navy">{inviteUrl(result.invitation.token)}</div>
          <CopyButton text={inviteUrl(result.invitation.token)} />
        </div>
      )}
    </Modal>
  );
}

// ---------- Invitations ----------

function InvitationsPanel() {
  const { state, resendInvitation, revokeInvitation } = useStore();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const resend = async (i: Invitation) => {
    const r = await resendInvitation(i.id);
    setNotice(!r.ok ? { ok: false, text: r.error } : r.emailSent ? { ok: true, text: `Nouvelle invitation envoyée à ${i.email}.` } : { ok: false, text: "Nouveau lien créé, mais l'e-mail n'a pas pu partir. Copiez le lien pour le transmettre." });
  };
  const statusOf = (i: Invitation) => (i.status === 'PENDING' && daysUntil(i.expiresAt) < 0 ? 'EXPIRED' : i.status);
  const meta: Record<string, [string, 'brand' | 'green' | 'muted' | 'red']> = {
    PENDING: ['En attente', 'brand'], ACCEPTED: ['Acceptée', 'green'], REVOKED: ['Annulée', 'muted'], EXPIRED: ['Expirée', 'red'],
  };
  const list = [...state.invitations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setAdding(true)}><UserPlus size={16} /> Inviter par e-mail</Button></div>
      {notice && (notice.ok ? <div className="glass-sm flex items-center gap-2 rounded-2xl p-3 text-sm text-emerald-700"><MailCheck size={16} /> {notice.text}</div> : <ErrorNote>{notice.text}</ErrorNote>)}
      {list.length ? (
        <motion.ul className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
          {list.map((i) => {
            const st = statusOf(i);
            return (
              <motion.li key={i.id} variants={staggerChildX} className="glass-sm flex flex-wrap items-center gap-3 rounded-2xl p-3">
                <div className="rounded-xl bg-brand/10 p-2 text-brand"><Mail size={18} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-navy">
                    <span className="truncate">{i.name}</span>
                    <Badge tone={meta[st][1]}>{meta[st][0]}</Badge>
                    {i.roles.map((r) => <Badge key={r} tone="muted">{roleLabel[r]}</Badge>)}
                  </div>
                  <div className="truncate text-xs text-navy/45">{i.email} · invité par {state.users.find((u) => u.id === i.invitedBy)?.name.split(' ')[0] ?? 'la console serveur'} {relDays(i.createdAt)}</div>
                  {st === 'PENDING' && <div className="text-[11px] text-navy/40">Expire {relDays(i.expiresAt)} ({fmtDateTime(i.expiresAt)})</div>}
                  {st === 'ACCEPTED' && i.acceptedUserId && <div className="text-[11px] text-emerald-700">Compte créé par {state.users.find((u) => u.id === i.acceptedUserId)?.name}</div>}
                </div>
                {st === 'PENDING' && <CopyButton text={inviteUrl(i.token)} />}
                {(st === 'PENDING' || st === 'EXPIRED') && (
                  <Button variant="icon" title="Renvoyer l'e-mail (nouveau lien)" aria-label={`Renvoyer l'invitation de ${i.email}`} onClick={() => resend(i)}><RefreshCw size={16} /></Button>
                )}
                {st === 'PENDING' && (
                  <Button variant="icon-danger" title="Annuler l'invitation" aria-label={`Annuler l'invitation de ${i.email}`} onClick={() => revokeInvitation(i.id)}><Ban size={16} /></Button>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      ) : (
        <Empty icon={<Mail />} title="Aucune invitation" hint="Invitez un membre pour qu'il crée son compte avec son propre mot de passe." />
      )}
      {adding && <AddMemberModal onClose={() => setAdding(false)} />}
    </div>
  );
}

// ---------- Audit ----------

function AuditPanel() {
  const { state } = useStore();
  const [project, setProject] = useState('');
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const actions = Array.from(new Set(state.auditLog.map((a) => a.action)));
  const rows = state.auditLog.filter((a) => (!project || a.projectId === project) && (!user || a.userId === user) && (!action || a.action === action));

  return (
    <div className="space-y-4">
      <div className="glass-sm grid grid-cols-1 gap-3 rounded-2xl p-3 sm:grid-cols-3">
        <Select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Projet"><option value="">Tous projets</option>{state.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={user} onChange={(e) => setUser(e.target.value)} aria-label="Utilisateur"><option value="">Tous utilisateurs</option>{state.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action"><option value="">Toutes actions</option>{actions.map((a) => <option key={a}>{a}</option>)}</Select>
      </div>
      {rows.length ? (
        <motion.div className="glass divide-y divide-white/50 overflow-hidden rounded-2xl" variants={staggerParent} initial="hidden" animate="show" key={project + user + action}>
          {rows.map((a) => (
            <motion.div key={a.id} variants={staggerChildX} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar userId={a.userId} size={28} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-navy"><b>{state.users.find((u) => u.id === a.userId)?.name ?? 'Système'}</b> · {a.target}</div>
                <div className="text-xs text-navy/45">{state.projects.find((p) => p.id === a.projectId)?.name ?? 'Global'} · {fmtDateTime(a.date)}</div>
              </div>
              <Badge tone={a.action.startsWith('VAULT') ? 'amber' : a.action.includes('PASSWORD') || a.action.includes('INVITE') || a.action.startsWith('USER') ? 'ocean' : 'navy'}>{a.action}</Badge>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <Empty icon={<ScrollText />} title="Aucune entrée" />
      )}
      <ErrorNote>Journal non modifiable et non supprimable (RG-06).</ErrorNote>
    </div>
  );
}
