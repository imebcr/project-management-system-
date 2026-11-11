/**
 * Client HTTP de l'API Django (même origine : /api est redirigé vers le backend).
 * - access token (15 min) gardé en mémoire uniquement ;
 * - refresh token dans un cookie httpOnly, renouvelé automatiquement sur un 401 ;
 * - erreurs renvoyées en français ({ error }) par le backend.
 */

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<SessionUser | null> | null = null;
let reauth: { token: string; until: number } | null = null;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'DEV';
  roles: ('ADMIN' | 'DEV')[];
  mustChangePassword: boolean;
}

export function setAccess(token: string | null) {
  accessToken = token;
}

/** Renouvelle la session à partir du cookie httpOnly. Une seule requête à la fois. */
export function refreshSession(): Promise<SessionUser | null> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) {
        accessToken = null;
        return null;
      }
      const data = await r.json();
      accessToken = data.access;
      return data.user as SessionUser;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Options = { method?: string; body?: unknown; form?: FormData; headers?: Record<string, string>; retry?: boolean };

export async function api<T = unknown>(path: string, { method = 'GET', body, form, headers = {}, retry = true }: Options = {}): Promise<T> {
  const h: Record<string, string> = { ...headers };
  if (accessToken) h.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, credentials: 'include', headers: h, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError('Serveur injoignable. Vérifiez votre connexion.', 0);
  }
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const user = await refreshSession();
    if (user) return api<T>(path, { method, body, form, headers, retry: false });
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.error ?? `Erreur ${res.status}`, res.status);
  return data as T;
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Une erreur est survenue.';
}

// ---------- Ré-authentification du coffre (5 minutes) ----------

export function reauthToken() {
  return reauth && reauth.until > Date.now() ? reauth.token : null;
}

export async function doReauth(password: string) {
  const r = await api<{ reauthToken: string; expiresIn: number }>('/auth/reauth', { method: 'POST', body: { password } });
  reauth = { token: r.reauthToken, until: Date.now() + (r.expiresIn - 5) * 1000 };
}

export function clearSession() {
  accessToken = null;
  reauth = null;
}
