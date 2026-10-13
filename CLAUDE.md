# CLAUDE.md

Guidance for AI coding agents working on ObjectTalk.

## Commands
- `npm run dev`: server (tsx watch, :8787) + Vite client (:5173, proxies /api, /socket.io, /generated)
- `npm run check`: typecheck + vitest (unit + end-to-end socket tests) + production build
- `npm run agent -- validate`: playability simulation of the item catalog

## Architecture in one breath
`shared/` is the brain: one language engine per level (study: spatial/reg/nlu/missions;
`cafe.ts`, `city.ts`, `bedroom.ts`) plus the coach (`analysis.ts`, `coach.ts`, `cefr.ts`).
`server/` runs authoritative Socket.IO rooms; level rules live in `server/game/engines/*`
behind `LevelEngine`, AI partners in `server/game/bots/*` (rule brains) and
`server/agent/*` (LLM tool-use harness, OpenAI-compatible or Claude, with a `vetSay` guardrail). `src/` is the
React + R3F client (first-person controls, one scene per level, voice-first HUD).
`agent/` is the Scene Agent (whole levels → `content/levels`).
Information asymmetry is enforced per viewer in each engine's `missionFor` / `world`:
the acting player never receives the secret.

## Rules of thumb
- New spatial wording? Add it to `shared/nlu.ts` **and** a case to `tests/nlu.test.ts`.
- New missions must stay solvable: run `npm test` (the simulator asserts >97% success).
- New level from a theme: use the `new-level` skill (`npm run agent -- level "<theme>"`).
- 3D assets: use the `new-object-pack` skill; never commit raw 8 MB Rodin exports.
- AI partner changes: keep the rule brain working offline, and run `tests/sim.test.ts` (AI vs AI on every level).
- The LLM is optional (`LLM_API_KEY` for DeepSeek/Qwen via an OpenAI-compatible API; Claude needs `LLM_PROVIDER=anthropic` + `ENABLE_LLM=1`); everything must still work offline. Tests never read `.env`.
- `npm run agent -- doctor` checks the LLM, the Rodin key and the Hyper3D CLI without spending credits.
