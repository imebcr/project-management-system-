/**
 * Couche d'accès « serveur » : équivalent des endpoints `infra` et `/expiries`.
 * Tout utilisateur non admin reçoit 403 (v1.1, point 7), quel que soit l'écran qui appelle.
 */
import { expirations, lateBackups, type ExpiryItem } from './expirations';
import type { AppState } from './store';
import type { Domain, Server, SslCert, Subscription, User } from './types';
import { canAccessInfra } from './utils';

export type ApiResult<T> = { ok: true; status: 200; data: T } | { ok: false; status: 403; error: string };

const forbidden = { ok: false as const, status: 403 as const, error: 'Réservé à l’admin.' };

function guard<T>(user: Pick<User, 'role'>, read: () => T): ApiResult<T> {
  return canAccessInfra(user) ? { ok: true, status: 200, data: read() } : forbidden;
}

type InfraState = Pick<AppState, 'servers' | 'domains' | 'sslCerts' | 'subscriptions' | 'projects' | 'milestones'>;

export const getServers = (state: InfraState, user: Pick<User, 'role'>): ApiResult<Server[]> => guard(user, () => state.servers);
export const getDomains = (state: InfraState, user: Pick<User, 'role'>): ApiResult<Domain[]> => guard(user, () => state.domains);
export const getSslCerts = (state: InfraState, user: Pick<User, 'role'>): ApiResult<SslCert[]> => guard(user, () => state.sslCerts);
export const getSubscriptions = (state: InfraState, user: Pick<User, 'role'>): ApiResult<Subscription[]> => guard(user, () => state.subscriptions);
export const getLateBackups = (state: InfraState, user: Pick<User, 'role'>): ApiResult<Server[]> => guard(user, () => lateBackups(state as AppState));

/** `/expiries` : domaines, SSL et abonnements dans l'horizon donné. */
export const getExpiries = (state: InfraState, user: Pick<User, 'role'>, horizon = 60): ApiResult<ExpiryItem[]> =>
  guard(user, () => expirations(state as AppState, horizon));
