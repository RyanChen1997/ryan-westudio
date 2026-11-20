# Ryan-WeStudio 开源版 — AI Agent 安装指引

> 🤖 **本文档供 AI Agent 阅读与执行。**
> 当用户要求你从 GitHub 仓库安装或更新 `ryan-westudio` 开源版时，请按以下步骤直接安装依赖并构建。

---

## 1. 检查运行环境

在终端中检查当前机器的 Node.js 与 npm 版本：

```bash
node -v
npm -v
```

- **要求**：Node.js **22.12.0** 及以上版本。
- 若当前环境未安装 Node.js 或版本低于 `22.12.0`，请暂停安装，明确告知用户需要先安装或升级到 Node.js 22.12+。

---

## 2. 确定当前宿主环境的 Skills 安装目录

根据你当前运行的 AI Agent 宿主环境，定位你能自动扫描并加载 `SKILL.md` 的用户级 Skills 目录。目标文件夹名统一为 `ryan-westudio`：

| AI Agent 宿主环境 | 默认安装目标路径（macOS / Linux） | Windows 对应路径 |
| --- | --- | --- |
| **Claude Code** | `~/.claude/skills/ryan-westudio` | `%USERPROFILE%\.claude\skills\ryan-westudio` |
| **Codex / OpenCode / 通用 Agent** | `~/.agents/skills/ryan-westudio` 或 `~/.codex/skills/ryan-westudio` | `%USERPROFILE%\.agents\skills\ryan-westudio` |
| **Cursor** | `~/.cursor/skills/ryan-westudio` | `%USERPROFILE%\.cursor\skills\ryan-westudio` |
| **其他 Agent（Antigravity / Kimi Code / Qoder / Workbuddy / 豆包电脑版等）** | 使用你当前环境实际配置并能识别的 `skills/ryan-westudio` 目录 | 同左 |

如果父级 `skills` 目录尚不存在，请先创建该目录。

---

## 3. 拉取开源版仓库并保护已有安装

请先检查目标路径 `<SKILLS_DIR>/ryan-westudio` 是否已经存在：

### 情况 A：首次全新安装（目标目录不存在）

直接将 GitHub 仓库克隆到目标路径：

```bash
git clone https://github.com/RyanChen1997/ryan-westudio.git "<SKILLS_DIR>/ryan-westudio"
```

### 情况 B：更新已有安装（目标目录已存在）

先确认它是开源版。若是 Git 仓库且无未提交改动，用 `git pull --ff-only` 更新，不强行覆盖本地改动。若不是开源版 Git 仓库，先征得用户同意并完整备份旧目录，再安装到目标位置。不要删除旧版私人模板或用户稿件，也不要把 Pro 私人模板迁进开源版运行目录。

---

## 4. 安装依赖并构建本地编辑器

进入安装目录，安装完整依赖（含前端构建所需的 devDependencies）并执行构建：

```bash
cd "<SKILLS_DIR>/ryan-westudio"
npm ci --include=dev
npm run build
```

---

## 5. 验证安装结果

构建完成后，请检查以下内容是否就绪：

1. `<SKILLS_DIR>/ryan-westudio/SKILL.md` 存在且可读取。
2. `<SKILLS_DIR>/ryan-westudio/dist/index.html` 已成功生成（本地所见即所得编辑器前端产物）。

---

## 6. 向用户汇报并说明调用方式

确认安装与构建成功后，请向用户简洁汇报：

1. **安装状态与路径**：说明 `ryan-westudio` 已成功安装并构建完成。
2. **如何使用**：告诉用户现在可以通过以下任意方式调用：
   - **发文章链接或本地文稿**：「用 `ryan-westudio` 帮我把这篇文章排成公众号版式：`<链接或文件路径>`」
   - **直接排当前对话里的文章**：「用 `ryan-westudio` 把刚才在对话里写好的这篇文章排成公众号版式」
   - **用本地图片加图或换图**：「在当前文章的第二节后插入 `<本地图片路径>`」。
