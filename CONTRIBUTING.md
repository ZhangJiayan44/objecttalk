# Contributing to ObjectTalk

Thanks for helping people speak more clearly! 🎉

## Setup

```bash
npm install
npm run dev        # http://localhost:5173 (client) + :8787 (server)
npm run check      # run before every PR: typecheck + tests + build
```

## Good first contributions

- **New spatial phrases**: extend `shared/nlu.ts` and add a case to `tests/nlu.test.ts`.
- **New object packs**: follow `.claude/skills/new-object-pack/SKILL.md`; packs must pass
  `npm run agent -- validate`.
- **New missions**: add a generator in `shared/missions.ts`; the playability simulator
  in `tests/missions.test.ts` must stay above 97 % solvable.
- **Translations of the phrasebook** in `src/components/game/GameView.tsx`.

## Conventions

- TypeScript strict mode, no `any` in new code.
- Keep `shared/` dependency-free (it runs on both server and client).
- The builder must never receive the target: keep information filtering in `Room.missionFor`.
- UI follows the clay design tokens in `src/styles/index.css`.
