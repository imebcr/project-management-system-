'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { CdcTab } from '@/components/project-tabs/cdc-tab';
import { DeliverablesTab } from '@/components/project-tabs/deliverables-tab';
import { FeedbackTab } from '@/components/project-tabs/feedback-tab';
import { MeetingsTab } from '@/components/project-tabs/meetings-tab';
import { MembersTab } from '@/components/project-tabs/members-tab';
import { NotesTab } from '@/components/project-tabs/notes-tab';
import { OverviewTab } from '@/components/project-tabs/overview-tab';
import { VaultTab } from '@/components/project-tabs/vault-tab';
import { projectTabHref, useActiveTab, useCurrentProject } from '@/components/project-shell';
import { pageTransition } from '@/lib/motion';
import { useStore } from '@/lib/store';
import { canManage, canPostFeedback, canUploadDeliverables } from '@/lib/utils';

export default function ProjectPage() {
  return (
    <Suspense>
      <ProjectTabContent />
    </Suspense>
  );
}

function ProjectTabContent() {
  const project = useCurrentProject();
  const tab = useActiveTab();
  const router = useRouter();
  const { me } = useStore();
  // Onglets protégés : un accès direct par URL retombe sur l'Aperçu.
  const allowed = (tab !== 'members' || canManage(me, project)) && (tab !== 'deliverables' || canUploadDeliverables(me, project)) && (tab !== 'feedback' || canPostFeedback(me, project));
  const shown = allowed ? tab : 'overview';

  return (
    <motion.div key={shown} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={pageTransition}>
      {shown === 'overview' && <OverviewTab project={project} goTo={(t) => router.push(projectTabHref(project.id, t), { scroll: false })} />}
      {shown === 'cdc' && <CdcTab project={project} />}
      {shown === 'deliverables' && <DeliverablesTab project={project} />}
      {shown === 'feedback' && <FeedbackTab project={project} />}
      {shown === 'meetings' && <MeetingsTab project={project} />}
      {shown === 'vault' && <VaultTab project={project} />}
      {shown === 'notes' && <NotesTab project={project} />}
      {shown === 'members' && <MembersTab project={project} />}
    </motion.div>
  );
}
