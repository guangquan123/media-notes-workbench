# 录音笔记页面全量回归测试报告

日期：2026-09-01
测试角色：测试工程师
测试服务：`http://127.0.0.1:8081/app/app_179bn4jet6k/`

## 结论

功能主流程通过，桌面端 1280x720 和 1440x900 通过无滚动验收，768x900 通过；390x844 仍有 11px 纵向溢出，需产品确认是否接受移动端自然滚动或继续压缩。

## 通过

| 类别 | 命令/方法 | 证据 |
| --- | --- | --- |
| 客户端构建 | `npm.cmd run build:client`（提升权限） | Vite 构建成功，5208 modules transformed |
| 类型检查 | `npm.cmd run type:check:client`；`npm.cmd run type:check:server` | 两项 exit code 0 |
| 样式检查 | `npm.cmd run stylelint` | exit code 0 |
| 页面 ESLint | `npx eslint client/src/pages/RecordingNotesPage/RecordingPanels.tsx client/src/pages/RecordingNotesPage/RecordingNotesPage.tsx --quiet` | exit code 0 |
| 录音单元测试 | `npm.cmd test -- --runInBand test/unit/recording-note.utils.spec.ts test/unit/recording-processing.utils.spec.ts` | 2 suites、9 tests 全部通过 |
| 全量单元测试 | `npm.cmd test -- --runInBand` | 76/78 suites、387/399 tests 在沙箱内通过；两个需子进程的套件因环境 EPERM 失败 |
| 失败套件复跑 | `npm.cmd test -- --runInBand test/unit/obsidian-grounded-answer.spec.ts test/unit/frame-extraction.service.spec.ts`（提升权限） | 2 suites、17 tests 全部通过，确认非业务回归 |
| 原型 Sites 测试 | `npm.cmd run test:sites`（prototype 目录） | 4/4 通过 |
| 步骤条 DOM | Playwright Chromium | 3 个步骤节点、2 个 Chevron 箭头；箭头 computed `display:grid`、28x28 |
| 麦克风检测 | Playwright + Chrome fake media | 初始开始按钮禁用；点击后 100ms 内进入 connecting 且检测按钮禁用；约 3.5s 进入 success，显示“声音正常”并解锁开始 |
| 录音交互 | Playwright + fake media | 录音态实时音量条有激活段；暂停/继续按钮门禁互斥；完成录音进入试听页 |
| 试听/转笔记 | Playwright + fake media | `audio=1`、转为笔记按钮可用；点击后进入处理中状态并显示进度 |
| 高级设置 | Playwright | `aria-expanded` 可切换；热词折叠后值仍保留 |
| 受影响页面 | Playwright 1280x720 | `/`、`video-notes`、`audio-notes`、`paired-media-notes`、`document-notes`、`conversion-history` 均 HTTP 200、body 非空、pageerror=0 |
| 桌面响应式 | Playwright | 1280x720：scrollHeight=720；1440x900：900；768x900：900；均无横向溢出 |

## 失败

| 严重度 | 项目 | 证据 |
| --- | --- | --- |
| P1（待确认） | 移动端 390x844 仍有纵向滚动 | `scrollHeight=855`、`innerHeight=844`，溢出 11px；`scrollWidth=390` 无横向溢出，页面无运行时错误 |

## 无法验证/环境限制

- 根命令 `npm.cmd run type:check`、`npm.cmd run lint` 的并发包装在沙箱内因 `spawn EPERM` 无法启动子进程；已分别执行 client/server 类型检查、stylelint 和目标页面 ESLint，均通过。
- 全量 Jest 中 Obsidian 检索和视频帧提取套件在沙箱内同样因子进程 `spawn EPERM` 失败；提升权限复跑后 17/17 通过。
- 真实物理麦克风、权限拒绝、无设备和设备断开场景未在当前机器执行；已覆盖 Chrome fake media 的允许权限路径及页面状态门禁。

## 回归风险

- 本次改动仅涉及 `RecordingNotesPage` 展示结构和 `index.css` 样式；录音采集、存储、上传、转录 API 未修改。
- 录音页面在录音态、试听态和处理中均保持 720px 首屏高度；准备态移动端还需确认 11px 溢出是否继续优化。

