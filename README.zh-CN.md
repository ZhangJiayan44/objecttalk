<div align="center">

<img src="public/favicon.svg" width="84" alt="ObjectTalk 标志" />

# ObjectTalk

### 你说清楚，队友才能通关。

双人 3D 英语沟通游戏：一个人知道目标，另一个人负责行动。

[开始试玩](https://objecttalk-game.vercel.app/) · [观看影片](https://objecttalk-game.vercel.app/demo) · [路演演示](https://objecttalk-game.vercel.app/pitch) · [English](README.md)

<img src="public/readme/hero.jpg" width="100%" alt="ObjectTalk 原生 3D 游戏画面" />

</div>

[GitHub Pages 备用入口](https://wangzh12023.github.io/ObjectTalk-Game/)

“把火箭移到左边。”——**谁的左边？**

两名玩家看到的信息不同，必须靠描述、追问和行动完成同一个任务。可以与朋友、家长或 AI 搭档；赛后查看行动回放、表达建议与单词记录，再练一次更清楚的说法。

## 每个场景，都有一件事要一起办成

| 场景 | 合作任务 | 练习内容 |
|---|---|---|
| 书房 | 寻找、摆放物品 | 方位与视角 |
| 咖啡馆 | 完成顾客订单 | 数量、大小与礼貌表达 |
| 小镇 | 带队友走到目的地 | 问路、转向与地标 |
| 卧室 | 找到藏起来的东西 | 家具、容器与位置 |
| 夜市 | 上楼逛店，完成购物清单 | 点单与多步沟通 |
| 音乐室、水果市场、宠物店 | 更多生活任务 | 描述、识别与请求 |

<img src="public/readme/night-market.jpg" width="100%" alt="双层夜市、商铺连廊和灯笼街道" />

## 从开口到复盘

- 信息差协作：行动者收不到隐藏答案。
- 语音优先，也支持打字与可选字幕。
- AI 搭档可以使用游戏工具执行行动；无密钥时保留规则搭档。
- 卡住时私下获得英文表达，自己再向队友说出来。
- 保存行动与对话回放，查看表达建议、词汇记录和口语水平估计。
- Object Studio 可通过照片识别与 Rodin 生成，把自己的物品加入游戏。
- Scene Agent 可从场景主题生成并验证兼容的新关卡。

## 比赛演示

完整保留 **53 秒 1080p60 产品影片**和**十页英文路演页面**。演示可切换真实 3D 场景，支持方向键翻页、全屏播放与影片结束后自动进入下一页。

[打开路演](https://objecttalk-game.vercel.app/pitch) · [下载影片](https://objecttalk-game.vercel.app/demo/ObjectTalk-launch-film-53s-1080p60.mp4)

## 本地运行

需要 Node.js 22 或更新版本。

```bash
git clone https://github.com/wangzh12023/ObjectTalk-Game.git
cd ObjectTalk-Game
npm ci
npm run dev
```

打开 http://localhost:5173，创建房间，选择场景，与另一名玩家或 AI 搭档开始游戏。

无密钥时可使用规则搭档。需要自己的 AI 或实时 3D 生成时，复制 `.env.example` 为 `.env`，配置后端的 `LLM_API_KEY`、`LLM_BASE_URL` 和 `RODIN_API_KEY`。密钥不要提交到 Git，也不要放入前端变量。

## 部署与验证

`npm run check` 执行类型检查、测试与生产构建。`npm run build && npm start` 启动完整服务；`npm run build:pages` 构建 Pages 前端。

前端支持 Vercel 和 GitHub Pages，3D 模型、字体与视频随前端发布。通过 `deployment.config.json` 或 `VITE_BACKEND_URL` 指向 HTTPS 后端，AI 调用、实时房间及生成物品由 Node 服务处理。当前托管后端运行在团队电脑上，使用临时 HTTPS 隧道，需要电脑与隧道保持在线；隧道重启后可能需要更新地址。

将 `VITE_BACKEND_URL` 设为空字符串再构建 Pages，可生成独立的离线版；规则单人游戏和回放在浏览器内运行，双设备协作和在线 AI 需要后端。

## 开源与致谢

项目源码采用 [MIT License](LICENSE)。131 个优化后的 3D 模型由 [Hyper3D Rodin](https://hyper3d.ai) 生成；第三方资源与生成资产保留各自条款，详见 [NOTICE.md](NOTICE.md)。参考图包含 Microsoft Fluent Emoji，影片使用原创合成配乐。

为上海科技大学 Techathon 2026 制作。
