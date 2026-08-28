# 转录与总结模型统一配置设计

## 1. 建议结论

建议把设置导航中的“转录引擎”和“总结模型”合并为一个页面：**转录与模型**。

但只合并配置入口和自定义 API 连接凭据，不合并运行时能力：

```text
统一页面
├── 转录来源
│   ├── 腾讯云 ASR（沿用当前完整参数）
│   ├── 自定义 API（共用 API 地址和 API Key）
│   └── 本地 Whisper（保留现有能力）
├── 自定义 API 连接
│   ├── API 地址
│   └── API Key
└── 能力模型
    ├── 转录模型（音频接口使用）
    └── 总结模型（Chat Completions 使用）
```

同一个服务商可以复用一份地址和 API Key，但 ASR 模型和 LLM 模型必须是两个字段。两者接口路径、输入格式、响应格式都可能不同，不能用一个 `model` 字段覆盖。

## 2. 为什么要合并

当前代码已经存在两套非常相似的外部配置：

- `ExternalModelSettings`：`baseUrl`、`apiKey`、`model`、`enabled`；服务端调用 `/chat/completions`。
- `TencentAsrSettings`：SecretId、SecretKey、COS、ASR 地域、引擎模型等；服务端有独立的测试和额度接口。

用户如果使用同一家兼容服务商，会重复填写地址和 API Key。统一页面可以减少重复配置，也能在开始使用自检里一次看清“转录”和“总结”是否分别就绪。

## 3. 为什么不能只保留一个模型下拉框

ASR 和 LLM 的模型标识通常不同，例如：

| 能力 | 典型请求 | 模型用途 |
| --- | --- | --- |
| 音频转录 | `/audio/transcriptions` 或厂商自定义路径 | `whisper-1`、`paraformer-v2` |
| 总结生成 | `/chat/completions` | `deepseek-chat`、`qwen-plus` |

因此原型使用两个下拉框：

- `转录模型`：只出现在自定义 API 转录链路中。
- `总结模型`：只出现在外部大模型总结链路中。

如果服务商确实允许同一个模型承担两种能力，用户可以在两个下拉框中选择同一个值，但系统仍然按两个能力分别校验。

## 4. 页面交互

### 默认页面

1. 页面标题为“转录与模型”。
2. 顶部显示当前组合，例如“自定义 API · 转录模型：paraformer-v2 · 总结模型：deepseek-chat”。
3. “转录来源”使用三个互斥选项：腾讯云 ASR、自定义 API、本地 Whisper。
4. 选择腾讯云 ASR 时，直接展开当前腾讯配置表单，不跳转页面。
5. 选择自定义 API 时，展开一份连接配置和两个模型下拉框。
6. 总结模型可选择“妙搭内置 AI”或“自定义 API · 总结模型”。
7. 页面只保留两个测试动作：`测试转录`、`测试总结`；两者状态分别显示。
8. 保存按钮统一为 `保存配置`，启用状态按能力分别判断。

### 自定义 API 模式最小字段

| 区域 | 字段 |
| --- | --- |
| 连接 | API 地址、API Key |
| 转录 | 转录模型下拉框 |
| 总结 | 总结模型下拉框、是否启用外部总结 |

默认约定：Bearer Token、OpenAI 兼容接口、模型列表通过 `/models` 或服务端预置列表获取。不同协议暂不在首版页面暴露高级映射字段。

## 5. 影响分析

