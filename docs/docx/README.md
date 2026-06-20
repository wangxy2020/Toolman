# DOCX MCP 文档审查

Toolman 通过 `docx-mcp-server` 对 Word 文档执行结构化审查，生成修订版副本（不覆盖原件）。

| 文档 | 说明 |
|------|------|
| [DOCX_REVIEW_GUIDE.md](./DOCX_REVIEW_GUIDE.md) | 审查流水线、修改类型、关键词、风险与使用建议 |

实现入口：

- `apps/desktop/src/main/services/docx-review.service.ts` — 审查 prompt、issue 解析与应用
- `apps/desktop/src/main/services/docx-mcp-task.service.ts` — 工作副本、深度审查与整段重写关键词检测
