<div align="center">

<img src="public/favicon.svg" width="92" alt="ObjectTalk logo" />

# ObjectTalk

**你说清楚，队友才能通关。**

双人 3D 英语**口语**游戏：一个人掌握目标，另一个人在 3D 世界里行动。<br/>
在书桌上找东西、在咖啡馆点单、**在小镇里边走边问路**、在卧室里找丢失的钥匙。

[![CI](https://github.com/wangzh12023/objecttalk/actions/workflows/ci.yml/badge.svg)](https://github.com/wangzh12023/objecttalk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A520.11-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![three.js](https://img.shields.io/badge/three.js-r185-000000?logo=three.js&logoColor=white)
![Hyper3D Rodin](https://img.shields.io/badge/3D-57%20个%20Rodin%20模型-9b7bf2)

[快速开始](#-快速开始) · [关卡](#-关卡) · [操作](#-操作) · [AI 搭档](#-ai-搭档agent) · [Scene Agent](#-scene-agent一句话生成整个关卡) · [技术架构](docs/ARCHITECTURE.md) · [Rodin 四级](docs/RODIN.md) · [English](README.md)

<img src="docs/images/city-walker.jpg" alt="Toy Town：问路者以第一人称在 3D 街道上行走" width="100%" />

</div>

## 💡 为什么做这个

AI 陪聊什么都能听懂，所以你**没有理由说清楚**。ObjectTalk 让“说不清”有直接后果：
**队友会走错路、端错咖啡、拿错火箭。**

- 🧭 一个人**知道**（目标物品 / 点单卡 / 地图 / 钥匙在哪），但不能动手；
- 🛠️ 另一个人在 3D 世界里**行动**，但看不到答案；
- 🔄 两人看到的世界不同：隔着桌子“左边”会反过来；在小镇里“左转”取决于**问路者**面朝哪里。

每局结束都有回放，教练**站在队友的角度**逐句检查，给出更清楚的说法，并估计你本局的口语水平（CEFR A1–C1）。

## 🚀 快速开始

```bash
git clone https://github.com/wangzh12023/objecttalk.git
cd objecttalk && npm install
npm run dev            # 打开 http://localhost:5173
```

无需 API Key 和数据库。创建房间、选关卡，再开一个浏览器窗口（或同一 Wi-Fi 下手机扫码）加入另一个角色。
一个人练习：选 **“I build, AI guides”**；只想看演示：打开 `/demo`（AI 对 AI）。

## 🗺️ 关卡

| | 关卡 | 掌握信息的一方 | 行动的一方 | 练习的英语 |
|---|---|---|---|---|
| 📚 | **Cozy Study 书房** | 🧭 Guide 看得到金色目标 | 🛠️ Builder 在桌上拿取、摆放 | next to / between / on YOUR left / closer to you |
| ☕ | **Corner Café 咖啡馆** | 🙋 顾客拿着点单卡 | 🧑‍🍳 店员从展柜取餐放到托盘 | Could I have two croissants and a large coffee? · Small or large? |
| 🏙️ | **Toy Town 小镇问路** | 🗺️ 导航员看地图 | 🚶 问路者 **WASD 在街道上行走** | Excuse me, how do I get to…? · Turn left at the bank |
| 🛏️ | **Messy Bedroom 卧室寻物** | 🤔 主人记得东西放在哪 | 🔦 寻找者在房间里走动、打开箱子 | under the bed · on top of the wardrobe · inside the toy box |
| 🎸 | **Music Room 音乐教室** ✨ | 🎼 乐队队长 | 🧰 搬运工 | 乐器词汇 + 视角（Scene Agent 生成） |
| 🍎 | **Fruit Market 水果市场** ✨ | 🛍️ 拿着购物清单的顾客 | 🧑‍🌾 摊主 | three peaches, two tomatoes, a large watermelon（Scene Agent 生成） |

✨ = 由 [Scene Agent](#-scene-agent一句话生成整个关卡) 调用 Hyper3D Rodin 全自动生成。每个关卡都有 Easy / Normal / Tricky：
Tricky 下 AI 搭档会故意犯典型错误（说 “go north”、从自己的角度描述、漏说杯型），训练你发现并纠正。

## 🎮 操作

点击一次 3D 画面即可锁定鼠标，**像 CS 一样**：移动鼠标就是转头，准星就是指针，点击即交互，`Esc` 释放鼠标。

| 按键 | | 按键 | |
|---|---|---|---|
| `W` `A` `S` `D` / 方向键 | 行走（小镇、卧室），`Shift` 跑 | `Space`（按住） | 说话（语音转文字） |
| 鼠标左键 | 拿起 · 放下 · 放上托盘 · 打开 | `Enter` | 改为打字 |
| `F` | 上餐（咖啡馆） | `1`–`6` | 当前角色的快捷短语 |
| `E` | 显示 / 隐藏任务卡 | `C` | 字幕开关（**默认关闭**） |
| `Tab` | 短语手册（含中文释义） | `T` | 完整对话记录 |
| `G` | 查看 AI 搭档的推理过程 | `L` | 物品标签 |

**语音优先**：读对方的文字不是口语练习，所以默认不显示字幕，只**听**对方说（AI 语音 / 朋友的语音转写），
可以点 👂 再听一遍、点 👁 只看这一句，或按 `C` 打开字幕。手机上支持拖动转视角和虚拟摇杆。

## 🤖 AI 搭档（Agent）

任何关卡都可以和 AI 搭档玩，或在 `/demo` 观看 **AI 对 AI**。AI 只知道自己角色该知道的信息，只通过对话交流。

- **LLM 工具调用 Agent**（填 `LLM_API_KEY` 即开启，默认 **DeepSeek-V4-Flash**，也支持 Claude）：每一轮都是一个有界的 Agent 循环（`server/agent/harness.ts`）：
  观察 → 调用**接地工具**（`describe_target`、`find_objects`、`route`、`add_to_tray`、`follow`、`go_to`…，直接读写权威游戏状态）→ `say`。
  **护栏**会从听者视角重新理解每一句话（问路时按问路者朝向检查左右），误导性的话会被退回让模型重说。有步数上限和超时，工具参数做 schema 校验，完整轨迹写入回放。
- **规则大脑**（始终可用、离线）：每个关卡都有对话状态（咖啡馆的点单票据与“小杯还是大杯？”、小镇里按路口计数执行指令、卧室里“上层还是下层？”），回答你真正问的问题、不重复同一句话，Claude 未开启或太慢时立刻接管。
- 按 `G` 打开 **AI brain** 面板，查看每轮由哪个大脑回答、调用了哪些工具及结果。

## 🏭 Scene Agent：一句话生成整个关卡

```bash
npm run agent -- level "music class"          # 或 "fruit market"、"science lab"…
```

规划（Claude 或离线关卡库：引擎、角色、短语手册、8–12 个物品）→ 参考图（Fluent Emoji 3D，自动摆正、1024²）→
审核（拼图；Claude 视觉审核）→ 生成（**Hyper3D Rodin Gen-2.5**：`RODIN_API_KEY`、官方 **Hyper3D CLI**，或交给装有 **Hyper3D MCP** 的编码 Agent）→
优化（~8 MB → ~300 KB）→ 校验（每个难度模拟 200 局，必须全部可解）→ 发布（`content/levels/<id>.json`，无需重启即出现在大厅）。
Music Room 和 Fruit Market 就是这样生成的：20 次 Rodin 生成，157 MB → 5.5 MB，全部校验 PASS。

## 🧊 Rodin 四级使用

| 等级 | ObjectTalk 中的实现 |
|---|---|
| **01 USE** | **57** 个 Rodin Gen-2.5 模型：书桌物品、咖啡馆菜单、小镇建筑与地标、卧室物品、装饰 |
| **02 BUILD** | 全部在 Claude Code 中通过 **Hyper3D MCP** 生成；仓库自带 `.mcp.json` 并启用官方 `rodin3d-skill` 插件；流程沉淀为 Skill（`new-level`、`new-object-pack`） |
| **03 CORE** | Object Studio 运行时调用 Rodin API：拍照生成你自己的游戏物品 |
| **04 AGENT** | **Scene Agent** 自动生成、校验并发布可玩的完整关卡 |

## ⚙️ 配置（全部可选）

复制 [`.env.example`](.env.example) 为 `.env`，然后运行 `npm run agent -- doctor` 检查（不消耗积分）：

| 变量 | 用途 |
|---|---|
| `LLM_API_KEY` + `LLM_BASE_URL` | 任意 OpenAI 兼容接口（DeepSeek、通义千问、GLM、Kimi 或聚合网关）：AI 搭档 Agent、教练与 CEFR、Scene Agent 规划与视觉审核 |
| `LLM_MODEL` / `LLM_COACH_MODEL` / `LLM_PLANNER_MODEL` / `LLM_VISION_MODEL` | 各任务模型，默认 `deepseek-v4-flash` / `deepseek-v4-pro` / `deepseek-v4-pro` / `qwen3.6-35b-a3b`（逗号分隔即备选） |
| `RODIN_API_KEY` | Rodin REST：Object Studio 实时生成 + Scene Agent 的 `rest` 后端 |
| `npm run agent -- login` | 登录官方 Hyper3D CLI（Scene Agent 的 `cli` 后端） |
| `PUBLIC_URL` | 部署后的二维码地址 |

画质可用 `?fx=off|low|high` 手动指定。

## 🧪 开发

```bash
npm run check          # 类型检查 + 62 个测试（引擎、NLU、Agent harness、AI 对 AI 模拟、真实 Socket.IO 对局）+ 构建
npm run agent          # Scene Agent 帮助
```

## 🙏 致谢

为 **上海科技大学 Techathon 2026** 制作。3D 模型由 [Hyper3D Rodin](https://hyper3d.ai) 生成，参考图来自 [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji)（MIT）。完整第三方清单见 [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md)。

[MIT License](LICENSE)
