import {
  PM_AGENT_RESOURCE_TYPE_LABELS,
  resolvePmAgentResourceTypeLabel,
} from './pm-resource-apply.js'
import type { PmCostAssignmentSuggestion, PmCostTaskPlanSuggestion } from './pm-cost-apply-schema.js'
import {
  extractJsonArraySnippet,
  extractJsonObjectSnippet,
  parseCostPlanArray,
  parsePmCostPlanFromText,
  rootLooksLikeResourcePlanOnly,
  type PmParsedCostPlanFromText,
} from './pm-cost-apply-parse.js'

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}

function formatCostTypeCell(entry: PmCostAssignmentSuggestion): string {
  if (entry.type) {
    const resolved = resolvePmAgentResourceTypeLabel(entry.type) ?? entry.type
    return (
      (PM_AGENT_RESOURCE_TYPE_LABELS as Record<string, string>)[resolved] ??
      resolved
    )
  }
  const fromLabel = entry.typeLabel
    ? resolvePmAgentResourceTypeLabel(entry.typeLabel)
    : null
  if (fromLabel) return PM_AGENT_RESOURCE_TYPE_LABELS[fromLabel]
  return entry.typeLabel?.trim() || '—'
}

function formatAmountCell(entry: PmCostAssignmentSuggestion): string {
  if (entry.amount != null && Number.isFinite(entry.amount)) return String(entry.amount)
  if (entry.quantity != null && entry.unitPrice != null) {
    return String(entry.quantity * entry.unitPrice)
  }
  return '—'
}

/** Human-readable cost plan table for chat display. */
export function formatPmCostPlanAsMarkdownTable(plan: PmParsedCostPlanFromText): string {
  const { costPlan } = plan
  if (costPlan.length === 0) return ''

  const lines: string[] = [
    '### 成本计划',
    '',
    '| 任务名称 | 类型 | 费用名称 | 数量 | 单价 | 金额 | 单位 |',
    '| --- | :---: | --- | :---: | :---: | :---: | :---: |',
  ]

  for (const task of costPlan) {
    const title = escapeMarkdownTableCell(
      task.workItemTitle?.trim() || task.workItemCode?.trim() || task.workItemId || '任务',
    )
    for (const entry of task.assignments) {
      lines.push(
        `| ${title} | ${escapeMarkdownTableCell(formatCostTypeCell(entry))} | ${escapeMarkdownTableCell(
          entry.name,
        )} | ${entry.quantity ?? '—'} | ${entry.unitPrice ?? '—'} | ${formatAmountCell(entry)} | ${escapeMarkdownTableCell(
          entry.unit?.trim() || '—',
        )} |`,
      )
    }
  }

  return lines.join('\n')
}
const COST_JSON_CONFIRM_LABEL_RE = /JSON\s*数据结构\s*[（(]供系统确认[）)]\s*[:：]?\s*/gi

/**
 * Replace costPlan JSON (fenced, raw, or embedded after a confirm label) with a readable table.
 * Original message text is unchanged — apply/parse still uses the stored JSON.
 */
export function presentPmCostPlanMarkdownForDisplay(text: string): string {
  let replacedFence = false
  const withFences = text.replace(
    /```(?:json)?\s*([\s\S]*?)```/gi,
    (full, body: string) => {
      try {
        const parsed = JSON.parse(body.trim()) as unknown
        let costPlan: PmCostTaskPlanSuggestion[] = []
        if (Array.isArray(parsed)) {
          costPlan = parseCostPlanArray(parsed)
        } else if (parsed && typeof parsed === 'object') {
          const root = parsed as Record<string, unknown>
          if (rootLooksLikeResourcePlanOnly(root)) return full
          if (!('costPlan' in root || 'costAssignments' in root)) return full
          if ('wbs' in root || 'projectPlan' in root) return full
          costPlan = parseCostPlanArray(root.costPlan ?? root.costAssignments)
        }
        if (costPlan.length === 0) return full
        replacedFence = true
        return formatPmCostPlanAsMarkdownTable({ costPlan })
      } catch {
        return full
      }
    },
  )
  if (replacedFence) {
    return withFences.replace(COST_JSON_CONFIRM_LABEL_RE, '')
  }

  const plan = parsePmCostPlanFromText(text)
  if (plan.costPlan.length === 0) return text

  const snippet = extractJsonObjectSnippet(text) ?? extractJsonArraySnippet(text)
  if (!snippet) return text

  const table = formatPmCostPlanAsMarkdownTable(plan)
  const withoutLabel = text.replace(COST_JSON_CONFIRM_LABEL_RE, '')
  const idx = withoutLabel.indexOf(snippet)
  if (idx < 0) {
    // Fallback: whole-text JSON
    const trimmed = text.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return table
    return text
  }
  return `${withoutLabel.slice(0, idx).trimEnd()}\n\n${table}\n\n${withoutLabel
    .slice(idx + snippet.length)
    .trimStart()}`.trim()
}

/** Prompt fragment: how the plan agent should emit cost assignments. */
export const PM_COST_PLAN_OUTPUT_HINT = [
  '## 成本计划输出（写入甘特「成本分配」）',
  '仅在进度计划已完善、甘特中已有任务时再输出成本分配；不要与进度 WBS / 资源计划写在同一条消息里。',
  '1. **先**输出 Markdown 成本表（给人阅读），列固定为：',
  '   | 任务名称 | 类型 | 费用名称 | 数量 | 单价 | 金额 | 单位 |',
  '2. **再**附加如下 JSON（可用 ```json 代码块），供系统确认写入；聊天界面会隐藏该 JSON 并展示为表格：',
  '{',
  '  "costPlan": [',
  '    {',
  '      "workItemId": "优先填写下方任务列表中的任务 id（uuid）",',
  '      "workItemCode": "无法确定 id 时，可填写任务编号（WBS 编码等）",',
  '      "workItemTitle": "无法确定 id/编号时，填写与甘特任务名称一致的叶子任务作为兜底",',
  '      "assignments": [',
  '        { "type": "material", "name": "商品混凝土", "quantity": 30, "unitPrice": 420, "unit": "m³" }',
  '      ]',
  '    }',
  '  ]',
  '}',
  'amount 可直接给出，或省略由 quantity × unitPrice 计算。',
  'type 可用：labor/auxiliary/material/equipment/device/instrument/funds/custom/management/fees/comprehensive/measures/other/tax/investment/designEstimate/constructionBudget/costBudget（或中文：人力/辅材/材料/机械/设备/仪器/资金/自定义/管理费/规费/综合单价/措施费/其他费/税金/投资估算/设计概算/施工预算/成本预算）。',
  '名称尽量使用价格表中的现有名称；若需新增，仍输出该名称，系统确认后会写入「全部项目」价格表。',
  '同一任务再次应用时按名称合并金额，不会无故清空其他成本项。',
].join('\n')
