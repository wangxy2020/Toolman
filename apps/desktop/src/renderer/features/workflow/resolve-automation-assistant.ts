import {
  isAutomationAssistantName,
  type Assistant,
} from '@toolman/shared'

/** Resolve the dedicated「自动化」assistant (never 课堂 / 通用 / 项目管理). */
export function resolveAutomationAssistant(assistants: readonly Assistant[]): Assistant | null {
  return assistants.find((item) => isAutomationAssistantName(item.name)) ?? null
}
