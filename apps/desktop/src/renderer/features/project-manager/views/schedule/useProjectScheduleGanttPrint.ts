import { useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'

import { IpcChannel, type PmProject } from '@toolman/shared'

import { useI18n } from '../../../../i18n/useI18n'
import { escapeCssContentValue, sanitizePrintDocumentTitle } from './pm-schedule-gantt-panel-utils'

export function useProjectScheduleGanttPrint(args: {
  selectedProject: PmProject | null
  t: ReturnType<typeof useI18n>['t']
}) {
  const { selectedProject, t } = args

  const applyPrintPageNumberVars = useCallback(() => {
    const root = document.documentElement
    const prefix = t('projectManagerPage.schedule.print.pageLabel')
    const suffix = t('projectManagerPage.schedule.print.pageOf').trim()
    const title = selectedProject
      ? `${selectedProject.code} · ${selectedProject.name}`
      : t('projectManagerPage.headerProject.allProjects')
    // CSS content() strings must include quotes inside the custom property value.
    root.style.setProperty('--tm-pm-print-page-prefix', escapeCssContentValue(`${prefix} `))
    root.style.setProperty('--tm-pm-print-page-sep', escapeCssContentValue(' / '))
    root.style.setProperty(
      '--tm-pm-print-page-suffix',
      suffix ? escapeCssContentValue(` ${suffix}`) : '""',
    )
    root.style.setProperty('--tm-pm-print-title', escapeCssContentValue(title))
  }, [selectedProject, t])

  const printDocumentTitleRef = useRef<string | null>(null)

  const applyPrintDocumentTitle = useCallback(() => {
    if (printDocumentTitleRef.current == null) {
      printDocumentTitleRef.current = document.title
    }
    // Chromium “Save as PDF” uses document.title as the default filename.
    const code = selectedProject?.code?.trim() ?? ''
    const name = selectedProject?.name?.trim() ?? ''
    document.title = sanitizePrintDocumentTitle(code, name)
  }, [selectedProject])

  const restorePrintDocumentTitle = useCallback(() => {
    if (printDocumentTitleRef.current != null) {
      document.title = printDocumentTitleRef.current
      printDocumentTitleRef.current = null
    }
  }, [])

  useEffect(() => {
    const onBeforePrint = () => {
      flushSync(() => {
        applyPrintPageNumberVars()
        applyPrintDocumentTitle()
      })
    }
    const onAfterPrint = () => {
      restorePrintDocumentTitle()
    }
    window.addEventListener('beforeprint', onBeforePrint)
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [applyPrintDocumentTitle, applyPrintPageNumberVars, restorePrintDocumentTitle])

  const handlePrint = useCallback(() => {
    // Do not toggle screen layout — print uses a separate hidden table.
    // Only set document title / @page CSS vars, then open the print dialog.
    flushSync(() => {
      applyPrintPageNumberVars()
      applyPrintDocumentTitle()
    })
    const runPrint = () => {
      // Prefer Electron print API so landscape is forced (window.print often stays portrait).
      void window.api.invoke(IpcChannel.AppPrintWindow, { landscape: true, printBackground: true })
    }
    // Brief delay so title/CSS vars settle before Chromium snapshots.
    window.setTimeout(runPrint, 0)
  }, [applyPrintDocumentTitle, applyPrintPageNumberVars])

  return { handlePrint }
}
