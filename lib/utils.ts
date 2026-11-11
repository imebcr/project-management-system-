import type {
  Audience,
  CdcStatus,
  DeliverableStatus,
  FeedbackStatus,
  FeedbackType,
  Health,
  Milestone,
  MilestoneStatus,
  Note,
  Priority,
  Project,
  ProjectRole,
  ProjectStatus,
  ProjectType,
  Role,
  Task,
  TaskStatus,
  User,
  VaultCategory,
  VaultEntry,
} from './types';

export const TZ = 'Africa/Algiers';
export const DAY = 86_400_000;

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// ---------- Formatting (RG-07 : stocké en UTC, affiché heure d'Alger) ----------

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...opts }).format(new Date(iso));
}

export function fmtDateLong(iso: string) {
  return fmtDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtDateTime(iso: string) {
  return fmtDate(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Whole days from today (Algiers) to the given date. Negative = past. */
export function daysUntil(iso: string) {
  const key = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
  const a = Date.parse(key(new Date()));
  const b = Date.parse(key(new Date(iso)));
  return Math.round((b - a) / DAY);
}

export function relDays(iso: string) {
  const n = daysUntil(iso);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  return n > 0 ? `dans ${n} j` : `il y a ${-n} j`;
}

export function fmtBytes(bytes: number) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' Go';
  if (bytes >= 1e6) return Math.round(bytes / 1e6) + ' Mo';
  return Math.round(bytes / 1e3) + ' Ko';
}

export function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

// ---------- Progress service (TSK-06) ----------

/** Toutes les tâches comptent pareil (plus d'estimation de temps). */
const weight = (_t: Task) => 1;

function weightedAverage(items: { w: number; v: number }[]) {
  const total = items.reduce((s, i) => s + i.w, 0);
  if (!total) return 0;
  return items.reduce((s, i) => s + i.w * i.v, 0) / total;
}

export function childrenOf(task: Task, all: Task[]) {
  return all.filter((t) => t.parentId === task.id);
}

export function taskProgress(task: Task, all: Task[]): number {
  const kids = childrenOf(task, all).filter((k) => k.status !== 'CANCELLED');
  if (!kids.length) return task.status === 'DONE' ? 100 : task.progress;
  return Math.round(weightedAverage(kids.map((k) => ({ w: weight(k), v: taskProgress(k, all) }))));
}

function aggregate(roots: Task[], all: Task[]) {
  const active = roots.filter((t) => t.status !== 'CANCELLED');
  return Math.round(weightedAverage(active.map((t) => ({ w: weight(t), v: taskProgress(t, all) }))));
}

export function projectProgress(projectId: string, all: Task[]) {
  return aggregate(all.filter((t) => t.projectId === projectId && !t.parentId), all);
}

export function milestoneProgress(milestoneId: string, all: Task[]) {
  return aggregate(all.filter((t) => t.milestoneId === milestoneId && !t.parentId), all);
}

export function sprintProgress(sprintId: string, all: Task[]) {
  return aggregate(all.filter((t) => t.sprintId === sprintId), all);
}

// ---------- Milestones & health (MIL-01 / PRJ-04) ----------

export function milestoneStatus(m: Milestone): MilestoneStatus {
  if (m.status !== 'DONE' && daysUntil(m.targetDate) < 0) return 'LATE';
  return m.status;
}

export function projectHealth(project: Project, all: Task[], ms: Milestone[]): Health {
  const done = project.status === 'DELIVERED' || project.status === 'CLOSED' || project.status === 'ARCHIVED';
  if (done) return 'ON_TRACK';
  const lateMilestone = ms.some((m) => m.projectId === project.id && milestoneStatus(m) === 'LATE');
  if (daysUntil(project.dueDate) < 0 || lateMilestone) return 'LATE';
  const start = Date.parse(project.startDate);
  const end = Date.parse(project.dueDate);
  const expected = Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  const real = projectProgress(project.id, all);
  if (real < expected - 15) return 'AT_RISK';
  return 'ON_TRACK';
}

// ---------- Permissions (matrice v1.1 : Admin · Responsable du projet · Dev membre) ----------

export function projectRole(project: Project, userId: string): ProjectRole | null {
  return project.members.find((m) => m.userId === userId)?.role ?? null;
}

export function isMember(project: Project, userId: string) {
  return project.members.some((m) => m.userId === userId);
}

export function isAdmin(user: Pick<User, 'role'> & { roles?: Role[] }) {
  return user.roles ? user.roles.includes('ADMIN') : user.role === 'ADMIN';
}

/** Rôle Dev (cumulable avec Admin) : donne « Mes tâches » et l'agenda. */
export function isDev(user: Pick<User, 'role'> & { roles?: Role[] }) {
  return user.roles ? user.roles.includes('DEV') : user.role === 'DEV';
}

/** Responsable (HEAD) du projet, ou null : un projet sans responsable est géré par l'admin. */
export function projectHead(project: Project): string | null {
  return project.members.find((m) => m.role === 'HEAD')?.userId ?? null;
}

export function isHead(project: Project, userId: string) {
  return projectHead(project) === userId;
}

/** Admin, ou responsable de ce projet : sprints, jalons, équipe, tâches, CDC, livrables, coffre du projet. */
export function canManage(user: User, project: Project) {
  return isAdmin(user) || isHead(project, user.id);
}

/** Dépôt de livrables : admin, responsable et devs membres du projet. */
export function canUploadDeliverables(user: User, project: Project) {
  return canManage(user, project) || isMember(project, user.id);
}

/** Copier / partager un lien, révoquer, fixer l'échéance d'un livrable : admin et responsable. */
export function canShareDeliverables(user: User, project: Project) {
  return canManage(user, project);
}

/** v1.2 : tout membre du projet (et l'admin) dépose des retours texte + photos. */
export function canPostFeedback(user: User, project: Project) {
  return isAdmin(user) || isMember(project, user.id);
}

/** Serveurs, domaines, SSL, abonnements, échéances : admin seul (v1.1). */
export function canAccessInfra(user: Pick<User, 'role'>) {
  return isAdmin(user);
}

/** PRJ-02 : transitions autorisées (admin ou chef du projet : `allowed` = canManage). ARCHIVED depuis tout statut. */
export function canTransition(from: ProjectStatus, to: ProjectStatus, permitted = true) {
  if (!permitted || from === to) return false;
  if (to === 'ARCHIVED') return true;
  const allowed: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
    DRAFT: ['ACTIVE'],
    ACTIVE: ['ON_HOLD', 'DELIVERED'],
    ON_HOLD: ['ACTIVE'],
    DELIVERED: ['CLOSED'],
  };
  return !!allowed[from]?.includes(to);
}

/** Admin : tous les projets (archives comprises). Dev : ses projets, hors archives. */
export function visibleProjects(user: User, all: Project[]) {
  if (isAdmin(user)) return all;
  return all.filter((p) => isMember(p, user.id) && p.status !== 'ARCHIVED');
}

/**
 * Ajoute, change ou retire un membre. Garantit un seul HEAD par projet :
 * désigner un responsable rétrograde l'ancien en CONTRIBUTOR (contrainte unique conditionnelle).
 */
export function withMember(project: Project, userId: string, role: ProjectRole | null): Project {
  let members = project.members.filter((m) => m.userId !== userId);
  if (role === 'HEAD') members = members.map((m) => (m.role === 'HEAD' ? { ...m, role: 'CONTRIBUTOR' as const } : m));
  if (!role) return { ...project, members };
  return { ...project, members: role === 'HEAD' ? [{ userId, role }, ...members] : [...members, { userId, role }] };
}

/** Projets dont l'utilisateur est responsable. */
export function headedProjects(user: User, all: Project[]) {
  return all.filter((p) => isHead(p, user.id) && p.status !== 'ARCHIVED');
}

/** VLT-03 ; v1.1 : le champ « serveur lié » n'est exposé qu'à l'admin (omis comme par un serializer). */
export function visibleVaultEntries(user: User, entries: VaultEntry[], projectList: Project[]) {
  if (isAdmin(user)) return entries;
  return entries
    .filter((e) => {
      const p = projectList.find((x) => x.id === e.projectId);
      if (p && canManage(user, p)) return true;
      return e.grants.some((g) => g.userId === user.id && (!g.expiresAt || daysUntil(g.expiresAt) >= 0));
    })
    .map((e) => ({ ...e, serverId: null }));
}

export function visibleNotes(user: User, list: Note[]) {
  return list.filter((n) => {
    if (n.audience === 'TEAM') return true;
    if (isAdmin(user) || n.authorId === user.id) return true;
    return n.audience.includes(user.id);
  });
}

export function isRead(n: { read: boolean; readBy?: string[] }, userId: string) {
  return n.readBy ? n.readBy.includes(userId) : n.read;
}

/** Une notification est destinée à tous, aux admins, ou à une liste d'utilisateurs. */
export function isRecipient(user: User, audience: Audience) {
  if (audience === 'ALL') return true;
  if (audience === 'ADMINS') return isAdmin(user);
  return audience.includes(user.id);
}

// ---------- Labels & tones ----------

type Tone = 'brand' | 'navy' | 'green' | 'amber' | 'red' | 'muted' | 'ocean';

export const toneClass: Record<Tone, string> = {
  brand: 'bg-brand/15 text-ocean',
  ocean: 'bg-ocean/10 text-ocean',
  navy: 'bg-navy/10 text-navy',
  green: 'bg-emerald-500/15 text-emerald-700',
  amber: 'bg-amber-400/20 text-amber-700',
  red: 'bg-red-500/15 text-red-600',
  muted: 'bg-navy/5 text-navy/50',
};

export const roleLabel: Record<Role, string> = {
  ADMIN: 'Admin',
  DEV: 'Dev',
};

export const ALL_ROLES: Role[] = ['ADMIN', 'DEV'];

/** « Admin + Dev », « Dev »… */
export function rolesLabel(user: { roles?: Role[]; role?: Role }) {
  const roles = user.roles?.length ? user.roles : user.role ? [user.role] : [];
  return roles.map((r) => roleLabel[r]).join(' + ');
}

export const projectTypeLabel: Record<ProjectType, string> = {
  mobile: 'Mobile',
  web: 'Web',
};

export const projectRoleLabel: Record<ProjectRole, string> = {
  HEAD: 'Responsable',
  CONTRIBUTOR: 'Contributeur',
};

export const projectStatusMeta: Record<ProjectStatus, [string, Tone]> = {
  DRAFT: ['Brouillon', 'muted'],
  ACTIVE: ['Actif', 'brand'],
  ON_HOLD: ['En pause', 'amber'],
  DELIVERED: ['Livré', 'green'],
  CLOSED: ['Clôturé', 'navy'],
  ARCHIVED: ['Archivé', 'muted'],
};

export const healthMeta: Record<Health, [string, Tone]> = {
  ON_TRACK: ['En bonne voie', 'green'],
  AT_RISK: ['À risque', 'amber'],
  LATE: ['En retard', 'red'],
};

export const taskStatusMeta: Record<TaskStatus, [string, Tone]> = {
  TODO: ['À faire', 'muted'],
  IN_PROGRESS: ['En cours', 'brand'],
  IN_REVIEW: ['En revue', 'ocean'],
  DONE: ['Terminé', 'green'],
  BLOCKED: ['Bloqué', 'red'],
  CANCELLED: ['Annulé', 'muted'],
};

export const priorityMeta: Record<Priority, [string, Tone]> = {
  LOW: ['Basse', 'muted'],
  MEDIUM: ['Moyenne', 'navy'],
  HIGH: ['Haute', 'amber'],
  URGENT: ['Urgente', 'red'],
};

export const milestoneStatusMeta: Record<MilestoneStatus, [string, Tone]> = {
  PLANNED: ['Planifié', 'muted'],
  IN_PROGRESS: ['En cours', 'brand'],
  DONE: ['Atteint', 'green'],
  LATE: ['En retard', 'red'],
};

export const cdcStatusMeta: Record<CdcStatus, [string, Tone]> = {
  DRAFT: ['Brouillon', 'muted'],
  SENT: ['Envoyé', 'brand'],
  ACCEPTED: ['Accepté', 'green'],
  REJECTED: ['Refusé', 'red'],
  SUPERSEDED: ['Remplacé', 'navy'],
};

export const feedbackTypeMeta: Record<FeedbackType, [string, Tone]> = {
  CHANGE_REQUEST: ['Demande de modif.', 'amber'],
  FEEDBACK: ['Remarque', 'navy'],
  VALIDATION: ['Validation', 'green'],
  BUG: ['Bug', 'red'],
};

export const feedbackStatusMeta: Record<FeedbackStatus, [string, Tone]> = {
  OPEN: ['Ouvert', 'brand'],
  ACCEPTED: ['Accepté', 'green'],
  REJECTED: ['Refusé', 'muted'],
  DONE: ['Traité', 'navy'],
};

export const deliverableStatusMeta: Record<DeliverableStatus, [string, Tone]> = {
  IN_PROGRESS: ['En préparation', 'muted'],
  REJECTED_INTERNAL: ['Rejeté avant envoi', 'red'],
  SENT: ['Envoyé au client', 'brand'],
  VALIDATED: ['Validé par le client', 'green'],
  REJECTED_CLIENT: ['Rejeté par le client', 'red'],
};

/** Étapes suivantes possibles (même règle que le serveur). Une nouvelle version repart « En préparation ». */
export const deliverableTransitions: Record<DeliverableStatus, DeliverableStatus[]> = {
  IN_PROGRESS: ['SENT', 'REJECTED_INTERNAL'],
  REJECTED_INTERNAL: ['IN_PROGRESS'],
  SENT: ['VALIDATED', 'REJECTED_CLIENT'],
  VALIDATED: ['SENT'],
  REJECTED_CLIENT: ['SENT'],
};

export const vaultCategoryLabel: Record<VaultCategory, string> = {
  SERVER: 'Serveur',
  DATABASE: 'Base de données',
  STORE: 'Store',
  CLIENT_ACCOUNT: 'Compte client',
  API_KEY: 'Clé API',
  OTHER: 'Autre',
};

export function expiryTone(days: number): Tone {
  if (days < 0) return 'red';
  if (days <= 7) return 'red';
  if (days <= 30) return 'amber';
  return 'muted';
}
