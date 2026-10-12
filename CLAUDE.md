# CLAUDE.md

Guidance for AI coding agents working on ObjectTalk.

## Commands
- `npm run dev`: server (tsx watch, :8787) + Vite client (:5173, proxies /api, /socket.io, /generated)
- `npm run check`: typecheck + vitest (unit + end-to-end socket tests) + production build
- `npm run agent -- validate`: playability simulation of the item catalog

## Architecture in one breath
`shared/` is the brain (spatial frames, referring-expression generation, rule NLU,
mission generator + validator, coach analysis) and is imported by both `server/`
(authoritative Socket.IO rooms, AI partner bots, Rodin + optional Claude services)
and `src/` (React + R3F client). The builder's client never receives the target;
keep that invariant in `Room.missionFor`.

## Rules of thumb
- New spatial wording? Add it to `shared/nlu.ts` **and** a case to `tests/nlu.test.ts`.
- New missions must stay solvable: run `npm test` (the simulator asserts >97% success).
- 3D assets: use the `new-object-pack` skill; never commit raw 8 MB Rodin exports.
- Claude is optional and opt-in (`ENABLE_LLM=1`); everything must still work offline.
