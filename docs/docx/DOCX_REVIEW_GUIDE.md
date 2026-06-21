# Word 文档 DOCX MCP 审查修改说明

> 适用：Toolman 桌面端 + `docx-mcp-server`（结构化审查流水线）

## 1. 整体流程

用户上传 **`.docx`、`.doc` 或 `.wps`** 且智能体挂载 `docx-mcp-server` 后，应用自动执行：

1. **准备修订版**（工作目录，不覆盖用户原文件）：
   - **`.docx`**：复制为 `修订版_<文件名>.docx`
   - **`.doc` / `.wps`**：转换为 docx 后直接写入 `修订版_<文件名>.docx`（不产生第二个中间副本）
2. **读取**：`read_document` 读取修订版全文（含 `paragraph_index`）
3. **审查**：内置审查 prompt 让模型输出 **JSON issue 列表**
4. **应用**：按 issue 批量调用 MCP 工具写入修订版
5. **总结**：输出审查摘要与修订版绝对路径

转换优先级（`.doc`/`.wps`）：

| 本机环境 | 尝试顺序 | 说明 |
|----------|----------|------|
| **任意** | LibreOffice | 跨平台，保留格式（推荐无 Word 时安装） |
| **macOS** | Microsoft Word | AppleScript 另存为 docx |
| **Windows** | Microsoft Word | COM 自动化另存为 docx |
| **未装 Word** | 纯文本 docx（仅 `.doc`） | 会丢失目录/格式/大纲；状态栏与统计卡片会明确提示 |

**已安装 Word 但自动化失败**：不会静默降级为纯文本，需授权自动化（macOS）或手动另存为 `.docx`。

**不要使用 macOS textutil**：对含目录域、交叉引用的合同类文档会产生乱码域代码并损坏 docx 结构。

相关代码：`docx-review.service.ts`、`docx-mcp-task.service.ts`、`agent.service.ts`。

---

## 2. 用户消息中的关键词

### 2.1 深度审查模式

用户消息匹配以下词时，进入**深度编辑模式**（至少 3 次编辑类工具调用后才允许结束）：

| 中文 | 英文 |
|------|------|
| 审查、审阅、批注、修订、修改 | review |
| 纠错、优化、润色、校对 | comment、audit、annotate |

检测函数：`isDocxThoroughEditRequest()`（`docx-mcp-task.service.ts`）。

### 2.2 允许整段替换（`edit_paragraph`）

**默认禁止** `edit_paragraph`。仅当用户消息包含**强指令**时才允许模型输出 `edit_paragraph` issue。

匹配示例（`requestsDocxParagraphRewrite()`）：

| 类型 | 示例 |
|------|------|
| 整段操作 | 整段重写、整段替换、整段改写、整段修改 |
| 段落操作 | 段落重写、段落改写、段落替换、重写该段 |
| 结构操作 | 列表化、重组段落、重组结构、按列表重写 |
| 全文 | 全文重写 |
| 英文 | rewrite paragraph、full paragraph |

未命中上述强指令时，审查 prompt 要求：**优先 `replace` 与 `comment`，不要使用 `edit_paragraph`**。

---

## 3. Issue 字段说明

每个 issue 为 JSON 对象：

| 字段 | 取值 | 作用 |
|------|------|------|
| `action` | `comment` / `replace` / `edit_paragraph` | **决定 MCP 工具** |
| `severity` | `high` / `medium` / `low` | 严重程度（分类） |
| `category` | `error` / `wording` / `structure` / `terminology` / `other` | 问题类型（分类） |
| `anchor_text` | 文档原文片段 | 定位 / 批注锚点 |
| `paragraph_index` | 非负整数 | **`edit_paragraph` 必填** |
| `replacement` | 新文本 | **`replace` / `edit_paragraph` 必填** |
| `comment` | 说明 | 纯批注或修改理由（应用层可额外写入 Word 批注） |

`category` / `severity` 不直接映射工具，但会影响模型倾向（例如 `structure` 曾易触发整段重写，现已在 prompt 中约束）。

---

## 4. 三种修改方式

### 4.1 `comment` — 轻量（最安全）

| 项目 | 说明 |
|------|------|
| MCP 工具 | `add_comment` / `add_comments` |
| 正文改动 | **无**，仅 Word 批注 |
| 适用 | 需人工判断、信息不足、跨段关联、只建议不改字 |
| 风险 | **低** |

### 4.2 `replace` — 轻量～中等（默认首选）

