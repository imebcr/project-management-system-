'use client';

import { CheckCircle2, KeyRound, LinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthCard, PasswordInput, PasswordRules } from '@/components/password';
import { Button, ErrorNote, Field } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { isStrongPassword } from '@/lib/auth';

/** Lien reçu par e-mail (« Mot de passe oublié ») : choisir un nouveau mot de passe. */
export default function ResetPasswordPage() {
  const { uid, token } = useParams<{ uid: string; token: string }>();
  const [info, setInfo] = useState<{ valid: boolean; email: string | null } | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api<{ valid: boolean; email: string | null }>(`/auth/reset/${encodeURIComponent(uid)}/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch(() => setInfo({ valid: false, email: null }));
  }, [uid, token]);

  if (!info) return null;

  if (done) {
    return (
      <AuthCard title="Mot de passe modifié" subtitle="Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.">
        <div className="space-y-4 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
          <Link href="/login" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand/25 hover:bg-ocean">Aller à la connexion</Link>
        </div>
      </AuthCard>
    );
  }

  if (!info.valid) {
    return (
      <AuthCard title="Lien expiré" subtitle="Ce lien a expiré ou a déjà été utilisé.">
        <div className="space-y-4 text-center">
          <LinkIcon size={36} className="mx-auto text-navy/30" />
          <p className="text-sm text-navy/60">Les liens de réinitialisation sont valables 1 heure et ne servent qu&apos;une fois.</p>
          <Link href="/login" className="text-sm font-semibold text-brand hover:text-ocean">Demander un nouveau lien</Link>
        </div>
      </AuthCard>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setBusy(true);
    try {
      await api('/auth/reset', { method: 'POST', body: { uid, token, password } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <AuthCard title="Nouveau mot de passe" subtitle={<>Pour le compte <b className="text-navy">{info.email}</b>.</>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nouveau mot de passe"><PasswordInput value={password} onChange={(v) => { setPassword(v); setError(null); }} autoComplete="new-password" autoFocus /></Field>
        <PasswordRules value={password} />
        <Field label="Confirmation"><PasswordInput value={confirm} onChange={(v) => { setConfirm(v); setError(null); }} autoComplete="new-password" /></Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" className="w-full" disabled={busy || !isStrongPassword(password) || !confirm}><KeyRound size={16} /> {busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</Button>
      </form>
    </AuthCard>
  );
}
