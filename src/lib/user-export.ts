import { invoke, isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
export async function saveJson(name: string, value: unknown) {
  await saveText(name, JSON.stringify(value, null, 2), { label: 'JSON', extension: 'json', mime: 'application/json' });
}

/** Save a user-requested export locally; false means the save dialog was cancelled. */
export async function saveText(name: string, contents: string, format: { label: string; extension: string; mime: string }): Promise<boolean> {
  if (isTauri()) {
    const path = await save({ defaultPath: name, filters: [{ name: format.label, extensions: [format.extension] }] });
    if (!path) return false;
    await invoke('save_user_export', { path, contents });
    return true;
  }
  const url = URL.createObjectURL(new Blob([contents], { type: format.mime }));
  try {
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return true;
}
