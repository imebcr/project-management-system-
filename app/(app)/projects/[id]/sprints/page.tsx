'use client';

import { motion } from 'framer-motion';
import { useCurrentProject } from '@/components/project-shell';
import { SprintBoard } from '@/components/sprints';
import { pageTransition } from '@/lib/motion';

/** Onglet Sprints, niveau 1 : tableau Backlog + sprints. */
export default function SprintsPage() {
  const project = useCurrentProject();
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={pageTransition}>
      <SprintBoard project={project} />
    </motion.div>
  );
}
