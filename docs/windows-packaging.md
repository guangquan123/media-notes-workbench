# Windows 安装包交付

## 客户看到的流程

客户只需要下载 `多媒体笔记工作台-<版本>-Setup.exe`，完成安装后点击桌面图标。程序会启动本地服务并打开默认浏览器，首次进入时填写模型地址、模型名和 API Key，测试连接后即可使用。

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

`package:windows:compile` 会依次重新编译服务端、按安装版根路径编译客户端、裁剪生产依赖、生成发布目录，并调用 Inno Setup 编译安装器。

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
5. 从“应用和功能”卸载，确认服务进程和快捷方式被清理。

客户数据保存在 `%LOCALAPPDATA%\MediaNotesWorkbench`，不会写入安装目录，升级安装时应保留该目录。
