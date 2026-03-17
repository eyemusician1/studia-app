import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = '@studia_history';
const MIGRATION_KEY = '@studia_history_migrated_v2';

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
    date: String(raw.date ?? ''),
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

export async function migrateHistoryOnce(): Promise<any[]> {
  const alreadyMigrated = await AsyncStorage.getItem(MIGRATION_KEY);
  const historyRaw = await AsyncStorage.getItem(HISTORY_KEY);
  const parsed = parseHistory(historyRaw);

  if (alreadyMigrated) {
    return parsed;
  }

  const normalized = parsed.map(normalizeHistoryEntry).filter(Boolean);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(normalized));
  await AsyncStorage.setItem(MIGRATION_KEY, '1');
  return normalized;
}

export async function prependHistoryEntry(entry: any, maxItems = 100): Promise<void> {
  const current = await migrateHistoryOnce();
  const normalizedNew = normalizeHistoryEntry(entry);
  if (!normalizedNew) return;

  const next = [normalizedNew, ...current].slice(0, maxItems);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export async function patchHistoryEntryById(id: string, patcher: (entry: any) => any): Promise<boolean> {
  const current = await migrateHistoryOnce();
  const index = current.findIndex((entry) => entry?.id === id);
  if (index === -1) return false;

  const patched = patcher(current[index]);
  const normalizedPatched = normalizeHistoryEntry(patched);
  if (!normalizedPatched) return false;

  current[index] = normalizedPatched;
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(current));
  return true;
}

export async function replaceHistoryEntries(entries: any[]): Promise<void> {
  const normalized = (Array.isArray(entries) ? entries : []).map(normalizeHistoryEntry).filter(Boolean);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(normalized));
}
