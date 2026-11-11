/** v1.1 : deux rôles globaux. Le responsable d'un projet est un rôle dans le projet (HEAD). */
export type Role = 'ADMIN' | 'DEV';
export type ProjectRole = 'HEAD' | 'CONTRIBUTOR';
export type Department = 'Développement' | 'Design';
/** v1.2 : uniquement des projets de développement, mobile ou web. */
export type ProjectType = 'mobile' | 'web';
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'DELIVERED' | 'CLOSED' | 'ARCHIVED';
export type Health = 'ON_TRACK' | 'AT_RISK' | 'LATE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'BLOCKED' | 'CANCELLED';
export type MilestoneStatus = 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'LATE';
export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED';
export type CdcStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';
export type FeedbackType = 'CHANGE_REQUEST' | 'FEEDBACK' | 'VALIDATION' | 'BUG';
export type FeedbackChannel = 'Appel' | 'WhatsApp' | 'E-mail' | 'Réunion' | 'Autre';
export type FeedbackStatus = 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'DONE';
/** Étapes : en préparation → rejeté avant envoi | envoyé au client → validé | rejeté par le client. */
export type DeliverableStatus = 'IN_PROGRESS' | 'REJECTED_INTERNAL' | 'SENT' | 'VALIDATED' | 'REJECTED_CLIENT';
/** Texte libre (suggestions : VPS, Dédié, Mutualisé, PaaS…). */
export type ServerType = string;
export type ServerState = 'ACTIVE' | 'MAINTENANCE' | 'DOWN' | 'DECOMMISSIONED';
export type VaultCategory = 'SERVER' | 'DATABASE' | 'STORE' | 'CLIENT_ACCOUNT' | 'API_KEY' | 'OTHER';

