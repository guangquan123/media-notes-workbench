# 转录引擎双模式设计方案

## 1. 结论

建议把“转录引擎”拆成两个彼此独立的配置实体，在同一个页面提供统一选择入口：

- `腾讯云 ASR`：沿用现有配置、接口、COS 上传和连通性测试逻辑，不改字段语义。
- `自定义 API`：新增独立配置，按标准 HTTP API 调用；支持地址、密钥、请求参数和响应字段映射。
- 同一时间只允许一个云端引擎作为“当前启用引擎”；本地 Whisper 仍作为现有本地能力，不与云端配置互相覆盖。

推荐原型方向是“**双栏引擎台**”：顶部先选引擎，下面只展开当前引擎的配置，右侧固定展示连接测试与数据流向。这样既能让用户快速切换，又不会把腾讯参数和自定义参数混在一起。

## 2. 当前代码证据与边界

当前页面 `client/src/pages/TranscriptionSettingsPage/TranscriptionSettingsPage.tsx` 只读取和更新 `TencentAsrSettings`，包含 SecretId、SecretKey、COS 地域、COS 桶、ASR 地域、模型和说话人分离。页面的测试按钮调用腾讯专用连通性接口。

共享类型 `shared/api.interface.ts` 当前的 `NoteJob.transcriptionProvider` 只有 `tencent_asr`、`local_whisper`、`mixed`。因此本次设计先不改代码和数据库，先确定新增 provider 与配置契约；进入开发时再按接口先行、数据库后实现的项目规范落地。

现有页面和设置截图采用浅灰背景、白色内容面板、黑色激活导航、蓝色/青绿色强调色。本方案沿用这套视觉语言。

## 3. 信息架构

```text
设置
└── 转录引擎
    ├── 当前引擎选择
    │   ├── 腾讯云 ASR
    │   └── 自定义 API
    ├── 当前引擎配置
    │   ├── 腾讯云配置（原有字段，原样保留）
    │   └── 自定义 API 配置（新增字段）
    ├── 连接测试
    └── 使用说明 / 数据流向 / 安全提示
```

页面职责只做三件事：选择、配置、测试。转录任务详情页只显示“本次使用的引擎”，不重复显示密钥或配置表单。

## 4. 自定义 API 最小配置契约

### 必填字段

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| 引擎名称 | 用户可读名称 | `公司内部 ASR` |
| API 地址 | HTTPS endpoint；开发环境可允许 localhost | `https://asr.example.com/v1/transcribe` |
| HTTP 方法 | MVP 先支持 POST | `POST` |
| 鉴权方式 | `Bearer` 或自定义 Header | `Bearer Token` |
| API 密钥 | 页面只显示掩码，服务端保存 | `••••••••••••` |
| 模型 | 传给服务端的模型标识 | `general-cn` |
| 音频格式 | 上传内容格式 | `wav / mp3 / m4a` |
| 语言 | 默认 `zh-CN`，支持 `auto` | `zh-CN` |

### 高级字段

| 字段 | 说明 |
| --- | --- |
| 自定义 Header | JSON key-value；禁止输入 `Host`、`Content-Length` 等受保护 Header |
| 请求模式 | `multipart/form-data`（MVP 推荐）或 JSON + 音频 URL |
| 文件字段名 | 默认 `file` |
| 模型字段名 | 默认 `model` |
| 响应文本路径 | 例如 `data.text`、`result.transcript` |
| 时间戳路径 | 可选，例如 `data.segments` |
| 说话人路径 | 可选，例如 `data.speakers` |
| 超时 | 5-120 秒，默认 60 秒 |

MVP 不建议开放任意脚本转换。字段映射足以覆盖大多数兼容 API，同时避免把用户输入变成服务端执行代码。

## 5. 后端分层建议（开发阶段）

```text
TranscriptionProviderResolver
├── TencentAsrTranscriptionService  ← 现有实现，保持原调用链
├── CustomApiTranscriptionService   ← 新增 HTTP 适配器
└── LocalWhisperTranscriptionService ← 现有本地实现
```

统一内部接口建议为：

```ts
interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
  testConnection(): Promise<ConnectionTestResult>;
}
```

