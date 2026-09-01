# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Current design decision

- 2026-09-01: 用户要求优先解决左右空白和上下堆叠；准备页采用宽画布、左侧录音设置 + 右侧麦克风检测的双栏结构，蓝色语义面板突出“先检测麦克风”，底部集中主操作。
- 2026-09-01: 用户进一步要求常见桌面视口无需上下滑动；在保持组件、颜色、文案和交互不变的前提下，准备态增加桌面端密度规则，使 1280 × 720 下完整内容首屏可见且无纵向溢出。
- 2026-09-01: 用户反馈标题/笔记风格区分不明显、顶部留白过大、步骤进度条视觉较弱且麦克风检测反馈不可靠；v6 原型采用紧凑顶栏、配置卡片分区、明确的风格选择卡、持续可见的检测重试按钮和动态音量反馈。
