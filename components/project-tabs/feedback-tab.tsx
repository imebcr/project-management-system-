'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Camera, ChevronLeft, ChevronRight, ImagePlus, ListPlus, MessageSquareText, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarStack, Badge, Button, DeptBadge, Empty, ErrorNote, Field, MetaBadge, Modal, Segmented } from '@/components/ui';
import { MAX_FEEDBACK_IMAGES, prepareImage, type PreparedImage } from '@/lib/images';
import { staggerChildY, staggerParent } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { Feedback, FeedbackChannel, FeedbackImage, FeedbackType, Project } from '@/lib/types';
import { canManage, canPostFeedback, cn, feedbackStatusMeta, feedbackTypeMeta, fmtDateTime, relDays } from '@/lib/utils';
import { Select } from '@/components/select';

const FEEDBACK_TYPES: FeedbackType[] = ['FEEDBACK', 'BUG', 'CHANGE_REQUEST', 'VALIDATION'];
const CHANNELS: FeedbackChannel[] = ['WhatsApp', 'Appel', 'E-mail', 'Réunion', 'Autre'];

/** Retours : texte et photos sur l'application, par l'équipe ou transmis par le client. */
export function FeedbackTab({ project }: { project: Project }) {
  const store = useStore();
  const { state, me } = store;
  const manage = canManage(me, project);
  const canPost = canPostFeedback(me, project);
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState<Feedback | null>(null);
  const [viewer, setViewer] = useState<{ images: FeedbackImage[]; index: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const sourceOf = useSource();

  const all = state.feedbacks.filter((f) => f.projectId === project.id).sort((a, b) => b.date.localeCompare(a.date));
  const list = all
    .filter((f) => scope === 'all' || f.status === 'OPEN' || f.status === 'ACCEPTED');
  const openCount = all.filter((f) => f.status === 'OPEN').length;
  const openFeedback = all.find((f) => f.id === openId) ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={scope} onChange={setScope} options={[{ value: 'open', label: `À traiter${openCount ? ` · ${openCount}` : ''}` }, { value: 'all', label: 'Tous' }]} />
        </div>
        {canPost && <Button onClick={() => setCreating(true)}><Plus size={16} /> Nouveau retour</Button>}
      </div>

      {!list.length ? (
        <Empty
          icon={<MessageSquareText />}
          title={all.length ? 'Aucun retour avec ces filtres' : 'Aucun retour pour le moment'}
          hint="Ajoutez un retour avec des captures d’écran ou des photos : remarque, bug, demande de modification ou validation."
          action={canPost && !all.length && <Button onClick={() => setCreating(true)}><Camera size={15} /> Ajouter un retour</Button>}
        />
      ) : (
        <motion.ul className="glass divide-y divide-white/60 overflow-hidden rounded-2xl" variants={staggerParent} initial="hidden" animate="show" key={scope}>
          {list.map((f) => (
            <motion.li key={f.id} variants={staggerChildY}>
              <button onClick={() => setOpenId(f.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/45">
                {f.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.images[0].url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/70" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"><MessageSquareText size={17} /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-navy">{f.content || 'Retour en photos'}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-navy/50">
                    <MetaBadge meta={feedbackTypeMeta[f.type]} />
                    <span>De {sourceOf(f)}</span>
                    {f.recipientIds.length > 0 && <span className="flex items-center gap-1">→ <AvatarStack ids={f.recipientIds} size={16} max={3} /></span>}
                    {f.images.length > 0 && <span className="flex items-center gap-0.5"><Camera size={11} /> {f.images.length}</span>}
                    <span className="text-navy/35">{relDays(f.date)}</span>
                  </span>
                </span>
                <MetaBadge meta={feedbackStatusMeta[f.status]} />
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}

      {openFeedback && (
        <Modal open onClose={() => setOpenId(null)} title={feedbackTypeMeta[openFeedback.type][0]} wide>
          <FeedbackDetail
            f={openFeedback}
            manage={manage}
            onImage={(i) => setViewer({ images: openFeedback.images, index: i })}
            onConvert={() => { setConverting(openFeedback); setOpenId(null); }}
          />
        </Modal>
      )}
      {creating && <NewFeedbackModal project={project} onClose={() => setCreating(false)} />}
      {converting && <ConvertModal feedback={converting} onClose={() => setConverting(null)} />}
      {viewer && <ImageViewer images={viewer.images} index={viewer.index} onIndex={(index) => setViewer({ ...viewer, index })} onClose={() => setViewer(null)} />}
    </div>
  );
}

/** « De » : le membre de l'équipe, ou la personne côté client et le canal. */
function useSource() {
  const { state } = useStore();
  return (f: Feedback) => {
    if (f.channel !== 'Interne') return `${f.contact || 'Client'} (client · ${f.channel})`;
    const id = f.fromUserId ?? f.authorId;
    return state.users.find((u) => u.id === id)?.name ?? '—';
  };
}

function FeedbackDetail({ f, manage, onImage, onConvert }: { f: Feedback; manage: boolean; onImage: (i: number) => void; onConvert: () => void }) {
  const store = useStore();
  const { state } = store;
  const sourceOf = useSource();
  const author = state.users.find((u) => u.id === f.authorId);
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? '—';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <MetaBadge meta={feedbackTypeMeta[f.type]} />
        <MetaBadge meta={feedbackStatusMeta[f.status]} />
        {f.needsNewCdc && <Badge tone="navy">Nouvelle version du CDC</Badge>}
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div className="glass-sm rounded-xl p-2.5">
          <dt className="text-[11px] font-medium text-navy/45">De</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-navy">
            {f.channel === 'Interne' && <Avatar userId={f.fromUserId ?? f.authorId} size={20} />}{sourceOf(f)}
          </dd>
        </div>
        <div className="glass-sm rounded-xl p-2.5">
          <dt className="text-[11px] font-medium text-navy/45">Pour</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-navy">
            {f.recipientIds.length ? f.recipientIds.map((id) => <span key={id} className="flex items-center gap-1"><Avatar userId={id} size={20} />{name(id).split(' ')[0]}</span>) : <span className="font-medium text-navy/45">Toute l&apos;équipe</span>}
          </dd>
        </div>
      </dl>
      <p className="whitespace-pre-line text-sm leading-relaxed text-navy">{f.content}</p>
      {f.images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {f.images.map((img, i) => (
            <button key={img.id} onClick={() => onImage(i)} className="group relative aspect-square overflow-hidden rounded-xl bg-white/50 ring-1 ring-white/70" aria-label={`Agrandir ${img.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
            </button>
          ))}
        </div>
      )}
      <div className="text-[11px] text-navy/45">Saisi par {author?.name ?? '—'} · {fmtDateTime(f.date)}{f.linkedLabel && ` · ↳ ${f.linkedLabel}`}</div>
      {manage && (
        <div className="flex flex-wrap gap-2 border-t border-white/60 pt-3">
          {f.status === 'OPEN' && (
            <>
              <Button className="!py-1.5 text-xs" onClick={() => store.setFeedbackStatus(f.id, 'ACCEPTED')}>Prendre en compte</Button>
              <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => store.setFeedbackStatus(f.id, 'REJECTED')}>Refuser</Button>
            </>
          )}
          {f.status === 'ACCEPTED' && f.type !== 'VALIDATION' && <Button variant="secondary" className="!py-1.5 text-xs" onClick={onConvert}><ListPlus size={13} /> Convertir en tâches</Button>}
          {f.status === 'ACCEPTED' && <Button className="!py-1.5 text-xs" onClick={() => store.setFeedbackStatus(f.id, 'DONE')}>Marquer traité</Button>}
          {f.type === 'CHANGE_REQUEST' && f.status !== 'REJECTED' && (
            <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => store.toggleNeedsNewCdc(f.id)}>{f.needsNewCdc ? 'Ne nécessite plus de version du CDC' : 'Nécessite une nouvelle version du CDC'}</Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Nouveau retour (texte + photos) ----------

function NewFeedbackModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { state, me, addFeedback } = useStore();
  const team = project.members.map((m) => m.userId).filter((id) => state.users.find((u) => u.id === id)?.active);
  const [fromUserId, setFromUserId] = useState(me.id); // par défaut : la personne qui saisit
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [type, setType] = useState<FeedbackType>('FEEDBACK');
  const [source, setSource] = useState<'internal' | 'client'>('internal');
  const [channel, setChannel] = useState<FeedbackChannel>('WhatsApp');
  const [contact, setContact] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const room = MAX_FEEDBACK_IMAGES - images.length;
    if (list.length > room) setError(`${MAX_FEEDBACK_IMAGES} photos maximum par retour.`);
    setBusy(true);
    const added: PreparedImage[] = [];
    for (const file of list.slice(0, Math.max(0, room))) {
      try {
        added.push(await prepareImage(file));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Image illisible.');
      }
    }
    setImages((x) => [...x, ...added]);
    setBusy(false);
  };

  // Libère les aperçus locaux à la fermeture.
  useEffect(() => () => images.forEach((i) => URL.revokeObjectURL(i.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true);
    const r = await addFeedback({
      projectId: project.id, type, deliverableId: null,
      channel: source === 'internal' ? 'Interne' : channel, contact: source === 'client' ? contact.trim() : '',
      fromUserId: source === 'internal' ? fromUserId : null, recipientIds,
      content: content.trim(), images: images.map((i) => ({ blob: i.blob, name: i.name })),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouveau retour"
      wide
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={busy || (!content.trim() && !images.length)} onClick={submit}>Publier le retour</Button></>}
    >
      <Field label="Type">
        <Select value={type} onChange={(e) => setType(e.target.value as FeedbackType)}>
          {FEEDBACK_TYPES.map((t) => <option key={t} value={t}>{feedbackTypeMeta[t][0]}</option>)}
        </Select>
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-navy/50">Origine</span>
        <Segmented value={source} onChange={setSource} options={[{ value: 'internal', label: 'Équipe' }, { value: 'client', label: 'Client' }]} />
      </div>
      {source === 'client' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="De (personne côté client)"><input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Ex. M. Belkacem (DG)" /></Field>
          <Field label="Reçu par"><Select value={channel} onChange={(e) => setChannel(e.target.value as FeedbackChannel)}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
      ) : (
        <Field label="De (membre de l'équipe)">
          <Select value={fromUserId} onChange={(e) => setFromUserId(e.target.value)}>
            {(team.includes(me.id) ? team : [me.id, ...team]).map((id) => <option key={id} value={id}>{state.users.find((u) => u.id === id)?.name}{id === me.id ? ' (vous)' : ''}</option>)}
          </Select>
        </Field>
      )}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-navy/50">
          <span>Pour qui · membres chargés de le traiter (notifiés)</span>
          {recipientIds.length > 0 && <button type="button" onClick={() => setRecipientIds([])} className="font-semibold text-brand hover:text-ocean">Toute l&apos;équipe</button>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {team.map((id) => {
            const u = state.users.find((x) => x.id === id)!;
            const on = recipientIds.includes(id);
            return (
              <button key={id} type="button" aria-pressed={on} onClick={() => setRecipientIds((r) => (on ? r.filter((x) => x !== id) : [...r, id]))} className={cn('flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-xs font-semibold transition-colors', on ? 'border-brand/40 bg-brand/15 text-ocean' : 'border-white/70 bg-white/50 text-navy/50 hover:text-navy')}>
                <Avatar userId={id} size={20} /> {u.name.split(' ')[0]} <DeptBadge department={u.department} />
              </button>
            );
          })}
        </div>
        {!recipientIds.length && <p className="mt-1 text-[11px] text-navy/40">Personne de précis : le retour s&apos;adresse à toute l&apos;équipe (le chef de projet est prévenu).</p>}
      </div>
      <Field label="Retour"><textarea rows={4} value={content} onChange={(e) => { setContent(e.target.value); setError(null); }} placeholder="Décrivez ce qui va, ce qui ne va pas, ou ce qui doit changer…" autoFocus /></Field>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-navy/50">
          <span>Photos et captures d&apos;écran</span>
          <span>{images.length} / {MAX_FEEDBACK_IMAGES}</span>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          className={cn('rounded-2xl border-2 border-dashed p-3 transition-colors', dragOver ? 'border-brand bg-brand/10' : 'border-navy/10 bg-white/30')}
        >
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <AnimatePresence initial={false}>
              {images.map((img) => (
                <motion.div key={img.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-white/70">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.preview} alt={img.name} className="h-full w-full object-cover" />
                  <button onClick={() => { URL.revokeObjectURL(img.preview); setImages((x) => x.filter((y) => y.id !== img.id)); }} aria-label={`Retirer ${img.name}`} className="absolute right-1 top-1 rounded-full bg-navy/70 p-1 text-white hover:bg-red-500"><X size={12} /></button>
                </motion.div>
              ))}
            </AnimatePresence>
            {images.length < MAX_FEEDBACK_IMAGES && (
              <button onClick={() => input.current?.click()} disabled={busy} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl bg-white/50 text-[11px] font-semibold text-ocean hover:bg-white/80">
                <ImagePlus size={20} /> {busy ? 'Ajout…' : 'Ajouter'}
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-navy/45">Glissez des images ici, ou appuyez sur Ajouter (sur mobile : appareil photo ou galerie).</p>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        </div>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </Modal>
  );
}

// ---------- Visionneuse ----------

function ImageViewer({ images, index, onIndex, onClose }: { images: FeedbackImage[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const img = images[index];
  return (
    <Modal open onClose={onClose} title={img.name} wide>
      <div className="relative flex items-center justify-center rounded-2xl bg-navy/90 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.url} alt={img.name} className="max-h-[65vh] w-auto rounded-xl object-contain" />
        {images.length > 1 && (
          <>
            <button onClick={() => onIndex((index - 1 + images.length) % images.length)} aria-label="Photo précédente" className="absolute left-2 rounded-full bg-white/80 p-2 text-navy hover:bg-white"><ChevronLeft size={18} /></button>
            <button onClick={() => onIndex((index + 1) % images.length)} aria-label="Photo suivante" className="absolute right-2 rounded-full bg-white/80 p-2 text-navy hover:bg-white"><ChevronRight size={18} /></button>
          </>
        )}
      </div>
      {images.length > 1 && <div className="text-center text-xs text-navy/45">{index + 1} / {images.length}</div>}
    </Modal>
  );
}

// ---------- CDC-06 : convertir un retour en tâches ----------

function ConvertModal({ feedback, onClose }: { feedback: Feedback; onClose: () => void }) {
  const { convertFeedback } = useStore();
  const [titles, setTitles] = useState<string[]>([feedback.content.slice(0, 60), '']);
  const valid = titles.map((t) => t.trim()).filter(Boolean);
  return (
    <Modal open onClose={onClose} title="Convertir en tâches" footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!valid.length} onClick={() => { convertFeedback(feedback.id, valid); onClose(); }}>Créer {valid.length} tâche(s)</Button></>}>
      <p className="glass-sm rounded-xl p-3 text-sm text-navy/70">« {feedback.content} »</p>
      {titles.map((t, i) => (
        <div key={i} className="flex gap-2">
          <input type="text" value={t} placeholder={`Tâche ${i + 1}`} onChange={(e) => setTitles((all) => all.map((x, j) => (j === i ? e.target.value : x)))} />
          {titles.length > 1 && <Button variant="icon-danger" aria-label="Retirer" onClick={() => setTitles((all) => all.filter((_, j) => j !== i))}><X size={16} /></Button>}
        </div>
      ))}
      <Button variant="secondary" onClick={() => setTitles((t) => [...t, ''])}><Plus size={14} /> Ajouter une tâche</Button>
    </Modal>
  );
}
