import type { AppGetDiagnosticsOutput } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { SettingsCollapsibleSection } from './SettingsShared'
import { formatTime } from './diagnostics-settings-utils'

interface Props {
  snapshot: AppGetDiagnosticsOutput
}

export function DiagnosticsSettingsEventsSection({ snapshot }: Props) {
  const { t } = useI18n()

  if (snapshot.recentEvents.length === 0) return null

  return (
    <SettingsCollapsibleSection title={t('settings.diagnostics.events.section')}>
      <ul className="tm-diagnostics-event-list">
        {snapshot.recentEvents.map((event, index) => (
          <li key={`${event.at}-${index}`} className={`tm-diagnostics-event tm-diagnostics-event--${event.level}`}>
            <span className="tm-diagnostics-event-time">{formatTime(event.at)}</span>
            <span className="tm-diagnostics-event-subsystem">{event.subsystem}</span>
            <span className="tm-diagnostics-event-message">{event.message}</span>
          </li>
        ))}
      </ul>
    </SettingsCollapsibleSection>
  )
}
