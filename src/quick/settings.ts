export interface QuickSettings {
  /**
   * When enabled, the Quick Translate popup tab automatically reads the
   * system clipboard on open and pastes its text into the source input.
   * Defaults to `true`.
   */
  pasteFromClipboard: boolean;
}

export const DEFAULT_QUICK_SETTINGS: QuickSettings = {
  pasteFromClipboard: true
};

const QUICK_SETTINGS_KEY = "translator2k:quickSettings";

export async function loadQuickSettings(): Promise<QuickSettings> {
  const result = await chrome.storage.local.get(QUICK_SETTINGS_KEY);
  const stored = result[QUICK_SETTINGS_KEY] as Partial<QuickSettings> | undefined;
  if (!stored) return { ...DEFAULT_QUICK_SETTINGS };
  return {
    ...DEFAULT_QUICK_SETTINGS,
    ...stored
  };
}

export async function saveQuickSettings(settings: QuickSettings): Promise<void> {
  await chrome.storage.local.set({ [QUICK_SETTINGS_KEY]: settings });
}

/**
 * Apply a partial update, merging over the freshest stored value to avoid
 * read-modify-write races with the popup tab.
 */
export async function updateQuickSettings(patch: Partial<QuickSettings>): Promise<QuickSettings> {
  const current = await loadQuickSettings();
  const next: QuickSettings = { ...current, ...patch };
  await saveQuickSettings(next);
  return next;
}

export function watchQuickSettings(callback: (settings: QuickSettings) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string
  ) => {
    if (area !== "local" || !(QUICK_SETTINGS_KEY in changes)) return;
    const next = changes[QUICK_SETTINGS_KEY]?.newValue as Partial<QuickSettings> | undefined;
    callback(next ? { ...DEFAULT_QUICK_SETTINGS, ...next } : { ...DEFAULT_QUICK_SETTINGS });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
