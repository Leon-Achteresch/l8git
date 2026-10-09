import { Link } from '@tanstack/react-router';
import { CircleHelp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getWorkflowGuides } from '@/lib/workflow-help';

/** Open the guide for the task at hand; clicking help never starts the task. */
export function WorkflowHelpLink({ guideId, onOpen }: { guideId: string; onOpen?: () => void }) {
  const { t, i18n } = useTranslation();
  const guide = getWorkflowGuides(i18n.language, t('workflowGuides', { returnObjects: true })).find(item => item.id === guideId);
  if (!guide) return null;
  const label = t('helpCenter.contextHelp', { title: guide.title });
  return <Tooltip>
    <TooltipTrigger asChild><Button asChild variant="ghost" size="icon-sm"><Link to="/info" hash={guideId} onClick={onOpen} aria-label={label}><CircleHelp aria-hidden="true" className="size-4" /></Link></Button></TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>;
}
