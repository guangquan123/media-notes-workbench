# 平台抽象层设计：剥离妙搭依赖，支持本地开箱即用

> 目标：把 `@lark-apaas/*`（妙搭）从硬依赖降级为“可配置的运行时 Provider”，默认本地模式零配置即可运行，同时保留妙搭模式供既有部署使用。

## 1. 现状耦合清单

| 能力 | 现状实现 | 本地替代方案 |
|------|----------|--------------|
| 启动/装配 | `PlatformModule.forRoot()` + `configureApp()` | 本地 `NestFactory` + 自建全局管道/过滤器 |
| 鉴权/身份 | `NeedLogin` + `req.userContext` + `AuthNPaasService` | 本地单用户身份注入，`lark_user_id` 返回 null |
| 数据库 | `DRIZZLE_DATABASE`（Drizzle + Postgres） | Drizzle + SQLite（`node:sqlite`，零配置） |
| AI 总结 | `CapabilityService`（妙搭内置 AI） | 已存在的外部模型配置 + OpenAI 兼容 API / 本地 Ollama |
| 文件存储 | `@lark-apaas/file-service` `FileService` | 本地文件系统目录 |
| HTTP | `PlatformHttpClientService` | 普通 axios 实例 |
| 前端 | `@lark-apaas/client-toolkit`（axiosForBackend、AppContainer、用户组件、dataloom） | 本地 axios + 精简 AppContainer + 本地文件读写 |

## 2. 核心设计：RuntimeProvider（与连接器同构）

新增 `server/platform/`，提供一套与“协作连接器”同构的运行时抽象：

```
server/platform/
  platform.config.ts          # 运行时配置契约
  platform.registry.service.ts # 选择并暴露当前 Provider
  providers/
    miaoda/                   # 现有 @lark-apaas 能力，原样封装
    local/                    # 本地零依赖实现
      local-database.provider.ts   # SQLite + Drizzle
      local-identity.provider.ts   # 单用户 userContext
      local-ai.provider.ts         # OpenAI 兼容 / Ollama
      local-storage.provider.ts    # 文件系统
      local-http.provider.ts       # axios
```

### 配置契约（`.platform-config.json`）

```json
{
  "runtime": "local",
  "database": { "kind": "sqlite", "file": "data/workbench.sqlite" },
  "auth": { "kind": "local", "ownerId": "local-owner" },
  "ai": { "provider": "external", "baseUrl": "", "apiKeyConfigured": false, "model": "" },
  "storage": { "kind": "local", "root": "data/storage" }
}
```

`runtime` 取值 `local | miaoda`；业务代码只依赖 `PlatformRegistryService` 暴露的抽象接口，不再直接 import `@lark-apaas/*`。

## 3. 关键抽象接口

```ts
interface IdentityProvider {
  getUserContext(req): UserContext;
  getLarkUserId(): Promise<string | null>;
}

interface DatabaseProvider {
  getDb(): Database;  // Drizzle 统一 client
}

interface AiProvider {
  generate(input): Promise<{ text: string }>;
}

interface StorageProvider {
  put(key, buf): Promise<{ url }>;
  get(key): Promise<Buffer>;
}
```

## 4. 难点与处理策略

- **数据库方言差异最大**：当前 schema 用 `pgTable`/`uuid`/`customTimestamptz`。建议新增一套 SQLite schema（`sqliteTable`），用适配器做方言切换，先让“本地单机”跑通，再逐步收敛字段差异。
- **AI 降级**：`CapabilityService` 只在 `miaoda` runtime 可用；`local` runtime 走外部模型（OpenAI 兼容），配置缺失时明确报错并引导配置。
- **前端解耦**：`client-toolkit` 用本地 shim 替换 `axiosForBackend`/`AppContainer`/用户选择器；用户选择器在本地模式降级为纯文本输入或隐藏。

## 5. 分阶段落地

1. 运行时配置 + Registry（本地/妙搭可切换，默认本地）。
2. 数据库抽象：本地 SQLite。
3. 身份抽象：本地单用户。
4. AI 抽象：外部模型 Provider。
5. 存储/HTTP 抽象。
6. 前端 client-toolkit 解耦。
7. 本地模式全链路验证后，保留妙搭为可选 Provider。

## 6. 需要确认的关键决策

1. 本地数据库：**SQLite（零配置，推荐）** 还是继续要求 Postgres？
2. 本地 AI：**OpenAI 兼容外部 API（用户自带 key）** 还是内置本地模型？
3. 本地鉴权：**单用户免登录** 还是简单本机账号密码？
4. 妙搭：**保留为可选 Provider** 还是彻底移除？
