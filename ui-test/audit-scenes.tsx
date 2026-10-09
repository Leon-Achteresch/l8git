import CiScene from "./ci-scene";
import AgentsScene from "./agents-scene";
import { useState } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { router } from '@/lib/router';
import { AgentReviewDialog } from '@/components/agents/worktree-review/agent-review-dialog';
import { CommitSplitDialog } from '@/components/repo/commit/commit-split-dialog';
import { EditRemoteDialog } from '@/components/repo/remote/edit-remote-dialog';
import { ContextReviewDialog } from '@/components/ai/context-review-dialog';
import { reviewAiContext } from '@/lib/ai/context-review';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { FIXTURE_PATH, PATCH, seedAuditFixture } from './audit-fixtures';
import { seedHistoryFixture } from './history-fixture';
export default function AuditScenes({ scene }: { scene: string }) {
  useState(() => { if (scene !== 'agents' && !seedHistoryFixture(scene)) seedAuditFixture(scene); return true; });
  const [reviewOpen, setReviewOpen] = useState(true);
  const [remoteOpen, setRemoteOpen] = useState(true);
  const [sent, setSent] = useState('');
  const [splitOpen, setSplitOpen] = useState(true);
  const [splitResult, setSplitResult] = useState('');
  if (scene === "ci") return <CiScene />;
  if (scene === "agents") return <AgentsScene />;
  if (scene === 'context') return <div className="p-6"><Button onClick={() => void reviewAiContext({ system: 'Summarize the changes.', prompt: PATCH }).then(c => setSent(c.prompt)).catch(() => {})}>Preview AI context</Button><ContextReviewDialog /><output aria-label="Sent context">{sent}</output></div>;
  if (scene === 'review') return <><AgentReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} session={{ worktreePath: FIXTURE_PATH, basePath: '/tmp/base-fixture', branch: 'agents/fixture' }} /><Toaster /></>;
  if (scene === 'split' || scene === 'split-worktree') return <><CommitSplitDialog open={splitOpen} onOpenChange={setSplitOpen} path={FIXTURE_PATH} ownerRepoPath={scene === 'split-worktree' ? '/tmp/base-fixture' : FIXTURE_PATH} onApplied={result => setSplitResult(JSON.stringify(result))} /><div className="p-6"><Button onClick={() => setSplitOpen(true)}>Open split dialog</Button><output aria-label="Split result">{splitResult}</output></div><Toaster /></>;
  if (scene === 'remote-dialog') return <><EditRemoteDialog open={remoteOpen} onClose={() => setRemoteOpen(false)} path={FIXTURE_PATH} /><div className="p-6"><Button onClick={() => setRemoteOpen(true)}>Open remote dialog</Button></div><Toaster /></>;
  return <RouterProvider router={router} />;
}
