# Rodin in ObjectTalk: all four levels

The Rodin Selected Award ranks projects by how deeply Rodin is used. ObjectTalk
uses it at every level, and each level is something you can run or inspect.

| Level | What it means | Where it is in ObjectTalk |
|---|---|---|
| **01 USE**: 3D assets in the project | Rodin-generated assets are used in the product | **57 Rodin Gen-2.5 models** across 6 levels: desk objects, the café menu (with small/large drinks), Toy Town's buildings and landmarks (bank, hospital, school, post office, hotel, museum, 24-hour shop, house, fountain, trees, traffic lights, bus stop), bedroom belongings, decor, plus the 20 objects of the two agent-made levels. `public/models/`. |
| **02 BUILD**: MCP builds the product | The Hyper3D MCP is used inside the AI coding workflow | Every model was produced from Claude Code through the **Hyper3D MCP** (`rodin_create_uploads` → PUT → `rodin_generate` → `rodin_wait` → `rodin_get_result`). The repo ships the MCP config (`.mcp.json`), enables the official **`rodin3d-skill`** plugin from `DeemosTech/rodin3d-skills` (`.claude/settings.json`), and packages our workflows as project skills: `.claude/skills/new-level` and `.claude/skills/new-object-pack`. |
| **03 CORE**: the API is a core capability | The product calls the Rodin API at runtime | **Object Studio** (`/studio`): players upload a photo of their own object; the server calls `POST /api/v2/rodin` → `/status` → `/download`, optimizes the GLB and adds it to the catalog; it appears on the desk in their next round. Code: `server/services/rodin.ts`, `server/services/studio.ts`. |
| **04 AGENT**: a 3D agent builds the project | An agent orchestrates 3D generation | The **Scene Agent v2** (`agent/level.ts`) turns a theme into a **whole playable level**: plan (Claude structured output or offline library) → Fluent references → contact sheet + Claude vision review → Rodin (REST, **Hyper3D CLI**, or hand-off to an MCP coding agent) → optimize → **playability simulation** → publish to `content/levels/`, live in the lobby without a restart. **Music Room** and **Fruit Market** were made this way. |

## Three waves of generation

| Wave | What | Models | Reference review |
|---|---|---|---|
| 1 | Hero objects for the first table | 5 | `assets/rodin/candidates.jpg`, `assets/rodin/review.jpg` |
| 2 | Everything the new levels need: desk & bedroom belongings, café menu, town buildings & landmarks, decor | 32 | `assets/rodin/review-wave2.jpg` |
| 3 | Two whole levels from the Scene Agent | 20 | `assets/rodin/review-music-room.jpg`, `assets/rodin/review-fruit-market.jpg` |

All 57 generation ids, prompts and references are in [`assets/rodin/manifest.json`](../assets/rodin/manifest.json);
every one opens at `https://hyper3d.ai/workspace/rodin/<id>`.

## How a level is generated (wave 3, end to end)

```bash
npm run agent -- level "fruit market" --backend handoff
```

1. **Plan.** Without Claude the offline library picked *Fruit Market* (order engine): roles,
   quick phrases, a phrasebook with Chinese glosses, and 12 items, each naming a Microsoft
   Fluent Emoji 3D folder as its reference and a one-line prompt for the unseen back side.
2. **Source + review.** References were downloaded, trimmed, rotated upright where needed
   (carrot +45°, pineapple +25°, trumpet +35°, microphone −45°) and upscaled to 1024² with
   alpha. The contact sheet was reviewed by eye (Claude vision does this when enabled), two
   references were re-oriented and re-sourced, then all 20 were approved.
3. **Generate.** No API key on this machine, so the agent wrote `HANDOFF.md`; Claude Code ran
   it with the Hyper3D MCP: 4 batched `rodin_create_uploads`, 20 parallel PUTs, 20
   `rodin_generate` calls (Gen-2.5-High, Raw, 20k faces, GLB; fast mode, about three minutes
   for the whole batch), `rodin_wait`, `rodin_get_result`, download, then
   `npm run agent -- level-add <level> <item> <generation_id>` for each.
4. **Finish.** `npm run agent -- level-finish fruit-market` optimized 94.6 MB → 3.06 MB,
   simulated 200 rounds per difficulty (every generated order servable from the stall **and**
   understood by the order parser) and published the level. The Music Room (tabletop engine)
   went 62.8 MB → 2.40 MB with every mission solvable on all difficulties.

The same pipeline runs unattended with `RODIN_API_KEY` (REST) or after `npx @hyper3d/cli auth login`
(the official Hyper3D CLI, same account and credits as the MCP): `npm run agent -- level "<theme>" --yes`.

## Why Rodin is the core of the game, not decoration

The objects are the vocabulary of the game. You can only practise *"Could I have three peaches
and a large watermelon?"* if the stall has peaches and two sizes of watermelon; *"turn left at
the hospital"* needs a hospital on the corner; *"my keys are on top of the wardrobe"* needs keys.
Rodin makes it cheap to give every everyday situation its own set of real, recognisable objects,
and the Scene Agent makes a new situation one command away.
