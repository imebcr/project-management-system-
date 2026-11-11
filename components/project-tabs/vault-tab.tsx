'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Eye, EyeOff, Fingerprint, KeyRound, Plus, ScrollText, ShieldAlert, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Empty, ErrorNote, Field, Modal, SectionLabel } from '@/components/ui';
import { staggerChildY, staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { Project, VaultCategory, VaultEntry } from '@/lib/types';
import { canManage, fmtDateTime, isAdmin, relDays, vaultCategoryLabel, visibleVaultEntries } from '@/lib/utils';
import { Select } from '@/components/select';

export function VaultTab({ project }: { project: Project }) {
  const { state, me } = useStore();
  const manage = canManage(me, project);
  const entries = visibleVaultEntries(me, state.vaultEntries, state.projects).filter((e) => e.projectId === project.id);
  const [revealing, setRevealing] = useState<VaultEntry | null>(null);
  const [granting, setGranting] = useState<VaultEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const logs = state.vaultLogs.filter((l) => state.vaultEntries.find((e) => e.id === l.entryId)?.projectId === project.id);

  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <section>
        <SectionLabel action={manage && <Button variant="ghost" className="!py-1 text-xs" onClick={() => setCreating(true)}><Plus size={14} /> Entrée</Button>}>Coffre-fort des accès</SectionLabel>
        {entries.length ? (
          <motion.div className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
            {entries.map((e) => (
              <motion.div key={e.id} variants={staggerChildY} className="glass-sm flex items-center gap-3 rounded-2xl p-3">
                <div className="rounded-xl bg-navy/5 p-2 text-navy"><KeyRound size={18} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-navy">{e.label}</span>
                    <Badge tone="muted">{vaultCategoryLabel[e.category]}</Badge>
                  </div>
                  <div className="truncate text-xs text-navy/45">{e.username} · {e.url}</div>
                  <div className="text-[11px] text-navy/40">Rotation {relDays(e.lastRotation)} · {e.grants.length} partage(s)</div>
                </div>
                {manage && <Button variant="icon" aria-label="Partager" onClick={() => setGranting(e)}><UserPlus size={17} /></Button>}
                <Button variant="secondary" className="!px-3" onClick={() => setRevealing(e)}><Eye size={15} /> Révéler</Button>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <Empty icon={<ShieldAlert />} title="Aucune entrée accessible" hint="Les membres ne voient que les accès qui leur ont été explicitement partagés." />
        )}
      </section>

      {manage && (
        <section>
          <SectionLabel>Journal d&apos;accès</SectionLabel>
          <div className="glass-sm divide-y divide-white/50 rounded-2xl">
            {logs.slice(0, 12).map((l) => (
              <div key={l.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <ScrollText size={13} className="shrink-0 text-navy/35" />
                <span className="min-w-0 flex-1 truncate text-navy">
                  <b>{state.users.find((u) => u.id === l.userId)?.name}</b> · {l.action} · {state.vaultEntries.find((e) => e.id === l.entryId)?.label}
                </span>
                <span className="shrink-0 text-navy/45">{fmtDateTime(l.date)}</span>
              </div>
            ))}
            {!logs.length && <div className="p-3 text-center text-xs text-navy/45">Aucune consultation</div>}
          </div>
        </section>
      )}

      {revealing && <RevealModal entry={revealing} onClose={() => setRevealing(null)} />}
      {granting && <GrantModal entry={granting} project={project} onClose={() => setGranting(null)} />}
      <CreateModal open={creating} onClose={() => setCreating(false)} project={project} />
    </div>
  );
}

function RevealModal({ entry, onClose }: { entry: VaultEntry; onClose: () => void }) {
  const { revealSecret, logVault, reauth: confirmPassword, hasReauth } = useStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Le secret n'existe qu'en mémoire de cette fenêtre, le temps de l'affichage (RG-05).
  const [secret, setSecret] = useState<{ value: string; notes: string } | null>(null);
  const [left, setLeft] = useState(30);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = !!secret;
  const needsAuth = !hasReauth();

  useEffect(() => {
    if (!shown) return;
    const id = setInterval(() => setLeft((s) => { if (s <= 1) { setSecret(null); return 30; } return s - 1; }), 1000);
    return () => clearInterval(id);
  }, [shown]);

  const doReveal = async () => {
    setBusy(true);
    const r = await revealSecret(entry.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    setSecret({ value: r.secret, notes: r.secretNotes });
    setLeft(30);
  };

  const reauth = async () => {
    setBusy(true);
    const r = await confirmPassword(password);
    setBusy(false);
    setPassword('');
    if (!r.ok) { setError(r.error); return; }
    await doReveal();
  };

  const copy = async () => {
    if (!secret) return;
    await navigator.clipboard.writeText(secret.value);
    logVault(entry.id, 'COPY');
    setCopied(true);
    setTimeout(() => { navigator.clipboard.writeText('').catch(() => {}); setCopied(false); }, 30_000);
  };

  return (
    <Modal open onClose={onClose} title={entry.label}>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-navy/45">Identifiant</dt><dd className="font-mono font-medium text-navy">{entry.username}</dd></div>
        <div><dt className="text-xs text-navy/45">URL</dt><dd className="truncate font-mono font-medium text-navy">{entry.url}</dd></div>
      </dl>

      {needsAuth && !shown ? (
        <div className="glass-sm space-y-3 rounded-2xl p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-navy"><Fingerprint size={18} className="text-brand" /> Confirmez votre identité</div>
          <p className="text-xs text-navy/45">Ré-authentification requise (valable 5 minutes). Sur mobile : biométrie + PIN.</p>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" autoFocus autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && reauth()} />
          <Button className="w-full" disabled={busy || !password} onClick={reauth}>Confirmer et révéler</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="glass-sm relative overflow-hidden rounded-2xl p-4">
            <div className="mb-1 text-xs text-navy/45">Secret</div>
            <AnimatePresence mode="wait">
              <motion.div key={String(shown)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="break-all font-mono text-base font-bold text-navy">
                {secret ? secret.value : '•'.repeat(16)}
              </motion.div>
            </AnimatePresence>
            {secret?.notes && <div className="mt-2 text-xs text-navy/60">Notes : {secret.notes}</div>}
            {shown && <motion.div className="absolute bottom-0 left-0 h-1 bg-brand" initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: 30, ease: 'linear' }} />}
          </div>
          <div className="flex gap-2">
            {shown ? (
              <Button variant="secondary" className="flex-1" onClick={() => setSecret(null)}><EyeOff size={15} /> Masquer ({left}s)</Button>
            ) : (
              <Button variant="secondary" className="flex-1" disabled={busy} onClick={doReveal}><Eye size={15} /> Révéler</Button>
            )}
            <Button className="flex-1" disabled={!shown} onClick={copy}><Copy size={15} /> {copied ? 'Copié · vidé dans 30 s' : 'Copier'}</Button>
          </div>
          <p className="text-[11px] text-navy/40">Chaque révélation et copie est journalisée. Capture d&apos;écran bloquée sur mobile.</p>
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </Modal>
  );
}

function GrantModal({ entry, project, onClose }: { entry: VaultEntry; project: Project; onClose: () => void }) {
  const { state, grantVault } = useStore();
  const candidates = project.members.filter((m) => m.role === 'CONTRIBUTOR').map((m) => state.users.find((u) => u.id === m.userId)!);
  const [userId, setUserId] = useState(candidates[0]?.id ?? '');
  const [expires, setExpires] = useState('');
  const current = state.vaultEntries.find((e) => e.id === entry.id)!;
  return (
    <Modal open onClose={onClose} title={`Partager « ${entry.label} »`} footer={<><Button variant="secondary" onClick={onClose}>Fermer</Button><Button disabled={!userId} onClick={() => grantVault(entry.id, userId, expires ? new Date(expires).toISOString() : null)}>Partager</Button></>}>
      <Field label="Membre"><Select value={userId} onChange={(e) => setUserId(e.target.value)}>{candidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      <Field label="Expiration (optionnelle)"><input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
      <div>
        <div className="mb-1 text-xs font-medium text-navy/50">Accès actuels</div>
        {current.grants.map((g) => (
          <div key={g.userId} className="flex justify-between text-sm text-navy"><span>{state.users.find((u) => u.id === g.userId)?.name}</span><span className="text-xs text-navy/45">{g.expiresAt ? `jusqu'au ${fmtDateTime(g.expiresAt)}` : 'permanent'}</span></div>
        ))}
        {!current.grants.length && <div className="text-xs text-navy/45">Aucun partage.</div>}
      </div>
    </Modal>
  );
}

const CATEGORIES: VaultCategory[] = ['SERVER', 'DATABASE', 'STORE', 'CLIENT_ACCOUNT', 'API_KEY', 'OTHER'];

function CreateModal({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const { state, me, createVaultEntry } = useStore();
  const admin = isAdmin(me);
  const [f, setF] = useState({ category: 'SERVER' as VaultCategory, label: '', url: '', username: '', secret: '', secretNotes: '', serverId: '' });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouvelle entrée du coffre"
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!f.label || !f.secret} onClick={() => { createVaultEntry({ ...f, projectId: project.id, serverId: admin ? f.serverId || null : null }); setF((x) => ({ ...x, label: '', secret: '', secretNotes: '' })); onClose(); }}>Chiffrer et enregistrer</Button></>}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Catégorie"><Select value={f.category} onChange={(e) => set('category', e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{vaultCategoryLabel[c]}</option>)}</Select></Field>
        {admin && <Field label="Serveur lié (admin)"><Select value={f.serverId} onChange={(e) => set('serverId', e.target.value)}><option value="">—</option>{state.servers.filter((s) => s.projectIds.includes(project.id)).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>}
      </div>
      <Field label="Libellé"><input type="text" value={f.label} onChange={(e) => set('label', e.target.value)} /></Field>
      <Field label="URL"><input type="text" value={f.url} onChange={(e) => set('url', e.target.value)} /></Field>
      <Field label="Identifiant"><input type="text" value={f.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" /></Field>
      <Field label="Secret (chiffré AES-256-GCM)"><input type="password" value={f.secret} onChange={(e) => set('secret', e.target.value)} autoComplete="new-password" /></Field>
      <Field label="Notes secrètes (chiffrées)"><textarea rows={2} value={f.secretNotes} onChange={(e) => set('secretNotes', e.target.value)} /></Field>
    </Modal>
  );
}
