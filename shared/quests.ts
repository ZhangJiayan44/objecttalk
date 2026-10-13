/**
 * Quests: what this round is about. Every level offers a few, the host picks
 * one in the lobby (or "Surprise me"), and the Daily Challenge gives every
 * room in the world the same world and missions today, so classmates can
 * compare scores. Quests only steer the existing engines (which mission
 * types, what kind of order, how hidden), so every quest stays solvable by
 * construction and is covered by the same simulations.
 */

export interface Quest {
  id: string;
  title: string;
  emoji: string;
  /** One line for the lobby card. */
  text: string;
}

export const QUESTS: Record<string, Quest[]> = {
  tabletop: [
    { id: 'mixed', title: 'Mixed', emoji: '🎲', text: 'Find and place, in any order.' },
    { id: 'find', title: 'Which one?', emoji: '🔎', text: 'Only “find it”: twins and look-alikes everywhere.' },
    { id: 'place', title: 'Tidy up', emoji: '📦', text: 'Only “put it there”: say exactly where things go.' },
  ],
  order: [
    { id: 'mixed', title: 'Mixed', emoji: '🎲', text: 'Any order the case can serve.' },
    { id: 'party', title: 'Party order', emoji: '🎉', text: 'Big numbers for a group: “four …, three …”.' },
    { id: 'drinks', title: 'Drinks run', emoji: '🥤', text: 'Every order has a drink: small or large?' },
  ],
  walknav: [
    { id: 'mixed', title: 'Mixed', emoji: '🎲', text: 'Three places around town.' },
    { id: 'far', title: 'Long walk', emoji: '🗺️', text: 'Farther places: more turns, more landmarks.' },
  ],
  walksearch: [
    { id: 'mixed', title: 'Mixed', emoji: '🎲', text: 'Some in the open, some tucked away.' },
    { id: 'hidden', title: 'Hide and seek', emoji: '🙈', text: 'Only hidden places: under, inside, behind.' },
  ],
};

export const questsFor = (engine: string): Quest[] => QUESTS[engine] ?? QUESTS.tabletop;

export const questOf = (engine: string, id: string | undefined): Quest => questsFor(engine).find((q) => q.id === id) ?? questsFor(engine)[0];

/** Today's date (UTC+8, the players' local day) as YYYY-MM-DD. */
export function today(now = Date.now()): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

/** One seed per day and level: everybody plays the same Daily Challenge. */
export function dailySeed(level: string, day = today()): number {
  let h = 2166136261;
  for (const ch of `${day}|${level}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 2 ** 31;
}
