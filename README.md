# Ryan-WeStudio · 开源版

本地公众号排版编辑器。导入 Word 或 Markdown，保留原稿配图；可在 18 套内置模板之间切换，手动插图、继续和 AI 调整排版，最后复制到公众号或导出 HTML。开源版的编辑、复制与导出不需要 Pro 账号或密钥，不会自动发布。

## 安装与启动

需要 Node.js 22.12+。在仓库根目录运行：

```sh
npm ci
npm run build
npm start -- --project "<项目目录>" --md "<文章.md>" --open
```

Word 输入换用 `--docx "<文章.docx>"`。恢复时只传同一个 `--project "<项目目录>" --open`，不会重新导入。也可以用 `bash install.sh "<你的 skills 目录>"` 安装为本地 AI skill。

- **AI 首次排版**：让 AI 读取 [SKILL.md](SKILL.md)，先冻结原文，再格式化并对照文字后打开编辑器。
- **继续调整**：右侧切换模板或调整页边距，也可让 AI 通过[本地协作工具](references/ai-tools.md)修改当前会话。正文图片可导入原稿自带图片，也可在编辑器手动添加或替换。
- **复制与导出**：用 Chrome 或 Edge 点击「复制到公众号」；粘贴后在公众号后台检查正文和图片，补齐发布信息。HTML 可由 AI Tools 从当前版本导出。
- **模板**：完整名单、默认模板和恢复规则见[模板说明](references/style-presets.md)。

「推送到草稿箱」在开源版仅展示 Pro 功能介绍，不连接草稿服务。更多信息见 [WeStudio 官网](https://westudio.airyanchen.cc/)。

开发验收：`npm test`、`npm run build`；浏览器回归用 `npm run test:browser`（需要 Playwright Chromium，或设置 `CHROME_PATH`）。
