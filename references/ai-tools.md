# 活跃编辑会话 AI Tools

## 连接

```bash
# 复用已有项目目录；新文章按 SKILL.md 先在系统临时目录中准备并导入。
npm start -- --project "<已有项目目录>" --open
export AI_BASE=http://127.0.0.1:4318/api/tools
export AI_TOKEN='<终端的 AI_TOKEN>'
curl -s -H "Authorization: Bearer $AI_TOKEN" "$AI_BASE/snapshot"
```

只监听本机。认证令牌每次启动随机生成，CLI URL 的 fragment 用于首次 GUI 认证，之后使用按端口隔离名称的 HttpOnly / SameSite=Strict cookie，避免并行项目互相覆盖认证。无跨域/远程访问；不向任意脚本提供 eval。令牌可编辑本项目，只给可信的本机调用者。

所有 tools 都必须有**同一项目唯一活跃浏览器页**。服务端只转发请求和持久化快照；不在 Node 创建另一个编辑器。第二页拒绝写入；无活跃页返回 409。`GET /api/project` 是恢复用磁盘提交，不是 AI 当前快照接口。

## 快照与定位

`GET /api/tools/snapshot` 返回：

- `projectId`, `revision`，完整 `doc`（Tiptap JSON），最新 `markdown`，`assets` 哈希 ID 映射。
- `sourceValidation`：可选的首次 AI 结构化原文对照报告。stage 为 initial-structuring，哈希指向初始输入；不代表用户后来改动仍与原文相同，不在编辑时重跑。
- `nodes[]`: `{id,type,position,size,text,attrs,imageVersion?}`；图片额外提供当前活跃页内的 `imageVersion`，用于异步替换的新鲜度保护（不是持久版本，刷新后须重取）。持久 UUID 跨保存恢复，节点删除后失效；拆分产生新 ID。
- `selection`: `{from,to,anchor,head}`（ProseMirror 文档位置）。

定位优先 `nodeId`，文字 `from/to` 是**该文字块内容内 UTF-16 偏移**，不计块的起止 token，不是 Unicode 字符数；emoji 通常占两个单位。省略范围表示整段。GUI 当前选区可省略 nodeId；AI 为避免误改应显式提供目标。节点/选区读取不增加 revision；任何内容/设计事务增加 revision。

## 事务

`POST /api/tools/operations`，Content-Type application/json：

```json
{
  "expectedRevision": 12,
  "operations": [
    {"type":"replaceText","nodeId":"段落UUID","from":0,"to":2,"text":"新文"},
    {"type":"style","nodeId":"段落UUID","style":{"fontSize":20,"color":"#005fc7"}}
  ]
}
```

先验证版本、所有操作和最终 Schema，成功才 dispatch 一次 Tiptap transaction。失败不部分提交；成功批次一次可撤销。后续操作定位基于**同批前面操作之后**的文档。只接受 1–100 项，不提供整篇 HTML/JSON 替换。

成功返回当前快照，且等待此次状态保存落盘。用户在等待保存期间继续编辑时可能返回 409；已提交事务并非被自动撤回。保存/网络失败不报成功，**超时或断线表示结果未知**，先读取当前快照，不要盲目重放。GUI 自动保存失败会明确提示。

### 操作清单

| type | 额外字段 | 说明 |
|---|---|---|
| replaceText | nodeId?, from?, to?, text | 行内替换；CR/LF 在 dispatch 前整体拒绝，换行用 insertBlock 或 GUI 编辑 |
| select | nodeId, from?, to?, node?:true | 文字选区；node:true 选择图片/卡片/装饰等整个节点 |
| setBlock | nodeId?, block: paragraph/h1/h2/h3/h4 | 文字块语义转换（不适用于表格单元格） |
| mark | nodeId?, from?, to?, mark:bold/italic/code, enabled?:boolean | 不给 enabled 则切换；给 true/false 则设/清 |
| toggleQuote | nodeId? | 引用包裹/解除 |
| toggleList | nodeId?, kind:bullet/ordered | 列表切换 |
| style | nodeId?, style, range?:true, from?,to? | 块样式；range:true 时为文字样式 |
| title | text | 修改文章发布标题，同步编辑器左上角与 Markdown `title` |
| digest | text | 修改发布简介，投影到 Markdown `digest`，不改变正文 |
| pageMargin | value:0–80整数或null | 同步调整文章左右内边距（px）；null 恢复模板默认，不写 Markdown |
| template | templateId | 切换已注册模板，清除全部视觉覆盖、页边距微调与纯装饰 |
| insertBlock | block:paragraph/quote/card/decoration/horizontalRule/image, text?, beforeId?, afterId?, assetId?, alt?, caption?, focus?:boolean | 默认末尾；beforeId/afterId 互斥，在同一合法父容器内插入；图片须使用已导入的 assetId |
| convertBlock | nodeId, block:paragraph/quote/card/image/horizontalRule, assetId?, alt?, caption?, focus? | 只转换仍为空的普通段落，保留块 ID，不覆盖文字 |
| replaceImage | nodeId, assetId, caption?, alt?, expectedImageVersion? | 替换目标图片，保留当前大小；引用已导入的本地资源，过期图片版本返回 409 |
| resizeImage | nodeId, scale | 等比缩放正文图片；`scale` 为 10、20、…、100，100 恢复模板默认大小。不改图片资源、图注或 Markdown |
| deleteNode | nodeId | 删除目标块，不能破坏 Schema 或表格的矩形结构 |
| undo / redo | 无 | 必须独立一项；也可撤销 GUI 操作，GUI 可撤销 AI 操作 |

