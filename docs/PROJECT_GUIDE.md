# B站学习笔记助手：项目说明与维护手册

> 对应妙搭应用 `app_179bn4jet6k`，开发分支为 `sprint/default`。项目把 B站视频依次转换为音频、转录稿、Markdown 学习笔记和飞书在线文档。

## 1. 项目解决什么问题

很多 B站收藏最后只剩下一串链接。这个项目把机械步骤交给程序：用户粘贴视频地址，系统在本机下载和转录音频，再调用妙搭内置 AI 整理笔记，最后以当前登录用户的身份创建飞书文档。

项目不依赖 OpenAI API Key。音频转写使用本地 `whisper-cpp`，笔记生成使用妙搭插件 `@official-plugins/ai-text-generate`，飞书文档由 `lark-cli docs +create` 创建。

## 2. 系统架构

```mermaid
flowchart LR
    U[用户粘贴 B站链接] --> FE[React 页面]
    FE -->|POST /api/note-jobs| API[NestJS 任务服务]
    API --> YT[yt-dlp<br/>元数据与 MP3]
    YT --> FF[ffmpeg<br/>长音频切片]
    FF --> WH[whisper-cpp<br/>本地中文转写]
    WH --> AI[妙搭 AI 文本生成插件<br/>固定笔记模板]
    AI --> LC[lark-cli docs +create]
    LC --> DOC[飞书在线文档]
    API -->|任务状态| FE
    FE -->|可点击地址| DOC
```

### 2.1 分层说明

| 层 | 组件 | 责任 |
|---|---|---|
| 前端 | React、Vite | 收集视频地址和 Cookie 来源，展示环境状态、进度、错误与文档链接 |
| API | NestJS | 校验输入，创建任务，编排处理流水线，提供轮询接口 |
| 下载 | yt-dlp、ffmpeg | 读取元数据、提取 MP3，必要时按 20 分钟切片 |
| 转写 | whisper-cpp | 使用本地模型离线生成中文转录稿 |
| 总结 | 妙搭 AI 插件 | 按固定模板将转录稿整理成 Markdown |
| 发布 | lark-cli | 以当前飞书用户身份创建文档并返回 URL |

### 2.2 关键设计取舍

- 音频和转写留在本机，减少原始内容外传，也省去语音 API 成本。
- AI 只接收转录文本和视频元数据，不接收浏览器 Cookie。
- 任务状态保存在进程内存中，结构简单，适合个人本地工具；后端重启后任务记录会丢失。
- 每个任务使用独立临时目录，成功或失败都会在 `finally` 中清理。
- 前端每 1.8 秒查询一次任务状态，没有引入 WebSocket，调试成本较低。

## 3. 运行前提

### 3.1 平台与运行时

- macOS（当前实战环境）
- Node.js `>= 22`
- npm `>= 10`
- 可访问 B站、妙搭和飞书开放平台的网络
- 对目标视频拥有合法使用权限

当前验证环境为 Node.js 24.7.0、npm 11.5.1、yt-dlp 2026.06.09、FFmpeg 8.0、lark-cli 1.0.63。

### 3.2 本机命令

确保以下命令可在终端直接执行：

```bash
node --version
npm --version
yt-dlp --version
ffmpeg -version
whisper-cli --help
lark-cli --version
```

macOS 可使用 Homebrew 安装常见依赖：

```bash
brew install yt-dlp ffmpeg whisper-cpp
```

`lark-cli` 请按妙搭/飞书 CLI 的安装方式完成安装，不要把访问令牌写进仓库。

### 3.3 Whisper 模型

模型文件必须放在：

```text
models/ggml-base-q5_1.bin
```

当前模型约 57 MB。后端按 `process.cwd()` 拼接此路径，因此启动命令必须在项目根目录执行。

### 3.4 飞书身份与妙搭配置

检查用户身份：

```bash
lark-cli auth status --json --verify
```

项目元数据位于 `.spark/meta.json`，应用 ID 应为 `app_179bn4jet6k`。AI 插件实例位于：

```text
server/capabilities/bilibili-note-writer.json
```

项目使用 `@official-plugins/ai-text-generate@1.0.17`。`npm run dev` 会尝试同步妙搭环境和插件；同步失败时会按本地现状继续启动，因此首次运行前仍应确认 `.env.local` 和插件依赖完整。

## 4. 安装与启动

### 4.1 进入项目

```bash
cd "/Users/yangjie/YJ/codex_workspace/b站学习笔记项目/bilibili-notes-app"
npm install
```

### 4.2 检查端口

默认后端端口为 3000，本地前端使用 8081。启动前检查旧进程：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:8081 -sTCP:LISTEN
```

不要看到端口占用就直接杀进程。先确认它是否属于本项目，必要时在原终端用 `Control+C` 停止。

### 4.3 推荐启动方式

macOS 可以双击 `启动B站学习笔记助手.command`，也可以在项目根目录运行：

```bash
CLIENT_DEV_PORT=8081 npm run dev
```

访问：

```text
http://localhost:8081/app/app_179bn4jet6k/
```

如需分开启动：

```bash
# 终端 1
npm run dev:server

