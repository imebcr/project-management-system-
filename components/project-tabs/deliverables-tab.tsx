'use client';

import { motion } from 'framer-motion';
import { Ban, CalendarClock, Check, ChevronRight, Download, ExternalLink, Eye, FileArchive, FileImage, FileText, FileVideo, Folder as FolderIcon, FolderPlus, Globe, Home, Link2, Pause, Pencil, Play, Share2, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Empty, ErrorNote, Field, MetaBadge, Modal, ProgressBar, SectionLabel, Segmented, Toast } from '@/components/ui';
import { cardHover, cardSpring, staggerChildY, staggerParent } from '@/lib/motion';
import { api, errorMessage } from '@/lib/api';
import { LINK_MAX_DAYS } from '@/lib/share';
import { DeliverableUpload } from '@/lib/upload';
import { useStore } from '@/lib/store';
import type { Deliverable, DeliverableStatus, Folder, Project, ShareLink } from '@/lib/types';
import { canManage, canShareDeliverables, canUploadDeliverables, cn, DAY, daysUntil, deliverableStatusMeta, deliverableTransitions, fmtBytes, fmtDate, fmtDateTime, relDays } from '@/lib/utils';
import { Select } from '@/components/select';

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return FileImage;
  if (mime.startsWith('video/')) return FileVideo;
  if (mime === 'application/pdf') return FileText;
  return FileArchive;
}

function depth(folder: Folder | undefined, all: Folder[]): number {
  let d = 0;
  let cur = folder;
  while (cur) { d++; cur = all.find((f) => f.id === cur!.parentId); }
  return d;
}

export function shareUrl(token: string) {
  return `${window.location.origin}/s/${token}`;
}

