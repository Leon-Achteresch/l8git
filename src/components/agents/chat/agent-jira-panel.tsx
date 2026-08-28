import { ExternalLink, Loader2, Plus, RefreshCw, Ticket, X } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { providerSupportsAppTools } from "@/lib/agents/provider-meta";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import { parseIssueRef } from "@/lib/jira/issue-key";
import { ensureJiraStatus, useJiraLinks, useJiraStore } from "@/lib/jira/jira-store";
import { openUrl } from "@tauri-apps/plugin-opener";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Jira tickets pinned to the selected repository. Rendered in the agents
 * sidebar so the ticket the session is about stays visible, and so the tool
 * gate ("which keys may the agent read?") has a UI.
 */
export const AgentJiraPanel = memo(function AgentJiraPanel({ path }: { path: string }) {
  const { t } = useTranslation();
  const provider = useAgentProviderStore((state) => state.provider);
  const enabled = useJiraStore((state) => state.enabled);
  const configured = useJiraStore((state) => state.status.configured);
  const statusLoaded = useJiraStore((state) => state.statusLoaded);
  const links = useJiraLinks(path);
  const linkTicket = useJiraStore((state) => state.linkTicket);
  const unlinkTicket = useJiraStore((state) => state.unlinkTicket);
  const refreshLinks = useJiraStore((state) => state.refreshLinks);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (enabled) void ensureJiraStatus();
  }, [enabled]);

  const submit = useCallback(async () => {
    const key = parseIssueRef(draft);
    if (!key) {
      toast.error(t("jira.invalidKey"));
      return;
    }
    setBusy(true);
    try {
      await linkTicket(path, key);
      setDraft("");
      setAdding(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [draft, linkTicket, path, t]);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await refreshLinks(path);
    } finally {
      setBusy(false);
    }
  }, [path, refreshLinks]);

  if (!enabled) return null;

  return (
    <section className="ag-line border-b px-2 py-2" aria-label={t("jira.panelTitle")}>
      <div className="flex items-center gap-1 px-1.5 pb-1">
        <Ticket className="size-3 shrink-0 text-[var(--ag-text-3)]" />
        <span className="ag-label flex-1 truncate">{t("jira.panelTitle")}</span>
        {links.length > 0 ? (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="ag-icon-btn size-5"
            aria-label={t("jira.refresh")}
            title={t("jira.refresh")}
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          className="ag-icon-btn size-5"
          aria-label={t("jira.linkTicket")}
          title={t("jira.linkTicket")}
        >
          <Plus className="size-3" />
        </button>
      </div>

      {statusLoaded && !configured ? (
        <p className="px-1.5 py-1 text-[11px] leading-relaxed text-[var(--ag-text-3)]">
          {t("jira.notConfigured")}
        </p>
      ) : null}

      {configured && !providerSupportsAppTools(provider) ? (
        <p className="px-1.5 py-1 text-[11px] leading-relaxed text-[var(--ag-text-3)]">
          {t("jira.providerUnsupported")}
        </p>
      ) : null}

      {adding ? (
        <form
          className="px-1 pb-1"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
            placeholder={t("jira.linkPlaceholder")}
            aria-label={t("jira.linkTicket")}
            disabled={busy}
            className="ag-inset w-full rounded-[7px] px-2 py-1 text-[12px] text-[var(--ag-text)] outline-none placeholder:text-[var(--ag-text-3)]"
          />
        </form>
      ) : null}

      {links.length === 0 && !adding ? (
        <p className="px-1.5 py-1 text-[11px] leading-relaxed text-[var(--ag-text-3)]">
          {t("jira.panelEmpty")}
        </p>
      ) : null}

      <ul className="space-y-0.5">
        {links.map((link) => (
          <li key={link.key} className="ag-row group h-auto items-start py-1.5 text-[12px]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-[var(--ag-text)]">{link.key}</span>
                {link.status ? (
                  <span className="ag-faint truncate rounded-[5px] bg-[var(--ag-hover)] px-1 py-px text-[9px]">
                    {link.status}
                  </span>
                ) : null}
              </div>
              {link.summary ? (
                <p className="ag-muted mt-0.5 line-clamp-2 text-[11px] leading-snug">{link.summary}</p>
              ) : null}
            </div>
            {link.url ? (
              <button
                type="button"
                onClick={() => void openUrl(link.url)}
                className="ag-icon-btn size-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={t("jira.openInJira", { key: link.key })}
                title={t("jira.openInJira", { key: link.key })}
              >
                <ExternalLink className="size-3" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => unlinkTicket(path, link.key)}
              className="ag-icon-btn size-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={t("jira.unlink", { key: link.key })}
              title={t("jira.unlink", { key: link.key })}
            >
              <X className="size-3" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
});
