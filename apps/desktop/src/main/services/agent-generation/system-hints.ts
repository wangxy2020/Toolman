import { toErrorMessage } from '@toolman/shared'
import {
  DOCX_MCP_SERVER_ID,
  EXCEL_MCP_SERVER_ID,
  isDocxMcpSourceFileBlock,
  isExcelMcpSourceFileBlock,
  parseProjectManagementSessionMetadata,
  buildProjectManagementRuntimeHint,
} from '@toolman/shared'
import { isGemmaThinkingOllamaModelId } from '@toolman/model-gateway'
import { buildToolSystemHint } from '../mcp-status.service'
import {
  buildAutonomousSystemHint,
  buildMemorySystemHint,
  buildSkillsSystemHint,
  buildWebSearchSystemHint,
  buildKnowledgeSystemHint,
  loadSoulMd,
} from '../agent-runtime.service'
import { resolveWorkingDirectory } from '../permission.service'
import { listRelevantMemories } from '../memory.service'
import { searchWeb } from '../web-search.service'
import {
  resolveEffectiveKbIds,
  searchKnowledgeForChat,
} from '../knowledge-document.service'
import { parseModelId } from '../provider.service'
import { resolveAttachmentReadPath } from '../resolve-user-content-blocks.service'
import { getSession } from '../session.service'
import type { BuildRuntimeSystemHintsOptions } from './types'

export async function buildRuntimeSystemHints(
  options: BuildRuntimeSystemHintsOptions,
): Promise<{ hints: string[]; kbResults: Awaited<ReturnType<typeof searchKnowledgeForChat>> }> {
  const hints: string[] = []
  let kbResults: Awaited<ReturnType<typeof searchKnowledgeForChat>> = []

  if (options.sessionId) {
    const session = getSession({ id: options.sessionId })
    if (session) {
      const projectManagement = parseProjectManagementSessionMetadata(session.metadata)
      if (projectManagement) {
        hints.push(buildProjectManagementRuntimeHint(projectManagement.tab))
      }
    }
  }

  const hasInlineAttachment = options.userContentBlocks?.some(
    (block) =>
      (block.type === 'file' && (block.content?.trim() || (block.visionPages && block.visionPages.length > 0))) ||
      (block.type === 'image' && block.blobHash?.trim()),
  )

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

  if (options.enableTools) {
    hints.push(buildToolSystemHint(options.runtime.toolContext, options.mcpServerIds))
    const workdir = resolveWorkingDirectory(options.runtime.toolContext.workingDirectory)
    hints.push(
      [
        '## 工作目录',
        `当前工具工作目录：${workdir}`,
        '使用 fs_glob、fs_list、fs_read 等工具时，默认从此目录搜索文件。',
      ].join('\n'),
    )
  }

  const compactSystemHints = (() => {
    if (!options.modelId) return false
    const { providerId, model } = parseModelId(options.modelId)
    if (providerId !== 'ollama') return false
    return isGemmaThinkingOllamaModelId(model)
  })()

  const skillsHint = buildSkillsSystemHint(options.runtime.skillIds, {
    compact: compactSystemHints,
  })
  if (skillsHint) hints.push(skillsHint)

  const soul = loadSoulMd(options.runtime.toolContext.workingDirectory)
  if (soul) {
    hints.push(['## 身份设定（soul.md）', soul].join('\n\n'))
  }

  if (options.runtime.autonomousMode) {
    hints.push(buildAutonomousSystemHint())
  }

  if (!hasInlineAttachment && options.sendOptions?.memoryEnabled && options.runtime.workspaceId) {
    const memories = await listRelevantMemories(options.runtime.workspaceId, options.userText, {
      assistantId: options.runtime.assistantId,
      retentionDays: options.sendOptions.memoryRetentionDays,
    })
    const memoryHint = buildMemorySystemHint(memories)
    if (memoryHint) hints.push(memoryHint)
  }

  if (!hasInlineAttachment && options.sendOptions?.webSearchEnabled) {
    try {
      const result = await searchWeb(
        options.userText,
        options.sendOptions.webSearchProvider ?? 'bing',
      )
      hints.push(buildWebSearchSystemHint(result, options.userText))
    } catch (error) {
      hints.push(
        `## 网络搜索\n检索失败：${toErrorMessage(error, '未知错误')}。请基于已有知识回答。`,
      )
    }
  }

  if (!hasInlineAttachment && options.sendOptions?.kbEnabled === true && options.runtime.workspaceId) {
    const kbIds = resolveEffectiveKbIds({
      workspaceId: options.runtime.workspaceId,
      assistant: options.assistant,
      overrideKbIds: options.sendOptions?.kbIds,
    })

    if (kbIds.length > 0) {
      try {
        const assistantParams = options.assistant
          ? (JSON.parse(options.assistant.parametersJson) as Record<string, unknown>)
          : {}
        const results = await searchKnowledgeForChat({
          workspaceId: options.runtime.workspaceId,
          kbIds,
          query: options.userText,
          topK:
            options.sendOptions?.kbTopK ??
            (assistantParams.kbTopK as number | undefined),
          scoreThreshold:
            options.sendOptions?.kbScoreThreshold ??
            (assistantParams.kbScoreThreshold as number | undefined),
          kbSettings: assistantParams.kbSettings as
            | Record<string, { topK?: number; scoreThreshold?: number }>
            | undefined,
        })
        kbResults = results
        const knowledgeHint = buildKnowledgeSystemHint(results, options.userText)
        if (knowledgeHint) hints.push(knowledgeHint)
      } catch (error) {
        hints.push(
          `## 知识库检索\n检索失败：${toErrorMessage(error, '未知错误')}。请基于已有知识回答。`,
        )
      }
    }
  }

  return {
    hints: hints.filter((item) => item.trim().length > 0),
    kbResults,
  }
}