# 终端 2
CLIENT_BASE_PATH=/app/app_179bn4jet6k \
CLIENT_DEV_PORT=8081 \
npm run dev:client
```

后端 API 默认地址为 `http://localhost:3000`。

## 5. 使用步骤

1. 打开本地页面，确认顶部显示“本机处理环境已就绪”。
2. 粘贴 `bilibili.com` 或 `b23.tv` 视频地址。
3. 匿名访问失败时，选择一个已登录 B站的浏览器。
4. 点击“开始生成学习笔记”。
5. 页面依次展示“拉取音频、语音转文字、生成学习笔记、写入飞书”。
6. 任务完成后点击“打开飞书学习笔记”。
7. 人工检查专有名词、数字和转录不清的句子，再开始二次学习。

### 5.1 API

| 方法 | 地址 | 用途 |
|---|---|---|
| GET | `/api/note-jobs/readiness` | 检查五项本机依赖 |
| POST | `/api/note-jobs` | 创建任务 |
| GET | `/api/note-jobs/:id` | 查询进度和结果 |

创建任务示例：

```bash
curl -X POST http://localhost:3000/api/note-jobs \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.bilibili.com/video/BV1AycQzMEZh"}'
```

如需读取 Chrome 登录状态：

```json
{
  "url": "https://www.bilibili.com/video/BV1AycQzMEZh",
  "cookieBrowser": "chrome"
}
```

`cookieBrowser` 仅支持 `chrome`、`safari`、`edge`、`firefox`。

## 6. 一次任务内部发生了什么

```mermaid
sequenceDiagram
    participant User as 用户
    participant Web as React
    participant API as NestJS
    participant Local as yt-dlp/ffmpeg/Whisper
    participant AI as 妙搭 AI
    participant Lark as 飞书文档

    User->>Web: 提交视频地址
    Web->>API: POST /api/note-jobs
    API-->>Web: 返回 jobId
    API->>Local: 获取元数据并下载 MP3
    Local->>Local: 大于 24 MB 时按 1200 秒切片
    Local-->>API: 中文转录稿
    API->>AI: 转录稿 + 标题 + UP主 + 时长 + 日期
    AI-->>API: 固定结构 Markdown
    API->>Lark: lark-cli docs +create
    Lark-->>API: 文档 URL
    loop 每 1.8 秒
        Web->>API: GET /api/note-jobs/:id
        API-->>Web: 阶段、进度、消息
    end
    Web-->>User: 展示飞书文档入口
```

处理细节：

1. 后端检查 `yt-dlp`、`ffmpeg`、`whisper-cli`、模型文件和 `lark-cli`。
2. yt-dlp 使用 B站 Referer、Origin 和浏览器 User-Agent 获取元数据。
3. 下载阶段提取 MP3；文件超过 24 MB 时由 ffmpeg 按 1200 秒切片。
4. Whisper 使用 `--language zh --no-timestamps --no-prints --no-gpu` 转写。
5. 妙搭插件按固定模板生成 Markdown。没有讲到的章节必须写“本视频未展开”，不能补造案例。
6. `lark-cli docs +create` 从标准输入接收 Markdown，创建完成后返回文档地址。

## 7. 固定笔记模板

每篇笔记包含：基本信息、核心结论、知识结构、原理理解、方法步骤、实战案例、易错点、行动清单、复习问题、反思总结和补充信息。

模板把“视频明确结论”和“笔记建议”分开。课程宣传、福利和领取方式进入补充信息，避免盖过真正的知识内容。

修改模板时，同时检查：

- `paramsSchema` 中定义的变量是否全部在 `formValue.prompt` 中使用。
- Prompt 引用的 `{{input.xxx}}` 是否都在 `paramsSchema` 中定义。
- 后端 `pluginInput` 是否传入所有必填变量。
- 输出是否仍为纯 Markdown，不能带代码围栏。

## 8. 实战 Demo

测试视频：

```text
BV1AycQzMEZh
```

操作过程：

1. 在页面粘贴 `https://www.bilibili.com/video/BV1AycQzMEZh`。
2. 先选择“不使用登录状态”。
3. 点击生成，观察四个任务阶段。
4. 匿名状态下已验证可以读取元数据并下载 MP3。
5. 转录完成后，AI 将课程导论整理成固定结构。
6. 最终示例文档：`https://my.feishu.cn/docx/ZOTcdwv8RoNxcPxPJuocHbIDndf`

这段视频只有 2 分 49 秒，内容主要是课程介绍。新版模板不会硬凑“原理”和“实战”，而是明确标注本节未展开，并把课程福利移到补充信息。这正好验证了模板的边界控制。

## 9. 问题记录与复盘

### 9.1 B站 HTTP 412

现象：

```text
ERROR: [BiliBili] ... HTTP Error 412: Precondition Failed
```

