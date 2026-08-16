import { toErrorMessage } from '@toolman/shared'
import {
  buildAssistantLibCourseRuntimeHint,
  buildSocraticKnowledgeHint,
  buildSocraticModeRuntimeHint,
  isSocraticTeachingMode,
  resolveAssistantLibTeachingRuntime,
} from '@toolman/shared'
import { isGemmaThinkingOllamaModelId } from '@toolman/model-gateway'
import { buildToolSystemHint } from '../mcp-status.service'
import {
  buildAutonomousSystemHint,
  buildMemorySystemHint,
  buildSkillsSystemHint,
  buildWebSearchSystemHint,
  buildKnowledgeSystemHint,
  buildKnowledgeEnabledHint,
  buildKnowledgeEmptySearchHint,
  buildKnowledgeUnavailableHint,
  loadSoulMd,
} from '../agent-runtime.service'
import { resolveWorkingDirectory } from '../permission.service'
import { listRelevantMemories } from '../memory.service'
import { searchWeb } from '../web-search.service'
import {
  resolveEffectiveKbIds,
  searchKnowledgeForChat,
  getAssistantKbIds,
} from '../knowledge-document.service'
import { parseModelId } from '../provider.service'
import type { BuildRuntimeSystemHintsOptions } from './types'

function looksLikeDirectoryExportGoal(text: string): boolean {
  const goal = text.trim()
  if (!goal) return false
  const wantsListing = /目录|文件夹|文件列表|文件目录|扫描|整理|listing|directory|清单|子文件夹|子目录/.test(goal)
  const wantsSpreadsheet = /excel|xlsx|xls|csv|表格|导出|生成.*表/.test(goal)
  return wantsListing && wantsSpreadsheet
}

function buildDirectoryExportToolHint(): string {
  return [
    '## 目录扫描并导出表格',
    '用户要求扫描目录并生成 Excel/CSV 清单。务必完整执行，不要在中途仅用文字总结代替文件。',
    '1. **fs_list 只列一层**；递归扫描子文件夹请用 `fs_glob`（如 `**/*`）或 **bash + python3**（os.walk / pathlib.rglob）。',
    '2. 任务**未完成** until 已用 **fs_write** 写 .csv，或 **bash + openpyxl** 写 .xlsx 到当前工作目录。',
    '3. 仅调用 fs_list/fs_glob **不能结束**；看到列表后必须继续汇总并写文件。',
    '4. 若用户指定列名（如序号、文件名称、项目目录、文档资料），输出必须包含这些列。',
    '5. 工具路径用相对工作目录（`.` 或子目录名），不要用 `/Users/...` 绝对路径。',
  ].join('\n')
}

export async function appendRuntimeContextHints(
  hints: string[],
  options: BuildRuntimeSystemHintsOptions,
  session: ReturnType<typeof import('../session.service').getSession>,
  hasInlineAttachment: boolean,
): Promise<Awaited<ReturnType<typeof searchKnowledgeForChat>>> {
  let kbResults: Awaited<ReturnType<typeof searchKnowledgeForChat>> = []

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
    if (looksLikeDirectoryExportGoal(options.userText)) {
      hints.push(buildDirectoryExportToolHint())
    }
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

  const assistantParams = options.assistant
    ? (() => {
        try {
          return JSON.parse(options.assistant.parametersJson) as Record<string, unknown>
        } catch {
          return {} as Record<string, unknown>
        }
      })()
    : {}
  const teachingRuntime = resolveAssistantLibTeachingRuntime({
    sessionMetadata: session?.metadata,
    assistantParameters: assistantParams,
  })
  const socraticMode = isSocraticTeachingMode(teachingRuntime.teachingMode)

  if (socraticMode) {
    hints.push(buildSocraticModeRuntimeHint(teachingRuntime.roleplayId ?? ''))
  }
  const courseHint = buildAssistantLibCourseRuntimeHint(teachingRuntime)
  if (courseHint) {
    hints.push(courseHint)
  }

  if (!hasInlineAttachment && options.sendOptions?.kbEnabled === true && options.runtime.workspaceId) {
    const kbIds = resolveEffectiveKbIds({
      workspaceId: options.runtime.workspaceId,
      assistant: options.assistant,
      overrideKbIds: options.sendOptions?.kbIds?.length
        ? options.sendOptions.kbIds
        : teachingRuntime.kbIds,
    })

    if (kbIds.length > 0) {
      hints.push(buildKnowledgeEnabledHint())
      try {
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
        if (socraticMode) {
          if (results.length > 0) {
            hints.push(buildSocraticKnowledgeHint(results, options.userText))
          } else {
            hints.push(buildKnowledgeEmptySearchHint(options.userText))
          }
        } else {
          const knowledgeHint = buildKnowledgeSystemHint(results, options.userText)
          if (knowledgeHint) {
            hints.push(knowledgeHint)
          } else {
            hints.push(buildKnowledgeEmptySearchHint(options.userText))
          }
        }
      } catch (error) {
        hints.push(
          `## 知识库检索\n检索失败：${toErrorMessage(error, '未知错误')}。请基于已有知识回答。`,
        )
      }
    } else {
      const hasBoundKbIds =
        (options.sendOptions?.kbIds?.length ?? 0) > 0 ||
        getAssistantKbIds(options.assistant).length > 0
      hints.push(buildKnowledgeUnavailableHint({ hasBoundKbIds }))
    }
  }

  return kbResults
}
