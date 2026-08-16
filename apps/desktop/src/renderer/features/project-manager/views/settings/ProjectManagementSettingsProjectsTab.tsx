import type { Dispatch, FC, SetStateAction } from 'react'
import type { PmProject } from '@toolman/shared'

type Props = {
  t: (key: string, params?: Record<string, string>) => string
  projects: PmProject[]
  deletingId: string | null
  statusLabel: (status: PmProject['status']) => string
  setPendingDeleteProject: Dispatch<SetStateAction<PmProject | null>>
}

export const ProjectManagementSettingsProjectsTab: FC<Props> = ({
  t,
  projects,
  deletingId,
  statusLabel,
  setPendingDeleteProject,
}) => (
  <div className="tm-kb-settings-form">
    <p className="tm-kb-settings-hint">
      {t('projectManagerPage.domainSettings.projectsHint')}
    </p>
    {projects.length === 0 ? (
      <p className="tm-kb-settings-hint">
        {t('projectManagerPage.domainSettings.projectsEmpty')}
      </p>
    ) : (
      <table className="tm-pm-database-table tm-pm-settings-projects-table">
        <thead>
          <tr>
            <th>{t('projectManagerPage.domainSettings.projectsColCode')}</th>
            <th>{t('projectManagerPage.domainSettings.projectsColName')}</th>
            <th>{t('projectManagerPage.domainSettings.projectsColStatus')}</th>
            <th>{t('projectManagerPage.domainSettings.projectsColActions')}</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id}>
              <td>{project.code}</td>
              <td>{project.name}</td>
              <td>{statusLabel(project.status)}</td>
              <td>
                <div className="tm-pm-database-actions">
                  <button
                    type="button"
                    className="tm-pm-settings-project-delete"
                    disabled={deletingId === project.id}
                    onClick={() => setPendingDeleteProject(project)}>
                    {deletingId === project.id
                      ? t('projectManagerPage.domainSettings.projectsDeleting')
                      : t('projectManagerPage.domainSettings.projectsDelete')}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)
