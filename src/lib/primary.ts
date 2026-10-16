import { createGameClient, type GameClient } from './game-client';

let primary: GameClient | null = null;

/** The local player's connection, shared by /play, /room and /watch so navigation keeps the session. */
export function getPrimaryClient(): GameClient {
  primary ??= createGameClient();
  return primary;
}