| 模块 | 影响 | 建议 | 风险 |
| --- | --- | --- | --- |
| 设置导航 | `SettingsPage` 目前有 `transcription` 和 `model` 两个入口 | 合并为一个 `ai` 或 `transcription-model` section；保留旧 query 参数重定向 | 中 |
| 腾讯配置页面 | 当前 `TranscriptionSettingsPage` 是完整腾讯表单 | 改为统一页内的 Tencent 面板，字段和保存接口原样复用 | 低 |
| 外部模型页面 | 当前 `ModelSettingsPage` 管理地址、Key、模型和额度 | 抽出共享连接表单；保留旧组件或旧路由作为兼容壳 | 中 |
| shared 类型 | 当前 `ExternalModelSettings.model` 只有一个总结模型 | 增加统一配置响应类型，拆分 `transcriptionModel` / `summaryModel` | 中 |
| API | 当前腾讯和外部模型接口完全分离 | 新增聚合读写接口；旧接口继续保留一段迁移期 | 中 |
| 外部模型服务 | `ExternalModelSettingsService` 当前只面向 Chat Completions | 抽出共享凭据服务，保留现有 LLM 调用路径 | 高 |
| 自定义 ASR | 当前 provider 没有 `custom_api` | 新增独立 ASR adapter；不要把腾讯 adapter 改成通用分支 | 高 |
| 总结流水线 | `NoteSummaryPipelineService` 读取外部模型 credentials 和单一 model | 改读 `summaryModel`；保留外部失败回退妙搭内置 AI的逻辑 | 高 |
| 任务记录 | `NoteJob.transcriptionProvider` 没有自定义 API | 增加 `custom_api`，新任务写入；旧任务按旧值读取 | 中 |
| 任务详情 | 当前显示腾讯 / Whisper 标签 | 增加“自定义 API · 模型名”显示，但不显示地址和 Key | 低 |
| 就绪自检 | 当前分别计算转录和总结模型状态 | 增加组合状态：转录可用、总结可用、两者是否匹配 | 中 |
| 录音/视频入口 | 当前有“配置转录”和“配置总结模型”提示 | 统一跳转到一个设置 section，并按缺失能力定位 | 低 |
| 额度查询 | 腾讯 ASR 和外部 LLM 的余额接口不同 | 保留两套查询；不做虚假的统一余额 | 中 |
| 安全 | 一份 Key 被两条链路复用 | 只在服务端保存和读取；日志按能力记录，不记录 Key | 高 |
| 文档/手册 | 当前分别描述转录与总结配置 | 改为统一页面说明，并保留腾讯专属参数说明 | 低 |

## 6. 兼容和迁移策略

不建议首版做破坏性数据迁移：

1. 继续读取现有腾讯配置文件/字段。
2. 继续读取现有 `.external-model-config.json`。
3. 统一页面首次加载时，将两套旧配置投影成一个前端视图。
4. 用户保存统一配置后，再写入新的共享配置和能力模型字段。
5. 旧 API 保留，旧页面链接可跳到统一页的对应面板。

这样可以先完成 UI 和调用适配，再决定是否清理旧配置文件。

## 7. 接口建议

新增聚合接口，但不删除旧接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/note-jobs/ai-settings` | 返回腾讯、自定义连接、能力模型和就绪状态 |
| PUT | `/api/note-jobs/ai-settings` | 保存统一配置，服务端按能力拆分写入 |
| POST | `/api/note-jobs/ai-settings/test-transcription` | 测试当前转录能力 |
| POST | `/api/note-jobs/ai-settings/test-summary` | 测试当前总结能力 |
| GET | `/api/note-jobs/ai-settings/models` | 获取自定义 API 模型列表 |

测试状态必须按能力独立保存。转录测试失败不能覆盖总结配置，总结测试失败也不能把转录标为不可用。

## 8. 开发分期

### P1：统一页面和兼容视图

- 合并设置导航。
- 页内嵌入现有腾讯完整配置。
- 页内嵌入现有外部模型配置的最小字段。
- 暂时仍调用旧接口，验证交互和兼容性。

### P2：共享自定义 API 连接

- 抽取共享 API 地址/API Key。
- 新增转录模型和总结模型两个字段。
- 新增自定义 ASR adapter。
- 旧 LLM 服务改读共享凭据和 `summaryModel`。

### P3：模型列表与能力校验

- 从 `/models` 或服务端预置列表刷新模型。
- 分别测试转录和总结。
- 在开始使用自检和任务详情显示实际能力状态。

## 9. 回滚

如果自定义 ASR 或共享配置出现问题：

- 关闭 `custom_api` provider。
- 恢复旧腾讯 ASR 页面和旧外部模型页面入口。
- 继续使用旧的腾讯接口和 `.external-model-config.json`。
- 不删除旧配置、不改写历史任务记录。
