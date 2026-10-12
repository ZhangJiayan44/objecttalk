---
name: new-object-pack
description: Generate a new themed pack of 3D objects for ObjectTalk with the Hyper3D Rodin MCP (image-to-3D), optimize it, register it in the game and validate playability. Use when asked to add objects, a new room theme, or "more Rodin assets".
---

# New object pack (Hyper3D MCP → ObjectTalk)

Rodin works best **image-to-3D**. Text-to-3D is weaker, so always start from a
reviewed reference image. Credits are limited: generate only approved references.

## 1. Plan
```bash
npm run agent -- plan "<theme>" --count 4      # writes agent/packs/<pack>.plan.json
```
Pick objects that are table-sized, iconic, easy to name in English, and visually distinct.

## 2. Source and review the references
```bash
npm run agent -- build <pack> --dry-run --yes  # downloads + prepares refs, writes review.png
```
Open `agent/packs/<pack>/review.png` and **look at it**. Reject any reference where:
- more than one object is visible, or the object is cropped
- the background is busy (transparent or plain white is ideal)
- the shape would become odd geometry (beams, shadows, text)
- the object is lying at an angle you don't want: set `rotate` in the plan

## 3. Generate with the MCP (or `build --yes` with RODIN_API_KEY)
For each approved `agent/packs/<pack>/<id>.png`:
1. `rodin_create_uploads` with `{filename, mime_type: "image/png", size_bytes}`
2. HTTP `PUT` the file to the returned `upload_url` (Content-Type: image/png)
3. `rodin_generate` with `reference_upload_ids: [upload_id]`, `tier: "Gen-2.5-High"`,
   `mesh_mode: "Raw"`, `quality_override: 20000`, `geometry_file_format: "glb"`,
   and a one-line `prompt` describing the object (helps the unseen back side)
4. `rodin_wait` until `completed`, then `rodin_get_result`
5. Download the `base_basic_pbr.glb` file

## 4. Register + validate
```bash
npm run agent -- register ./downloads/<id>.glb --id <id> --name "<name>" \
  --synonyms "<a>,<b>" --interest <space|animals|food|sports|games|everyday> \
  --color <base colour> --ref agent/packs/<pack>/<id>.png --generation <generation_id>
```
This optimizes (about 8 MB → 300 KB), copies into `data/models`, appends to `data/items.json`
and runs the playability simulator. Every difficulty must report **PASS**.

## 5. Record provenance
Add the generation id, prompt and reference to `assets/rodin/manifest.json`
(and `docs/THIRD_PARTY.md` if the reference image is new third-party material).
