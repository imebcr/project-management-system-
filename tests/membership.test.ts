import { describe, expect, it } from 'vitest';
import { projectHead, withMember } from '@/lib/utils';
import { p1, project } from './fixtures';

const heads = (p: { members: { role: string }[] }) => p.members.filter((m) => m.role === 'HEAD').length;

describe('un seul HEAD par projet (critère 13)', () => {
  it('désigner un responsable rétrograde l’ancien en contributeur', () => {
    const next = withMember(p1, 'member', 'HEAD');
    expect(heads(next)).toBe(1);
    expect(projectHead(next)).toBe('member');
    expect(next.members.find((m) => m.userId === 'head')?.role).toBe('CONTRIBUTOR');
  });

  it('un nouveau membre externe peut devenir responsable', () => {
    const next = withMember(p1, 'newcomer', 'HEAD');
    expect(heads(next)).toBe(1);
    expect(next.members).toHaveLength(3);
  });

  it('retirer le responsable laisse un projet sans responsable', () => {
    const next = withMember(p1, 'head', null);
    expect(projectHead(next)).toBeNull();
  });

  it('ajouter un contributeur ne touche pas au responsable', () => {
    const next = withMember(project('p9', [{ userId: 'a', role: 'HEAD' }]), 'b', 'CONTRIBUTOR');
    expect(projectHead(next)).toBe('a');
    expect(heads(next)).toBe(1);
  });

});

