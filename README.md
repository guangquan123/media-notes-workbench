# 视频学习笔记助手

粘贴 B站或抖音视频地址后，自动完成：

1. 用 `yt-dlp` 拉取并提取音频
2. 用本机 Whisper 离线转录，长音频自动切片
3. 用妙搭内置 AI 生成结构化 Markdown 学习笔记
4. 通过当前登录的飞书用户身份创建在线文档
5. 在页面返回飞书文档地址

## 启动

macOS 直接双击 `启动B站学习笔记助手.command`。

也可以在当前目录执行：

```bash
npm run dev
```

然后访问：

`http://localhost:8081/app/app_179bn4jet6k/`

## 使用前提

- `yt-dlp`
- `ffmpeg`
- 已登录的 `lark-cli`
- `whisper-cpp` 与 `models/ggml-base-q5_1.bin`

本工具仅用于处理你有权使用的内容。任务结束后，临时音频会自动清理。

抖音支持 `www.douyin.com/jingxuan?modal_id=...`、标准视频地址和手机分享短链，
通过公开移动分享页解析，一般不需要登录状态。如果 B站返回 HTTP 412，请在页面的
“登录状态来源”中选择一个已经登录 B站的浏览器。应用通过 yt-dlp 在本机读取 Cookie，
不会把 Cookie 保存到项目。
