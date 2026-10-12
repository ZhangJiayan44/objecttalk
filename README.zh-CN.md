<div align="center">

<img src="public/favicon.svg" width="92" alt="ObjectTalk logo" />

# ObjectTalk

**你说清楚，队友才能通关。**

双人 3D 英语沟通游戏：一个人看得到目标，另一个人能操作物品，<br/>
而你们站在**桌子的两侧**：你的左边，就是队友的右边。

[![CI](https://github.com/wangzh12023/objecttalk/actions/workflows/ci.yml/badge.svg)](https://github.com/wangzh12023/objecttalk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A520.11-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![three.js](https://img.shields.io/badge/three.js-r185-000000?logo=three.js&logoColor=white)
![Hyper3D Rodin](https://img.shields.io/badge/3D-Hyper3D%20Rodin%20Gen--2.5-9b7bf2)

[快速开始](#-快速开始) · [玩法](#-玩法) · [技术架构](docs/ARCHITECTURE.md) · [Rodin 四级](docs/RODIN.md) · [提交说明](docs/SUBMISSION.md) · [English](README.md)

<img src="docs/images/duo.jpg" alt="单屏双人演示" width="100%" />

</div>

## 💡 为什么做这个

学了很多年英语，却说不清“把杯子放到红色书后面”。AI 陪聊什么都能听懂，所以你**没有理由说清楚**。
ObjectTalk 让“说不清”有直接后果：**队友会拿错**。

- 🧭 **Guide（向导）**：看得到金色目标，不能动手；
- 🛠️ **Builder（操作者）**：能移动物品，看不到目标；
- 🔄 两人面对面，所以 “on the left” 对两个人来说是两个地方。

一局 90 秒、3 个任务。结束后回放整局，教练**站在队友的角度**逐句检查，指出哪句话容易误解，并给出更清楚的说法。

## 🚀 快速开始

```bash
git clone https://github.com/wangzh12023/objecttalk.git
cd objecttalk && npm install
npm run dev            # 打开 http://localhost:5173
```

无需任何 API Key 和数据库。创建房间后再开一个浏览器窗口（或用同一 Wi-Fi 下的手机扫码）加入另一个角色即可。
一个人练习：选择 **“I build, AI guides”**。

<details>
<summary><b>生产部署 / Docker / 手机使用麦克风</b></summary>

```bash
npm run build && npm start           # 单进程运行于 http://localhost:8787
docker compose up --build            # 容器运行（数据卷持久化）
npm run dev:https                    # 自签 HTTPS，局域网手机才能使用麦克风
```

云端一键部署：仓库自带 [`render.yaml`](render.yaml)。部署后设置 `PUBLIC_URL`，二维码会指向你的域名。
</details>

## 🎮 玩法

| 模式 | 入口 | 适合 |
|---|---|---|
| 👫 和朋友玩 | `/play` → 创建房间，队友扫码 | 面对面或远程对局 |
| 🤖 和 AI 搭档 | `/play` → “I build, AI guides” / “I guide, AI builds” | 单人练习；Tricky 难度下 AI 会故意从自己的角度描述 |
| 🖥️ 单屏双人演示 | `/demo`（自动演示） | 路演、录屏、断网备用 |
| 📺 观众大屏 | `/watch/房间号` | 展位大屏：双视角并排 + 实时对话 |
| 📼 回放与教练 | `/replay/:id` | 赛后复盘，可切换双方视角 |
| ✨ Object Studio | `/studio` | 上传自己物品的照片，由 Rodin 生成 3D 物品进入关卡 |

**快捷键**：按住 `Space` 说话 · `E` 任务卡 · `Tab` 短语手册（含中文释义）· `L` 物品标签 · `Esc` 放回

## 🧠 核心技术

- **视角相关的空间语言引擎**（`shared/`）：桌面网格 + 每位玩家各自的坐标系；指代表达生成（REG）只保留从**听者视角**唯一指向目标的说法；规则语义解析（NLU）识别 *your/my*、*closer to you*、*between … and …* 以及含糊指代。
- **一套引擎驱动三件事**：任务生成（并经可玩性模拟：900 个任务 100% 可解）、两个 AI 搭档、赛后教练，所以 AI 的说法、系统认可的说法、教练表扬的说法始终一致。
- **协议层信息隔离**：服务端只把目标发给 Guide，Builder 的浏览器里根本没有答案。
- **离线优先**：规则引擎 + 预置 Rodin 模型 + 本地字体与光照，展位断网也能完整演示；Claude 仅作为可选兜底与个性化改写。

## 🧊 Rodin 四级使用

| 等级 | ObjectTalk 中的实现 |
|---|---|
| **01 USE** | 5 个 Rodin Gen-2.5 图生 3D 物品，优化后 39.8 MB → 1.44 MB（-96%） |
| **02 BUILD** | 在 Claude Code 中通过 Hyper3D MCP 生成，并沉淀为 `new-object-pack` Skill |
| **03 CORE** | Object Studio 运行时调用 Rodin API：拍照生成你自己的游戏物品 |
| **04 AGENT** | `npm run agent`：Scene Agent 规划 → 参考图 → 人工审核 → 生成 → 优化 → 注册 → 可玩性校验 |

## ⚙️ 配置（全部可选）

复制 [`.env.example`](.env.example) 为 `.env`：`RODIN_API_KEY` 开启实时生成；`ENABLE_LLM=1` + `ANTHROPIC_API_KEY` 开启 Claude 能力；`PUBLIC_URL` 用于部署后的二维码。

## 🧪 开发

```bash
npm run check          # 类型检查 + 测试（含真实 Socket.IO 对局）+ 构建
npm run agent -- validate   # 物品库可玩性模拟
```

## 🙏 致谢

为 **上海科技大学 Techathon 2026** 在 48 小时内完成。3D 物品由 [Hyper3D Rodin](https://hyper3d.ai) 生成，参考图来自 [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji)（MIT）。完整第三方清单见 [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md)。

[MIT License](LICENSE)
