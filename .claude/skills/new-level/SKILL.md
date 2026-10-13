---
name: new-level
description: Generate a whole new playable ObjectTalk level from a theme (plan, Fluent Emoji 3D references, review, Hyper3D Rodin image-to-3D, optimize, playability validation, publish). Use when asked for a new scene, a new level, a new room theme, or "more Rodin content".
---

# New level (Scene Agent v2 + Hyper3D)

A level is a theme + an engine + 6-12 Rodin objects + roles + a phrasebook.
Two engines can be generated: `tabletop` (find / place objects, spatial English)
and `order` (a shop counter: quantities, sizes, plurals). Rodin works best
**image-to-3D**, so every object starts from a reviewed reference image.

## 1. Plan + references + review
```bash
npm run agent -- level "<theme>" [--engine tabletop|order] [--id my-level]
```
- With an LLM configured (`LLM_API_KEY`: DeepSeek-V4-Pro plans, Qwen3.6 reviews; or Claude) the
  agent plans the level and reviews the reference contact sheet with vision; otherwise the offline
  level library is used. `npm run agent -- doctor` shows what is set up.
- Output: `agent/runs/<id>/plan.json`, `refs/*.png` (1024², transparent), `review.jpg`.
- **Look at `review.jpg` yourself.** Reject or fix references that show several
  objects, are cropped, or lie at an odd angle (set `rotate` in the plan, delete
  the ref and run again with `--id <id>`).

## 2. Generate with Hyper3D
The agent picks a backend automatically:

| backend | needs | what happens |
|---|---|---|
| `rest` | `RODIN_API_KEY` | the agent calls the Rodin API itself (`--yes` to spend credits) |
| `cli` | `npm run agent -- login` once (approve the code in the browser) | the agent drives the official Hyper3D CLI (same account as the MCP) |
| `handoff` | nothing | writes `agent/runs/<id>/HANDOFF.md` for a coding agent with the Hyper3D MCP |

With the **Hyper3D MCP** (this repo ships `.mcp.json`), for each approved reference:
1. `rodin_create_uploads` (batch up to 5) → HTTP `PUT` each PNG to its `upload_url`
2. `rodin_generate` with `reference_upload_ids`, `tier: "Gen-2.5-High"`, `mesh_mode: "Raw"`,
   `quality_override: 20000`, `geometry_file_format: "glb"` and the plan's prompt
3. `rodin_wait` → `rodin_get_result` → download `base_basic_pbr.glb` to `agent/runs/<id>/raw/<item>.glb`
4. `npm run agent -- level-add <id> <item> <generation_id>`

## 3. Finish
```bash
npm run agent -- level-finish <id>
```
Optimizes every GLB (~8 MB → ~300 KB), writes `public/models/levels/<id>/`,
simulates 200 rounds per difficulty (tabletop: every mission solvable; order:
every order servable and understood by the order parser) and publishes
`content/levels/<id>.json`. The running server picks it up without a restart:
it appears in the lobby under "Made by the Scene Agent".

## 4. Record provenance
Add the generation ids to `assets/rodin/manifest.json` (`levels` section).
