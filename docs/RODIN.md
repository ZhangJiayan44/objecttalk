# Rodin in ObjectTalk: all four levels

The Rodin Selected Award ranks projects by how deeply Rodin is used. ObjectTalk
uses it at every level, and each level is something you can run or inspect.

| Level | What it means | Where it is in ObjectTalk |
|---|---|---|
| **01 USE**: 3D assets in the project | Rodin-generated assets are used in the product | The 5 hero objects (rocket, teddy bear, cupcake, sneaker, game controller) in `public/models/`, rendered in every room, the landing page and Object Studio. |
| **02 BUILD**: MCP builds the product | The Hyper3D MCP is used inside the AI coding workflow | All 5 objects were produced from Claude Code through the Hyper3D MCP (`rodin_create_uploads` → PUT → `rodin_generate` → `rodin_wait` → `rodin_get_result`). The workflow is packaged as the Claude Code skill `.claude/skills/new-object-pack`. |
| **03 CORE**: the API is a core capability | The product calls the Rodin API at runtime | **Object Studio** (`/studio`): players upload a photo of their own object; the server calls `POST /api/v2/rodin` → `/status` → `/download`, optimizes the GLB and adds it to the catalog; it then appears on the table in their next round ("your things, in the game"). Code: `server/services/rodin.ts`, `server/services/studio.ts`. |
| **04 AGENT**: a 3D agent builds the project | An agent orchestrates 3D generation | The **Scene Agent** (`agent/cli.ts`): plan a themed pack (Claude or built-in library) → source references → human review gate → Rodin → optimize → register → **playability validation** (simulates hundreds of rounds; every mission must stay solvable). |

## How the 5 starter objects were made

1. **Reference search & review.** Web image search was unreliable from our network,
   so we used Microsoft Fluent Emoji 3D (MIT): single objects, transparent
   backgrounds, one consistent toy style. 16 candidates were reviewed
   (`assets/rodin/candidates.jpg`) and 5 chosen for distinct silhouettes, one per
   player interest (Space, Animals, Food, Sports, Games).
2. **Preparation.** The rocket was rotated 45° so it stands upright and the sneaker
   28° to level the sole; each image was trimmed, padded and Lanczos-upscaled to
   1024² with premultiplied alpha (`assets/rodin/review.jpg`).
3. **Generation.** Gen-2.5-High, Raw mesh, 20k faces, GLB (fast mode: each finished
   in under a minute), plus a one-line prompt to guide the unseen back side.
4. **Optimization.** `scripts/optimize-models.ts`: centre with the base at y = 0,
   normalize to 1 unit, WebP textures and meshopt geometry: **39.8 MB → 1.44 MB
   (−96.4 %)**, so a phone on venue Wi-Fi loads the whole set in seconds.
5. **Integration.** `shared/catalog.ts` holds names, synonyms (what players may
   call it), interest, base colour, footprint and orientation fixes (the controller
   is laid flat and re-seated automatically). Full provenance, including generation
   ids, prompts and sizes, is in `assets/rodin/manifest.json`.

## Why Rodin is the core of the game, not decoration

The objects are the vocabulary of the game. Each run fills the table from the
players' interests, and in Object Studio from their own photos, so learners
describe things they actually care about. The game can only teach "the small rocket
next to the lamp, on your left" because it has rockets, two sizes of them, and a
lamp to anchor them, all generated quickly enough to theme every round.
