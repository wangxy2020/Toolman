import {
  PM_AGENT_RESOURCE_TYPE_LABELS,
  resolvePmAgentResourceTypeLabel,
  type PmResourceAssignmentSuggestion,
  type PmResourceTaskPlanSuggestion,
  type PmTaskResourceAssignment,
} from './pm-resource-apply-schema.js'
import {
  extractJsonArraySnippet,
  extractJsonObjectSnippet,
  parsePmResourcePlanFromText,
  parseResourcePlanArray,
  type PmParsedResourcePlanFromText,
} from './pm-resource-apply-parse.js'

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}

function formatResourceTypeCell(entry: PmResourceAssignmentSuggestion): string {
  if (entry.type) return PM_AGENT_RESOURCE_TYPE_LABELS[entry.type]
  const resolved = entry.typeLabel
    ? resolvePmAgentResourceTypeLabel(entry.typeLabel)
    : null
  if (resolved) return PM_AGENT_RESOURCE_TYPE_LABELS[resolved]
  return entry.typeLabel?.trim() || '—'
}

export function formatPmResourcePlanAsMarkdownTable(
  plan: PmParsedResourcePlanFromText,
): string {
  const { resourcePlan } = plan
  if (resourcePlan.length === 0) return ''

  const lines: string[] = [
    '### 资源计划',
    '',
    '| 任务名称 | 类型 | 资源名称 | 数量 | 单位 |',
    '| --- | :---: | --- | :---: | :---: |',
  ]

  for (const task of resourcePlan) {
    const title = escapeMarkdownTableCell(
      task.workItemTitle?.trim() || task.workItemCode?.trim() || task.workItemId || '任务',
    )
    for (const entry of task.assignments) {
      lines.push(
        `| ${title} | ${escapeMarkdownTableCell(formatResourceTypeCell(entry))} | ${escapeMarkdownTableCell(
          entry.name,
        )} | ${entry.quantity ?? '—'} | ${escapeMarkdownTableCell(entry.unit?.trim() || '—')} |`,
      )
    }
  }

  return lines.join('\n')
}

/**
 * Replace resourcePlan JSON (fenced or raw) with a readable markdown table for chat UI.
 * Original message text is unchanged — apply/parse still uses the stored JSON.
 */
export function presentPmResourcePlanMarkdownForDisplay(text: string): string {
  let replacedFence = false
  const withFences = text.replace(
    /```(?:json)?\s*([\s\S]*?)```/gi,
    (full, body: string) => {
      try {
        const parsed = JSON.parse(body.trim()) as unknown
        let resourcePlan: PmResourceTaskPlanSuggestion[] = []
        if (Array.isArray(parsed)) {
          resourcePlan = parseResourcePlanArray(parsed)
        } else if (parsed && typeof parsed === 'object') {
          const root = parsed as Record<string, unknown>
          // Prefer explicit resourcePlan keys; do not treat bare WBS / cost as resources.
          if ('costPlan' in root || 'costAssignments' in root) {
            return full
          }
          if (!('resourcePlan' in root || 'resourceAssignments' in root || 'assignments' in root)) {
            return full
          }
          if ('wbs' in root || 'projectPlan' in root) {
            return full
          }
          resourcePlan = parseResourcePlanArray(
            root.resourcePlan ?? root.resourceAssignments ?? root.assignments,
          )
        }
        if (resourcePlan.length === 0) return full
        replacedFence = true
        return formatPmResourcePlanAsMarkdownTable({ resourcePlan })
      } catch {
        return full
      }
    },
  )
  if (replacedFence) {
    return withFences.replace(/JSON\s*数据结构\s*[（(]供系统确认[）)]\s*[:：]?\s*/gi, '')
  }

  // Pure costPlan messages must not be rewritten as resource tables.
  if (/"costPlan"\s*:/.test(text) && !/"resourcePlan"\s*:/.test(text)) {
    return text
  }

  const plan = parsePmResourcePlanFromText(text)
  if (plan.resourcePlan.length === 0) return text

  const snippet = extractJsonObjectSnippet(text) ?? extractJsonArraySnippet(text)
  if (snippet) {
    const table = formatPmResourcePlanAsMarkdownTable(plan)
    const withoutLabel = text.replace(
      /JSON\s*数据结构\s*[（(]供系统确认[）)]\s*[:：]?\s*/gi,
      '',
    )
    const idx = withoutLabel.indexOf(snippet)
    if (idx >= 0) {
      return `${withoutLabel.slice(0, idx).trimEnd()}\n\n${table}\n\n${withoutLabel
        .slice(idx + snippet.length)
        .trimStart()}`.trim()
    }
  }

  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return text
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const root = parsed as Record<string, unknown>
      if ('wbs' in root || 'projectPlan' in root) return text
      if ('costPlan' in root || 'costAssignments' in root) return text
    }
  } catch {
    return text
  }
  return formatPmResourcePlanAsMarkdownTable(plan)
}

export function normalizeResourceAssignmentSuggestion(
  entry: PmResourceAssignmentSuggestion,
): PmTaskResourceAssignment {
  const type =
    entry.type ??
    (entry.typeLabel ? resolvePmAgentResourceTypeLabel(entry.typeLabel) : null) ??
    null
  return {
    resourceId: null,
    type,
    name: entry.name.trim(),
    quantity: entry.quantity ?? null,
    note: entry.note?.trim() ?? '',
  }
}

/** Prompt fragment: how the plan agent should emit resource quantities. */
export const PM_RESOURCE_PLAN_OUTPUT_HINT = [
  '## 资源计划输出（写入甘特「资源分配」）',
  '仅在进度计划已完善、甘特中已有任务时再输出资源分配；不要与进度 WBS / 成本计划写在同一条消息里。',
  '1. **先**输出 Markdown 资源表（给人阅读），列固定为：',
  '   | 任务名称 | 类型 | 资源名称 | 数量 | 单位 |',
  '2. **再**附加如下 JSON（可用 ```json 代码块），供系统确认写入；聊天界面会隐藏该 JSON 并展示为表格：',
  '{',
  '  "resourcePlan": [',
  '    {',
  '      "workItemId": "优先填写下方任务列表中的任务 id（uuid）",',
  '      "workItemTitle": "无法确定 id 时，填写与甘特任务名称一致的叶子任务作为兜底",',
  '      "assignments": [',
  '        { "type": "labor", "name": "普通工", "quantity": 20, "unit": "工日" }',
  '      ]',
  '    }',
  '  ]',
  '}',
  'type 可用：labor/auxiliary/material/equipment/device/instrument/funds/custom/management/fees/comprehensive/measures/other/tax/investment/designEstimate/constructionBudget/costBudget（或中文：人力/辅材/材料/机械/设备/仪器/资金/自定义/管理费/规费/综合单价/措施费/其他费/税金/投资估算/设计概算/施工预算/成本预算）。',
  '名称尽量使用资源列表中的现有名称；若需新增，仍输出该名称，系统确认后会写入「全部项目」资源列表。',
  '同一任务再次应用时按资源名称合并数量，不会无故清空其他资源。',
].join('\n')