/** Appui long (≥ 550 ms) : ouvre la feuille de partage native au lieu de copier. */
function useLongPress(onLong: () => void, onShort: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  return {
    onPointerDown: () => { fired.current = false; clear(); timer.current = setTimeout(() => { fired.current = true; onLong(); }, 550); },
    onPointerUp: () => { clear(); if (!fired.current) onShort(); },
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

export function DeliverablesTab({ project }: { project: Project }) {
  const store = useStore();
  const { state, me } = store;
  const manage = canManage(me, project);
  const canUpload = canUploadDeliverables(me, project);
  const canShare = canShareDeliverables(me, project);
  const folders = state.folders.filter((f) => f.projectId === project.id);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState(false);
  const [uploadFor, setUploadFor] = useState<Deliverable | 'new' | null>(null);
  const [preview, setPreview] = useState<Deliverable | null>(null);
  const [renaming, setRenaming] = useState<Folder | null>(null);
  const [removing, setRemoving] = useState<Folder | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const current = folders.find((f) => f.id === folderId);
  const trail: Folder[] = [];
  for (let f = current; f; f = folders.find((x) => x.id === f!.parentId)) trail.unshift(f);
  const children = folders.filter((f) => f.parentId === folderId);
  const items = state.deliverables.filter((d) => d.projectId === project.id && d.folderId === folderId);
  const links = state.shareLinks.filter((l) => l.projectId === project.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const countIn = (id: string): number => state.deliverables.filter((d) => d.folderId === id).length + folders.filter((f) => f.parentId === id).reduce((s, f) => s + countIn(f.id), 0);

  /** DLV-05 v1.1 : lien de la version courante, créé ou réutilisé, copié dans le presse-papiers. */
  const copy = async (d: Deliverable) => {
    const link = await store.copyLink(d.id);
    if ('error' in link) { setToast(link.error); return; }
    try {
      await navigator.clipboard.writeText(link.url);
      setToast('Lien copié');
    } catch {
      setToast('Copie impossible : autorisez le presse-papiers');
    }
  };

  const share = async (d: Deliverable) => {
    const link = await store.copyLink(d.id);
    if ('error' in link) { setToast(link.error); return; }
    const url = link.url;
    const v = d.versions[d.versions.length - 1];
    if (navigator.share) {
      try { await navigator.share({ title: `${d.name} — ${project.name}`, text: v.fileName, url }); } catch { /* partage annulé */ }
    } else {
      await navigator.clipboard.writeText(url);
      setToast('Lien copié');
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Fil d'Ariane">
            <button onClick={() => setFolderId(null)} className="flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-navy/60 hover:bg-white/50 hover:text-navy"><Home size={14} /> Livrables</button>
            {trail.map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <ChevronRight size={14} className="text-navy/30" />
                <button onClick={() => setFolderId(f.id)} className="rounded-lg px-2 py-1 font-semibold text-navy hover:bg-white/50">{f.name}</button>
              </span>
            ))}
          </nav>
          <div className="flex gap-2">
            {manage && depth(current, folders) < 3 && <Button variant="secondary" onClick={() => setNewFolder(true)}><FolderPlus size={15} /> Dossier</Button>}
            {canUpload && folderId && <Button onClick={() => setUploadFor('new')}><Upload size={15} /> Ajouter</Button>}
          </div>
        </div>

        {children.length > 0 && (
          <motion.div className="grid grid-cols-2 gap-3 sm:grid-cols-4" variants={staggerParent} initial="hidden" animate="show" key={folderId ?? 'root'}>
            {children.map((f) => (
              <motion.div key={f.id} variants={staggerChildY} whileHover={cardHover} transition={cardSpring} className="glass group relative rounded-2xl">
                <button onClick={() => setFolderId(f.id)} className="flex w-full flex-col items-start rounded-2xl p-3 text-left">
                  <FolderIcon size={22} className="fill-brand/20 text-brand" />
                  <span className={cn('mt-2 w-full truncate text-sm font-semibold text-navy', manage && 'pr-12 sm:pr-0 sm:group-hover:pr-12 sm:group-focus-within:pr-12')}>{f.name}</span>
                  <span className="text-xs text-navy/45">{countIn(f.id)} élément(s)</span>
                </button>
                {manage && (
                  <span className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Button variant="icon" className="!p-1.5" title="Renommer" aria-label={`Renommer le dossier ${f.name}`} onClick={() => setRenaming(f)}><Pencil size={14} /></Button>
                    <Button variant="icon-danger" className="!p-1.5" title="Supprimer" aria-label={`Supprimer le dossier ${f.name}`} onClick={() => setRemoving(f)}><Trash2 size={14} /></Button>
                  </span>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}

        {folderId && (
          <motion.div className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
            {items.map((d) => (
              <DeliverableRow
                key={d.id}
                d={d}
                canShare={canShare}
                canUpload={canUpload}
                onCopy={() => copy(d)}
                onShare={() => share(d)}
                onPreview={() => setPreview(d)}
                onUpload={() => setUploadFor(d)}
              />
            ))}
            {!items.length && !children.length && <Empty icon={<FolderIcon />} title="Dossier vide" hint="Déposez un fichier depuis votre téléphone ou ordinateur." />}
          </motion.div>
        )}
        {canShare && folderId && items.length > 0 && <p className="text-xs text-navy/45">« Copier le lien » donne l&apos;adresse de la version courante : l&apos;ouvrir télécharge directement le fichier. Appui long pour partager (WhatsApp, e-mail…).</p>}
      </section>

      {canShare && <section>
        <SectionLabel>Liens client</SectionLabel>
        <div className="space-y-2">
          {links.map((l) => <LinkRow key={l.id} link={l} manage={canShare} />)}
          {!links.length && <div className="glass-sm rounded-2xl p-4 text-center text-xs text-navy/45">Aucun lien partagé</div>}
        </div>
      </section>}

      <NewFolderModal open={newFolder} onClose={() => setNewFolder(false)} projectId={project.id} parentId={folderId} />
      {uploadFor && folderId && <UploadModal project={project} folderId={folderId} target={uploadFor === 'new' ? null : uploadFor} onClose={() => setUploadFor(null)} />}
      {preview && <PreviewModal d={preview} onClose={() => setPreview(null)} />}
      {renaming && <RenameFolderModal folder={renaming} onClose={() => setRenaming(null)} />}
      {removing && <DeleteFolderModal folder={removing} count={countIn(removing.id)} onClose={() => setRemoving(null)} />}
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

function DeliverableRow({ d, canShare, canUpload, onCopy, onShare, onPreview, onUpload }: { d: Deliverable; canShare: boolean; canUpload: boolean; onCopy: () => void; onShare: () => void; onPreview: () => void; onUpload: () => void }) {
  const { state, setDeliverableDueDate } = useStore();
  const v = d.versions[d.versions.length - 1];
  const isLink = v.kind === 'LINK';
  const Icon = isLink ? Globe : fileIcon(v.mime);
  const press = useLongPress(onShare, onCopy);
  const due = d.dueDate ? daysUntil(d.dueDate) : null;
  return (
    <motion.div variants={staggerChildY} className="glass-sm rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-white/60 p-2 text-brand"><Icon size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-navy">{d.name}</span>
            <Badge tone="ocean">v{v.number}</Badge>
            {isLink && <Badge tone="muted">Lien</Badge>}
            <MetaBadge meta={deliverableStatusMeta[d.status]} />
          </div>
          <StageTrack status={d.status} />
          <div className="truncate text-xs text-navy/45">{isLink ? v.fileName : `${v.fileName} · ${fmtBytes(v.size)}`} · {state.users.find((u) => u.id === v.uploaderId)?.name.split(' ')[0]} · {relDays(v.date)}</div>
        </div>
        {isLink && v.url && <a href={v.url} target="_blank" rel="noopener noreferrer" className="rounded-xl p-2 text-navy/50 transition-colors hover:bg-white/70 hover:text-brand" aria-label={`Ouvrir ${d.name}`} title="Ouvrir le lien"><ExternalLink size={17} /></a>}
        <Button variant="icon" aria-label="Détails et versions" onClick={onPreview}><Eye size={17} /></Button>
        {canUpload && <Button variant="icon" aria-label="Nouvelle version" onClick={onUpload}><Upload size={17} /></Button>}
        {canShare && (
          <>
            <Button variant="icon" className="hidden sm:inline-flex" aria-label="Partager" title="Partager…" onClick={onShare}><Share2 size={17} /></Button>
            <Button
              className="!px-3 !py-1.5 text-xs"
              {...press}
              disabled={d.status === 'REJECTED_INTERNAL'}
              title={d.status === 'REJECTED_INTERNAL' ? 'Rejeté avant envoi : déposez une nouvelle version pour le partager' : undefined}
              aria-label={`Copier le lien de ${d.name} v${v.number}`}
            >
              <Link2 size={14} /> Copier le lien
            </Button>
          </>
        )}
      </div>
      {d.status.startsWith('REJECTED') && (
        <div className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-700">
          <b>{deliverableStatusMeta[d.status][0]}</b>
          {d.statusChangedBy && ` par ${state.users.find((u) => u.id === d.statusChangedBy)?.name.split(' ')[0] ?? '—'}`}
          {d.statusChangedAt && `, ${relDays(d.statusChangedAt)}`}
          {d.statusNote ? <> : {d.statusNote}</> : '.'}
          {canUpload && <span className="block text-red-700/70">Déposez une nouvelle version : elle repartira « En préparation ».</span>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/50 pt-2 text-xs text-navy/55">
        {canShare && <StageControl d={d} />}
        <CalendarClock size={13} className="text-brand" />
        <span>Échéance</span>
        {canShare ? (
          <input
            type="date"
            value={d.dueDate?.slice(0, 10) ?? ''}
            onChange={(e) => setDeliverableDueDate(d.id, e.target.value ? new Date(e.target.value + 'T17:00:00Z').toISOString() : null)}
            className="!w-auto !py-1 !text-xs"
            aria-label={`Échéance de ${d.name}`}
          />
        ) : (
          <span className="font-semibold text-navy">{d.dueDate ? fmtDate(d.dueDate, { day: 'numeric', month: 'long' }) : '—'}</span>
        )}
        {due !== null && d.status !== 'VALIDATED' && <Badge tone={due < 0 ? 'red' : due <= 2 ? 'amber' : 'muted'}>{due < 0 ? `${-due} j de retard` : due === 0 ? "aujourd'hui" : `J-${due}`}</Badge>}
      </div>
    </motion.div>
  );
}

/** Frise des étapes : préparation → envoi → réponse du client. Un rejet s'affiche en rouge sur son étape. */
function StageTrack({ status }: { status: DeliverableStatus }) {
  const reached = { IN_PROGRESS: 0, REJECTED_INTERNAL: 0, SENT: 1, VALIDATED: 2, REJECTED_CLIENT: 2 }[status];
  const steps = [
    { label: status === 'REJECTED_INTERNAL' ? 'Rejeté' : 'Préparation', title: deliverableStatusMeta[status === 'REJECTED_INTERNAL' ? 'REJECTED_INTERNAL' : 'IN_PROGRESS'][0], bad: status === 'REJECTED_INTERNAL' },
    { label: 'Envoyé', title: 'Envoyé au client', bad: false },
    { label: status === 'REJECTED_CLIENT' ? 'Refusé' : 'Validé', title: status === 'REJECTED_CLIENT' ? 'Rejeté par le client' : 'Validé par le client', bad: status === 'REJECTED_CLIENT' },
  ];
  return (
    <ol className="mt-1.5 flex items-center gap-1" aria-label={`Étape : ${deliverableStatusMeta[status][0]}`}>
      {steps.map((st, i) => {
        const done = i < reached || (i === reached && (status === 'VALIDATED' || i === 1));
        const current = i === reached;
        return (
          <li key={st.label} className="flex items-center gap-1">
            {i > 0 && <span className={cn('h-px w-4 sm:w-6', i <= reached ? 'bg-brand/60' : 'bg-navy/15')} />}
            <span
              title={st.title}
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white',
                st.bad && current ? 'bg-red-500' : done || current ? (status === 'VALIDATED' && i === 2 ? 'bg-emerald-500' : 'bg-brand') : 'bg-navy/15',
              )}
            >
              {st.bad && current ? <X size={10} /> : done ? <Check size={10} /> : i + 1}
            </span>
            <span className={cn('hidden whitespace-nowrap text-[10px] font-medium md:inline', current ? (st.bad ? 'text-red-600' : 'text-navy') : 'text-navy/40')}>{st.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Changer d'étape (chef de projet ou admin). Un rejet demande un motif, transmis à l'auteur de la version. */
function StageControl({ d }: { d: Deliverable }) {
  const { setDeliverableStage } = useStore();
  const [rejecting, setRejecting] = useState<DeliverableStatus | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const next = deliverableTransitions[d.status];
  const apply = async (status: DeliverableStatus, reason = '') => {
    setError(null);
    const r = await setDeliverableStage(d.id, status, reason);
    if (!r.ok) { setError(r.error); return false; }
    return true;
  };
  return (
    <>
      <span className="flex items-center gap-1.5">
        <span>Étape</span>
        <Select
          value={d.status}
          onChange={(e) => {
            const to = e.target.value as DeliverableStatus;
            if (to.startsWith('REJECTED')) { setNote(''); setRejecting(to); } else apply(to);
          }}
          className="!w-auto !py-1 !text-xs"
          aria-label={`Étape de ${d.name}`}
        >
          <option value={d.status}>{deliverableStatusMeta[d.status][0]}</option>
          {next.map((s) => <option key={s} value={s}>→ {deliverableStatusMeta[s][0]}</option>)}
        </Select>
      </span>
      <span className="mx-1 hidden h-4 w-px bg-navy/10 sm:inline-block" />
      {error && <span className="w-full text-red-600">{error}</span>}
      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={rejecting === 'REJECTED_INTERNAL' ? 'Rejeter avant envoi' : 'Rejeté par le client'}
        footer={<><Button variant="secondary" onClick={() => setRejecting(null)}>Annuler</Button><Button variant="danger" onClick={async () => { if (rejecting && (await apply(rejecting, note))) setRejecting(null); }}>Confirmer le rejet</Button></>}
      >
        <p className="text-sm text-navy">
          {rejecting === 'REJECTED_INTERNAL'
            ? `« ${d.name} » ne sera pas envoyé au client. L'auteur de la dernière version est prévenu pour la corriger.`
            : `Le client a refusé « ${d.name} ». L'équipe est prévenue pour préparer une nouvelle version.`}
        </p>
        <Field label="Motif (recommandé)"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. couleurs à revoir, texte à corriger…" autoFocus /></Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </Modal>
    </>
  );
}

const EXPIRY_CHOICES = [7, 14, 30, 60, LINK_MAX_DAYS];

function LinkRow({ link, manage }: { link: ShareLink; manage: boolean }) {
  const { state, revokeLink, setLinkExpiry } = useStore();
  const d = state.deliverables.find((x) => x.id === link.deliverableId);
  const expired = daysUntil(link.expiresAt) < 0;
  const active = !link.revoked && !expired;
  const lifetime = Math.round((Date.parse(link.expiresAt) - Date.parse(link.createdAt)) / DAY);
  const last = state.shareAccess.find((a) => a.linkId === link.id);
  const isLink = d?.versions.find((v) => v.number === link.versionNumber)?.kind === 'LINK';
  const word = isLink ? 'ouverture' : 'téléchargement';
  return (
    <div className={cn('glass-sm rounded-2xl p-3', !active && 'opacity-60')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-navy"><Link2 size={14} className="shrink-0 text-brand" /><span className="truncate">{d?.name ?? 'Livrable supprimé'} · v{link.versionNumber}</span></span>
        {link.revoked ? <Badge tone="muted">Révoqué</Badge> : expired ? <Badge tone="red">Expiré</Badge> : <Badge tone="green">Actif</Badge>}
      </div>
      <div className="mt-1 truncate font-mono text-[11px] text-navy/45">/s/{link.token}</div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-navy/50">
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1"><Download size={12} /> {link.downloads ? `${link.downloads} ${word}${link.downloads > 1 ? 's' : ''}` : isLink ? 'jamais ouvert' : 'jamais téléchargé'}</span>
          {last && <span>dernier {relDays(last.date)}</span>}
        </span>
        {manage && active ? (
          <span className="flex items-center gap-2">
            <Select
              value={EXPIRY_CHOICES.includes(lifetime) ? lifetime : ''}
              onChange={(e) => setLinkExpiry(link.id, Number(e.target.value))}
              className="!w-auto !py-1 !text-xs"
              aria-label="Durée de validité du lien"
            >
              {!EXPIRY_CHOICES.includes(lifetime) && <option value="">expire {fmtDate(link.expiresAt)}</option>}
              {EXPIRY_CHOICES.map((n) => <option key={n} value={n}>{n} jours{n === 14 ? ' (défaut)' : n === LINK_MAX_DAYS ? ' (max)' : ''}</option>)}
            </Select>
            <button onClick={() => revokeLink(link.id)} className="flex items-center gap-1 font-semibold text-red-500 hover:text-red-600"><Ban size={12} /> Révoquer</button>
          </span>
        ) : (
          <span>expire {fmtDate(link.expiresAt)}</span>
        )}
      </div>
    </div>
  );
}

function NewFolderModal({ open, onClose, projectId, parentId }: { open: boolean; onClose: () => void; projectId: string; parentId: string | null }) {
  const { createFolder } = useStore();
  const [name, setName] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Nouveau dossier" footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!name.trim()} onClick={() => { createFolder(projectId, name.trim(), parentId); setName(''); onClose(); }}>Créer</Button></>}>
      <Field label="Nom" hint="Profondeur maximale : 3 niveaux."><input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}

// ---------- DLV-03 : dépôt direct vers le stockage (URL présignée, multipart > 100 Mo, reprise, annulation) ----------

function UploadModal({ project, folderId, target, onClose }: { project: Project; folderId: string; target: Deliverable | null; onClose: () => void }) {
  const { reload, addDeliverableLink } = useStore();
  const [mode, setMode] = useState<'FILE' | 'LINK'>('FILE');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState(target?.name ?? '');
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'paused' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const upload = useRef<DeliverableUpload | null>(null);
  const tooBig = !!file && file.size > 2 * 1024 ** 3;
  const multipart = !!file && file.size > 100 * 1024 ** 2;
  const validUrl = /^https?:\/\/\S+\.\S+/i.test(url.trim());

  const run = async () => {
    if (!file) return;
    setError(null);
    setPhase('uploading');
    upload.current ??= new DeliverableUpload(file, { projectId: project.id, folderId, deliverableId: target?.id ?? null, name: name.trim() || file.name, note }, setProgress);
    try {
      await upload.current.start();
      setPhase('done');
      await reload();
      setTimeout(onClose, 600);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // pause ou annulation
      setPhase('paused');
      setError(`${errorMessage(e)} Les parties déjà envoyées sont conservées : vous pouvez reprendre.`);
    }
  };

  const saveLink = async () => {
    setError(null);
    setPhase('uploading');
    const r = await addDeliverableLink({ projectId: project.id, folderId, deliverableId: target?.id ?? null, name: name.trim(), url: url.trim(), note });
    if (!r.ok) { setPhase('idle'); setError(r.error); return; }
    setPhase('done');
    onClose();
  };

  const pause = () => {
    upload.current?.pause();
    setPhase('paused');
  };

  const cancel = async () => {
    await upload.current?.cancel();
    upload.current = null;
    setProgress(0);
    setPhase('idle');
  };

  const close = () => {
    if (phase === 'uploading' && mode === 'FILE') upload.current?.pause();
    onClose();
  };

  return (
    <Modal open onClose={close} title={target ? `Nouvelle version · ${target.name}` : 'Ajouter un livrable'}>
      <Segmented<'FILE' | 'LINK'>
        value={mode}
        onChange={(v) => { if (phase === 'idle') { setMode(v); setError(null); } }}
        options={[{ value: 'FILE', label: <><Upload size={13} /> Fichier</> }, { value: 'LINK', label: <><Link2 size={13} /> Lien</> }]}
      />
      {!target && <Field label="Nom du livrable"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === 'FILE' ? 'Ex. APK Android' : 'Ex. Maquettes Figma'} /></Field>}
      {mode === 'FILE' ? (
        <>
          <Field label="Fichier (tous formats, 2 Go max)">
            <input type="file" disabled={phase !== 'idle'} onChange={(e) => { setFile(e.target.files?.[0] ?? null); upload.current = null; }} className="block w-full text-sm text-navy/60" />
          </Field>
          {file && <div className="text-xs text-navy/45">{fmtBytes(file.size)} · {file.type || 'type inconnu'}{multipart && ' · envoi en plusieurs parties, reprise possible'}</div>}
          {tooBig && <ErrorNote>Fichier trop volumineux (2 Go max).</ErrorNote>}
        </>
      ) : (
        <Field label="Adresse du livrable" hint="Drive, TestFlight, Figma, site de recette… Le lien partagé redirigera vers cette adresse.">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" disabled={phase !== 'idle'} />
        </Field>
      )}
      <Field label="Note de version"><input type="text" value={note} disabled={phase !== 'idle'} onChange={(e) => setNote(e.target.value)} /></Field>
      {mode === 'FILE' && phase !== 'idle' && (
        <div className="glass-sm rounded-2xl p-3">
          <div className="mb-2 flex justify-between text-xs font-medium text-navy/60">
            <span>{phase === 'paused' ? 'En pause — reprise possible' : phase === 'done' ? 'Terminé ✓' : 'Envoi vers le stockage…'}</span>
            <span>{progress}%</span>
          </div>
          <ProgressBar value={progress} tone={phase === 'done' ? 'green' : phase === 'paused' ? 'amber' : 'brand'} />
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end gap-2">
        {mode === 'LINK' && <Button disabled={phase !== 'idle' || !validUrl || (!target && !name.trim())} onClick={saveLink}><Link2 size={15} /> {phase === 'uploading' ? 'Enregistrement…' : 'Enregistrer le lien'}</Button>}
        {mode === 'FILE' && phase === 'idle' && <Button disabled={!file || tooBig} onClick={run}><Upload size={15} /> Envoyer</Button>}
        {mode === 'FILE' && phase === 'uploading' && <Button variant="secondary" onClick={pause}><Pause size={15} /> Pause</Button>}
        {mode === 'FILE' && phase === 'paused' && <Button onClick={run}><Play size={15} /> Reprendre</Button>}
        {mode === 'FILE' && (phase === 'uploading' || phase === 'paused') && <Button variant="danger" onClick={cancel}><X size={15} /> Annuler</Button>}
      </div>
    </Modal>
  );
}

function RenameFolderModal({ folder, onClose }: { folder: Folder; onClose: () => void }) {
  const { renameFolder } = useStore();
  const [name, setName] = useState(folder.name);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const r = await renameFolder(folder.id, name.trim());
    if (!r.ok) { setError(r.error); return; }
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Renommer le dossier" footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!name.trim() || name.trim() === folder.name} onClick={submit}>Renommer</Button></>}>
      <Field label="Nom"><input type="text" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} onKeyDown={(e) => e.key === 'Enter' && name.trim() && submit()} autoFocus /></Field>
      {error && <ErrorNote>{error}</ErrorNote>}
    </Modal>
  );
}

function DeleteFolderModal({ folder, count, onClose }: { folder: Folder; count: number; onClose: () => void }) {
  const { deleteFolder } = useStore();
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const r = await deleteFolder(folder.id);
    if (!r.ok) { setError(r.error); return; }
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Supprimer le dossier ?" footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button variant="danger" disabled={count > 0} onClick={submit}><Trash2 size={15} /> Supprimer</Button></>}>
      {count > 0 ? (
        <ErrorNote>« {folder.name} » contient {count} élément(s). Videz-le d&apos;abord : un dossier ne peut être supprimé que s&apos;il est vide, pour ne jamais perdre un livrable par erreur.</ErrorNote>
      ) : (
        <p className="text-sm text-navy">Le dossier vide « {folder.name} » sera supprimé.</p>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </Modal>
  );
}

type PreviewKind = 'video' | 'audio' | 'pdf' | 'image' | 'none';
function previewKind(mime: string, name: string): PreviewKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  return 'none';
}

/** Détails d'un livrable : lecture de la vidéo, du PDF ou de l'image directement dans l'application, et historique. */
function PreviewModal({ d, onClose }: { d: Deliverable; onClose: () => void }) {
  const { state } = useStore();
  const [number, setNumber] = useState(d.versions[d.versions.length - 1].number);
  const v = d.versions.find((x) => x.number === number) ?? d.versions[d.versions.length - 1];
  const isLink = v.kind === 'LINK';
  const kind = isLink ? 'none' : previewKind(v.mime, v.fileName);
  const Icon = isLink ? Globe : fileIcon(v.mime);
  const [urls, setUrls] = useState<{ url: string; downloadUrl?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLink) return;
    let live = true;
    setUrls(null);
    setError(null);
    api<{ url: string; downloadUrl?: string }>(`/deliverables/${d.id}/versions/${v.number}/preview`)
      .then((r) => { if (live) setUrls(r); })
      .catch((e) => { if (live) setError(errorMessage(e)); });
    return () => { live = false; };
  }, [d.id, v.number, isLink]);

  return (
    <Modal open onClose={onClose} title={d.name} wide>
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-frost/50 to-white/40">
        {urls && kind === 'video' && <video key={urls.url} src={urls.url} controls playsInline preload="metadata" className="max-h-[60vh] w-full bg-navy" />}
        {urls && kind === 'audio' && <div className="p-6"><audio key={urls.url} src={urls.url} controls className="w-full" /></div>}
        {urls && kind === 'pdf' && <iframe key={urls.url} src={urls.url} title={v.fileName} className="h-[60vh] w-full bg-white" />}
        {urls && kind === 'image' && <img key={urls.url} src={urls.url} alt={v.fileName} className="mx-auto max-h-[60vh] object-contain" />}
        {(isLink || kind === 'none' || (!urls && !error) || error) && (
          <div className="flex aspect-video items-center justify-center p-6">
            <div className="text-center">
              <Icon size={48} className="mx-auto text-brand" />
              <div className="mt-2 text-sm font-semibold text-navy">{isLink ? d.name : v.fileName}</div>
              {isLink && v.url ? (
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-ocean"><ExternalLink size={13} /> Ouvrir {v.fileName}</a>
              ) : error ? (
                <div className="mt-1 text-xs text-red-600">{error}</div>
              ) : !urls ? (
                <div className="mt-1 text-xs text-navy/45">Chargement de l&apos;aperçu…</div>
              ) : (
                <div className="mt-1 text-xs text-navy/45">Pas d&apos;aperçu pour ce type de fichier : téléchargez-le pour l&apos;ouvrir.</div>
              )}
            </div>
          </div>
        )}
      </div>
      {urls?.downloadUrl && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-navy/50">{v.fileName} · {fmtBytes(v.size)}</span>
          <a href={urls.downloadUrl} className="inline-flex items-center gap-1.5 rounded-xl bg-white/60 px-3 py-1.5 text-xs font-semibold text-navy shadow-sm hover:bg-white/90"><Download size={13} /> Télécharger</a>
        </div>
      )}
      <div>
        <div className="mb-2 text-xs font-medium text-navy/50">Historique des versions · cliquez pour afficher une version</div>
        <div className="space-y-1.5">
          {[...d.versions].reverse().map((x) => (
            <button
              key={x.number}
              type="button"
              onClick={() => setNumber(x.number)}
              className={cn('glass-sm flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-white/60', x.number === v.number && 'ring-2 ring-brand/50')}
            >
              <span className="min-w-0">
                <b className="text-navy">v{x.number}</b> <span className="text-navy/60">{x.note || x.fileName}</span>
                {x.kind === 'LINK' ? (
                  <span className="block truncate text-[11px] text-brand">{x.url}</span>
                ) : x.sha256 ? (
                  <span
                    className="mt-0.5 flex items-center gap-1 text-[10px] text-navy/45"
                    title={`Empreinte SHA-256 : ${x.sha256}\nCalculée à partir du contenu du fichier. Si le client recalcule la même empreinte sur le fichier reçu, c'est la preuve qu'il a exactement ce fichier, intact et non modifié.`}
                  >
                    <ShieldCheck size={11} className="text-emerald-600" /> Empreinte de vérification <span className="font-mono">{x.sha256.slice(0, 8)}…{x.sha256.slice(-6)}</span>
                  </span>
                ) : (
                  <span className="mt-0.5 block text-[10px] text-navy/40">Empreinte en cours de calcul…</span>
                )}
              </span>
              <span className="shrink-0 text-right text-xs text-navy/45">{x.kind === 'LINK' ? 'Lien' : fmtBytes(x.size)}<br />{state.users.find((u) => u.id === x.uploaderId)?.name.split(' ')[0]} · {fmtDateTime(x.date)}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
