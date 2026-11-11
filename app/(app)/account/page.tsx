'use client';

import { motion } from 'framer-motion';
import { Check, KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PasswordInput, PasswordRules } from '@/components/password';
import { Avatar, Badge, Button, Card, ErrorNote, Field, Page, PageHeader, SectionLabel } from '@/components/ui';
import { isStrongPassword } from '@/lib/auth';
import { staggerChildY, staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import { fmtDateLong, fmtDateTime, roleLabel, visibleProjects } from '@/lib/utils';

export default function AccountPage() {
  const { me, state, updateProfile, changePassword, logout } = useStore();
  const router = useRouter();
  const [name, setName] = useState(me.name);
  const [saved, setSaved] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const projects = visibleProjects(me, state.projects).filter((p) => p.members.some((m) => m.userId === me.id));

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { setPwError('Les deux mots de passe ne correspondent pas.'); return; }
    setBusy(true);
    const r = await changePassword(current, next);
    setBusy(false);
    if (!r.ok) { setPwError(r.error); return; }
    setCurrent(''); setNext(''); setConfirm(''); setPwDone(true);
  };

  return (
    <Page>
      <PageHeader title="Mon compte" subtitle={me.email} actions={<Button variant="secondary" onClick={() => { logout(); router.replace('/login'); }}><LogOut size={15} /> Se déconnecter</Button>} />
      <motion.div className="mx-auto grid max-w-4xl gap-6 p-6 lg:grid-cols-2" variants={staggerParent} initial="hidden" animate="show">
        <motion.div variants={staggerChildY} className="space-y-6">
          <Card>
            <SectionLabel>Profil</SectionLabel>
            <div className="mb-4 flex items-center gap-3">
              <Avatar userId={me.id} size={48} />
              <div>
                <div className="font-bold text-navy">{me.name}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">{me.roles.map((r) => <Badge key={r} tone="brand">{roleLabel[r]}</Badge>)}<Badge tone="muted">{me.department}</Badge></div>
              </div>
            </div>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); updateProfile(name.trim()); setSaved(true); }}>
              <Field label="Nom complet"><input type="text" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></Field>
              <Field label="E-mail" hint="L'adresse de connexion est gérée par l'admin."><input type="email" value={me.email} disabled /></Field>
              <div className="flex items-center justify-end gap-2">
                {saved && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={13} /> Enregistré</span>}
                <Button type="submit" disabled={!name.trim() || name.trim() === me.name}><UserRound size={15} /> Enregistrer</Button>
              </div>
            </form>
          </Card>
          <Card>
            <SectionLabel>Sécurité</SectionLabel>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-navy/50">Compte créé</dt><dd className="font-medium text-navy">{fmtDateLong(me.createdAt)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-navy/50">Dernière connexion</dt><dd className="font-medium text-navy">{me.lastLoginAt ? fmtDateTime(me.lastLoginAt) : '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-navy/50">Projets</dt><dd className="font-medium text-navy">{projects.length}</dd></div>
            </dl>
            <p className="mt-3 flex items-start gap-2 text-xs text-navy/45"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-brand" /> Sur mobile, l&apos;app se verrouille après 5 min en arrière-plan (déverrouillage biométrique).</p>
          </Card>
        </motion.div>

        <motion.div variants={staggerChildY} className="space-y-6">
          <Card>
            <SectionLabel>Changer le mot de passe</SectionLabel>
            <form className="space-y-3" onSubmit={submitPassword}>
              <Field label="Mot de passe actuel"><PasswordInput value={current} onChange={(v) => { setCurrent(v); setPwError(null); setPwDone(false); }} /></Field>
              <Field label="Nouveau mot de passe"><PasswordInput value={next} onChange={(v) => { setNext(v); setPwError(null); setPwDone(false); }} autoComplete="new-password" /></Field>
              <PasswordRules value={next} />
              <Field label="Confirmation"><PasswordInput value={confirm} onChange={(v) => { setConfirm(v); setPwError(null); }} autoComplete="new-password" /></Field>
              {pwError && <ErrorNote>{pwError}</ErrorNote>}
              {pwDone && <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50/80 px-3 py-2 text-xs font-semibold text-emerald-700"><Check size={14} /> Mot de passe mis à jour.</div>}
              <div className="flex justify-end"><Button type="submit" disabled={busy || !current || !isStrongPassword(next) || !confirm}><KeyRound size={15} /> Mettre à jour</Button></div>
            </form>
          </Card>
        </motion.div>
      </motion.div>
    </Page>
  );
}
