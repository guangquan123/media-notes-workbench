# 本地运行目录

项目代码目录只负责源码、依赖和构建输入。运行时可变内容按以下目录保存：

```text
%LOCALAPPDATA%\MediaNotesWorkbench\        # 安装版
%LOCALAPPDATA%\MediaNotesWorkbench\dev\    # 源码本地开发版
├─ data\                                    # PGlite、上传文件、录音和归档
├─ config\                                  # 本地运行配置、连接器和模型配置
├─ cache\                                   # 可丢弃缓存
├─ logs\                                    # 启动器、服务和前端日志
└─ runtime\                                 # PID、启动令牌、迁移标记
```

## 路径优先级

启动器先读取环境变量，再使用上面的默认目录。可用以下变量覆盖单个目录：

```text
WORKBENCH_HOME
WORKBENCH_DATA_DIR
WORKBENCH_CONFIG_DIR
WORKBENCH_CACHE_DIR
LOG_DIR
WORKBENCH_STATE_DIR
```

直接目录变量优先于 `WORKBENCH_HOME` 派生目录，因此旧启动方式仍然兼容。未经过启动器直接执行 `npm run dev:server` 时，仍保留仓库相对路径，便于调试；日常本地启动使用 `npm run dev:local` 或 Windows 启动入口即可获得完全分离的目录。

## 首次迁移

首次启动会执行只复制的迁移：

- 复制旧 `data`、配置文件、上传媒体、录音和 PGlite 数据；
- 重写录音清单中的旧绝对路径和归档路径；
- 校验文件数量和字节数；
- 新目录已有文件时不覆盖，并报告冲突；
- 成功后在 `runtime/layout-migration.json` 写入完成标记；
- 旧目录不删除，作为回滚源。

也可以手动预览迁移范围：

```powershell
node scripts/migrate-local-runtime.js --dry-run
```

迁移失败时启动器会继续使用旧目录，不会阻断现有工作流。确认新目录可用后，旧目录可以由用户自行备份和清理；程序不会自动删除它。

## 打包边界

Windows 打包脚本只从 `dist/server`、`dist/client`、`dist/shared` 和裁剪后的依赖目录取输入，并扫描已知配置文件、临时文件和运行时数据。静态 fallback HTML 在内存生成，不会写回 `dist/client`。

## 回滚

回滚优先使用 Git 提交回退代码；运行数据不需要回退。若迁移后的目录需要暂时停用，可删除 `runtime/layout-migration.json` 后设置旧目录覆盖变量，或直接使用旧启动参数启动。任何数据清理前请先关闭服务并保留旧目录备份。
