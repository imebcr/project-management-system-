'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CalendarClock, ChevronDown, DatabaseBackup, Globe, LayoutGrid, Lock, Plus, RefreshCcw, Search, Server as ServerIcon, ShieldCheck, Table2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, Button, Empty, ErrorNote, Field, Modal, Page, PageHeader, Segmented, Stat } from '@/components/ui';
import { getExpiries, getLateBackups, getServers, getSubscriptions } from '@/lib/access';
import type { ExpiryKind } from '@/lib/expirations';
import { cardHover, cardSpring, staggerChildY, staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { Server, ServerState, ServerType, Subscription } from '@/lib/types';
import { cn, daysUntil, expiryTone, fmtDate, relDays } from '@/lib/utils';
import { Combobox } from '@/components/combobox';
import { Select } from '@/components/select';

/** Suggestions : on peut aussi taper un autre fournisseur ou un autre type. */
const PROVIDERS = ['OVH', 'Hetzner', 'AWS', 'Google Cloud', 'Azure', 'DigitalOcean', 'Contabo', 'Hostinger', 'Hébergeur local'];
const TYPES: ServerType[] = ['VPS', 'Dédié', 'Mutualisé', 'PaaS', 'Base managée', 'Cloud'];
const stateMeta: Record<ServerState, [string, 'green' | 'amber' | 'red' | 'muted']> = {
  ACTIVE: ['Actif', 'green'], MAINTENANCE: ['Maintenance', 'amber'], DOWN: ['Hors service', 'red'], DECOMMISSIONED: ['Décommissionné', 'muted'],
};
type Sort = 'renewal' | 'name' | 'provider';

function RenewalBadge({ date }: { date: string }) {
  const d = daysUntil(date);
  return <Badge tone={expiryTone(d)}>{d < 0 ? `dépassée de ${-d} j` : d === 0 ? "aujourd'hui" : `J-${d}`}</Badge>;
}

export default function ServersPage() {
  const { state, me } = useStore();
  const [view, setView] = useState<'cards' | 'table' | 'expiries'>('cards');
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState<ServerState | ''>('');
  const [sort, setSort] = useState<Sort>('renewal');
  const [creating, setCreating] = useState(false);

  // v1.1 : tout passe par la couche d'accès « infra » — 403 pour un non-admin.
  const serversRes = getServers(state, me);
  const subsRes = getSubscriptions(state, me);
  const lateRes = getLateBackups(state, me);
  const all = serversRes.ok ? serversRes.data : [];
  const subs = subsRes.ok ? subsRes.data : [];
  const subOf = (s: Server) => subs.filter((x) => x.serverId === s.id).sort((a, b) => a.renewalDate.localeCompare(b.renewalDate))[0];
  const late = lateRes.ok ? lateRes.data.map((s) => s.id) : [];

  const servers = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all
      .filter((s) => !provider || s.provider === provider)
      .filter((s) => !status || s.state === status)
      .filter((s) => {
        if (!term) return true;
        const projects = s.projectIds.map((id) => state.projects.find((p) => p.id === id)?.name ?? '').join(' ');
        return `${s.label} ${s.host} ${s.provider} ${projects}`.toLowerCase().includes(term);
      })
      .sort((a, b) => {
        if (sort === 'name') return a.label.localeCompare(b.label);
        if (sort === 'provider') return a.provider.localeCompare(b.provider);
        return (subOf(a)?.renewalDate ?? '9999').localeCompare(subOf(b)?.renewalDate ?? '9999');
      });
  }, [state, q, provider, status, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!serversRes.ok) {
    return (
      <Page>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-6 text-center">
          <Lock size={32} className="text-navy/30" />
          <div className="font-bold text-navy">Réservé à l&apos;admin</div>
          <div className="text-sm text-navy/45">Les serveurs, domaines, certificats et abonnements sont gérés par l&apos;admin.</div>
        </div>
      </Page>
    );
  }

  const visible = all;
  const renewals = visible.map(subOf).filter(Boolean) as Subscription[];
  const soon = renewals.filter((r) => daysUntil(r.renewalDate) <= 30);
  const next = [...renewals].sort((a, b) => a.renewalDate.localeCompare(b.renewalDate))[0];
  const providers = Array.from(new Set(all.map((s) => s.provider)));

  return (
    <Page>
      <PageHeader
        title="Serveurs"
        subtitle="Fournisseurs, échéances de renouvellement et projets hébergés"
        actions={
          <>
            <Segmented value={view} onChange={setView} options={[{ value: 'cards', label: <><LayoutGrid size={14} /> Cartes</> }, { value: 'table', label: <><Table2 size={14} /> Tableau</> }, { value: 'expiries', label: <><CalendarClock size={14} /> Échéances</> }]} />
            <Button onClick={() => setCreating(true)}><Plus size={16} /> <span className="hidden sm:inline">Serveur</span></Button>
          </>
        }
      />
      <div className="space-y-5 p-6">
        <motion.div className="grid grid-cols-2 gap-3 lg:grid-cols-4" variants={staggerParent} initial="hidden" animate="show">
          <motion.div variants={staggerChildY}><Stat label="Serveurs" value={visible.length} hint={`${visible.filter((s) => s.state === 'ACTIVE').length} actifs`} icon={<ServerIcon size={18} />} /></motion.div>
          <motion.div variants={staggerChildY}><Stat label="Prochaine échéance" value={next ? (daysUntil(next.renewalDate) <= 0 ? "Aujourd'hui" : `J-${daysUntil(next.renewalDate)}`) : '—'} hint={next ? `${next.provider} · ${next.offer}` : undefined} icon={<CalendarClock size={18} />} /></motion.div>
          <motion.div variants={staggerChildY}><Stat label="Échéances à 30 jours" value={soon.length} icon={<RefreshCcw size={18} />} /></motion.div>
          <motion.div variants={staggerChildY}><Stat label="Sauvegardes en retard" value={visible.filter((s) => late.includes(s.id)).length} icon={<DatabaseBackup size={18} />} /></motion.div>
        </motion.div>

        <div className="glass-sm grid grid-cols-1 gap-3 rounded-2xl p-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy/35" />
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Serveur, hôte, fournisseur, projet…" className="!pl-9" />
          </div>
          <Select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Fournisseur">
            <option value="">Tous fournisseurs</option>
            {providers.map((p) => <option key={p}>{p}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as ServerState | '')} aria-label="État">
            <option value="">Tous états</option>
            {Object.entries(stateMeta).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Tri">
            <option value="renewal">Tri : échéance</option>
            <option value="name">Tri : nom</option>
            <option value="provider">Tri : fournisseur</option>
          </Select>
        </div>

        {view === 'expiries' ? (
          <ExpiriesPanel />
        ) : !servers.length ? (
          <Empty icon={<ServerIcon />} title="Aucun serveur" hint="Modifiez la recherche ou les filtres." />
        ) : view === 'cards' ? (
          <motion.div className="grid gap-4 xl:grid-cols-2" variants={staggerParent} initial="hidden" animate="show" key={servers.map((s) => s.id).join()}>
            {servers.map((s) => <ServerCard key={s.id} server={s} sub={subOf(s)} lateBackup={late.includes(s.id)} />)}
          </motion.div>
        ) : (
          <ServerTable servers={servers} subOf={subOf} />
        )}
      </div>
      {creating && <NewServerModal onClose={() => setCreating(false)} />}
    </Page>
  );
}

/** INF-07 : domaines, SSL et abonnements dans les 60 jours (segment Échéances, admin). */
function ExpiriesPanel() {
  const { state, me } = useStore();
  const res = getExpiries(state, me, 60);
  const items = res.ok ? res.data : [];
  const icons: Partial<Record<ExpiryKind, typeof Globe>> = { Domaine: Globe, SSL: ShieldCheck, Abonnement: RefreshCcw };
  if (!items.length) return <Empty icon={<CalendarClock />} title="Rien n'expire dans les 60 jours" />;
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <p className="text-xs text-navy/45">Alertes envoyées aux admins à J-30, J-14, J-7, J-1, le jour J, puis chaque jour si expiré.</p>
      <motion.ul className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
        {items.map((i) => {
          const Icon = icons[i.kind] ?? CalendarClock;
          const project = state.projects.find((p) => p.id === i.projectId);
          return (
            <motion.li key={i.kind + i.id} variants={staggerChildY} className="glass flex items-center gap-3 rounded-2xl p-3">
              <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-white/50 py-1.5">
                <span className="text-[10px] font-semibold uppercase text-navy/45">{fmtDate(i.date, { month: 'short' })}</span>
                <span className="text-lg font-bold leading-none text-navy">{fmtDate(i.date, { day: 'numeric' })}</span>
              </div>
              <div className="rounded-xl bg-brand/10 p-2 text-brand"><Icon size={18} /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-navy">{i.label}</div>
                <div className="truncate text-xs text-navy/45">{i.kind} · {project?.name ?? '—'}{i.autoRenew && ' · renouv. auto'}</div>
              </div>
              <RenewalBadge date={i.date} />
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}

function ServerCard({ server: s, sub, lateBackup }: { server: Server; sub?: Subscription; lateBackup: boolean }) {
  const { state, renewSubscription, recordBackup, setServerProject } = useStore();
  const manage = true; // page réservée à l'admin
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const domains = state.domains.filter((d) => d.serverId === s.id);
  const certs = state.sslCerts.filter((c) => domains.some((d) => c.domain.endsWith(d.name)));

  return (
    <motion.div variants={staggerChildY} whileHover={cardHover} transition={cardSpring} className="glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl bg-brand/10 p-2.5 text-brand"><ServerIcon size={20} /></div>
          <div className="min-w-0">
            <div className="truncate font-bold text-navy">{s.label}</div>
            <div className="truncate font-mono text-xs text-navy/45">{s.host}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={stateMeta[s.state][1]}>{stateMeta[s.state][0]}</Badge>
          <span className="text-[11px] text-navy/45">{s.type}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white/45 p-3">
          <div className="text-[11px] font-medium text-navy/50">Fournisseur</div>
          <div className="mt-0.5 text-sm font-bold text-navy">{s.provider}</div>
          <div className="text-xs text-navy/50">{sub?.offer ?? '—'} · {s.region}</div>
        </div>
        <div className={cn('rounded-xl p-3', sub && daysUntil(sub.renewalDate) <= 7 ? 'bg-red-50/80' : 'bg-white/45')}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-navy/50">Échéance de renouvellement</span>
            {sub && <RenewalBadge date={sub.renewalDate} />}
          </div>
          {sub ? (
            <>
              <div className="mt-0.5 text-sm font-bold text-navy">{fmtDate(sub.renewalDate, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              <div className="flex items-center justify-between gap-2 text-xs text-navy/50">
                <span>{sub.period}</span>
                {manage && <button onClick={() => renewSubscription(sub.id)} className="shrink-0 font-semibold text-brand hover:text-ocean">Marquer renouvelé</button>}
              </div>
            </>
          ) : (
            <div className="mt-0.5 text-sm text-navy/45">Aucun abonnement saisi</div>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-navy/50">
          <span>Projets hébergés · {s.projectIds.length}</span>
          <button onClick={() => setAssigning((a) => !a)} className="font-semibold text-brand hover:text-ocean">{assigning ? 'Terminé' : 'Affecter'}</button>
        </div>
        {assigning && (
          <div className="mb-2 flex flex-wrap gap-1.5 rounded-xl bg-white/40 p-2">
            {state.projects.filter((p) => p.status !== 'ARCHIVED').map((p) => {
              const on = s.projectIds.includes(p.id);
              return (
                <button key={p.id} onClick={() => setServerProject(s.id, p.id, !on)} aria-pressed={on} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', on ? 'bg-brand text-white' : 'bg-white/60 text-navy/55 hover:text-navy')}>
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {s.projectIds.map((id) => {
            const p = state.projects.find((x) => x.id === id);
            return p ? (
              <Link key={id} href={`/projects/${id}`} className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-ocean hover:bg-brand/20">{p.name}</Link>
            ) : null;
          })}
          {!s.projectIds.length && <span className="text-xs text-navy/45">Aucun projet</span>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/60 pt-3 text-xs">
        <span className={cn('flex items-center gap-1.5', lateBackup ? 'font-semibold text-red-600' : 'text-navy/55')}>
          {lateBackup ? <AlertTriangle size={13} /> : <DatabaseBackup size={13} className="text-brand" />}
          Sauvegarde {relDays(s.lastBackup)} · tous les {s.backupFrequencyDays} j
          {manage && <button onClick={() => recordBackup(s.id, 'Saisie manuelle')} className="ml-1 font-semibold text-brand hover:text-ocean">Noter</button>}
        </span>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1 font-semibold text-navy/50 hover:text-navy">
          Détails <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-3 text-xs">
              <dl className="grid grid-cols-2 gap-2">
                <div><dt className="text-navy/45">Système</dt><dd className="font-medium text-navy">{s.os}</dd></div>
                <div><dt className="text-navy/45">Région</dt><dd className="font-medium text-navy">{s.region}</dd></div>
              </dl>
              <div>
                <div className="mb-1 text-navy/45">Domaines et certificats</div>
                {domains.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="flex items-center gap-1.5 font-medium text-navy"><Globe size={12} className="text-brand" />{d.name}</span>
                    <RenewalBadge date={d.expiresAt} />
                  </div>
                ))}
                {certs.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="flex items-center gap-1.5 font-medium text-navy"><ShieldCheck size={12} className="text-brand" />SSL {c.domain}</span>
                    <RenewalBadge date={c.expiresAt} />
                  </div>
                ))}
                {!domains.length && !certs.length && <div className="text-navy/45">Aucun domaine pointé sur ce serveur.</div>}
              </div>
              {s.notes && <p className="text-navy/60">{s.notes}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ServerTable({ servers, subOf }: { servers: Server[]; subOf: (s: Server) => Subscription | undefined }) {
  const { state } = useStore();
  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/60 text-xs text-navy/50">
            <th className="px-4 py-2.5 font-medium">Serveur</th>
            <th className="px-4 py-2.5 font-medium">Fournisseur</th>
            <th className="px-4 py-2.5 font-medium">Échéance</th>
            <th className="px-4 py-2.5 font-medium">Projets hébergés</th>
            <th className="px-4 py-2.5 font-medium">État</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((s) => {
            const sub = subOf(s);
            return (
              <tr key={s.id} className="border-b border-white/40 last:border-0 hover:bg-white/30">
                <td className="px-4 py-3"><div className="font-semibold text-navy">{s.label}</div><div className="font-mono text-[11px] text-navy/45">{s.host}</div></td>
                <td className="px-4 py-3"><div className="font-medium text-navy">{s.provider}</div><div className="text-[11px] text-navy/45">{sub?.offer ?? '—'}</div></td>
                <td className="px-4 py-3">
                  {sub ? (
                    <div className="flex items-center gap-2"><span className="text-navy">{fmtDate(sub.renewalDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span><RenewalBadge date={sub.renewalDate} /></div>
                  ) : <span className="text-navy/40">—</span>}
                  {sub && <div className="text-[11px] text-navy/45">{sub.period}</div>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {s.projectIds.map((id) => { const p = state.projects.find((x) => x.id === id); return p ? <Link key={id} href={`/projects/${id}`} className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-ocean hover:bg-brand/20">{p.name}</Link> : null; })}
                  </div>
                </td>
                <td className="px-4 py-3"><Badge tone={stateMeta[s.state][1]}>{stateMeta[s.state][0]}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NewServerModal({ onClose }: { onClose: () => void }) {
  const { state, createServer } = useStore();
  const projects = state.projects.filter((p) => p.status !== 'ARCHIVED' && p.status !== 'CLOSED');
  const [f, setF] = useState({
    label: '', provider: '', type: '' as ServerType, host: '', region: '', os: 'Ubuntu 24.04', backupFrequencyDays: '1', notes: '',
    offer: '', renewalDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), period: 'Mensuel' as Subscription['period'],
  });
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setError(null); };

  const submit = () => {
    if (!f.label.trim() || !f.host.trim()) { setError('Libellé et hôte sont obligatoires.'); return; }
    if (!f.provider.trim() || !f.type.trim()) { setError('Fournisseur et type sont obligatoires.'); return; }
    if (state.servers.some((s) => s.label.toLowerCase() === f.label.trim().toLowerCase())) { setError('Un serveur porte déjà ce libellé.'); return; }
    createServer({
      ...f, label: f.label.trim(), host: f.host.trim(), provider: f.provider.trim(), type: f.type.trim(), backupFrequencyDays: Math.max(1, Number(f.backupFrequencyDays) || 1), projectIds,
      renewalDate: new Date(f.renewalDate + 'T09:00:00Z').toISOString(),
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Nouveau serveur" wide footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={submit}>Enregistrer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Libellé"><input type="text" value={f.label} onChange={(e) => set('label', e.target.value)} placeholder="ex. client-prod" autoFocus /></Field>
        <Field label="Adresse IP / hôte"><input type="text" value={f.host} onChange={(e) => set('host', e.target.value)} /></Field>
        <Field label="Fournisseur"><Combobox value={f.provider} onChange={(v) => set('provider', v)} suggestions={[...PROVIDERS, ...state.servers.map((s) => s.provider)]} placeholder="Choisir ou saisir…" /></Field>
        <Field label="Type"><Combobox value={f.type} onChange={(v) => set('type', v)} suggestions={[...TYPES, ...state.servers.map((s) => s.type)]} placeholder="Choisir ou saisir…" /></Field>
        <Field label="Région"><input type="text" value={f.region} onChange={(e) => set('region', e.target.value)} /></Field>
        <Field label="Système"><input type="text" value={f.os} onChange={(e) => set('os', e.target.value)} /></Field>
      </div>
      <div className="glass-sm space-y-3 rounded-2xl p-3">
        <div className="text-xs font-semibold text-navy">Abonnement et échéance</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Offre"><input type="text" value={f.offer} onChange={(e) => set('offer', e.target.value)} placeholder="ex. CX32" /></Field>
          <Field label="Prochaine échéance"><input type="date" value={f.renewalDate} onChange={(e) => set('renewalDate', e.target.value)} /></Field>
          <Field label="Périodicité"><Select value={f.period} onChange={(e) => set('period', e.target.value as Subscription['period'])}><option>Mensuel</option><option>Annuel</option></Select></Field>
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-navy/50">Projets hébergés</div>
        <div className="flex flex-wrap gap-1.5">
          {projects.map((p) => {
            const on = projectIds.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => setProjectIds((x) => (on ? x.filter((i) => i !== p.id) : [...x, p.id]))} className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', on ? 'bg-brand text-white' : 'bg-white/50 text-navy/55 hover:text-navy')}>
                {p.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <Field label="Sauvegarde attendue (jours)"><input type="number" min={1} value={f.backupFrequencyDays} onChange={(e) => set('backupFrequencyDays', e.target.value)} /></Field>
        <Field label="Notes"><input type="text" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </Modal>
  );
}
