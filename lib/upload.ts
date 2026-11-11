/**
 * Dépôt d'un livrable directement dans le stockage S3 (DLV-03), avec barre de progression réelle.
 * - ≤ 100 Mo : une URL présignée unique ;
 * - au-delà : multipart ; les parties déjà reçues sont redemandées au serveur, ce qui permet
 *   de reprendre après une coupure (même après rechargement de la page, tant que la session vit).
 */
import { api } from './api';

export interface UploadMeta {
  projectId: string;
  folderId: string;
  deliverableId: string | null;
  name: string;
  note: string;
}

interface InitResponse {
  sessionId: string;
  multipart: boolean;
  url?: string;
  partSize?: number;
  partCount?: number;
}

const RESUME_KEY = 'zidny-upload-sessions';

function fingerprint(file: File, meta: UploadMeta) {
  return [meta.projectId, meta.deliverableId ?? meta.folderId, file.name, file.size, file.lastModified].join('|');
}

function savedSessions(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(RESUME_KEY) || '{}');
  } catch {
    return {};
  }
}

function remember(fp: string, sessionId: string | null) {
  try {
    const all = savedSessions();
    if (sessionId) all[fp] = sessionId;
    else delete all[fp];
    localStorage.setItem(RESUME_KEY, JSON.stringify(all));
  } catch {
    /* stockage indisponible : pas de reprise après rechargement */
  }
}

function put(url: string, blob: Blob, contentType: string | null, onProgress: (loaded: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Envoi refusé par le stockage (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Connexion perdue pendant l’envoi.'));
    xhr.onabort = () => reject(new DOMException('Envoi interrompu', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

export class DeliverableUpload {
  private controller = new AbortController();
  private sessionId: string | null = null;
  private readonly fp: string;

  constructor(private file: File, private meta: UploadMeta, private onProgress: (percent: number) => void) {
    this.fp = fingerprint(file, meta);
  }

  /** Démarre ou reprend le dépôt. Résout avec le livrable mis à jour. */
  async start() {
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const mime = this.file.type || 'application/octet-stream';
    let init: InitResponse | null = null;
    const previous = savedSessions()[this.fp];
    if (previous) {
      try {
        const parts = await api<{ done: number[]; partSize: number; partCount: number }>(`/uploads/${previous}/parts`);
        init = { sessionId: previous, multipart: true, partSize: parts.partSize, partCount: parts.partCount };
        return this.multipart(init, new Set(parts.done), signal);
      } catch {
        remember(this.fp, null);
      }
    }
    init = await api<InitResponse>('/uploads', {
      method: 'POST',
      body: { ...this.meta, fileName: this.file.name, size: this.file.size, mime },
    });
    this.sessionId = init.sessionId;
    if (!init.multipart) {
      await put(init.url!, this.file, mime, (loaded) => this.onProgress(Math.round((loaded / this.file.size) * 100)), signal);
      return this.complete();
    }
    remember(this.fp, init.sessionId);
    return this.multipart(init, new Set(), signal);
  }

  private async multipart(init: InitResponse, done: Set<number>, signal: AbortSignal) {
    this.sessionId = init.sessionId;
    const partSize = init.partSize!;
    const partCount = init.partCount!;
    const sizeOf = (n: number) => Math.min(partSize, this.file.size - (n - 1) * partSize);
    let uploaded = [...done].reduce((s, n) => s + sizeOf(n), 0);
    this.onProgress(Math.round((uploaded / this.file.size) * 100));
    const todo = Array.from({ length: partCount }, (_, i) => i + 1).filter((n) => !done.has(n));
    for (let i = 0; i < todo.length; i += 10) {
      const batch = todo.slice(i, i + 10);
      const { urls } = await api<{ urls: Record<string, string> }>(`/uploads/${init.sessionId}/parts?numbers=${batch.join(',')}`);
      for (const n of batch) {
        const blob = this.file.slice((n - 1) * partSize, (n - 1) * partSize + sizeOf(n));
        await put(urls[String(n)], blob, null, (loaded) => this.onProgress(Math.round(((uploaded + loaded) / this.file.size) * 100)), signal);
        uploaded += sizeOf(n);
      }
    }
    return this.complete();
  }

  private async complete() {
    const result = await api(`/uploads/${this.sessionId}/complete`, { method: 'POST', body: { note: this.meta.note } });
    remember(this.fp, null);
    this.onProgress(100);
    return result;
  }

  /** Pause : la session est conservée, les parties déjà envoyées aussi. */
  pause() {
    this.controller.abort();
  }

  /** Annulation : la session est supprimée côté stockage. */
  async cancel() {
    this.controller.abort();
    remember(this.fp, null);
    if (this.sessionId) await api(`/uploads/${this.sessionId}`, { method: 'DELETE' }).catch(() => undefined);
  }
}
