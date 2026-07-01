import type { EpcProjectRecord } from '@toolman/shared'
import { useI18n } from '../../../i18n/useI18n'

export function ProjectStatusBadge({ status }: { status: EpcProjectRecord['status'] }) {
  const { t } = useI18n()
  const className =
    status === 'critical'
      ? 'tm-pm-status tm-pm-status--critical'
      : status === 'warning'
        ? 'tm-pm-status tm-pm-status--warning'
        : 'tm-pm-status tm-pm-status--normal'
  const label =
    status === 'critical'
      ? t('projectManagerPage.dashboard.status.critical')
      : status === 'warning'
        ? t('projectManagerPage.dashboard.status.warning')
        : t('projectManagerPage.dashboard.status.normal')

  return <span className={className}>{label}</span>
}
