# Codex 长期记忆与用户画像联动

## 目标

将 `/Users/yangjie/.codex/memories` 单向镜像到：

`/Users/yangjie/Library/Mobile Documents/com~apple~CloudDocs/yj/07_mydoc/01_typora/20_AI自动化知识库/99_自己用户画像/01_Codex长期记忆镜像`

同步同时更新 `杨杰个人用户画像-v1.0-2026-07-28.md` 中由以下标记包围的
受控区块：

```text
<!-- BEGIN CODEX MEMORY SYNC -->
<!-- END CODEX MEMORY SYNC -->
```

## 执行

在本仓库运行：

```bash
npm run memory:sync
```

如需在隔离测试目录运行：

```bash
npm run memory:sync -- \
  --source <memory-source> \
  --target <mirror-target> \
  --profile <profile-file>
```

## 同步内容

- `memory_summary.md`
- `MEMORY.md`
- `raw_memories.md`
- `extensions/ad_hoc/`
- `rollout_summaries/`
- 将来在记忆根目录新增的其他普通文件

`.git` 目录不会同步。

## 机制

1. 递归读取源文件并计算逐文件 SHA-256。
2. 用排序后的路径、哈希和大小生成源状态摘要。
3. 源状态变化或镜像损坏时，先写暂存目录，再替换 `source/` 镜像。
4. 生成 `README.md` 和 `sync-manifest.json`。
5. 更新用户画像中的受控区块。
6. 源状态未变化且镜像完整时返回 `unchanged`，不重写文件。

## 验收

成功结果必须同时满足：

- 命令退出码为 `0`；
- 返回 `status=updated` 或 `status=unchanged`；
- `sync-manifest.json` 中的 `sourceDigest` 与命令结果一致；
- 清单中的每个文件在 `source/` 下存在且 SHA-256 一致；
- 用户画像包含完整的受控区块和同一个 `sourceDigest`。

## 边界与回滚

- Codex 记忆库是唯一事实源；Obsidian 镜像不反向覆盖源文件。
- 镜像包含私人工作记录，不得公开发布或提交到公共仓库。
- 同步程序只管理镜像目录中的 `source/`、`README.md`、
  `sync-manifest.json`，以及用户画像的受控区块。
- 同步失败时不会修改 Codex 记忆源；再次运行会重新校验并修复镜像。
- 如需停用，停止执行 `npm run memory:sync` 即可；删除镜像前应另行确认。
