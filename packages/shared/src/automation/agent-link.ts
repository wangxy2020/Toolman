export const AUTOMATION_ASSISTANT_NAME = '自动化'

const AUTOMATION_ASSISTANT_NAME_ALIASES = new Set([
  AUTOMATION_ASSISTANT_NAME,
  'Automation',
  '自动化智能体',
])

export function isAutomationAssistantName(name: string | null | undefined): boolean {
  return AUTOMATION_ASSISTANT_NAME_ALIASES.has((name ?? '').trim())
}

export function buildAutomationAssistantSystemPrompt(): string {
  return [
    '你是 Toolman「自动化」助手。',
    '协助用户规划、拆解与执行自动化任务与子任务。',
    '回答应清晰、可执行；需要多步骤时请分步给出。',
  ].join('\n')
}