style 支持 `fontSize`（10–72 的字号数值，界面显示如 `16`，CSS 渲染为 `16px`）、`color`（#RRGGBB）、`borderColor`、`borderWidth`（0–12 数值）；null 重置。range:true 只支持字号与颜色；代码等排斥视觉标记的范围会拒绝操作，不返回假成功。纯视觉不改变 Markdown。本地和迁入模板均支持这些节点/选区能力。页边距通过独立 pageMargin 操作设置；当前没有整套模板配色或全文字体参数的专用操作。

`insertBlock.text` 支持多行：CR/CRLF 统一为 LF，并表示成同一块内的 hardBreak；需要多个独立段落时提交多个 insertBlock。图片替代文字/图注中的标点、实体字面量及换行由 Markdown 序列化器转义，不会因文件名含方括号而破坏保存。

异步换图先记录目标 nodeId 和 imageVersion，等素材准备好后重新读取 revision。若目标已变或不存在，停止并核对；不能仅拿新的 revision 悄悄覆盖用户刚换的图。

### 示例

```bash
# 先读快照，使用它实际返回的 revision、id。示例值不可照抄覆盖。
curl -s -H "Authorization: Bearer $AI_TOKEN" -H 'Content-Type: application/json' \
  "$AI_BASE/operations" -d '{"expectedRevision":12,"operations":[{"type":"insertBlock","block":"card","text":"可编辑的卡片正文","afterId":"目标块UUID"},{"type":"insertBlock","block":"decoration","afterId":"目标块UUID"}]}'

curl -s -H "Authorization: Bearer $AI_TOKEN" -H 'Content-Type: application/json' \
  "$AI_BASE/operations" -d '{"expectedRevision":13,"operations":[{"type":"template","templateId":"blue-sequence"}]}'
```

`templateId` 必须来自[开源版内置模板](style-presets.md)。

## 保存与导出

`POST /api/tools/save` / `POST /api/tools/export`，body `{"expectedRevision":14}`。同样路由活跃页，检查当前版本，等待原子保存。export 直接返回当前版本 `{revision,html,text}`，其中 text 为输出 HTML 的可见纯文本（不含 Markdown 定界符或 frontmatter），并写项目 `export.json`。不运行文字一致性检查，没有准备或校验状态；GUI 复制也是直接获取最新状态，不复用旧导出。不执行发布，不上传图片。

## AI 导入图片

在用户要求加图或换图时，向 `POST /api/tools/assets` 发送一张现成本地图片。必须使用 Bearer 令牌和 `Content-Type: application/octet-stream`，支持 PNG、JPEG、WebP、GIF（最多 25 MiB）。本地转成 PNG，GIF 取首帧；接口不收 URL、文件路径或 SVG，也不向外部服务上传。

```bash
curl --fail-with-body -sS -H "Authorization: Bearer $AI_TOKEN" \
  -H 'Content-Type: application/octet-stream' --data-binary '@/path/to/image.png' "$AI_BASE/assets"
```

`@` 由 curl 在调用端读取文件。成功返回 `201` 和 `{id,path,mime,bytes}`，说明同一个活跃编辑页已登记并保存该资源，但正文和 revision 尚未改变。读取最新快照，以返回的 `id` 作为 `assetId` 提交 `insertBlock`（`block: "image"`）、`convertBlock`（仅空段落）或 `replaceImage`。GUI 手动上传不受影响。开源版提供的是本地图片编辑接口，不附带 Pro 的配图策划流程。

## 错误

- 401：令牌无效，或上传图片未使用 Bearer 令牌。
- 409：过期 revision / imageVersion / 没有活跃页 / 多页或磁盘版本冲突。
- 413 / 415：请求超限，或请求类型/编码不受支持。
- 422：非法操作、目标/范围/样式无效、图片无效或资源编码/导出失败。
- 504：活跃页响应超时，结果未知，需重新读取。

GUI 的插入流程先 insertBlock 一个空段落，再 convertBlock 为基础样式；两步独立可撤销，之后的键盘输入不会并入样式转换的撤销步骤。取消选择保留空段落；并发写入文字后再转换会拒绝，避免覆盖。目录、悬停和菜单打开不修改 revision。

操作原子性限于单批文档事务，不是跨网络的分布式事务。不保存 CRDT，不做过期自动合并，不跨刷新持久化 undo 栈。不要绕过工具直接编辑磁盘快照。
