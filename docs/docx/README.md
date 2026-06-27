# DOCX MCP 文档审查

Toolman 通过**内置 DOCX MCP** 对 Word 文档执行结构化审查，生成修订版副本（不覆盖原件）。

## 架构（2026-06）

```
.doc / .wps / .wpsx / .docx
        │
        ▼
 toolman-docx-core (Rust / office_oxide + LibreOffice)
        │  统一转为 .docx 工作副本
        ▼
 @knorq/docx-mcp-server (内置 TypeScript MCP)
        │  read_document / add_comment / replace_text …
        ▼
 docx-review.service.ts（审查流水线）
```

| 格式 | 处理方式 |
|------|----------|
| `.docx` | 直接使用 |
| `.doc` | `office_oxide` 转 docx |
| `.wpsx` | 按 OpenXML 处理（同 docx） |
| 旧 `.wps` | LibreOffice headless 转 docx（需本机安装） |

打包后 MCP 不再依赖系统 `npx` / Node PATH，使用 Electron 内置 Node 启动 `resources/mcp-docx/dist/docxServer.js`。

## 相关代码

- `crates/toolman-docx-core/` — Rust 格式桥
- `mcp-servers/docx/` — 内置 MCP 启动器
- `apps/desktop/src/main/services/docx-mcp-paths.ts`
- `apps/desktop/src/main/services/office-to-docx.service.ts`
- `apps/desktop/src/main/services/docx-review.service.ts`
- `apps/desktop/src/main/services/docx-mcp-task.service.ts`

详细流程见 [DOCX_REVIEW_GUIDE.md](./DOCX_REVIEW_GUIDE.md)。
