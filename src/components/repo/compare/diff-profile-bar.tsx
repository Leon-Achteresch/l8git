import { Button } from "@/components/ui/button";
import { BUILTIN_PROFILES, FILE_CLASSES, useDiffProfiles, type FileClass } from "@/lib/workbench-ui/file-classes";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** Profile picker + "n hidden" disclosure; hidden files stay one click away. */
export function DiffProfileBar({ hiddenCount, showHidden, onShowHidden }: { hiddenCount: number; showHidden: boolean; onShowHidden: (v: boolean) => void }) {
  const { t } = useTranslation();
  const { custom, active, setActive, save, remove } = useDiffProfiles();
  const [editing, setEditing] = useState<{ name: string; hide: FileClass[] } | null>(null);
  const all = [...BUILTIN_PROFILES, ...custom];
  return (
    <div className="space-y-1 text-[10px]">
      <div className="flex flex-wrap items-center gap-1">
        <select value={active} onChange={(e) => setActive(e.target.value)} aria-label={t("diffProfile.profile")} className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1 text-[11px]">
          {all.map((p) => <option key={p.id} value={p.id}>{p.name || t(`diffProfile.builtin.${p.id}`)}</option>)}
        </select>
        <Button size="xs" variant="ghost" className="h-6 text-[10px]" onClick={() => setEditing({ name: "", hide: all.find((p) => p.id === active)?.hide ?? [] })}>{t("diffProfile.new")}</Button>
        {custom.some((p) => p.id === active) && <Button size="xs" variant="ghost" className="h-6 text-[10px]" onClick={() => remove(active)}>{t("common.delete")}</Button>}
      </div>
      {hiddenCount > 0 && (
        <button type="button" className="text-primary hover:underline" aria-pressed={showHidden} onClick={() => onShowHidden(!showHidden)}>
          {showHidden ? t("diffProfile.hideAgain", { count: hiddenCount }) : t("diffProfile.hidden", { count: hiddenCount })}
        </button>
      )}
      {editing && (
        <form className="space-y-1 rounded border border-dashed border-border p-1.5" onSubmit={(e) => { e.preventDefault(); if (editing.name.trim()) { save({ id: crypto.randomUUID(), name: editing.name.trim(), hide: editing.hide }); setEditing(null); } }}>
          <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t("diffProfile.name")} aria-label={t("diffProfile.name")} className="h-6 w-full rounded border border-border bg-background px-1 text-[11px]" />
          <div className="flex flex-wrap gap-1">
            {FILE_CLASSES.map((c) => (
              <label key={c} className="flex items-center gap-1">
                <input type="checkbox" checked={editing.hide.includes(c)} onChange={(e) => setEditing({ ...editing, hide: e.target.checked ? [...editing.hide, c] : editing.hide.filter((x) => x !== c) })} />
                {t("diffProfile.hideClass", { cls: t(`diffProfile.class.${c}`) })}
              </label>
            ))}
          </div>
          <div className="flex gap-1">
            <Button type="submit" size="xs" className="h-6 text-[10px]" disabled={!editing.name.trim()}>{t("common.save")}</Button>
            <Button type="button" size="xs" variant="ghost" className="h-6 text-[10px]" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
