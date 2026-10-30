import { AppDataSchema, AppSettings, DataPatch } from '../vite-env';

// Turns a renderer-side state update into a minimal patch of the fields the renderer owns.
// Only changed settings keys are sent, so a stale copy of other settings (e.g. a property
// the scheduler just auto-selected) is never written back.
export function buildPatch(prev: AppDataSchema, next: AppDataSchema): DataPatch {
  const patch: DataPatch = {};

  if (next.businessRecords !== prev.businessRecords) {
    patch.businessRecords = next.businessRecords.filter((r) => !r.isSample);
  }
  if (next.savedSearches !== prev.savedSearches) patch.savedSearches = next.savedSearches;
  if (next.searchHistory !== prev.searchHistory) patch.searchHistory = next.searchHistory;

  if (next.settings !== prev.settings) {
    const changed: Partial<AppSettings> = {};
    for (const key of Object.keys(next.settings) as (keyof AppSettings)[]) {
      if (next.settings[key] !== prev.settings[key]) {
        (changed as Record<string, unknown>)[key] = next.settings[key];
      }
    }
    if (Object.keys(changed).length > 0) patch.settings = changed;
  }

  return patch;
}

export function isEmptyPatch(patch: DataPatch): boolean {
  return Object.keys(patch).length === 0;
}
