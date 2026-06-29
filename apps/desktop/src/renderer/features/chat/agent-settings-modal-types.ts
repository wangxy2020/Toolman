import type { Assistant, Provider, Session, Workspace } from '@toolman/shared'

export type SettingsTab =
  | 'basic'
  | 'prompt'
  | 'permission'
  | 'tools'
  | 'skills'
  | 'knowledge'
  | 'advanced'

export interface AgentSettingsModalProps {
  assistant: Assistant
  workspace: Workspace | null
  providers: Provider[]
  activeSession?: Session | null
  onClose: () => void
  onSaved?: () => void
}
