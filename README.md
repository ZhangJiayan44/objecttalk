<div align="center">

<img src="public/favicon.svg" width="92" alt="ObjectTalk logo" />

# ObjectTalk

**Say it clearly, so your teammate can win.**

A two-player 3D game for **speaking** English. One player knows the goal, the other acts in the 3D world:<br/>
find things on a desk, order in a café, **ask for directions while walking through a town**, hunt for lost keys.

[![CI](https://github.com/wangzh12023/objecttalk/actions/workflows/ci.yml/badge.svg)](https://github.com/wangzh12023/objecttalk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A520.11-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![three.js](https://img.shields.io/badge/three.js-r185-000000?logo=three.js&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?logo=socket.io&logoColor=white)
![Hyper3D Rodin](https://img.shields.io/badge/3D-57%20Rodin%20Gen--2.5%20models-9b7bf2)
![Claude](https://img.shields.io/badge/AI-Claude%20agent%20(optional)-D97757?logo=anthropic&logoColor=white)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-ff8fb8.svg)](CONTRIBUTING.md)

[Quick start](#-quick-start) · [Levels](#-levels) · [Controls](#-controls) · [AI partner](#-the-ai-partner-agent) · [Scene Agent](#-scene-agent-whole-levels-from-a-theme) · [Architecture](docs/ARCHITECTURE.md) · [Rodin ×4](docs/RODIN.md) · [中文文档](README.zh-CN.md)

<img src="docs/images/city-walker.jpg" alt="Toy Town: the walker walks the 3D streets in first person and asks the navigator for directions" width="100%" />

</div>

## 💡 Why

Most speaking practice has no reason to be clear: an AI chat partner understands
anything. In ObjectTalk, unclear English has a visible cost: **your teammate walks
the wrong way, serves the wrong coffee, picks the wrong rocket.**

- 🧭 One player **knows** (the target, the order card, the map, where the keys are) but can't act.
- 🛠️ The other **acts** in the 3D world but never sees the secret.
- 🔄 They see the world differently: across a table *"left"* flips; in a town *"turn left"* depends on where the **walker** is facing.

Every round ends with a replay where a coach checks **every sentence from your
partner's point of view**, shows a clearer way to say it and estimates your
speaking level (CEFR A1 to C1).

## 🚀 Quick start

```bash
git clone https://github.com/wangzh12023/objecttalk.git
cd objecttalk && npm install
npm run dev            # open http://localhost:5173
```

No API keys, no database. Create a room, pick a level, then open a second window
(or scan the QR code with a phone on the same Wi-Fi) to join as the other player.
Playing alone? Choose **"I build, AI guides"**. Want to just watch? Open `/demo`.

<details>
<summary><b>Production / Docker / phones with microphones</b></summary>

```bash
npm run build && npm start           # one process on http://localhost:8787
docker compose up --build            # same, in a container (data persisted in a volume)
npm run dev:https                    # self-signed HTTPS so phones on Wi-Fi may use the mic
```

One-click cloud: the repo includes a [`render.yaml`](render.yaml) blueprint (WebSockets supported).
Set `PUBLIC_URL` so QR codes point at your domain.
</details>

## 🗺️ Levels

| | Level | The one who knows | The one who acts | English you practise |
|---|---|---|---|---|
| 📚 | **Cozy Study** | 🧭 Guide sees the gold target | 🛠️ Builder picks & places on the desk | *next to / between / on YOUR left / closer to you* |
| ☕ | **Corner Café** | 🙋 Customer holds the order card | 🧑‍🍳 Barista fills the tray from the display case | *Could I have two croissants and a large coffee? · Small or large? · Anything else?* |
| 🏙️ | **Toy Town** | 🗺️ Navigator has the map | 🚶 Walker **walks the streets** (WASD) | *Excuse me, how do I get to…? · Turn left at the bank · It's on your right* |
| 🛏️ | **Messy Bedroom** | 🤔 Owner remembers where things are | 🔦 Seeker **walks the room**, opens boxes | *under the bed · on top of the wardrobe · inside the toy box · warmer / colder* |
| 🎸 | **Music Room** ✨ | 🎼 Band leader | 🧰 Roadie | instrument words + perspective (made by the Scene Agent) |
| 🍎 | **Fruit Market** ✨ | 🛍️ Shopper with a list | 🧑‍🌾 Stallholder | *three peaches, two tomatoes, a large watermelon* (made by the Scene Agent) |

✨ = generated end to end by the [Scene Agent](#-scene-agent-whole-levels-from-a-theme) with Hyper3D Rodin.
Every level has *Easy / Normal / Tricky*: on Tricky the AI partner makes the classic learner mistakes
on purpose ("go north", describing things from its own side, forgetting a size) so you practise catching them.

| Cozy Study (first person) | Corner Café (customer) |
|---|---|
| <img src="docs/images/study.jpg" alt="Cozy Study" /> | <img src="docs/images/cafe.jpg" alt="Corner Café" /> |
| **Toy Town: the navigator's map** | **Messy Bedroom + AI partner brain** |
| <img src="docs/images/city-navigator.jpg" alt="Toy Town map" /> | <img src="docs/images/bedroom-agent.jpg" alt="Bedroom with the agent panel" /> |
| **Music Room (agent-made)** | **Fruit Market (agent-made)** |
| <img src="docs/images/music-room.jpg" alt="Music Room" /> | <img src="docs/images/fruit-market.jpg" alt="Fruit Market" /> |

## 🎮 Controls

Click the 3D view once and the mouse is yours, **CS-style**: moving the mouse turns your head,
the crosshair is your pointer, click to interact, <kbd>Esc</kbd> gives the mouse back to the page.

| Key | | Key | |
|---|---|---|---|
| <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows | walk (town, bedroom); <kbd>Shift</kbd> run | <kbd>Space</kbd> (hold) | talk (speech-to-text) |
| click | pick up · place · add to tray · open | <kbd>Enter</kbd> | type a message instead |
| <kbd>F</kbd> | serve the tray (café) | <kbd>1</kbd>–<kbd>6</kbd> | quick phrases for your role |
| <kbd>E</kbd> | show / hide the mission card | <kbd>C</kbd> | captions on / off (**off by default**) |
| <kbd>Tab</kbd> | phrasebook (with Chinese glosses) | <kbd>T</kbd> | full transcript |
| <kbd>G</kbd> | the AI partner's reasoning | <kbd>L</kbd> | object labels |

**Voice-first by design.** Reading your partner's text is not speaking practice, so captions are
off: you *hear* the AI (and your friend's transcribed speech), can replay any line with 👂,
peek at one line with 👁 or press <kbd>C</kbd> for captions. Phones get drag-to-look and an
on-screen joystick.

## 🤖 The AI partner (agent)

Play any level with an AI partner (or watch **AI vs AI** at `/demo`). Each partner only knows
what its role knows and only talks through the chat, like a human.

- **Claude tool-use agent** (opt-in, `ENABLE_LLM=1`): every turn runs a bounded agent loop
  (`server/agent/harness.ts`): observe the world → call **grounded tools** (`describe_target`,
  `find_objects`, `route`, `add_to_tray`, `follow`, `go_to`, …) that read and act on the
  authoritative game state → `say`. A **guardrail** re-reads every line from the listener's side
  (and checks directions against the walker's heading) and bounces misleading lines back to the
  model. Hard step limit and deadline, schema-checked tool inputs, full trace in the replay.
- **Rule brain** (always on, offline): dialogue state per level (ticket and "small or large?" in
  the café, step execution with corner counting in the town, "the top shelf or the bottom shelf?"
  in the bedroom), answers the question you actually asked, never repeats itself verbatim, and
  takes over instantly whenever Claude is off or slow.
- Open the **AI brain** panel (<kbd>G</kbd>) to see which brain answered, every tool call and result.
- Simulation tests run AI vs AI on every level and difficulty: all missions complete.

## 🏭 Scene Agent: whole levels from a theme

```bash
npm run agent -- level "music class"          # or "fruit market", "science lab", anything
```

`plan` (Claude or the offline library: engine, roles, phrasebook, 8–12 objects) → `source`
(Fluent Emoji 3D references, rotated upright, 1024²) → `review` (contact sheet; Claude vision
rejects bad references) → `generate` (**Hyper3D Rodin Gen-2.5** via `RODIN_API_KEY`, the official
**Hyper3D CLI**, or a hand-off to a coding agent with the **Hyper3D MCP**) → `optimize` (~8 MB →
~300 KB) → `validate` (200 simulated rounds per difficulty must all be solvable) → `publish`
(`content/levels/<id>.json`, live in the lobby without a restart). Music Room and Fruit Market
were made this way: 20 Rodin generations, 157 MB → 5.5 MB, every check PASS.

## 🧊 Rodin at every level

| Level | In ObjectTalk |
|---|---|
| **01 USE** | **57** Rodin Gen-2.5 models: desk objects, café menu, town buildings & landmarks, bedroom belongings, decor |
| **02 BUILD** | All produced through the **Hyper3D MCP** inside Claude Code; the repo ships `.mcp.json` and enables the official `rodin3d-skill` plugin; workflows packaged as skills (`new-level`, `new-object-pack`) |
| **03 CORE** | Object Studio calls the Rodin API at runtime: your photo becomes a game object |
| **04 AGENT** | The **Scene Agent** generates, validates and publishes whole playable levels |

Provenance (every generation id, prompt, reference): [`assets/rodin/manifest.json`](assets/rodin/manifest.json) · write-up: [docs/RODIN.md](docs/RODIN.md)

## ⚙️ Configuration

Everything is optional. Copy [`.env.example`](.env.example) to `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Server port (production) |
| `PUBLIC_URL` | (none) | Base URL used in QR codes when deployed |
| `RODIN_API_KEY` | (none) | Live generation in Object Studio and the Scene Agent |
| `ENABLE_LLM` + `ANTHROPIC_API_KEY` | off | Claude agent for the AI partner, coaching + CEFR, agent planning & vision review |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model for all Claude calls |
| `LLM_BASE_URL` | (none) | Anthropic-compatible gateway (plain Messages API, no betas) |
| `LLM_PARTNER` | on | Set `0` to keep Claude for coaching only |
| `ICE_SERVERS` | public STUN | WebRTC voice link (add TURN for strict networks) |

Graphics: `?fx=off|low|high` overrides the automatic post-processing level (remembered per browser).

## 🧪 Development

```bash
npm run check          # typecheck + 62 tests (engines, NLU, agent harness, AI-vs-AI sims, real Socket.IO games) + build
npm test               # vitest
npm run agent          # Scene Agent help
```

```
shared/   language engines (no dependencies): room/spatial/reg/nlu/missions (study),
          cafe, city, bedroom, levels, coach, cefr, analysis
server/   Express + Socket.IO: Room + level engines, AI partners (rule brains + Claude agent harness),
          Rodin, Object Studio, agent-made level store
src/      React 19 + React Three Fiber: first-person controls, 4 scenes + env kit, voice-first HUD, replay
agent/    Scene Agent CLI: whole levels (v2) and object packs (v1), Hyper3D REST / CLI / MCP hand-off
content/  published agent-made levels
tests/    vitest: engines, NLU, agent harness, AI-vs-AI simulations, end-to-end games
```

## 🙏 Acknowledgements

Built for **ShanghaiTech Techathon 2026**. 3D models by [Hyper3D Rodin](https://hyper3d.ai);
reference art from [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT);
UI style inspired by a playful claymorphism template; 2D-over-3D interaction inspired by
[medkit](https://github.com/bedriyan/medkit-app). Full list: [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md).

Released under the [MIT License](LICENSE).
