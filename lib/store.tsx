'use client';

/**
 * État de l'application, alimenté par l'API Django.
 * - Chargement : GET /api/bootstrap (instantané filtré côté serveur selon les droits de l'utilisateur).
 * - Actions : chaque action appelle son endpoint, puis recharge l'instantané.
 *   Quelques actions fréquentes (statut, avancement, planification, lecture) sont appliquées
 *   tout de suite à l'écran, puis confirmées ou annulées par le serveur.
 * - Rafraîchissement : toutes les 30 s quand l'onglet est visible, et au retour sur l'onglet.
 */
import { MotionConfig } from 'framer-motion';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, clearSession, doReauth, errorMessage, refreshSession, reauthToken, setAccess } from './api';
import type {
  AppNotification,
  AuditEntry,
  CdcSection,
  CdcVersion,
  Deliverable,
  DeliverableStatus,
  Domain,
  Feedback,
  FeedbackChannel,
  FeedbackStatus,
  FeedbackType,
  Folder,
  Invitation,
  Meeting,
  Milestone,
  Note,
  Project,
  ProjectRole,
  ProjectStatus,
  ProjectType,
  Role,
  Server,
  ServerType,
  ShareAccess,
  ShareLink,
  Sprint,
  SslCert,
  Subscription,
  Task,
  TaskComment,
  TaskStatus,
  User,
  VaultCategory,
  VaultEntry,
  VaultLog,
} from './types';

export interface AppState {
  /** Utilisateur connecté (null = déconnecté). */
  currentUserId: string | null;
  users: User[];
  invitations: Invitation[];
  projects: Project[];
  tasks: Task[];
  comments: TaskComment[];
  milestones: Milestone[];
  sprints: Sprint[];
  cdcVersions: CdcVersion[];
  feedbacks: Feedback[];
  folders: Folder[];
  deliverables: Deliverable[];
  shareLinks: ShareLink[];
  shareAccess: ShareAccess[];
  servers: Server[];
  /** Liste des serveurs proposée au choix (admin et chefs de projet) : identité seulement. */
  serverOptions: { id: string; label: string; provider: string; type: string }[];
  domains: Domain[];
  sslCerts: SslCert[];
  subscriptions: Subscription[];
  vaultEntries: VaultEntry[];
  vaultLogs: VaultLog[];
  notes: Note[];
  meetings: Meeting[];
  notifications: AppNotification[];
  auditLog: AuditEntry[];
  /** Préférences d'affichage par utilisateur (vue Liste / Kanban des projets). */
  prefs: Record<string, { projectsView?: 'list' | 'kanban' }>;
}

export type Result = { ok: true; id?: string } | { ok: false; error: string };

const EMPTY: AppState = {
  currentUserId: null, users: [], invitations: [], projects: [], tasks: [], comments: [], milestones: [], sprints: [],
  cdcVersions: [], feedbacks: [], folders: [], deliverables: [], shareLinks: [], shareAccess: [], servers: [], serverOptions: [], domains: [], sslCerts: [],
  subscriptions: [], vaultEntries: [], vaultLogs: [], notes: [], meetings: [], notifications: [], auditLog: [], prefs: {},
};

const POLL_MS = 30_000;

