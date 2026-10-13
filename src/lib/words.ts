/**
 * The word book (单词本): everything a player met and wanted to keep, in
 * localStorage. Three sources feed it: phrases borrowed with the Chinese
 * lifeline, objects looked up in a scene (word cards), and the player's own
 * photo objects from the Object Studio. The Progress page reviews it.
 */

export interface WordEntry {
  en: string;
  zh: string;
  source: 'lifeline' | 'scene' | 'studio';
  /** First time and last time it came up. */
  at: number;
  last: number;
  /** How many times it came up (more = weaker or more useful). */
  count: number;
  /** Where it came from (level title, object id…). */
  where?: string;
  /** Marked as learned by the player. */
  known?: boolean;
  /** Image for objects (a model reference picture). */
  img?: string;
}

const KEY = 'objecttalk:words';
const MAX = 300;

function read(): WordEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WordEntry[]) : [];
  } catch {
    return [];
  }
}

function write(list: WordEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    window.dispatchEvent(new Event('objecttalk:words'));
  } catch {
    /* storage unavailable: the word book is simply not kept */
  }
}

export const getWords = (): WordEntry[] => read().sort((a, b) => b.last - a.last);

/** Add or bump a word (matched by its English, case-insensitive). */
export function addWord(e: Omit<WordEntry, 'at' | 'last' | 'count'> & { at?: number }) {
  const en = e.en.trim();
  if (!en) return;
  const now = e.at ?? Date.now();
  const list = read();
  const hit = list.find((w) => w.en.toLowerCase() === en.toLowerCase());
  if (hit) {
    hit.last = now;
    hit.count += 1;
    hit.zh ||= e.zh;
    hit.img ||= e.img;
    if (e.source === 'lifeline') hit.known = false;
  } else list.push({ ...e, en, at: now, last: now, count: 1 });
  write(list);
}

export function setKnown(en: string, known: boolean) {
  const list = read();
  const hit = list.find((w) => w.en === en);
  if (hit) hit.known = known;
  write(list);
}

export function removeWord(en: string) {
  write(read().filter((w) => w.en !== en));
}
