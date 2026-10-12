import type { SessionReport } from '@shared/analysis';
import type { Role } from '@shared/types';

/**
 * Local player profile + progress history. Lives in localStorage only:
 * no accounts needed for a 90-second booth demo.
 */

export interface SessionSummary {
  replayId: string;
  at: number;
  role: Role;
  partner: 'friend' | 'ai';
  clarity: number;
  stars: number;
  missionsDone: number;
  missionsTotal: number;
  mistakes: number;
  skills: SessionReport['skills'];
}

const KEY_NAME = 'objecttalk:name';
const KEY_SESSIONS = 'objecttalk:sessions';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: progress simply is not remembered */
  }
}

const NAMES = ['Sunny', 'Mochi', 'Pip', 'Kiwi', 'Nova', 'Ziggy', 'Bean', 'Juno', 'Echo', 'Tofu', 'Pico', 'Lumi'];

export function getName(): string {
  return read<string>(KEY_NAME, '') || `${NAMES[Math.floor(Math.random() * NAMES.length)]}${Math.floor(Math.random() * 90 + 10)}`;
}

export function setName(name: string) {
  write(KEY_NAME, name.slice(0, 24));
}

export function getSessions(): SessionSummary[] {
  return read<SessionSummary[]>(KEY_SESSIONS, []);
}

export function addSession(s: SessionSummary) {
  const all = getSessions().filter((x) => x.replayId !== s.replayId);
  all.push(s);
  write(KEY_SESSIONS, all.slice(-60));
}
