'use client';

import { MailX, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthCard, PasswordInput, PasswordRules } from '@/components/password';
import { Badge, Button, ErrorNote, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { isStrongPassword } from '@/lib/auth';
import { useStore } from '@/lib/store';
import type { Role } from '@/lib/types';
import { fmtDate, roleLabel } from '@/lib/utils';

interface InvitationInfo {
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED' | 'UNKNOWN';
  email?: string;
  name?: string;
  role?: Role;
  roles?: Role[];
  department?: string;
  expiresAt?: string;
  invitedByName?: string;
}

const REASONS: Record<Exclude<InvitationInfo['status'], 'PENDING'>, string> = {
  UNKNOWN: "Ce lien d'invitation n'existe pas.",
  ACCEPTED: 'Cette invitation a déjà été utilisée.',
  REVOKED: 'Cette invitation a été annulée.',
  EXPIRED: 'Cette invitation a expiré.',
};

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { state, acceptInvitation, logout } = useStore();
  const router = useRouter();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<InvitationInfo>(`/invitations/token/${encodeURIComponent(token)}`)
      .then((i) => {
        setInfo(i);
        setName(i.name ?? '');
      })
      .catch(() => setInfo({ status: 'UNKNOWN' }));
  }, [token]);

  if (!info) return null;

  if (info.status !== 'PENDING') {
    return (
      <AuthCard title="Invitation indisponible" subtitle={REASONS[info.status]}>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <MailX size={36} className="text-navy/30" />
          <p className="text-sm text-navy/55">Demandez à l&apos;admin de vous renvoyer une invitation.</p>
          <Link href="/login" className="text-sm font-semibold text-brand hover:text-ocean">Aller à la connexion</Link>
        </div>
      </AuthCard>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setBusy(true);
    if (state.currentUserId) await logout();
    const r = await acceptInvitation(token, name, password);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    router.replace('/');
  };

  return (
    <AuthCard title="Créez votre compte" subtitle={<>{info.invitedByName ?? "L'admin"} vous invite à rejoindre Zidny Projets.</>}>
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl bg-white/45 p-3 text-sm">
        <span className="font-semibold text-navy">{info.email}</span>
        {(info.roles ?? (info.role ? [info.role] : [])).map((r) => <Badge key={r} tone="brand">{roleLabel[r]}</Badge>)}
        {info.department && <Badge tone="muted">{info.department}</Badge>}
        {info.expiresAt && <span className="w-full text-[11px] text-navy/45">Invitation valable jusqu&apos;au {fmtDate(info.expiresAt, { day: 'numeric', month: 'long' })}</span>}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nom complet"><input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>
        <Field label="Mot de passe"><PasswordInput value={password} onChange={(v) => { setPassword(v); setError(null); }} autoComplete="new-password" autoFocus /></Field>
        <PasswordRules value={password} />
        <Field label="Confirmation"><PasswordInput value={confirm} onChange={(v) => { setConfirm(v); setError(null); }} autoComplete="new-password" /></Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" className="w-full" disabled={busy || !name.trim() || !isStrongPassword(password) || !confirm}><UserPlus size={16} /> Créer mon compte</Button>
      </form>
    </AuthCard>
  );
}
