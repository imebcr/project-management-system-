'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, FileText, GitCompare, Plus, Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, Empty, ErrorNote, Field, MetaBadge, Modal, SectionLabel } from '@/components/ui';
import { staggerChildY, staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { CdcSection, CdcVersion, Project } from '@/lib/types';
import { canManage, cdcStatusMeta, cn, fmtDate } from '@/lib/utils';

/** Cahier des charges (CDC) : versions, version de référence et comparaison. Aucune notion de prix (v1.2). */
export function CdcTab({ project }: { project: Project }) {
  const store = useStore();
  const { state, me } = store;
  const manage = canManage(me, project);
  const versions = useMemo(
    () => state.cdcVersions.filter((v) => v.projectId === project.id).sort((a, b) => b.number - a.number),
    [state.cdcVersions, project.id],
  );
  const reference = versions.find((v) => v.status === 'ACCEPTED');
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [newVersion, setNewVersion] = useState(false);

  const toggleSel = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {reference && (
        <Card className="border-brand/30 bg-gradient-to-br from-white/60 to-frost/30">
          <div className="flex items-center gap-2 text-xs font-medium text-ocean"><Star size={14} className="fill-brand text-brand" /> Version de référence</div>
          <div className="mt-1 text-lg font-bold text-navy">v{reference.number} · {reference.fileName}</div>
          <div className="text-xs text-navy/45">Acceptée · délai {reference.delayDays} j · {fmtDate(reference.date, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </Card>
      )}

      <SectionLabel
        action={
          <div className="flex gap-1">
            <Button variant="ghost" className="!py-1 text-xs" disabled={selected.length !== 2} onClick={() => setComparing(true)}><GitCompare size={14} /> Comparer ({selected.length}/2)</Button>
            {manage && <Button variant="ghost" className="!py-1 text-xs" onClick={() => setNewVersion(true)}><Plus size={14} /> Version</Button>}
          </div>
        }
      >
        Versions du cahier des charges
      </SectionLabel>

      {!versions.length && (
        <Empty
          icon={<FileText />}
          title="Aucun cahier des charges"
          hint={manage ? 'Déposez le cahier des charges du client pour en faire la version 1.' : 'Le responsable n’a pas encore déposé de cahier des charges.'}
          action={manage && <Button onClick={() => setNewVersion(true)}><Plus size={15} /> Déposer la v1</Button>}
        />
      )}

      <motion.div className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
        {versions.map((v) => {
          const author = state.users.find((u) => u.id === v.authorId);
          const sel = selected.includes(v.id);
          return (
            <motion.div key={v.id} variants={staggerChildY} className={cn('glass-sm rounded-2xl p-3 transition-shadow', sel && 'ring-2 ring-brand')}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={sel} onChange={() => toggleSel(v.id)} className="mt-1 h-4 w-4 accent-brand" aria-label={`Sélectionner v${v.number}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-navy">v{v.number}</span>
                    <MetaBadge meta={cdcStatusMeta[v.status]} />
                    {v.fileUrl ? (
                      <a href={v.fileUrl} className="flex items-center gap-1 truncate text-xs font-medium text-brand hover:text-ocean" title="Télécharger"><FileText size={12} /> {v.fileName}</a>
                    ) : (
                      <span className="flex items-center gap-1 truncate text-xs text-navy/45"><FileText size={12} /> {v.fileName}</span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-navy/70">{v.changeSummary}</div>
                  <div className="mt-1 text-xs text-navy/45">{author?.name} · {fmtDate(v.date)} · délai {v.delayDays} j</div>
                </div>
                <div className="text-right">
                  {manage && v.status === 'DRAFT' && <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => store.setCdcStatus(v.id, 'SENT')}>Envoyer <ArrowRight size={12} /></Button>}
                  {manage && v.status === 'SENT' && (
                    <div className="mt-1 flex gap-1">
                      <Button variant="ghost" className="!px-2 !py-1 text-xs !text-emerald-600" onClick={() => store.setCdcStatus(v.id, 'ACCEPTED')}>Accepter</Button>
                      <Button variant="ghost" className="!px-2 !py-1 text-xs !text-red-500" onClick={() => store.setCdcStatus(v.id, 'REJECTED')}>Refuser</Button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
      <p className="text-xs text-navy/40">Les retours du client (demandes de modification, bugs, validations) sont dans l&apos;onglet Retours.</p>

      {comparing && selected.length === 2 && (
        <CompareModal a={versions.find((v) => v.id === selected[0])!} b={versions.find((v) => v.id === selected[1])!} all={versions} onClose={() => setComparing(false)} />
      )}
      <NewVersionModal open={newVersion} onClose={() => setNewVersion(false)} project={project} last={versions[0]} />
    </div>
  );
}

// ---------- CDC-03 : comparaison (délai, résumés, sections) ----------

function diffSections(a: CdcSection[], b: CdcSection[]) {
  const titles = Array.from(new Set([...a.map((s) => s.title), ...b.map((s) => s.title)]));
  return titles.map((title) => {
    const x = a.find((s) => s.title === title);
    const y = b.find((s) => s.title === title);
    const kind = !x ? 'added' : !y ? 'removed' : x.body === y.body ? 'same' : 'modified';
    return { title, before: x?.body, after: y?.body, kind } as const;
  });
}

function CompareModal({ a, b, all, onClose }: { a: CdcVersion; b: CdcVersion; all: CdcVersion[]; onClose: () => void }) {
  const [older, newer] = a.number < b.number ? [a, b] : [b, a];
  const between = all.filter((v) => v.number > older.number && v.number <= newer.number).sort((x, y) => x.number - y.number);
  const sections = older.sections.length && newer.sections.length ? diffSections(older.sections, newer.sections) : null;
  const delta = newer.delayDays - older.delayDays;

  return (
    <Modal open onClose={onClose} title={`Comparer v${older.number} → v${newer.number}`} wide>
      <div className="glass-sm rounded-2xl p-3">
        <div className="text-xs font-medium text-navy/50">Écart de délai</div>
        <div className={cn('mt-1 text-xl font-bold', delta > 0 ? 'text-amber-600' : delta < 0 ? 'text-emerald-600' : 'text-navy')}>{delta > 0 ? '+' : ''}{delta} j</div>
        <div className="text-xs text-navy/45">{older.delayDays} j → {newer.delayDays} j</div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-navy/50">Résumé des changements</div>
        <ul className="space-y-1.5">
          {between.map((v) => <li key={v.id} className="glass-sm rounded-xl px-3 py-2 text-sm text-navy"><b>v{v.number}</b> — {v.changeSummary}</li>)}
        </ul>
      </div>

      {sections && (
        <div>
          <div className="mb-2 text-xs font-medium text-navy/50">Différences par section</div>
          <div className="space-y-2">
            {sections.filter((s) => s.kind !== 'same').map((s) => (
              <div key={s.title} className={cn('rounded-xl border px-3 py-2 text-sm', s.kind === 'added' ? 'border-emerald-200 bg-emerald-50/70' : s.kind === 'removed' ? 'border-red-200 bg-red-50/70' : 'border-amber-200 bg-amber-50/70')}>
                <div className="mb-1 flex items-center gap-2 font-semibold text-navy">
                  {s.title}
                  <Badge tone={s.kind === 'added' ? 'green' : s.kind === 'removed' ? 'red' : 'amber'}>{s.kind === 'added' ? 'Ajoutée' : s.kind === 'removed' ? 'Supprimée' : 'Modifiée'}</Badge>
                </div>
                {s.before && s.kind !== 'added' && <div className={cn('text-navy/60', s.kind === 'modified' && 'line-through')}>{s.before}</div>}
                {s.after && s.kind !== 'removed' && <div className="text-navy">{s.after}</div>}
              </div>
            ))}
            {sections.every((s) => s.kind === 'same') && <div className="text-sm text-navy/45">Contenu structuré identique.</div>}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Nouvelle version ----------

function NewVersionModal({ open, onClose, project, last }: { open: boolean; onClose: () => void; project: Project; last?: CdcVersion }) {
  const { addCdcVersion } = useStore();
  const defaultDelay = Math.max(1, Math.round((Date.parse(project.dueDate) - Date.parse(project.startDate)) / 86_400_000));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [delay, setDelay] = useState(String(last?.delayDays ?? defaultDelay));
  const [summary, setSummary] = useState('');
  const [sections, setSections] = useState<CdcSection[]>(last?.sections ?? []);
  const needsSummary = !!last;

  const submit = async () => {
    setBusy(true);
    const r = await addCdcVersion({ projectId: project.id, file, delayDays: Number(delay), changeSummary: summary, sections });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setSummary(''); setFile(null); setError(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Nouvelle version · v${(last?.number ?? 0) + 1}`} wide footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={busy || !Number(delay) || (needsSummary && !summary.trim())} onClick={submit}>{busy ? 'Envoi…' : 'Enregistrer en brouillon'}</Button></>}>
      <Field label="Fichier du cahier des charges (PDF / DOCX)">
        <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-navy/60 file:mr-3 file:rounded-xl file:border-0 file:bg-brand/15 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ocean" />
      </Field>
      <Field label="Délai proposé (jours)"><input type="number" min={1} value={delay} onChange={(e) => setDelay(e.target.value)} className="!w-40" /></Field>
      <Field label={needsSummary ? 'Résumé des changements (obligatoire)' : 'Résumé des changements'}><textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-navy/50">
          Contenu structuré (optionnel)
          <button className="font-semibold text-brand" onClick={() => setSections((s) => [...s, { title: '', body: '' }])}>+ Section</button>
        </div>
        <AnimatePresence initial={false}>
          {sections.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-2 flex gap-2 overflow-hidden">
              <div className="flex-1 space-y-1">
                <input type="text" placeholder="Titre de section" value={s.title} onChange={(e) => setSections((all) => all.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <textarea rows={2} placeholder="Contenu (markdown)" value={s.body} onChange={(e) => setSections((all) => all.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
              </div>
              <Button variant="icon-danger" aria-label="Retirer la section" onClick={() => setSections((all) => all.filter((_, j) => j !== i))}><X size={16} /></Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </Modal>
  );
}