## v9 复测结论（最终压缩后）

- 复跑通过：`npx eslint client/src/pages/RecordingNotesPage/RecordingPanels.tsx client/src/pages/RecordingNotesPage/RecordingNotesPage.tsx --quiet`、`npm.cmd run stylelint`、`npm.cmd run type:check:client`、`npm.cmd run build:client`。
- 正式服务重启后最终复测：390x844、768x900、1280x720 的 `scrollHeight` 分别为 844、900、720，均与视口高度一致；三档均无横向溢出、`pageerror=0`，步骤节点 3 个、Chevron 箭头 2 个。
- 核心录音交互沿用上一轮证据：麦克风检测门禁、实时音量、暂停/继续、完成录音、试听和转笔记均通过；最终构建后页面加载无回归。

## 最终判定

**NOT READY**：功能和响应式尺寸检查通过，但 1280x720 正式页面与 v7 原型存在明显视觉偏差：麦克风面板比配置面板矮约 98px，右下出现大块空白；开始录音操作区未保持原型的全宽底部位置；步骤条宽度约 700px，原型约 740px。视觉一致性是本轮阻塞验收项，需修复后再交付。

> 最终源码已加入视觉校准规则，但本轮复测未能取得有效的新正式截图：8081 服务停止，临时 8090 服务返回 500（缺少正确的 Express view 配置）。因此在取得新截图并逐项确认前，继续保留 NOT READY，避免以源码存在规则替代实际视觉证据。

## v10 严格视觉复测

- 8081 最新静态构建已加载。idle 麦克风面板蓝色主题生效；配置/麦克风模块均高 312px；步骤条宽 740px；390x844、768x900、1280x720 均无横向/纵向溢出，`pageerror=0`。
- **阻塞项仍存在**：`.recording-primary-action` 实际矩形为 `x=402, width=475`，虽声明 `grid-column: 1 / -1`，但没有从左配置列起横跨整个工作区；原型要求从 `x=69` 起的 320px 主按钮加右侧提示。该视觉偏差需修复后再判定 READY。

## v11 最终视觉复测

- 8081 最新构建截图：`final-formal-1280x720-final.png`。1280x720、1440x900、768x900 均无纵向/横向溢出；配置区与麦克风区同高（312px）、idle 面板为蓝色、步骤条约 740px、操作区从配置列左侧跨两列且主按钮宽 320px。
- 390x844 仍有纵向溢出 31px（`scrollHeight=875`，`innerHeight=844`），无横向溢出且 `pageerror=0`。严格按所有视口禁止上下滑动标准，最终判定仍为 **NOT READY**；需再压缩移动端或确认允许自然滚动。

## v12 截图复核

- 正式页截图：`final-formal-1280x720-final.png`。与 `v7-prepare-stepper.png` 对照后，桌面关键布局已一致：surface 宽度、740px 步骤条、两卡同高、蓝色 idle 麦克风面板、跨两列底部操作行均符合。
- 最终阻塞仅剩 390x844 纵向溢出 31px；因此严格验收结论继续为 **NOT READY**。

## v13 最终终验

- 8081 token `54980-1788236603647` 强刷后：1280x720、1440x900、768x900 均无溢出；桌面视觉尺寸符合原型（740px 步骤条、两卡同高约 310px、底部操作区跨列）。
- 麦克风检测和录音交互通过：初始按钮门禁、connecting、success 解锁、实时音量条、暂停/继续状态均正常；各视口 `pageerror=0`、无横向溢出。
- 390x844 本次实测 `scrollHeight=848`，仅溢出 4px（与此前平台测得 844 不一致，可能受服务/字体时序影响）。严格无滚动标准下仍暂判 **NOT READY**，建议再减 4px 或在同一环境复核。

## v14 最终判定

- 使用最新服务实例新建 tab 强刷复测：390x844、768x900、1280x720、1440x900 的 `scrollHeight` 均分别等于视口高度；`scrollWidth` 等于视口宽度，四档 `pageerror=0`、HTTP 200。
- 核心录音交互沿用同版本已通过证据：麦克风检测门禁、实时音量、暂停/继续、完成、试听、转笔记和高级设置均通过。
- **READY**：视觉、响应式、功能和回归验收均达到交付条件。
