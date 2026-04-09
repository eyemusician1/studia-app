import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = '@studia_history';
const MIGRATION_KEY = '@studia_history_migrated_v2';

function scopedHistoryKey(userId?: string | null): string {
  return userId ? `@studia_history_${userId}` : HISTORY_KEY;
}

function scopedMigrationKey(userId?: string | null): string {
  return userId ? `@studia_history_migrated_v2_${userId}` : MIGRATION_KEY;
}

function isExamBundle(exam: any): boolean {
  return !!exam && typeof exam === 'object' && Array.isArray(exam.multipleChoice);
}

function normalizeHistoryEntry(raw: any): any | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.id || !raw.fileName) return null;

  const content = raw.content ?? {};

  return {
    id: String(raw.id),
    fileName: String(raw.fileName),
    date: String(raw.date ?? new Date(Number(raw.id) || Date.now()).toLocaleDateString()),
    content: {
      summary: typeof content.summary === 'string' ? content.summary : '',
      keyConceptsList: Array.isArray(content.keyConceptsList) ? content.keyConceptsList : [],
      flashcards: Array.isArray(content.flashcards) ? content.flashcards : [],
      quiz: Array.isArray(content.quiz) ? content.quiz : [],
      hardQuiz: Array.isArray(content.hardQuiz) ? content.hardQuiz : [],
      exam: Array.isArray(content.exam) || isExamBundle(content.exam) ? content.exam : undefined,
    },
  };
}

function parseHistory(raw: string | null): any[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeAndSort(entries: any[]): any[] {
  const deduped = new Map<string, any>();
  for (const item of entries) {
    const normalized = normalizeHistoryEntry(item);
    if (!normalized) continue;
    // Keep first seen item for an id (callers prepend newest first).
    if (!deduped.has(normalized.id)) deduped.set(normalized.id, normalized);
  }
  return Array.from(deduped.values()).sort((a, b) => Number(b.id) - Number(a.id));
}

export async function migrateHistoryOnce(userId?: string | null): Promise<any[]> {
  const historyKey = scopedHistoryKey(userId);
  const migrationKey = scopedMigrationKey(userId);

  const alreadyMigrated = await AsyncStorage.getItem(migrationKey);
  const historyRaw = await AsyncStorage.getItem(historyKey);
  const parsed = parseHistory(historyRaw);

  if (alreadyMigrated) {
    return normalizeAndSort(parsed);
  }

  // One-time legacy migration for user-scoped history.
  let seed = parsed;
  if (userId && seed.length === 0) {
    const legacyRaw = await AsyncStorage.getItem(HISTORY_KEY);
    seed = parseHistory(legacyRaw);
  }

  const normalized = normalizeAndSort(seed);
  await AsyncStorage.setItem(historyKey, JSON.stringify(normalized));
  await AsyncStorage.setItem(migrationKey, '1');
  return normalized;
}

export async function prependHistoryEntry(entry: any, maxItems = 100, userId?: string | null): Promise<void> {
  const historyKey = scopedHistoryKey(userId);
  const current = await migrateHistoryOnce(userId);
  const normalizedNew = normalizeHistoryEntry(entry);
  if (!normalizedNew) return;

  const next = normalizeAndSort([normalizedNew, ...current]).slice(0, maxItems);
  await AsyncStorage.setItem(historyKey, JSON.stringify(next));
}

export async function patchHistoryEntryById(id: string, patcher: (entry: any) => any, userId?: string | null): Promise<boolean> {
  const historyKey = scopedHistoryKey(userId);
  const current = await migrateHistoryOnce(userId);
  const index = current.findIndex((entry) => entry?.id === id);
  if (index === -1) return false;

  const patched = patcher(current[index]);
  const normalizedPatched = normalizeHistoryEntry(patched);
  if (!normalizedPatched) return false;

  current[index] = normalizedPatched;
  await AsyncStorage.setItem(historyKey, JSON.stringify(normalizeAndSort(current)));
  return true;
}

export async function replaceHistoryEntries(entries: any[], userId?: string | null): Promise<void> {
  const historyKey = scopedHistoryKey(userId);
  const normalized = normalizeAndSort(Array.isArray(entries) ? entries : []);
  await AsyncStorage.setItem(historyKey, JSON.stringify(normalized));
}

export async function clearHistoryEntries(userId?: string | null): Promise<void> {
  const historyKey = scopedHistoryKey(userId);
  const migrationKey = scopedMigrationKey(userId);
  await AsyncStorage.removeItem(historyKey);
  await AsyncStorage.removeItem(migrationKey);

  // Also clear legacy key for backward compatibility.
  if (userId) {
    await AsyncStorage.removeItem(HISTORY_KEY);
  }
}
