/**
 * Forme renvoyée par `GET /api/me/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD`.
 * La portée est appliquée par le serveur : l'admin voit tout ; un dev voit ses tâches et ses réunions,
 * et, pour les projets dont il est chef, livrables, sprints, jalons et livraison.
 */
import { TZ } from './utils';

export type AgendaType = 'MEETING' | 'PROJECT_DUE' | 'MILESTONE' | 'DELIVERABLE' | 'SPRINT_START' | 'SPRINT_END' | 'TASK' | 'RENEWAL';

export interface AgendaItem {
  type: AgendaType;
  id: string;
  title: string;
  /** YYYY-MM-DD, heure d'Alger */
  date: string;
  /** HH:MM pour les réunions, sinon null. */
  time: string | null;
  project: { id: string | null; code: string; name: string };
  status: string;
  /** Assignés (tâche) ou participants (réunion). */
  people: string[];
  priority?: string;
  duration?: number;
  location?: string;
  meetingKind?: 'Interne' | 'Client';
}

export function dayKey(iso: string | Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(typeof iso === 'string' ? new Date(iso) : iso);
}
