# Windows 安装包交付

## 客户看到的流程

客户只需要下载 `多媒体笔记工作台-<版本>-Setup.exe`，完成安装后点击桌面图标。程序会启动本地服务并打开默认浏览器，首次进入时填写模型地址、模型名和 API Key，测试连接后即可使用。

客户机必须是 Windows 10 或 Windows 11 的 64 位 x64 系统。安装器会主动拒绝 Windows 7、Windows 8、32 位 Windows 和 ARM64，避免出现“安装成功但无法启动”的假成功。

## 构建机一次性准备

- Windows 10/11
- Node.js 22 或更高版本
- npm 10 或更高版本
- Inno Setup 6

推荐使用官方安装器或执行：

```powershell
winget install --id JRSoftware.InnoSetup -e
```

## 每次生成 Setup.exe

在项目根目录执行：

```powershell
npm.cmd install
npm.cmd run package:windows:compile
```

也可以直接双击项目根目录的 `build-windows-installer.cmd`。

输出文件位于：

```text
release/windows/<版本>/installer/多媒体笔记工作台-<版本>-Setup.exe
```

`package:windows:compile` 会依次重新编译服务端、按安装版根路径编译客户端、裁剪生产依赖、生成发布目录，并调用 Inno Setup 编译安装器。默认使用管理员权限安装到 `C:\Program Files\多媒体笔记工作台`，因此会出现一次 UAC 确认；这是为了把卸载信息可靠登记到控制面板“程序和功能”以及 Windows 设置的“已安装的应用”。

Windows 打包会先清理上一次生成的 `dist/client`、`dist/server`、source map、精简依赖和 TypeScript 增量缓存，避免历史哈希资源重复进入安装包。依赖裁剪同时跳过 source map、测试和示例目录，以及不会参与运行的 TypeScript 源码、类型声明、README/许可证等文档文件；保留运行所需的 JavaScript、JSON、原生模块、WASM、字体和 PDF.js CMap 资源。

安装向导会显示标准目录选择页。可以直接使用默认目录，也可以选择其他磁盘/目录并在对话框中新建目录；卸载器会根据安装标记识别本产品目录，不要求目录名必须保持默认值。

### 关于 `@vercel/nft` 提示

项目已将 `@vercel/nft` 固定为开发依赖。正常执行 `npm.cmd install` 后，裁剪脚本会使用 NFT 精确追踪服务端依赖；它只参与构建，不会被复制到客户安装包。

如果构建机因离线、缓存或权限问题没有安装 NFT，脚本会显示“按 package.json 生产依赖进行保守裁剪”，并继续构建。这不是失败，但发布目录可能更大。遇到该提示时，先执行 `npm.cmd install`；若仍无法安装，确认 `node_modules/@vercel/nft` 是否存在，或在可联网的构建机上重新安装依赖。

Windows 构建机如果 npm 阻止 `esbuild` 安装脚本，Vite 会出现 `spawn EPERM`。项目已允许 `esbuild` 安装脚本；可执行 `npm.cmd install-scripts approve esbuild` 后再运行打包命令。

## 只生成发布目录或指定工具路径

不编译 Setup.exe 时：

```powershell
npm.cmd run package:windows:build
```

如果 Node.js 或 Inno Setup 安装在非标准位置：

```powershell
$env:WORKBENCH_NODE_RUNTIME = 'D:\tools\node\node.exe'
$env:INNO_SETUP_COMPILER = 'D:\tools\Inno Setup 6\ISCC.exe'
npm.cmd run package:windows:compile
```

也可以直接调用打包器：

```powershell
node scripts/package-windows.js --compile --node-runtime 'D:\tools\node\node.exe'
```

## 交付前检查

1. 在没有 Node.js 的干净 Windows 虚拟机安装 Setup.exe。
2. 点击桌面图标，确认默认浏览器打开本地工作台。
3. 填写模型地址、模型名、API Key 并测试连接。
4. 关闭程序后重新打开，确认模型配置和笔记数据仍存在。
5. 分别从“已安装的应用”和开始菜单卸载入口执行卸载，确认服务进程、安装目录和快捷方式被清理。

客户数据保存在 `%LOCALAPPDATA%\MediaNotesWorkbench`，不会写入安装目录，升级安装时应保留该目录。

## 卸载行为

客户可以通过 Windows“设置 → 应用”找到“多媒体笔记工作台”并卸载；也可以点击开始菜单应用组中的“卸载多媒体笔记工作台”，或直接双击安装目录根部的 `uninstall.cmd` / `卸载多媒体笔记工作台.cmd`。卸载程序会把内置 Node 临时复制到系统临时目录，用临时副本执行停止脚本并等待停止完成，再删除安装目录、内置 Node、桌面快捷方式和开始菜单快捷方式，避免正在退出的 Node 短暂锁住安装目录。若运行时文件已被删除或被安全软件隔离，卸载脚本会返回明确的非零退出码，卸载器仍会继续执行文件清理。

安装器会写入专用标记，并在卸载时同时确认标记、内置 Node、启动脚本和服务端入口都存在，满足条件才递归删除整个应用目录；这样既能清理自定义目录中的旧版本遗留文件，也避免误删无关目录。通过命令行把输出目录指向项目根目录、`dist` 或 `node_modules` 等受保护目录会被打包脚本拒绝。

为防止误删，卸载默认保留 `%LOCALAPPDATA%\MediaNotesWorkbench` 中的模型配置、笔记、上传文件和日志。重新安装同一产品后可以继续使用原数据。若客户要彻底清理数据，请在确认不再需要恢复后，手工删除该目录。

安装器和桌面快捷方式使用项目现有的 `client/public/icons/zhiji-logo.svg` 生成的 `app-icon.ico`，每次 Windows 打包都会自动重新生成并打入安装包。
