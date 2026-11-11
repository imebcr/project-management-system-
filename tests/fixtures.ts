import type { Project, Role, User } from '@/lib/types';

export function user(id: string, role: Role = 'DEV'): User {
  return {
    id, name: id, email: `${id}@zidny.dz`, roles: [role], role, department: 'Développement', active: true,
    mustChangePassword: false, createdAt: '2026-01-01T00:00:00Z', lastLoginAt: null,
  };
}

export function project(id: string, members: Project['members'], status: Project['status'] = 'ACTIVE'): Project {
  return {
    id, code: `ZD-${id}`, name: `Projet ${id}`, clientName: 'Client test', clientPhone: '', serverIds: [], type: 'web',
    status, startDate: '2026-10-01T00:00:00Z', dueDate: '2026-12-31T00:00:00Z', description: '', members, updatedAt: '2026-10-01T00:00:00Z',
  };
}

/** Les trois profils de la matrice v1.1 + un dev étranger au projet. */
export const admin = user('admin', 'ADMIN');
export const head = user('head');
export const member = user('member');
export const outsider = user('outsider');
export const p1 = project('p1', [{ userId: 'head', role: 'HEAD' }, { userId: 'member', role: 'CONTRIBUTOR' }]);
export const orphan = project('p2', [{ userId: 'member', role: 'CONTRIBUTOR' }]);
