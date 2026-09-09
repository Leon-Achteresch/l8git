import CiScene from "./ci-scene";
import { useState } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { router } from '@/lib/router';
import { AgentReviewDialog } from '@/components/agents/worktree-review/agent-review-dialog';
import { ContextReviewDialog } from '@/components/ai/context-review-dialog';
import { reviewAiContext } from '@/lib/ai/context-review';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { FIXTURE_PATH, PATCH, seedAuditFixture } from './audit-fixtures';
export default function AuditScenes({ scene }: { scene: string }) {
  useState(() => { seedAuditFixture(scene); return true; });
  const [reviewOpen, setReviewOpen] = useState(true);
  const [sent, setSent] = useState('');
  if (scene === "ci") return <CiScene />;
  if (scene === 'context') return <div className="p-6"><Button onClick={() => void reviewAiContext({ system: 'Summarize the changes.', prompt: PATCH }).then(c => setSent(c.prompt)).catch(() => {})}>Preview AI context</Button><ContextReviewDialog /><output aria-label="Sent context">{sent}</output></div>;
  if (scene === 'review') return <><AgentReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} session={{ worktreePath: FIXTURE_PATH, basePath: '/tmp/base-fixture', branch: 'agents/fixture' }} /><Toaster /></>;
  return <RouterProvider router={router} />;
}
