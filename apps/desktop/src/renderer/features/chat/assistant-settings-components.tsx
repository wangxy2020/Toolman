import type { ReactNode } from 'react'

export function AssistantSettingsHelpHint({ title }: { title: string }) {
  return (
    <span className="tm-agent-help" title={title} aria-label={title}>
      ⓘ
    </span>
  )
}

export function AssistantSettingsRequiredMark({ children }: { children?: ReactNode }) {
  return (
    <span className="tm-agent-required" aria-hidden="true">
      {children ?? '*'}
    </span>
  )
}
