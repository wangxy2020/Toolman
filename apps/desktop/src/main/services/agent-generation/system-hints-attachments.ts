import {
  DOCX_MCP_SERVER_ID,
  EXCEL_MCP_SERVER_ID,
  isDocxMcpSourceFileBlock,
  isExcelMcpSourceFileBlock,
} from '@toolman/shared'
import { resolveWorkingDirectory } from '../permission.service'
import { resolveAttachmentReadPath } from '../resolve-user-content-blocks.service'
import type { BuildRuntimeSystemHintsOptions } from './types'

export function appendAttachmentSystemHints(
  hints: string[],
  options: BuildRuntimeSystemHintsOptions,
): { docxMcpEnabled: boolean; excelMcpEnabled: boolean } {
  const docxBlocks =
    options.userContentBlocks?.filter(
      (block): block is Extract<import('@toolman/shared').ContentBlock, { type: 'file' }> =>
        block.type === 'file' && isDocxMcpSourceFileBlock(block),
    ) ?? []
  const docxMcpEnabled =
    options.enableTools &&
    options.mcpServerIds.includes(DOCX_MCP_SERVER_ID) &&
    docxBlocks.length > 0

  const excelBlocks =
    options.userContentBlocks?.filter(
      (block): block is Extract<import('@toolman/shared').ContentBlock, { type: 'file' }> =>
        block.type === 'file' && isExcelMcpSourceFileBlock(block),
    ) ?? []
  const excelMcpEnabled =
    options.enableTools &&
    options.mcpServerIds.includes(EXCEL_MCP_SERVER_ID) &&
    excelBlocks.length > 0

  if (docxMcpEnabled) {
    const workdir = resolveWorkingDirectory(options.runtime.toolContext.workingDirectory)
    const sourcePaths = docxBlocks
      .map((block) => `- 源文件 ${block.name}: ${resolveAttachmentReadPath(block)}`)
      .join('\n')
    const workingPaths =
      options.docxWorkingCopies
        ?.map((copy) => `- 修订版 ${copy.fileName}: ${copy.workingPath}`)
        .join('\n') ?? ''
    hints.push(
      [
        '## Word 文档（DOCX MCP · 结构化审查流水线）',
        '用户上传了 Word 文档并要求审查、修订并生成新文件。应用将按以下阶段自动执行：',
        '1. **准备修订版**：`.docx` 复制为工作目录副本；`.doc`/`.wps` 通过 LibreOffice 或 Microsoft Word 转换为 docx（不使用 textutil，以免破坏目录域）；纯文本兜底会丢失目录与格式',
        '2. **读取**：应用调用 read_document 读取修订版全文',
        '3. **审查**：内置审查 prompt 生成结构化 issue JSON 列表（含 anchor_text、comment、replace）',
        '4. **应用**：应用根据 issue 列表批量调用 replace_texts / edit_paragraphs / add_comments 写入修订版',
        '5. **总结**：向你输出审查摘要与修订版绝对路径',
        'docx-mcp-server **没有** save_document；编辑类工具直接写入 file_path。',
        '**禁止**提及 Toolman Office Skills、office-audit、toolman-office、`apply_semantic_diff_overlay` 等已移除能力。',
        sourcePaths,
        workingPaths ? `修订版文件：\n${workingPaths}` : '',
        `工作文件路径：${workdir}`,
        '你无需再自行调用 DOCX 工具；若需补充说明，仅总结审查结果并给出修订版完整绝对路径（纯文本，不要 Markdown 链接）。',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  if (excelMcpEnabled) {
    const workdir = resolveWorkingDirectory(options.runtime.toolContext.workingDirectory)
    const sourcePaths = excelBlocks
      .map((block) => `- 源文件 ${block.name}: ${resolveAttachmentReadPath(block)}`)
      .join('\n')
    const workingPaths =
      options.excelWorkingCopies
        ?.map((copy) => `- 修订版 ${copy.fileName}: ${copy.workingPath}`)
        .join('\n') ?? ''
    hints.push(
      [
        '## Excel 表格（Excel MCP · 结构化审查流水线）',
        '用户上传了 Excel 并要求审查、修订并生成新文件。应用将按以下阶段自动执行：',
        '1. **准备修订版**：复制为工作目录中的 `修订版_*.xlsx` 副本',
        '2. **读取**：应用调用 read_excel / review_excel 读取修订版',
        '3. **审查**：内置审查 prompt 生成结构化 issue JSON（含 sheet、cell、modify/highlight）',
        '4. **应用**：应用调用 modify_excel_cells / highlight_excel_cells 写入修订版',
        '5. **总结**：向你输出审查摘要；修订版下载链接由应用自动附上',
        '**禁止**模拟工具执行、禁止手写假下载链接、禁止编造未实际修改的内容。',
        sourcePaths,
        workingPaths ? `修订版文件：\n${workingPaths}` : '',
        `工作文件路径：${workdir}`,
        '你无需再自行调用 Excel 工具。',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  if (
    options.userContentBlocks?.some(
      (block) =>
        block.type === 'file' &&
        block.content?.trim() &&
        !(docxMcpEnabled && isDocxMcpSourceFileBlock(block)) &&
        !(excelMcpEnabled && isExcelMcpSourceFileBlock(block)),
    )
  ) {
    hints.push(
      [
        '## 附件说明',
        '用户消息中已附带文件正文（已解析并内联在消息里），请直接阅读其中的「### 附件」段落作答。',
        '不要告诉用户去上传文件或访问本地路径；不要调用文件系统、Python 等工具去重新读取或解析这些附件。',
      ].join('\n'),
    )
  } else if (
    options.userContentBlocks?.some(
      (block) => block.type === 'file' && block.visionPages && block.visionPages.length > 0,
    )
  ) {
    hints.push(
      [
        '## 附件说明',
        '用户已上传文档页面图片（见消息中的图片），请直接阅读图片内容作答。',
        '不要告诉用户去上传文件或访问本地路径。',
      ].join('\n'),
    )
  } else if (
    options.userContentBlocks?.some(
      (block) => block.type === 'image' && block.blobHash?.trim(),
    )
  ) {
    hints.push(
      [
        '## 附件说明',
        '用户消息中已附带图片，请结合图片内容作答。',
        '不要调用工具去重新读取图片文件。',
      ].join('\n'),
    )
  }

  return { docxMcpEnabled, excelMcpEnabled }
}