| 项目 | 说明 |
|------|------|
| MCP 工具 | `replace_text` / `replace_texts` |
| 正文改动 | 将 `anchor_text` **精确子串**替换为 `replacement` |
| 适用 | 错别字、语法、措辞、术语、句内调整 |
| 风险 | **中** |

风险点：

- `anchor_text` 不唯一 → 可能多处被替换
- 锚点与文档不完全一致 → 失败
- 子串过短 → 误伤
- `track_changes: true` → 修订视图下可见增删

### 4.3 `edit_paragraph` — 全段落（默认禁用）

| 项目 | 说明 |
|------|------|
| MCP 工具 | `edit_paragraph` / `edit_paragraphs` |
| 正文改动 | 按 `paragraph_index` **整段覆盖**为 `new_text` |
| 适用 | 用户**明确要求**整段重写 / 列表化 / 重组段落，且 `replace` 无法完成 |
| 风险 | **高** |

风险点：

- 整段覆盖，未保留的原文会丢失
- 模型易扩写，篇幅明显变长
- 段内格式（加粗、编号等）可能丢失
- `paragraph_index` 错误 → 改错段

---

## 5. MCP 工具与修改强度

| 工具 | 只读/编辑 | 强度 |
|------|-----------|------|
| `read_document`、`search_text` 等 | 只读 | 无 |
| `add_comment` / `add_comments` | 编辑 | 轻 |
| `replace_text` / `replace_texts` | 编辑 | 轻～中 |
| `edit_paragraph` / `edit_paragraphs` | 编辑 | **重** |

应用顺序：**批注（含 replace 的修改说明）→ replace → edit_paragraph**。

说明：replace / edit_paragraph 的 `comment` 会在**替换前**锚定到 `anchor_text` 原文写入批注，再执行正文替换；避免替换后用 `replacement` 作锚点导致批注失败。

---

## 6. 为何段落修订后内容变多？

1. **`edit_paragraph` 是整段替换**，不是 diff；模型常输出完整新段而非最小改动。
2. **深度审查模式**会推动至少 3 次编辑，整体改动偏多。
3. **修订跟踪**（`track_changes: true`）在 Word 中同时显示删除与插入。
4. **说明批注**：`replace` / `edit_paragraph` 若带 `comment`，在替换前写入批注（锚点为原文 `anchor_text`）。
5. **`replace` 全局匹配**：锚点重复时多处替换，视觉上改动变多。

当前 prompt 策略（2026-03）：默认禁止 `edit_paragraph`，强制优先 `replace`，并要求 `replacement` 尽量短、贴近原文。

---

## 7. 风险等级汇总

| 等级 | 场景 | 后果 |
|------|------|------|
| 低 | `comment` | 仅批注 |
| 中 | `replace`（锚点唯一、改动小） | 局部替换 |
| 中～高 | `replace`（锚点模糊/重复） | 误改多处 |
| 高 | `edit_paragraph` | 整段重写、扩写、格式变化 |
| 高 | 错误的 `paragraph_index` | 改错段 |

---

## 8. 使用建议

### 只要批注、不改正文

> 只添加批注，不要修改正文，不要使用 replace 或 edit_paragraph。

### 只要局部纠错

> 仅修正错别字和语法，使用最小范围 replace，不要整段重写。

### 需要整段重写

需包含强指令，例如：

> 将第 3 段**整段重写**为条目列表。

### 审阅结果

- 在 Word 中打开「修订版_*.docx」，使用修订视图查看增删。
- 关注消息中的 `docx_review_summary`：**段落修订数**高通常意味着改动范围大。

---

## 9. 示例

原文：

> 本项目效果很好，需要进一步优化。

| action | 结果 |
|--------|------|
| `comment` | 旁注「建议改为更正式表述」，正文不变 |
| `replace` | 「效果很好」→「成效显著」 |
| `edit_paragraph` | 整段变为分条列表（明显变长，需用户强指令才应使用） |

---

## 10. Prompt 策略摘要

| 条件 | `replace` | `comment` | `edit_paragraph` |
|------|-----------|-----------|------------------|
| 默认（无整段强指令） | **首选** | 允许 | **禁止** |
| 含整段强指令 | **仍首选** | 允许 | 仅当 replace 不足时 |

审查 system prompt：`buildDocxAuditSystemPrompt({ userRequest })`  
整段强指令检测：`requestsDocxParagraphRewrite(userRequest)`
