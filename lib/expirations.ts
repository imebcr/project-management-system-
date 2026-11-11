import type { AppState } from './store';
import { DAY, daysUntil } from './utils';

export type ExpiryKind = 'Domaine' | 'SSL' | 'Abonnement' | 'Livraison' | 'Jalon';

export interface ExpiryItem {
  id: string;
  kind: ExpiryKind;
  label: string;
  projectId: string | null;
  date: string;
  days: number;
  autoRenew?: boolean;
}

/** INF-07 : tout ce qui expire dans les N prochains jours (et ce qui a déjà expiré). */
export function expirations(state: AppState, horizon = 60, projectIds?: string[]): ExpiryItem[] {
  const keep = (projectId: string | null) => !projectIds || (projectId !== null && projectIds.includes(projectId));
  const items: ExpiryItem[] = [
    ...state.domains.map((d) => ({ id: d.id, kind: 'Domaine' as const, label: d.name, projectId: d.projectId, date: d.expiresAt, days: daysUntil(d.expiresAt), autoRenew: d.autoRenew })),
    ...state.sslCerts.map((c) => ({ id: c.id, kind: 'SSL' as const, label: c.domain, projectId: c.projectId, date: c.expiresAt, days: daysUntil(c.expiresAt), autoRenew: c.autoRenew })),
    ...state.subscriptions.map((s) => ({ id: s.id, kind: 'Abonnement' as const, label: `${s.provider} · ${s.offer}`, projectId: s.projectId, date: s.renewalDate, days: daysUntil(s.renewalDate) })),
  ];
  return items.filter((i) => i.days <= horizon && keep(i.projectId)).sort((a, b) => a.days - b.days);
}

export function deliveryDeadlines(state: AppState, horizon = 30, projectIds?: string[]): ExpiryItem[] {
  const keep = (id: string) => !projectIds || projectIds.includes(id);
  const active = state.projects.filter((p) => (p.status === 'ACTIVE' || p.status === 'ON_HOLD') && keep(p.id));
  const items: ExpiryItem[] = [
    ...active.map((p) => ({ id: p.id, kind: 'Livraison' as const, label: p.name, projectId: p.id, date: p.dueDate, days: daysUntil(p.dueDate) })),
    ...state.milestones
      .filter((m) => m.status !== 'DONE' && active.some((p) => p.id === m.projectId))
      .map((m) => ({ id: m.id, kind: 'Jalon' as const, label: m.name, projectId: m.projectId, date: m.targetDate, days: daysUntil(m.targetDate) })),
  ];
  return items.filter((i) => i.days <= horizon).sort((a, b) => a.days - b.days);
}

/** INF-02 : now − dernière sauvegarde > fréquence attendue. */
export function lateBackups(state: AppState) {
  return state.servers.filter((s) => s.state !== 'DECOMMISSIONED' && Date.now() - Date.parse(s.lastBackup) > s.backupFrequencyDays * DAY);
}