原因是 B站风控拒绝了缺少浏览器特征或登录状态的请求。

处理：增加 Referer、Origin 和浏览器 User-Agent；为 yt-dlp 增加重试；支持从 Chrome、Safari、Edge、Firefox 读取 Cookie；先匿名尝试，失败后再让用户选择登录浏览器。

对应提交：`810f2fe fix: handle Bilibili HTTP 412`。

复盘：Cookie 是兜底，不应成为默认依赖。浏览器数据只在本机由 yt-dlp 读取，应用不保存。

### 9.2 8080 端口冲突

现象：启动时报 `EADDRINUSE`。

处理：本地前端改用 8081，启动脚本和访问地址同步调整。

对应提交：`25a53d2 fix: avoid occupied local dev port`。

复盘：文档必须把端口检查写在启动前。否则重复启动会制造“服务明明开着但新进程报错”的假故障。

### 9.3 应用路径进入 NotFound

现象：访问 `/app/app_179bn4jet6k/` 时命中 React Router 的 NotFound。

处理：Vite root 指向 `client`；修正 `client/index.html`；前端从当前 URL 自动识别 `/app/app_xxx` 作为 Router basename。

对应提交：

- `e78c064 fix: serve local app at configured base path`
- `184a4fb fix: resolve local app router base path`

复盘：平台应用通常不是部署在根路径 `/`。路由、静态资源和开发服务器必须使用同一 base path。

### 9.4 从 OpenAI API Key 改为妙搭内置 AI

处理：移除外部 Key 方案，改用 `CapabilityService` 调用 `bilibili-note-writer`。

对应提交：`1b5e691 feat: replace API key with built-in AI`。

复盘：平台已有模型能力时，优先复用统一鉴权和插件配置，减少个人密钥泄露及环境配置成本。

### 9.5 第一版笔记结构不适合复习

现象：摘要、课程介绍和福利信息混在一起；缺少原理边界、行动清单和复习入口。

处理：固化十一段式模板，要求无内容时如实说明，不允许为了填满章节编造事实。

复盘：好的笔记生成器不只“总结更多”，还要知道哪些内容不该写。边界控制比篇幅更重要。

## 10. 日志与故障排查

本地统一启动日志：

```text
logs/dev.std.log
```

只看后端：

```bash
grep '\[server\]' logs/dev.std.log
```

排查顺序：

1. 调用 `/api/note-jobs/readiness` 检查依赖。
2. 检查 3000 和 8081 端口。
3. 查看后端日志中的任务 ID 和命令 stderr。
4. 单独运行 yt-dlp 验证 B站访问。
5. 检查 Whisper 模型路径和权限。
6. 检查 `lark-cli auth status --json --verify`。
7. 校验妙搭插件实例 JSON 与后端输入字段。

## 11. 构建与质量检查

```bash
npm run type:check
npm run lint
npm run build:server
npm run build:client
```

修改 AI 配置后额外执行：

```bash
node -e "JSON.parse(require('fs').readFileSync('server/capabilities/bilibili-note-writer.json','utf8')); console.log('ok')"
```

## 12. 安全、合规与当前限制

- 仅处理你有权使用的内容，遵守 B站条款和著作权要求。
- 不提交 Cookie、访问令牌、`.env.local` 或音频临时文件。
- AI 生成笔记仍需人工核对，尤其是人名、术语、数字和代码。
- 当前任务存储在内存，服务重启后无法查询旧任务。
- 当前没有任务队列和并发限制，多人或批量使用时需要引入持久化队列。
- Whisper 固定为中文和 CPU 模式；其他语言、GPU 加速与模型切换尚未产品化。
- `lark-cli` 依赖本机用户登录态，不适合直接作为无人值守的多人服务。

## 13. 关键代码位置

| 文件 | 作用 |
|---|---|
| `server/modules/note-jobs/note-jobs.service.ts` | 完整任务编排 |
| `server/modules/note-jobs/note-jobs.controller.ts` | 三个后端接口 |
| `server/capabilities/bilibili-note-writer.json` | AI 插件与固定笔记模板 |
| `shared/api.interface.ts` | 前后端共享类型 |
| `client/src/pages/HomePage/HomePage.tsx` | 页面与任务进度 |
| `client/src/api/index.ts` | 前端 API 调用 |
| `client/src/index.tsx` | Router basename 处理 |
| `vite.config.ts` | Vite 客户端根目录 |
| `scripts/dev-local.js` | 环境同步、插件安装、前后端启动及日志 |

## 14. 后续演进建议

1. 增加任务持久化和并发队列，解决重启丢状态与资源争抢。
2. 保存转录稿和阶段产物，支持失败后从中间步骤重试。
3. 增加模型、语言和笔记模板选择。
4. 为 yt-dlp、Whisper、AI 和飞书发布分别记录耗时。
5. 增加后端单元测试与一条可重复的端到端测试。
6. 发布为多人服务前，重新设计飞书身份、权限和 Cookie 使用方式。

