import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/error-toast";
import { applyIdentity, identityDifferences, readIdentity, useIdentityProfiles, type IdentityApplyResult, type IdentityProfile } from "@/lib/github-expansion/identity";
import { groupIdOfPath, useRepoGroupsStore } from "@/lib/repo-groups-store";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Field, RunButton, Section } from "./workbench-kit";

const EMPTY: Omit<IdentityProfile, "id"> = { label: "", name: "", email: "", signing_format: "openpgp", signing_key: "", sign_commits: false };

/** 67: author/signing profiles per repository group, previewed against the effective config before a guarded local apply. */
export function IdentityProfilesTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const { profiles, assignments, saveProfile, removeProfile, assignGroup } = useIdentityProfiles();
  const forest = useRepoGroupsStore((s) => s.forest);
  const group = groupIdOfPath(forest, path) ?? `repo:${path}`;
  const assigned = profiles.find((p) => p.id === assignments[group]) ?? null;
  const [info, setInfo] = useState<IdentityApplyResult | null>(null);
  const [draft, setDraft] = useState<IdentityProfile | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      setInfo(await readIdentity(path));
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function apply(p: IdentityProfile) {
    if (!info) return;
    const diff = identityDifferences(p, info.info);
    if (!diff.length || !window.confirm(t("identity.applyConfirm", { keys: diff.join(", ") }))) return;
    setBusy(true);
    try {
      const r = await applyIdentity(path, p, info.info.fingerprint);
      setInfo(r);
      if (r.error) toastError(t("identity.partial", { done: r.completed_keys.join(", ") || "—", error: r.error }));
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const diff = assigned && info ? identityDifferences(assigned, info.info) : [];
  const row = (k: string) => (
    <tr key={k} className="border-t border-border/40">
      <td className="py-0.5 pr-2 text-muted-foreground">{k}</td>
      <td className="font-mono">{info?.info.effective[k] ?? "—"}</td>
      <td className="font-mono text-muted-foreground">{info?.info.local[k] ? t("identity.local") : t("identity.inherited")}</td>
    </tr>
  );
  return (
    <Section id="identity" title={t("identity.title")} hint={t("identity.hint")}>
      <RunButton busy={busy} onClick={() => void load()}>{info ? t("common.refresh") : t("wb.inspect")}</RunButton>
      {info && (
        <table className="w-full text-[11px]">
          <tbody>{["user.name", "user.email", "gpg.format", "user.signingkey", "commit.gpgsign"].map(row)}</tbody>
        </table>
      )}
      <Field label={t("identity.groupProfile")}>
        <select value={assigned?.id ?? ""} onChange={(e) => assignGroup(group, e.target.value || null)} className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs">
          <option value="">{t("identity.none")}</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.label} · {p.email}</option>)}
        </select>
      </Field>
      {assigned && info && (
        diff.length ? (
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
            <p>{t("identity.firstCommitWarn", { keys: diff.join(", ") })}</p>
            <Button size="xs" disabled={busy} onClick={() => void apply(assigned)}>{t("identity.apply", { label: assigned.label })}</Button>
          </div>
        ) : (
          <p className="text-xs text-emerald-600">{t("identity.matches")}</p>
        )
      )}
      <ul className="space-y-0.5 text-xs">
        {profiles.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{p.label} — {p.name} &lt;{p.email}&gt;{p.sign_commits ? ` · ${p.signing_format}` : ""}</span>
            <Button variant="ghost" size="xs" onClick={() => setDraft({ ...p })}>{t("ghx.edit")}</Button>
            <Button variant="ghost" size="xs" onClick={() => removeProfile(p.id)}>{t("common.delete")}</Button>
          </li>
        ))}
      </ul>
      {draft ? (
        <form className="grid grid-cols-2 gap-1.5 rounded-md border border-dashed border-border p-2" onSubmit={(e) => {
          e.preventDefault();
          try {
            saveProfile(draft);
            setDraft(null);
          } catch (err) {
            toastError(String(err));
          }
        }}>
          {(["label", "name", "email", "signing_key"] as const).map((k) => (
            <Field key={k} label={t(`identity.f.${k}`)}><Input value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="h-7 text-xs" /></Field>
          ))}
          <Field label={t("identity.f.signing_format")}>
            <select value={draft.signing_format} onChange={(e) => setDraft({ ...draft, signing_format: e.target.value as IdentityProfile["signing_format"] })} className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs">
              {(["openpgp", "ssh", "x509"] as const).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.sign_commits} onChange={(e) => setDraft({ ...draft, sign_commits: e.target.checked })} />{t("identity.f.sign_commits")}</label>
          <div className="col-span-2 flex gap-1">
            <Button type="submit" size="xs">{t("common.save")}</Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setDraft(null)}>{t("common.cancel")}</Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" size="xs" onClick={() => setDraft({ ...EMPTY, id: crypto.randomUUID() })}>{t("identity.add")}</Button>
      )}
    </Section>
  );
}
