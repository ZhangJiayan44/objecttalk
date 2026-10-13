# 5 分钟路演脚本 · ObjectTalk

> 硬时限 5:00。建议 4:30 结束，留缓冲。现场演示用 `/demo`（AI 对 AI）+ 一位队员现场第一人称操作。

| 时间 | 内容 | 画面 |
|---|---|---|
| 0:00–0:30 | **痛点**：学了十年英语，还是说不清“在银行左转”“我要两个可颂和一杯大杯咖啡”。AI 陪聊不在乎你说得清不清楚，没有开口的理由。 | 首页 Hero |
| 0:30–1:10 | **核心机制**：一个人掌握信息（目标 / 点单卡 / 地图 / 钥匙在哪），另一个人在 3D 世界里行动。说不清，队友就走错路、端错咖啡。六个日常场景关卡。 | 大厅关卡选择 |
| 1:10–2:20 | **现场演示 · Toy Town 问路**：队员第一人称 WASD 走在小镇里，“Excuse me, how do I get to the hospital?”；导航员看地图，必须按问路者朝向说 “turn left at the bank”。Tricky 难度下 AI 故意说 “go north”，问路者追问 “Is that left or right?”。 | 第一人称 + 地图双视角 |
| 2:20–2:55 | **AI 搭档会思考**：按 G 打开 AI brain：它听到了什么、调用了哪些接地工具、护栏如何拦下一句会误导对方的话。默认不显示字幕，只听不看，是真正的口语练习。 | Agent 面板 |
| 2:55–3:30 | **赛后教练 + CEFR**：逐句诊断（“north 对问路者没有意义”“饮料要说大小杯”），给出改写；估计本局口语水平 A1–C1；回放带移动轨迹。 | Results / Replay |
| 3:30–4:20 | **Rodin 四级**：L1 57 个 Rodin 模型撑起所有场景；L2 全部在 Claude Code 中经 Hyper3D MCP 生成，仓库内置 MCP 配置与官方 Rodin Skill；L3 Object Studio 运行时调用 Rodin API；L4 Scene Agent：一句 “fruit market” → 规划、参考图审核、20 次 Rodin 生成、优化、200 局模拟校验 → 新关卡上线。 | RODIN.md / 大厅里的 AI-made 关卡 |
| 4:20–5:00 | **愿景**：从展位 90 秒到课堂结对练习；老师说一个主题，Agent 就生成一个新的口语场景。扫码来玩！ | CTA + 二维码 |

## 演示 Checklist

- [ ] 笔记本：`npm run build && npm start`（或 `docker compose up`），浏览器打开 `http://localhost:8787/demo`
- [ ] 手机与笔记本连同一 Wi-Fi；Lobby 二维码会自动使用局域网地址
- [ ] 需要麦克风的手机：用 `npm run dev:https` 提供 HTTPS（自签证书，点“继续访问”）
- [ ] 断网备用：`/demo` AI 对 AI 全部本地运行（规则大脑 + 预置 Rodin 模型）
- [ ] 观众大屏：另开 `/watch/房间号`
- [ ] 显卡较弱时：地址后加 `?fx=low` 或 `?fx=off`

## 评委可能的问题

- **和 ChatGPT 语音陪练有什么区别？** 我们练的是“让对方做对一件事”的交际能力，结果可验证（队友有没有走到医院、端对咖啡），且错误能精确归因到视角、方位词、数量、介词。
- **AI 是不是预设台词？** 不是。每个关卡都有基于对话状态的规则大脑，会回答你真正问的问题；开启 Claude 后是带接地工具与护栏的工具调用 Agent，每一步推理都能在 AI brain 面板里看到，也写入回放。
- **Rodin 是核心还是装饰？** 物品就是游戏的词汇表：没有桃子和两种大小的西瓜，就没法练 “three peaches and a large watermelon”；Scene Agent 让一个新场景只需要一条命令。