export interface User {
  id: string;
  name: string;
  email: string;
  /** Rôles cumulables (ex. Admin + Dev). */
  roles: Role[];
  /** Rôle principal : ADMIN si la personne l'a, sinon DEV. */
  role: Role;
  department: Department;
  active: boolean;
  /** Mot de passe temporaire : changement forcé à la prochaine connexion. */
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

export interface Invitation {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  role: Role;
  department: Department;
  token: string;
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
  status: InvitationStatus;
  acceptedUserId?: string;
}

export interface Membership {
  userId: string;
  role: ProjectRole;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  /** v1.2 : saisi librement (aucun lien avec l'ERP ou le CRM). */
  clientName: string;
  /** Optionnel. */
  clientPhone: string;
  /** Serveurs qui hébergent le projet (choisis par l'admin ou le chef de projet). */
  serverIds: string[];
  type: ProjectType;
  status: ProjectStatus;
  holdReason?: string;
  startDate: string;
  dueDate: string;
  description: string;
  members: Membership[];
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string;
  assignees: string[];
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  blockedReason?: string;
  progress: number;
  lastProgressBelow100: number;
  milestoneId: string | null;
  sprintId: string | null;
  labels: string[];
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  description: string;
  targetDate: string;
  order: number;
  status: Exclude<MilestoneStatus, 'LATE'>;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
}

export interface CdcSection {
  title: string;
  body: string;
}

export interface CdcVersion {
  id: string;
  projectId: string;
  number: number;
  date: string;
  fileName: string;
  /** URL temporaire de téléchargement du fichier déposé (null si aucun fichier). */
  fileUrl?: string | null;
  delayDays: number;
  changeSummary: string;
  status: CdcStatus;
  authorId: string;
  sections: CdcSection[];
}

/** Sujet d'un retour : l'application en général, ou un livrable précis. */
export type FeedbackTarget = { kind: 'APP' } | { kind: 'DELIVERABLE'; deliverableId: string; versionNumber: number };

export interface FeedbackImage {
  id: string;
  name: string;
  /** URL temporaire (présignée) vers le stockage S3. */
  url: string;
}

export interface Feedback {
  id: string;
  projectId: string;
  type: FeedbackType;
  target: FeedbackTarget;
  /** Retour transmis par le client (canal + personne) ou noté en interne. */
  channel: FeedbackChannel | 'Interne';
  date: string;
  contact: string;
  content: string;
  images: FeedbackImage[];
  status: FeedbackStatus;
  authorId: string;
  /** De qui vient le retour (membre de l'équipe) ; null si client (voir `contact`). */
  fromUserId: string | null;
  /** Pour qui : membres chargés de le traiter. */
  recipientIds: string[];
  needsNewCdc: boolean;
  linkedLabel?: string;
}

export interface Folder {
  id: string;
  projectId: string;
  name: string;
  parentId: string | null;
}

export interface DeliverableVersion {
  id?: string;
  number: number;
  /** Fichier déposé, ou lien externe (Drive, TestFlight, Figma…). */
  kind: 'FILE' | 'LINK';
  url: string | null;
  fileName: string;
  size: number;
  mime: string;
  sha256: string;
  note: string;
  uploaderId: string;
  date: string;
}

export interface Deliverable {
  id: string;
  projectId: string;
  folderId: string;
  name: string;
  status: DeliverableStatus;
  /** Motif d'un rejet (avant envoi ou par le client). */
  statusNote: string;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  /** v1.1 : date d'échéance du livrable (agenda du responsable, rappel la veille). */
  dueDate: string | null;
  versions: DeliverableVersion[];
}

/** v1.1 : un lien = une version de livrable, téléchargement direct, sans mot de passe. */
export interface ShareLink {
  id: string;
  projectId: string;
  deliverableId: string;
  versionNumber: number;
  token: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  downloads: number;
  revoked: boolean;
}

export interface ShareAccess {
  id: string;
  linkId: string;
  date: string;
  userAgent: string;
}

export interface Server {
  id: string;
  label: string;
  provider: string;
  type: ServerType;
  host: string;
  region: string;
  os: string;
  projectIds: string[];
  state: ServerState;
  lastBackup: string;
  lastBackupNote: string;
  backupFrequencyDays: number;
  notes: string;
}

export interface Domain {
  id: string;
  name: string;
  registrar: string;
  projectId: string;
  expiresAt: string;
  autoRenew: boolean;
  serverId: string | null;
}

export interface SslCert {
  id: string;
  domain: string;
  issuer: string;
  expiresAt: string;
  autoRenew: boolean;
  projectId: string;
}

export interface Subscription {
  id: string;
  provider: string;
  offer: string;
  projectId: string;
  serverId: string | null;
  renewalDate: string;
  period: 'Mensuel' | 'Annuel';
}

export interface VaultEntry {
  id: string;
  category: VaultCategory;
  label: string;
  projectId: string | null;
  serverId: string | null;
  url: string;
  username: string;
  secret: string;
  secretNotes: string;
  lastRotation: string;
  grants: { userId: string; expiresAt: string | null }[];
}

export interface VaultLog {
  id: string;
  entryId: string;
  userId: string;
  action: 'REVEAL' | 'COPY' | 'CREATE' | 'UPDATE' | 'SHARE' | 'DELETE';
  date: string;
  ip: string;
  device: string;
}

export interface Note {
  id: string;
  projectId: string;
  authorId: string;
  content: string;
  audience: 'TEAM' | string[];
  pinned: boolean;
  date: string;
}

/** Destinataires : tout le monde, les admins, ou une liste d'utilisateurs. */
export type Audience = 'ALL' | 'ADMINS' | string[];

export interface AppNotification {
  id: string;
  audience: Audience;
  title: string;
  body: string;
  date: string;
  /** Lu pour la démo initiale ; ensuite l'état de lecture est propre à chaque destinataire (readBy). */
  read: boolean;
  readBy?: string[];
  href: string;
  kind: 'task' | 'mention' | 'deadline' | 'note' | 'feedback' | 'deliverable' | 'expiry' | 'backup' | 'vault' | 'summary' | 'meeting';
}

export interface AuditEntry {
  id: string;
  date: string;
  userId: string;
  action: string;
  target: string;
  projectId: string | null;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  body: string;
  date: string;
}

export interface Meeting {
  id: string;
  projectId: string;
  title: string;
  /** Début (ISO). */
  date: string;
  durationMinutes: number;
  location: string;
  kind: 'Interne' | 'Client';
  attendees: string[];
  clientAttendees: string;
  notes: string;
  decisions: string[];
  authorId: string;
}
