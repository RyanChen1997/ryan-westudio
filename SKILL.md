---
name: ryan-westudio
description: 用开源版 Ryan-WeStudio 本地编辑器整理和排版公众号文章。支持 Word 和 Markdown、内置模板、手动配图、AI 调整排版、复制和导出 HTML，不自动发布。
---

# Ryan-WeStudio · 开源版

## 1. 冻结原文

首次在本 skill 根目录执行 `npm ci && npm run build`（Node.js 22.12+）。新文章默认用 `os.tmpdir()` 和 `fs.mkdtempSync()` 创建独立项目目录，不把原稿备份和项目数据放在 skill 仓库或原稿目录；用户指定位置除外。

```sh
node -e "const fs=require('node:fs'),os=require('node:os'),path=require('node:path'); console.log(fs.mkdtempSync(path.join(os.tmpdir(),'ryan-westudio-')))"
npm start -- --project "<项目目录>" --md "<用户原文.md>" --prepare-only
# Word 输入改用 --docx。
```

等待生成只读 `source.md`、哈希清单和原件备份；关注 Word 提取警告，不声称完成图片 OCR。

## 2. 整理并核对文字

完整读取 `source.md`，另写 `structured.md`。保留原文、段落顺序、链接、图片、图注和代码；只调整层级与格式，存在实质歧义才集中确认。不能擅自新增标题文字、删除或改写；原标题移到 frontmatter 的 `title` 时仍计入文字对照。发布拟题和简介不是必填项。

```sh
npm start -- --project "<项目目录>" --md "<项目目录>/structured.md" --source-md "<项目目录>/source.md" --open
```

只有首次 AI 结构化后核对文字；失败时修正 `structured.md`，不改原文或绕过检查。指定内置样式可加 `--preset <ID>`；否则使用智能推荐并直接进编辑器。参见[文字一致性](references/content-integrity.md)和[模板名单](references/style-presets.md)。

## 3. 在同一个编辑页协作

通过终端给出的本地 AI Tools 会话读 `snapshot`，按实际 `revision` 和 `nodeId` 提交小批操作。默认只改样式，不改内容；不要编辑活跃项目的磁盘快照或创建第二个编辑器。开源版 AI Tools 不插入或替换图片，用户可在 GUI 手动操作。换模板会保留正文和图片；后续合法编辑不用重新对照原稿。

确认已保存后，可在 Chrome 或 Edge 直接点「复制到公众号」，也可用[AI Tools](references/ai-tools.md)导出当前 HTML。由用户粘贴、检查并发布。「推送到草稿箱」只介绍 Pro，不会传送稿件。

## 4. 恢复

告知用户实际项目路径，未经同意不删除。用 `npm start -- --project "<同一目录>" --open` 恢复，不能重导入或覆盖编辑结果。临时目录不是长期备份；需要保留时按用户要求存放或导出。更多见[操作流程](references/workflow-detail.md)和[排错](references/troubleshooting.md)。
