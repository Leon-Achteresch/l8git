import { useMemo } from "react";
import anthropic from "thesvg/anthropic";
import deepseek from "thesvg/deepseek";
import google from "thesvg/google";
import meta from "thesvg/meta";
import mistral from "thesvg/mistral-ai";
import openai from "thesvg/openai";
import xai from "thesvg/xai";

import { cn } from "@/lib/utils";

const LOGOS: Record<string, { svg: string }> = {
  anthropic,
  openai,
  google,
  meta,
  mistral,
  deepseek,
  xai,
};

export function ProviderLogo({
  providerId,
  className,
}: {
  providerId: string;
  className?: string;
}) {
  const html = useMemo(() => {
    const raw = LOGOS[providerId]?.svg;
    if (!raw) return null;
    return raw
      .replace(/\s(?:width|height)="[^"]*"/g, " ")
      .replace(/fill="#(fff|ffff|ffffff|000|000000|191919)"/gi, 'fill="currentColor"')
      .replace("<svg", '<svg width="100%" height="100%"');
  }, [providerId]);

  if (!html) return null;

  return (
    <span
      aria-hidden
      className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
