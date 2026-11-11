'use client';

import { ArrowLeft, LogIn, MailCheck, Send } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AuthCard, PasswordInput } from '@/components/password';
import { Button, ErrorNote, Field } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useStore } from '@/lib/store';

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const { state, login } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');

  useEffect(() => {
    if (state.currentUserId) router.replace(next);
  }, [state.currentUserId, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await login(email, password);
    setBusy(false);
    if (!r.ok) setError(r.error);
  };

  if (mode === 'forgot') return <Forgot initialEmail={email} onBack={() => { setMode('login'); setError(null); }} />;

  return (
    <AuthCard title="Connexion" subtitle="Accédez au suivi des projets avec votre compte Zidny.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail"><input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} autoComplete="username" autoFocus required /></Field>
        <Field label="Mot de passe"><PasswordInput value={password} onChange={(v) => { setPassword(v); setError(null); }} /></Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" className="w-full" disabled={busy || !email || !password}><LogIn size={16} /> {busy ? 'Connexion…' : 'Se connecter'}</Button>
        <button type="button" onClick={() => setMode('forgot')} className="w-full text-center text-xs font-semibold text-brand hover:text-ocean">Mot de passe oublié ?</button>
      </form>
    </AuthCard>
  );
}

/** « Mot de passe oublié » : un lien de réinitialisation (valable 1 h) est envoyé par e-mail. */
function Forgot({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ message: string }>('/auth/forgot', { method: 'POST', body: { email: email.trim() } });
      setSent(r.message);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  };

  return (
    <AuthCard title="Mot de passe oublié" subtitle="Recevez par e-mail un lien pour choisir un nouveau mot de passe.">
      {sent ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600"><MailCheck size={24} /></div>
          <p className="text-sm text-navy">{sent}</p>
          <p className="text-xs text-navy/50">Le lien est valable 1 heure.</p>
          <Button variant="secondary" className="w-full" onClick={onBack}><ArrowLeft size={15} /> Retour à la connexion</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail de votre compte"><input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} autoComplete="username" autoFocus required /></Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" className="w-full" disabled={busy || !email.trim()}><Send size={15} /> {busy ? 'Envoi…' : 'Envoyer le lien'}</Button>
          <button type="button" onClick={onBack} className="flex w-full items-center justify-center gap-1 text-xs font-semibold text-brand hover:text-ocean"><ArrowLeft size={13} /> Retour à la connexion</button>
        </form>
      )}
    </AuthCard>
  );
}
