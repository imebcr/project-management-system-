'use client';

import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { useCurrentProject } from '@/components/project-shell';
import { SprintTasks } from '@/components/sprints';
import { pageTransition } from '@/lib/motion';

/** Onglet Sprints, niveau 2 : tâches du sprint par statut. */
export default function SprintPage() {
  const project = useCurrentProject();
  const { sprintId } = useParams<{ sprintId: string }>();
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={pageTransition}>
      <SprintTasks project={project} sprintId={sprintId} />
    </motion.div>
  );
}
