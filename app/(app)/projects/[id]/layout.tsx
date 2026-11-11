'use client';

import { Suspense } from 'react';
import { ProjectShell } from '@/components/project-shell';

/** En-tête et onglets communs à la fiche projet et aux deux niveaux de l'onglet Sprints. */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ProjectShell>{children}</ProjectShell>
    </Suspense>
  );
}