解析流程：任务读取 `transcriptionProvider` → resolver 选择实现 → 适配器返回统一的文本、时间戳、说话人和原始响应摘要。腾讯适配器的行为不迁移、不重写，避免回归风险。

建议新增 provider 值：`custom_api`。原有 `tencent_asr`、`local_whisper`、`mixed` 保持兼容；旧任务记录继续按旧值读取。

## 6. API 端点建议

保留现有腾讯接口不变，新增独立命名空间：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/transcription/custom-api` | 返回脱敏后的当前配置 |
| PUT | `/api/transcription/custom-api` | 保存自定义 API 配置 |
| POST | `/api/transcription/custom-api/test` | 使用临时配置或已保存配置测试 |
| PATCH | `/api/transcription/provider` | 切换当前启用引擎 |

测试接口应返回：`connected`、`latencyMs`、`checkedAt`、`message`、`responseShapeValid`。禁止返回密钥、完整请求 Header、音频内容和第三方完整响应。

## 7. 安全与可靠性要求

- 密钥只在服务端保存，页面回显为掩码；日志只记录 provider、host、状态码、耗时和 requestId。
- API 地址做 SSRF 防护：生产环境默认仅允许 `https`；禁止访问云元数据地址、环回地址和内网保留地址，开发环境单独放行 localhost。
- 自定义 Header 做名称黑名单和大小限制；总 Header 数量、请求体大小和超时均设上限。
- 测试连接使用一段内置短音频或无音频健康请求，不上传真实用户录音。
- 连接测试失败不能覆盖“配置已保存”；保存状态、启用状态、测试状态独立展示。
- 切换引擎只影响新任务；进行中的任务继续使用创建时记录的 provider，避免中途变更。
- 自定义 API 不可用时，不要静默改写为腾讯或本地；任务应明确失败并提供“切换引擎 / 重试”。

## 8. 三套原型方向

### A. 双栏引擎台（推荐）

顶部使用两个大型互斥选择项，下面左侧编辑、右侧测试。优点是最适合已有设置页，用户能同时看到配置和数据流向；缺点是桌面宽度较小时需要纵向堆叠。

### B. 配置卡片总览

先展示腾讯云 ASR、自定义 API 两张状态卡，卡片上直接显示“已配置 / 未配置 / 当前使用”。点击卡片后在下方展开编辑区。优点是适合以后增加第三个引擎；缺点是首次配置需要多一步展开。

### C. 三步向导

步骤 1 选择引擎，步骤 2 填配置并测试，步骤 3 确认启用。优点是新手引导强、能在每一步做校验；缺点是熟练用户切换成本高，不适合作为日常设置主界面。

本仓库新增的本地原型同时展示三种方向，默认打开 A 方案。

## 9. 验收标准（开发前冻结）

- 原腾讯设置可读取、保存、测试、启停，行为与改造前一致。
- 新增自定义 API 后，未配置或测试失败时不能被选为当前引擎。
- 切换引擎不要求重复填写另一引擎的密钥。
- 页面不回显 SecretKey/API Key；日志和错误提示不泄露密钥。
- 新任务记录实际使用的 provider；旧任务可正常打开。
- 自定义 API 至少支持 multipart POST + Bearer Token + `data.text` 响应映射。
- 测试失败、超时、非 2xx、响应字段缺失分别有可理解的错误提示。

## 10. 回滚方案

开发时采用“新增适配器 + 新增配置接口 + 最后接入 resolver”的顺序。若自定义 API 出现问题，可关闭 `custom_api` provider 路由并继续使用现有腾讯接口；旧字段、旧接口和旧任务记录无需迁移或回写。

## 11. 本轮简化版决策

根据评审反馈，首版界面不暴露通用 HTTP 适配器的高级参数，只保留：

- 引擎选择：腾讯云 ASR / 自定义 API。
- 自定义 API 地址。
- API Key。
- 模型下拉框，以及“刷新模型”。
- 测试连接、保存并启用。

Bearer Token 作为默认鉴权方式，音频格式、请求字段、响应映射、超时、自定义 Header 等参数先由适配器内部固定，不在用户页面配置。只有实际接入多个协议后，才考虑把这些字段放进“高级设置”。

简化版原型见 `artifacts/transcription-engine-prototype-simple.html`。
