# Deploying ObjectTalk

ObjectTalk has two deploy targets. They run the same game code.

| | **GitHub Pages** (static) | **Full server** (Node) |
|---|---|---|
| URL | https://zhangjiayan44.github.io/objecttalk/ | your host, e.g. Render / a VPS / Docker |
| Solo with the AI partner | ✅ rule-based AI partners | ✅ rule brains + the LLM agent (DeepSeek / Qwen / Claude) |
| AI vs AI demo (`/demo`) | ✅ | ✅ |
| Two players on two devices | ❌ (no server to meet on) | ✅ QR code, LAN or internet |
| Coach, CEFR, replays | ✅ (replays stay in that browser) | ✅ + LLM coaching, shareable replay links |
| 中文求助 (Chinese lifeline) | ✅ offline glossary | ✅ DeepSeek, in context |
| Object Studio (photo → Rodin 3D) | ❌ library only | ✅ with `RODIN_API_KEY` |
| Secrets in the page | none | none (keys stay on the server) |

## GitHub Pages

`.github/workflows/pages.yml` builds and deploys on every push to `main`
(**Settings → Pages → Source: GitHub Actions**).

```bash
npm run build:pages     # → dist/pages (base /objecttalk/; PAGES_BASE overrides it)
```

How it works: the static build has no backend, so the real server modules
(`server/realtime.ts`, `server/game/*` (rooms, engines, AI partners) and the coach)
are bundled into the page and run behind an in-page Socket.IO hub
(`src/static/hub.ts`, `src/static/server.ts`). Node-only modules are swapped for
browser stand-ins (`src/static/shims`: no config, no LLM transport), the agent-made
levels from `content/levels` are baked in, and `404.html` is a copy of `index.html`
so deep links such as `/objecttalk/room/ABCD` load the app. No API key ever enters
the static bundle.

> **Private repositories:** GitHub Pages for a private repository needs a paid plan
> (GitHub Pro / Team / Enterprise). Even then a Pages site is **public** unless the
> repository belongs to an Enterprise organization that enables private (access-controlled)
> Pages. Anyone with the link can open the static demo; the source code stays private.

## Full server

```bash
npm run build && npm start             # http://localhost:8787
docker compose up --build              # same, in a container
```

One-click: [`render.yaml`](../render.yaml) (WebSockets supported). Set `PUBLIC_URL` so QR
codes point at your domain, and the keys from [`.env.example`](../.env.example) as
environment variables on the host (never in the repository).
