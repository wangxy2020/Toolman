import type { PmProject } from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'

interface Props {
  projects: PmProject[]
  value: string | null
  onChange: (projectId: string | null) => void
  ariaLabel: string
}

/** Breadcrumb project picker shared across plan-management views. */
export function PmHeaderProjectSelect({
  projects,
  value,
  onChange,
  ariaLabel,
}: Props) {
  const { t } = useI18n()

  return (
    <span className="tm-module-breadcrumb-group tm-pm-header-project">
      <span className="tm-chat-breadcrumb-sep">/</span>
      <select
        className="tm-model-pill tm-module-pill tm-module-pill--secondary tm-pm-header-project-select"
        value={
          value && projects.some((project) => project.id === value) ? value : ''
        }
        onChange={(event) => {
          onChange(event.target.value || null)
        }}
        aria-label={ariaLabel}>
        <option value="">{t('projectManagerPage.headerProject.allProjects')}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.code} · {project.name}
          </option>
        ))}
      </select>
    </span>
  )
}
