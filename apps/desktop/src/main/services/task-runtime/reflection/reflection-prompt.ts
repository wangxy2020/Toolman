import type { AgentTask, TaskArtifact, TaskStepRecord } from '@toolman/shared'
import { summarizeStepOutput } from '@toolman/shared'

export function buildReflectionSystemPrompt(): string {
  return `你是 Toolman 自主任务反思器。根据任务目标、步骤执行结果与产物，评估当前进展并输出**仅包含 JSON 对象**：

{
  "verdict": "pass"|"fail"|"replan"|"continue"|"abort",
  "reason": string,
  "summary"?: string,
  "nextSteps"?: [{ "kind": string, "title": string, "description"?: string, "tool"?: { "toolName": string, "argsJson": string } }]
}

verdict 含义：
- pass：目标已达成，可结束任务（**必须**有真实产物或工具输出可验证；禁止仅凭推测 pass）
- continue：进展正常，但尚未完成，可继续执行剩余步骤
- replan：当前计划不足，需要补充/调整后续步骤（提供 nextSteps）
- fail：无法完成目标（reason 说明原因）
- abort：用户目标不应继续（等同 fail）

若 verdict 为 replan，nextSteps 必须包含至少一个带 tool 的可执行步骤。

若 steps 中 bash 输出含 ERROR:、或未找到 Excel 文件、或产物文件不存在，verdict 必须为 fail 或 replan，不能 pass。`
}

function formatStep(step: TaskStepRecord) {
  return {
    id: step.id,
    kind: step.kind,
    title: step.title,
    status: step.status,
    output: summarizeStepOutput(step.output),
    error: step.error,
  }
}

export function buildReflectionUserPrompt(
  task: Pick<AgentTask, 'title' | 'goal' | 'notes' | 'history'>,
  artifacts: TaskArtifact[],
): string {
  const goal = task.goal?.trim() || task.title
  const notes = task.notes?.trim()
  const payload = {
    goal,
    notes: notes || undefined,
    steps: task.history.map(formatStep),
    artifacts: artifacts.map((item) => ({
      name: item.name,
      kind: item.kind,
      relativePath: item.relativePath,
    })),
  }

  return `请评估以下自主任务进展并输出 JSON：\n${JSON.stringify(payload, null, 2)}`
}