function useStoreValue() {
  const [state, setState] = useState<AppState>(EMPTY);
  const [ready, setReady] = useState(false);
  const signedIn = useRef(false);

  /** Toujours défini dans les pages protégées (AppShell redirige vers /login sinon). */
  const me = state.users.find((u) => u.id === state.currentUserId) as User;

  const load = useCallback(async () => {
    const data = await api<AppState & { me: User }>('/bootstrap');
    const { me: current, ...rest } = data;
    signedIn.current = true;
    setState({ ...EMPTY, ...rest, currentUserId: current.id });
  }, []);

  // Ouverture de l'application : reprise de session par le cookie httpOnly.
  useEffect(() => {
    refreshSession()
      .then((user) => (user ? load() : undefined))
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [load]);

  useEffect(() => {
    const tick = () => {
      if (signedIn.current && document.visibilityState === 'visible') load().catch(() => undefined);
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  /** Appelle l'API puis recharge ; en cas d'erreur, l'état serveur est rechargé et l'erreur renvoyée. */
  const run = useCallback(
    async <T,>(call: () => Promise<T>, optimistic?: (s: AppState) => AppState): Promise<Result & { data?: T }> => {
      if (optimistic) setState(optimistic);
      try {
        const data = await call();
        await load();
        return { ok: true, data, id: (data as { id?: string } | null)?.id };
      } catch (e) {
        await load().catch(() => undefined);
        return { ok: false, error: errorMessage(e) };
      }
    },
    [load],
  );

  const patchTask = (id: string, patch: Partial<Task>) => (s: AppState) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  // ---------- Session (§5.2) ----------
  const login = async (email: string, password: string): Promise<Result> => {
    try {
      const r = await api<{ access: string }>('/auth/login', { method: 'POST', body: { email, password } });
      setAccess(r.access);
      await load();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSession();
    signedIn.current = false;
    setState(EMPTY);
  };

  /** `current` vaut null pour le changement forcé juste après une connexion avec mot de passe temporaire. */
  const changePassword = (current: string | null, next: string) => run(() => api('/auth/password', { method: 'POST', body: { current, new: next } }));
  const updateProfile = (name: string) => run(() => api('/me', { method: 'PATCH', body: { name } }));
  const setProjectsView = (view: 'list' | 'kanban') =>
    run(() => api('/me/preferences', { method: 'PATCH', body: { projectsView: view } }), (s) => ({ ...s, prefs: { ...s.prefs, [s.currentUserId!]: { projectsView: view } } }));

  // ---------- Projets ----------
  const createProject = (
    input: { name: string; clientName: string; clientPhone: string; type: ProjectType; startDate: string; dueDate: string; description: string; headId: string | null; memberIds: string[] },
    cdc?: { file: File; accepted: boolean } | null,
  ) => {
    const form = new FormData();
    const { memberIds, ...fields } = input;
    Object.entries(fields).forEach(([k, v]) => v !== null && form.append(k, String(v)));
    form.append('memberIds', JSON.stringify(memberIds));
    if (cdc) {
      form.append('cdcFile', cdc.file);
      form.append('cdcAccepted', String(cdc.accepted));
    }
    return run(() => api<Project>('/projects', { method: 'POST', form }));
  };

  /** v1.1 : transitions de statut réservées à l'admin (kanban et fiche projet). */
  const transitionProject = (id: string, to: ProjectStatus, reason?: string) =>
    run(() => api(`/projects/${id}/transition`, { method: 'POST', body: { status: to, reason } }));

  /** Équipe : le responsable compose l'équipe ; seul l'admin désigne ou retire le responsable. */
  const setMember = (projectId: string, userId: string, role: ProjectRole | null) =>
    run(() =>
      role ? api(`/projects/${projectId}/members`, { method: 'POST', body: { userId, role } }) : api(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
    );

  // ---------- Tâches ----------
  const createTask = (input: Partial<Task> & Pick<Task, 'projectId' | 'title'>) => run(() => api<Task>('/tasks', { method: 'POST', body: input }));

  const updateTask = (id: string, patch: Partial<Task>) => run(() => api(`/tasks/${id}`, { method: 'PATCH', body: patch }), patchTask(id, patch));

  /** TSK-04 : DONE force 100 %, quitter DONE restaure la dernière valeur < 100 (règle appliquée par le serveur). */
  const setTaskStatus = (id: string, status: TaskStatus, reason?: string) =>
    run(() => api(`/tasks/${id}/status`, { method: 'POST', body: { status, reason } }), patchTask(id, { status, ...(status === 'DONE' ? { progress: 100 } : {}) }));

  const setTaskProgress = (id: string, value: number) =>
    run(() => api(`/tasks/${id}/progress`, { method: 'POST', body: { value } }), patchTask(id, { progress: value }));

  const deleteTask = (id: string) => run(() => api(`/tasks/${id}`, { method: 'DELETE' }), (s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id && t.parentId !== id) }));
  const addComment = (taskId: string, body: string) => run(() => api(`/tasks/${taskId}/comments`, { method: 'POST', body: { body } }));

  // ---------- Temps (TSK-09) ----------

  // ---------- Jalons et sprints ----------
  const createMilestone = (input: { projectId: string; name: string; description: string; targetDate: string }) => run(() => api('/milestones', { method: 'POST', body: input }));
  const setMilestoneStatus = (id: string, status: Milestone['status']) => run(() => api(`/milestones/${id}`, { method: 'PATCH', body: { status } }));
  const createSprint = (input: { projectId: string; name: string; goal: string; startDate: string; endDate: string }) => run(() => api('/sprints', { method: 'POST', body: input }));
  const updateSprint = (id: string, patch: Partial<Pick<Sprint, 'name' | 'goal' | 'startDate' | 'endDate'>>) => run(() => api(`/sprints/${id}`, { method: 'PATCH', body: patch }));
  const startSprint = (id: string) => run(() => api(`/sprints/${id}/start`, { method: 'POST' }));
  /** MIL-05 : tâches non terminées → sprint suivant ou backlog. */
  const closeSprint = (id: string, moveTo: string | null) => run(() => api(`/sprints/${id}/close`, { method: 'POST', body: { moveTo } }));

  // ---------- Cahier des charges ----------
  const addCdcVersion = (input: { projectId: string; file: File | null; delayDays: number; changeSummary: string; sections: CdcSection[] }) => {
    const form = new FormData();
    form.append('projectId', input.projectId);
    form.append('delayDays', String(input.delayDays));
    form.append('changeSummary', input.changeSummary);
    form.append('sections', JSON.stringify(input.sections));
    if (input.file) form.append('file', input.file);
    return run(() => api('/cdc-versions', { method: 'POST', form }));
  };
  const setCdcStatus = (id: string, status: CdcVersion['status']) => run(() => api(`/cdc-versions/${id}/status`, { method: 'POST', body: { status } }));

  // ---------- Retours (texte + photos) ----------
  const addFeedback = (input: {
    projectId: string; type: FeedbackType; deliverableId: string | null; channel: FeedbackChannel | 'Interne'; contact: string; content: string; images: { blob: Blob; name: string }[];
    /** De qui (membre de l'équipe ; absent si le retour vient du client). */ fromUserId?: string | null;
    /** Pour qui : membres chargés de traiter le retour (notifiés). */ recipientIds?: string[];
  }) => {
    const form = new FormData();
    form.append('projectId', input.projectId);
    form.append('type', input.type);
    form.append('channel', input.channel);
    form.append('contact', input.contact);
    form.append('content', input.content);
    if (input.fromUserId) form.append('fromUserId', input.fromUserId);
    form.append('recipientIds', JSON.stringify(input.recipientIds ?? []));
    if (input.deliverableId) form.append('deliverableId', input.deliverableId);
    input.images.forEach((img) => form.append('images', img.blob, img.name));
    return run(() => api('/feedback', { method: 'POST', form }));
  };
  const setFeedbackStatus = (id: string, status: FeedbackStatus) => run(() => api(`/feedback/${id}/status`, { method: 'POST', body: { status } }));
  const toggleNeedsNewCdc = (id: string) => run(() => api(`/feedback/${id}/toggle-cdc`, { method: 'POST' }));
  /** CDC-06 : convertir une demande acceptée en tâche(s). */
  const convertFeedback = (id: string, titles: string[]) => run(() => api(`/feedback/${id}/convert`, { method: 'POST', body: { titles } }));

  // ---------- Livrables ----------
  const createFolder = (projectId: string, name: string, parentId: string | null) => run(() => api('/folders', { method: 'POST', body: { projectId, name, parentId } }));
  const renameFolder = (id: string, name: string) =>
    run(() => api(`/folders/${id}`, { method: 'PATCH', body: { name } }), (s) => ({ ...s, folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)) }));
  /** Seulement si le dossier est vide (le serveur refuse sinon). */
  const deleteFolder = (id: string) => run(() => api(`/folders/${id}`, { method: 'DELETE' }));
  const setDeliverableDueDate = (id: string, dueDate: string | null) =>
    run(() => api(`/deliverables/${id}`, { method: 'PATCH', body: { dueDate } }), (s) => ({ ...s, deliverables: s.deliverables.map((d) => (d.id === id ? { ...d, dueDate } : d)) }));
  /** Étape du livrable (chef de projet ou admin) ; `note` = motif d'un rejet. */
  const setDeliverableStage = (id: string, status: DeliverableStatus, note = '') =>
    run(() => api<Deliverable>(`/deliverables/${id}`, { method: 'PATCH', body: { status, note } }));
  /** « Copier le lien » (DLV-05) : lien de la version courante, réutilisé s'il est encore actif. */
  /** Livrable sous forme de lien (nouveau livrable, ou nouvelle version d'un livrable existant). */
  const addDeliverableLink = (input: { projectId: string; folderId: string; deliverableId: string | null; name: string; url: string; note: string }) =>
    run(() => api('/deliverable-links', { method: 'POST', body: input }));
  const copyLink = async (deliverableId: string): Promise<(ShareLink & { url: string }) | { error: string }> => {
    try {
      const link = await api<ShareLink & { url: string }>(`/deliverables/${deliverableId}/link`, { method: 'POST' });
      load().catch(() => undefined);
      return link;
    } catch (e) {
      return { error: errorMessage(e) };
    }
  };
  const setLinkExpiry = (id: string, days: number) => run(() => api(`/links/${id}`, { method: 'PATCH', body: { days } }));
  const revokeLink = (id: string) => run(() => api(`/links/${id}/revoke`, { method: 'POST' }));

  // ---------- Coffre-fort (VLT) ----------
  const reauth = async (password: string): Promise<Result> => {
    try {
      await doReauth(password);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  };
  const hasReauth = () => !!reauthToken();
  /** VLT-04 : le secret ne sort que par cet appel, après ré-authentification. */
  const revealSecret = async (entryId: string): Promise<{ ok: true; secret: string; secretNotes: string } | { ok: false; error: string }> => {
    const token = reauthToken();
    if (!token) return { ok: false, error: 'Confirmez votre mot de passe pour révéler ce secret.' };
    try {
      const r = await api<{ secret: string; secretNotes: string }>(`/vault/${entryId}/reveal`, { method: 'POST', headers: { 'X-Reauth-Token': token } });
      load().catch(() => undefined);
      return { ok: true, ...r };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  };
  const logVault = (entryId: string, action: 'COPY') => api(`/vault/${entryId}/log`, { method: 'POST', body: { action } }).catch(() => undefined);
  const createVaultEntry = (input: {
    category: VaultCategory; label: string; projectId: string | null; serverId: string | null; url: string; username: string; secret: string; secretNotes: string;
  }) => run(() => api('/vault', { method: 'POST', body: input }));
  const grantVault = (entryId: string, userId: string, expiresAt: string | null) => run(() => api(`/vault/${entryId}/grants`, { method: 'POST', body: { userId, expiresAt } }));

  // ---------- Collaboration ----------
  const addNote = (projectId: string, content: string, audience: Note['audience']) => run(() => api('/notes', { method: 'POST', body: { projectId, content, audience } }));
  const togglePin = (id: string) => run(() => api(`/notes/${id}/pin`, { method: 'POST' }), (s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)) }));
  /** Planifier une réunion : les participants sont notifiés (et prévenus par e-mail), puis rappelés 3 h avant. */
  const addMeeting = (input: Omit<Meeting, 'id' | 'authorId'>) => run(() => api<Meeting>('/meetings', { method: 'POST', body: input }));
  /** Modifier (compte rendu, date, participants) : un changement de date prévient les participants. */
  const updateMeeting = (id: string, patch: Partial<Omit<Meeting, 'id' | 'authorId' | 'projectId'>>) => run(() => api<Meeting>(`/meetings/${id}`, { method: 'PATCH', body: patch }));
  /** Annuler : les participants sont prévenus. */
  const cancelMeeting = (id: string) => run(() => api(`/meetings/${id}`, { method: 'DELETE' }), (s) => ({ ...s, meetings: s.meetings.filter((m) => m.id !== id) }));

  // ---------- Notifications ----------
  const markRead = (id: string) =>
    run(() => api(`/notifications/${id}/read`, { method: 'POST' }), (s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
  const markAllRead = () =>
    run(() => api('/notifications/read-all', { method: 'POST' }), (s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));

  // ---------- Comptes et invitations (ADM-01, Q5) ----------
  type AccountInput = { email: string; name: string; roles: Role[]; department: User['department'] };
  type InviteResult = Result & { invitation?: Invitation; url?: string; emailSent?: boolean };
  type InviteResponse = { invitation: Invitation; url: string; emailSent: boolean };
  /** L'invitation part par e-mail ; `emailSent: false` si l'envoi a échoué (lien copiable en secours). */
  const inviteUser = async (input: AccountInput): Promise<InviteResult> => {
    const r = await run(() => api<InviteResponse>('/invitations', { method: 'POST', body: input }));
    return r.ok ? { ok: true, ...r.data! } : r;
  };
  const resendInvitation = async (id: string): Promise<InviteResult> => {
    const r = await run(() => api<InviteResponse>(`/invitations/${id}/resend`, { method: 'POST' }));
    return r.ok ? { ok: true, ...r.data! } : r;
  };
  const revokeInvitation = (id: string) => run(() => api(`/invitations/${id}/revoke`, { method: 'POST' }));
  const acceptInvitation = async (token: string, name: string, password: string): Promise<Result> => {
    try {
      const r = await api<{ access: string }>('/invitations/accept', { method: 'POST', body: { token, name, password } });
      setAccess(r.access);
      await load();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  };
  const resetPassword = async (userId: string): Promise<string | null> => {
    const r = await run(() => api<{ password: string }>(`/users/${userId}/reset-password`, { method: 'POST' }));
    return r.ok ? r.data!.password : null;
  };
  /** Modifier un membre (nom, e-mail, département, rôles). */
  const updateUser = (id: string, patch: Partial<AccountInput>) => run(() => api(`/users/${id}`, { method: 'PATCH', body: patch }));
  /** Modifier une invitation en attente ; un changement d'e-mail renvoie un nouveau lien. */
  const updateInvitation = async (id: string, patch: Partial<AccountInput>): Promise<Result & { emailSent?: boolean | null }> => {
    const r = await run(() => api<{ emailSent: boolean | null }>(`/invitations/${id}`, { method: 'PATCH', body: patch }));
    return r.ok ? { ok: true, emailSent: r.data!.emailSent } : r;
  };
  const toggleUserActive = (id: string) => {
    const u = state.users.find((x) => x.id === id);
    return run(() => api(`/users/${id}`, { method: 'PATCH', body: { active: !u?.active } }));
  };

  /** Serveurs qui hébergent un projet (admin ou chef de projet). */
  const setProjectServers = (projectId: string, serverIds: string[]) =>
    run(() => api(`/projects/${projectId}/servers`, { method: 'POST', body: { serverIds } }), (st) => ({ ...st, projects: st.projects.map((p) => (p.id === projectId ? { ...p, serverIds } : p)) }));

  // ---------- Serveurs (admin) ----------
  const recordBackup = (serverId: string, note: string) => run(() => api(`/servers/${serverId}/backup`, { method: 'POST', body: { note } }));
  const createServer = (input: {
    label: string; provider: string; type: ServerType; host: string; region: string; os: string; projectIds: string[]; backupFrequencyDays: number; notes: string;
    offer: string; renewalDate: string; period: Subscription['period'];
  }) => run(() => api('/servers', { method: 'POST', body: input }));
  /** v1.1 : seul l'admin choisit le ou les serveurs d'un projet. */
  const setServerProject = (serverId: string, projectId: string, hosted: boolean) =>
    run(() => api(`/servers/${serverId}/projects`, { method: 'POST', body: { projectId, hosted } }));
  /** Renouvellement effectué : l'échéance avance d'une période. */
  const renewSubscription = (id: string) => run(() => api(`/subscriptions/${id}/renew`, { method: 'POST' }));

  return {
    state,
    me,
    ready,
    reload: load,
    login,
    logout,
    changePassword,
    updateProfile,
    setProjectsView,
    createProject,
    transitionProject,
    setMember,
    createTask,
    updateTask,
    setTaskStatus,
    setTaskProgress,
    deleteTask,
    addComment,
    createMilestone,
    setMilestoneStatus,
    createSprint,
    updateSprint,
    startSprint,
    closeSprint,
    addCdcVersion,
    setCdcStatus,
    addFeedback,
    setFeedbackStatus,
    toggleNeedsNewCdc,
    convertFeedback,
    createFolder,
    renameFolder,
    deleteFolder,
    setDeliverableDueDate,
    addDeliverableLink,
    setDeliverableStage,
    copyLink,
    setLinkExpiry,
    revokeLink,
    reauth,
    hasReauth,
    revealSecret,
    logVault,
    createVaultEntry,
    grantVault,
    addNote,
    togglePin,
    addMeeting,
    updateMeeting,
    cancelMeeting,
    markRead,
    markAllRead,
    inviteUser,
    resendInvitation,
    revokeInvitation,
    acceptInvitation,
    resetPassword,
    updateUser,
    updateInvitation,
    toggleUserActive,
    setProjectServers,
    recordBackup,
    createServer,
    setServerProject,
    renewSubscription,
  };
}

export type Store = ReturnType<typeof useStoreValue>;

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue();
  // Rien n'est affiché avant de savoir si une session existe (évite un aller-retour par l'écran de connexion).
  if (!value.ready) return null;
  return (
    <MotionConfig reducedMotion="user">
      <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
    </MotionConfig>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
