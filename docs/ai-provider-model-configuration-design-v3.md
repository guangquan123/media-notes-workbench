# 模型服务提供者与转录模型配置方案 v3

## 1. 方案结论

将配置拆成三个连续但独立的页面：

```text
模型服务提供者  →  模型配置  →  转录设置
地址、API Key       转录模型 / LLM       API 大模型 / 腾讯 ASR
```

用户先维护可以复用的 API 连接，再为两种能力选择模型，最后在新建转录任务时决定本次走 API 大模型还是腾讯 ASR 资源包。腾讯配置仍然在转录设置页内展开，不要求用户跳转到另一个配置页面。

原型文件：`artifacts/ai-provider-model-transcription-prototype-v3.html`

## 2. 页面与交互

### 2.1 模型服务提供者

- 支持多个提供者，每个提供者保存名称、API 地址、API Key。
- 列表显示地址和 Key 掩码，不显示明文密钥。
- 新增和编辑使用同一个轻量弹层；删除前需要二次确认（原型仅展示删除入口）。
- 首版按 OpenAI 兼容协议接入，模型列表由服务端调用提供者的 `/models` 或预置列表返回。

### 2.2 模型配置

页面有两个能力块：

- **转录模型**：先选模型服务提供者，再选该提供者下的转录模型。
- **LLM 总结模型**：先选模型服务提供者，再选该提供者下的总结模型。

两个下拉框相互独立，因此同一个提供者可以分别使用 `paraformer-v2` 和 `qwen-plus`，也可以让两种能力使用不同提供者。页面底部展示当前组合，便于保存前核对。

### 2.3 转录设置

本页只保留两个互斥方式：

1. **API 大模型**：直接使用“模型配置”中保存的转录模型，不重复填写地址和密钥。
2. **腾讯 ASR 资源包**：沿用现有腾讯配置；在本页展开原有 SecretId、SecretKey、COS、地域、识别引擎和说话人分离字段并保存。

选择方式后，任务卡片显示实际服务和模型，例如：

- `API 大模型 · 公司内部模型 API · paraformer-v2`
- `腾讯 ASR 资源包 · 16k_zh_en_2.0`

新任务在创建时固化服务和模型；进行中的任务和历史任务不随全局配置改变。

## 3. 影响分析

| 范围 | 影响与建议 | 风险 |
| --- | --- | --- |
| 设置导航 | 新增“模型服务提供者”“模型配置”“转录设置”三个 section；旧的 `model-settings` 与腾讯入口保留兼容跳转 | 中 |
| 共享类型 | 新增 `ModelServiceProvider`、`ConfiguredModel`、`AiModelSettings`；`transcriptionProvider` 增加 `custom_api`，任务增加 `transcriptionModel` | 中 |
| 提供者存储 | 新增 provider 配置存储，Key 仅服务端读取；旧 `.external-model-config.json` 继续读取 | 高 |
| 模型列表 | 新增按 provider 获取模型的接口；不同厂商不支持 `/models` 时使用服务端预置列表或手动刷新失败提示 | 中 |
| 自定义 ASR | 新增独立 `custom_api` 适配器，不能把腾讯适配器改成通用分支；统一返回文本、时间戳、说话人和原始响应摘要 | 高 |
| LLM 流水线 | `NoteSummaryPipelineService` 从模型配置读取 `summaryModel` 的 provider + model；保留妙搭内置 AI 回退 | 高 |
| 腾讯 ASR | 原接口、参数和额度查询保持不变；统一页只是复用其表单和保存逻辑 | 低 |
| 任务记录 | 创建任务时写入 `transcriptionProvider`、`transcriptionModel` 和 provider 显示名；历史 `local_whisper` 数据保留兼容读取 | 中 |
| 进度与结果 | `RecordingNotesPage`、任务卡片、结果文档元信息显示实际 provider + model，不展示地址或 API Key | 低 |
| 就绪检查 | 分别判断 API 转录、腾讯 ASR、LLM 总结是否就绪，不做虚假的统一余额判断 | 中 |
| 安全 | API Key 不能进入前端持久化、日志、任务记录或结果文档；接口返回仅掩码和状态 | 高 |
| 向后兼容 | 旧腾讯配置和旧外部 LLM 配置不做破坏性迁移；统一页面首次加载时投影旧配置，首次保存后写新结构 | 中 |

## 4. 建议接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/note-jobs/model-providers` | 获取提供者列表（掩码 Key） |
| POST | `/api/note-jobs/model-providers` | 新增提供者 |
| PUT | `/api/note-jobs/model-providers/:id` | 更新提供者 |
| DELETE | `/api/note-jobs/model-providers/:id` | 删除未被模型引用的提供者 |
| GET | `/api/note-jobs/model-providers/:id/models?capability=transcription\|llm` | 获取能力模型列表 |
| GET | `/api/note-jobs/model-settings` | 获取转录模型、LLM 模型配置 |
| PUT | `/api/note-jobs/model-settings` | 保存两个能力的 provider + model 引用 |
| GET/PUT | `/api/note-jobs/transcription-settings` | 读取和保存当前转录方式及腾讯参数 |

旧腾讯接口和旧外部模型接口在迁移期继续保留，由统一页面兼容调用或服务端投影。

## 5. 开发分期与回滚

### P1：页面与兼容视图

先完成三个页面和导航，继续复用现有腾讯 ASR、外部模型接口；验证选择路径和文案。

### P2：提供者与能力模型存储

新增 provider、模型引用及模型列表接口；LLM 流水线切换为读取 `summaryModel`。

### P3：自定义 ASR 适配器与任务追踪

增加 `custom_api` 转录适配器，任务固化 provider + model，进度/结果显示实际使用模型。

出现问题时，关闭 `custom_api`，恢复旧腾讯与旧外部模型入口；不删除旧配置、不改写历史任务。新增配置按 feature flag 或空配置降级，保证回滚可通过 `git revert` 完成。

## 6. 原型验收点

- 左侧可以切换三个页面，刷新不丢失当前页面结构。
- 提供者页能打开新增弹层，能看到多个 provider 卡片。
- 模型页有两个“提供者”和两个“模型”下拉框，变更后组合摘要同步更新。
- 转录页只显示 API 大模型和腾讯 ASR 资源包，不出现本地 Whisper。
- 切换腾讯时可以在当前页展开原有腾讯参数；切换 API 时展示实际 provider + model。
- 任务处理中示例随方式切换显示实际模型。
