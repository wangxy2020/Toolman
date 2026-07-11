import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { KnowledgeBase, KnowledgeDocument, PmDocumentLink, PmProject, PmWorkItem } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { pmApi } from '../../pm-api'

interface Props {
  workspaceId: string
}

const ProjectDocumentLinksPanel: FC<Props> = ({ workspaceId }) => {
  const { t } = useI18n()
  const [projects, setProjects] = useState<PmProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [workItems, setWorkItems] = useState<PmWorkItem[]>([])
  const [selectedWorkItemId, setSelectedWorkItemId] = useState('')
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null)
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [links, setLinks] = useState<PmDocumentLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const workItemTitleById = useMemo(
    () => new Map(workItems.map((item) => [item.id, item.title])),
    [workItems],
  )

  const docTitleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const doc of documents) {
      map.set(doc.id, doc.title)
    }
    for (const link of links) {
      if (link.titleOverride) {
        map.set(link.knowledgeDocumentId, link.titleOverride)
      }
    }
    return map
  }, [documents, links])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [projectResult, kbResult] = await Promise.all([
        pmApi.listProjects(workspaceId),
        pmApi.listKnowledgeBases(workspaceId),
      ])
      setProjects(projectResult.projects)
      setKnowledgeBases(kbResult.items)
      const projectId = selectedProjectId ?? projectResult.projects[0]?.id ?? null
      setSelectedProjectId(projectId)
      const kbId = selectedKbId ?? kbResult.items[0]?.id ?? null
      setSelectedKbId(kbId)
      if (projectId) {
        const itemResult = await pmApi.listWorkItems({
          workspaceId,
          projectId,
          limit: 1000,
        })
        setWorkItems(itemResult.items)
      } else {
        setWorkItems([])
      }
      if (kbId) {
        const docResult = await pmApi.listKnowledgeDocuments(workspaceId, kbId)
        setDocuments(docResult.items)
      } else {
        setDocuments([])
      }
      const linkResult = await pmApi.listDocumentLinks(workspaceId, projectId ?? undefined)
      setLinks(linkResult.links)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [selectedKbId, selectedProjectId, workspaceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleLink = async (doc: KnowledgeDocument) => {
    if (!selectedKbId) return
    await pmApi.createDocumentLink({
      workspaceId,
      projectId: selectedProjectId ?? undefined,
      workItemId: selectedWorkItemId || undefined,
      knowledgeBaseId: selectedKbId,
      knowledgeDocumentId: doc.id,
      linkType: 'archive',
      titleOverride: doc.title,
    })
    await reload()
  }

  if (loading) {
    return <div className="tm-pm-empty">{t('projectManagerPage.documentLinks.loading')}</div>
  }

  if (error) {
    return <div className="tm-pm-empty">{error}</div>
  }

  return (
    <div className="tm-pm-document-links">
      <div className="tm-pm-database-toolbar">
        <label className="tm-pm-database-label">
          {t('projectManagerPage.database.project')}
          <select
            className="tm-pm-database-select"
            value={selectedProjectId ?? ''}
            onChange={(event) => {
              setSelectedProjectId(event.target.value || null)
              setSelectedWorkItemId('')
            }}>
            <option value="">{t('projectManagerPage.documentLinks.allProjects')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tm-pm-database-label">
          {t('projectManagerPage.documentLinks.workItem')}
          <select
            className="tm-pm-database-select"
            value={selectedWorkItemId}
            onChange={(event) => setSelectedWorkItemId(event.target.value)}
            disabled={!selectedProjectId}>
            <option value="">{t('projectManagerPage.documentLinks.noWorkItem')}</option>
            {workItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="tm-pm-database-label">
          {t('projectManagerPage.documentLinks.knowledgeBase')}
          <select
            className="tm-pm-database-select"
            value={selectedKbId ?? ''}
            onChange={(event) => setSelectedKbId(event.target.value || null)}>
            {knowledgeBases.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3>{t('projectManagerPage.documentLinks.linkedTitle')}</h3>
      {links.length === 0 ? (
        <div className="tm-pm-empty">{t('projectManagerPage.documentLinks.emptyLinks')}</div>
      ) : (
        <ul className="tm-pm-files-list">
          {links.map((link) => (
            <li key={link.id} className="tm-pm-files-item">
              <span>
                {docTitleById.get(link.knowledgeDocumentId) ?? link.knowledgeDocumentId}
                {link.workItemId ? (
                  <span className="tm-pm-files-meta">
                    {' '}
                    · {workItemTitleById.get(link.workItemId) ?? link.workItemId}
                  </span>
                ) : null}
              </span>
              <button type="button" onClick={() => void pmApi.deleteDocumentLink(link.id).then(reload)}>
                {t('projectManagerPage.database.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>{t('projectManagerPage.documentLinks.pickTitle')}</h3>
      {documents.length === 0 ? (
        <div className="tm-pm-empty">{t('projectManagerPage.documentLinks.emptyDocs')}</div>
      ) : (
        <ul className="tm-pm-files-list">
          {documents.map((doc) => (
            <li key={doc.id} className="tm-pm-files-item">
              <span>{doc.title}</span>
              <button type="button" onClick={() => void handleLink(doc)}>
                {t('projectManagerPage.documentLinks.link')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ProjectDocumentLinksPanel
