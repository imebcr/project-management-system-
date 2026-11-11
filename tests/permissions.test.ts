import { describe, expect, it } from 'vitest';
import type { VaultEntry } from '@/lib/types';
import {
  canAccessInfra,
  canManage,
  canPostFeedback,
  canShareDeliverables,
  canTransition,
  canUploadDeliverables,
  headedProjects,
  isRecipient,
  visibleNotes,
  visibleProjects,
  visibleVaultEntries,
} from '@/lib/utils';
import { admin, head, member, orphan, outsider, p1, project } from './fixtures';

describe('matrice v1.1 — Admin · Responsable · Dev membre', () => {
  it('gestion du projet (sprints, jalons, équipe, tâches, CDC) : admin et responsable seulement', () => {
    expect(canManage(admin, p1)).toBe(true);
    expect(canManage(head, p1)).toBe(true);
    expect(canManage(member, p1)).toBe(false);
    expect(canManage(outsider, p1)).toBe(false);
  });

  it('un projet sans responsable est géré par l’admin seul', () => {
    expect(canManage(admin, orphan)).toBe(true);
    expect(canManage(member, orphan)).toBe(false);
  });

  it('retours (texte + photos) : tout membre du projet et l’admin', () => {
    expect(canPostFeedback(admin, p1)).toBe(true);
    expect(canPostFeedback(head, p1)).toBe(true);
    expect(canPostFeedback(member, p1)).toBe(true);
    expect(canPostFeedback(outsider, p1)).toBe(false);
  });

  it('livrables : le dev membre dépose mais ne partage pas', () => {
    expect(canUploadDeliverables(member, p1)).toBe(true);
    expect(canShareDeliverables(member, p1)).toBe(false);
    expect(canShareDeliverables(head, p1)).toBe(true);
    expect(canShareDeliverables(admin, p1)).toBe(true);
    expect(canUploadDeliverables(outsider, p1)).toBe(false);
  });

  it('infra : admin seul', () => {
    expect(canAccessInfra(admin)).toBe(true);
    expect(canAccessInfra(head)).toBe(false);
    expect(canAccessInfra(member)).toBe(false);
  });

  it('transitions de statut : admin seul, et seulement les transitions PRJ-02', () => {
    expect(canTransition('DRAFT', 'ACTIVE', true)).toBe(true);
    expect(canTransition('ACTIVE', 'ON_HOLD', true)).toBe(true);
    expect(canTransition('ON_HOLD', 'ACTIVE', true)).toBe(true);
    expect(canTransition('DELIVERED', 'CLOSED', true)).toBe(true);
    expect(canTransition('CLOSED', 'ARCHIVED', true)).toBe(true);
    expect(canTransition('DRAFT', 'DELIVERED', true)).toBe(false);
    expect(canTransition('CLOSED', 'ACTIVE', true)).toBe(false);
    expect(canTransition('DRAFT', 'ACTIVE', false)).toBe(false);
  });

  it('visibilité : l’admin voit tout, un dev voit ses projets hors archives', () => {
    const archived = project('p3', [{ userId: 'member', role: 'CONTRIBUTOR' }], 'ARCHIVED');
    const all = [p1, orphan, archived];
    expect(visibleProjects(admin, all)).toHaveLength(3);
    expect(visibleProjects(member, all).map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(visibleProjects(outsider, all)).toHaveLength(0);
    expect(headedProjects(head, all).map((p) => p.id)).toEqual(['p1']);
  });

  it('coffre : le champ « serveur lié » n’est exposé qu’à l’admin ; le dev ne voit que ses partages', () => {
    const entries: VaultEntry[] = [
      { id: 'v1', category: 'SERVER', label: 'SSH', projectId: 'p1', serverId: 'sv1', url: '', username: 'root', secret: 'x', secretNotes: '', lastRotation: '', grants: [{ userId: 'member', expiresAt: null }] },
      { id: 'v2', category: 'API_KEY', label: 'Clé', projectId: 'p1', serverId: 'sv1', url: '', username: '', secret: 'y', secretNotes: '', lastRotation: '', grants: [] },
    ];
    expect(visibleVaultEntries(admin, entries, [p1]).map((e) => e.serverId)).toEqual(['sv1', 'sv1']);
    expect(visibleVaultEntries(head, entries, [p1]).map((e) => e.serverId)).toEqual([null, null]);
    expect(visibleVaultEntries(member, entries, [p1]).map((e) => e.id)).toEqual(['v1']);
    expect(visibleVaultEntries(member, entries, [p1])[0].serverId).toBeNull();
  });

  it('note ciblée : invisible pour un autre membre (critère 8), visible par l’admin', () => {
    const notes = [{ id: 'n1', projectId: 'p1', authorId: 'head', content: '', audience: ['other'], pinned: false, date: '' }];
    expect(visibleNotes(member, notes)).toHaveLength(0);
    expect(visibleNotes(admin, notes)).toHaveLength(1);
  });

  it('notifications : audience admins / liste / tous', () => {
    expect(isRecipient(admin, 'ADMINS')).toBe(true);
    expect(isRecipient(head, 'ADMINS')).toBe(false);
    expect(isRecipient(member, ['member'])).toBe(true);
    expect(isRecipient(head, ['member'])).toBe(false);
    expect(isRecipient(head, 'ALL')).toBe(true);
  });
});
