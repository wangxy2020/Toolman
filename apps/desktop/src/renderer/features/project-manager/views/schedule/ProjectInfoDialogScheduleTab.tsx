import type { FC } from 'react'

import type { ProjectInfoDialogState } from './useProjectInfoDialog'

type Props = Pick<
  ProjectInfoDialogState,
  't' | 'dateInputLang' | 'datePlaceholder' | 'draft' | 'patchDraft'
>

export const ProjectInfoDialogScheduleTab: FC<Props> = ({
  t,
  dateInputLang,
  datePlaceholder,
  draft,
  patchDraft,
}) => (
  <div className="tm-kb-settings-form">
    <p className="tm-kb-settings-hint">{t('projectManagerPage.projectInfo.scheduleHint')}</p>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-info-plan-start">
        {t('projectManagerPage.projectInfo.fieldPlanStart')}
      </label>
      <input
        id="pm-info-plan-start"
        className="tm-kb-settings-input"
        type="date"
        lang={dateInputLang}
        placeholder={datePlaceholder}
        value={draft.planStart}
        onChange={(event) => patchDraft({ planStart: event.target.value })}
      />
    </div>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-info-plan-finish">
        {t('projectManagerPage.projectInfo.fieldPlanFinish')}
      </label>
      <input
        id="pm-info-plan-finish"
        className="tm-kb-settings-input"
        type="date"
        lang={dateInputLang}
        placeholder={datePlaceholder}
        value={draft.planFinish}
        onChange={(event) => patchDraft({ planFinish: event.target.value })}
      />
    </div>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-info-status-date">
        {t('projectManagerPage.projectInfo.fieldStatusDate')}
      </label>
      <input
        id="pm-info-status-date"
        className="tm-kb-settings-input"
        type="date"
        lang={dateInputLang}
        placeholder={datePlaceholder}
        value={draft.statusDate}
        onChange={(event) => patchDraft({ statusDate: event.target.value })}
      />
    </div>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-info-schedule-from">
        {t('projectManagerPage.projectInfo.fieldScheduleFrom')}
      </label>
      <select
        id="pm-info-schedule-from"
        className="tm-kb-settings-input"
        value={draft.scheduleFrom}
        onChange={(event) =>
          patchDraft({ scheduleFrom: event.target.value as 'project_start' | 'project_finish' })
        }>
        <option value="project_start">{t('projectManagerPage.projectInfo.scheduleFromStart')}</option>
        <option value="project_finish">{t('projectManagerPage.projectInfo.scheduleFromFinish')}</option>
      </select>
    </div>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-info-plan-calendar">
        {t('projectManagerPage.projectInfo.fieldPlanCalendar')}
      </label>
      <select
        id="pm-info-plan-calendar"
        className="tm-kb-settings-input"
        value={draft.planCalendar}
        onChange={(event) =>
          patchDraft({
            planCalendar: event.target.value === 'working_days' ? 'working_days' : 'calendar_days',
          })
        }>
        <option value="calendar_days">{t('projectManagerPage.projectInfo.planCalendarCalendarDays')}</option>
        <option value="working_days">{t('projectManagerPage.projectInfo.planCalendarWorkingDays')}</option>
      </select>
    </div>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-info-plan-phase">
        {t('projectManagerPage.projectInfo.fieldPlanPhase')}
      </label>
      <input
        id="pm-info-plan-phase"
        className="tm-kb-settings-input"
        value={draft.planPhase}
        onChange={(event) => patchDraft({ planPhase: event.target.value })}
      />
    </div>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-info-period">
        {t('projectManagerPage.projectInfo.fieldPeriod')}
      </label>
      <input
        id="pm-info-period"
        className="tm-kb-settings-input"
        value={draft.period}
        onChange={(event) => patchDraft({ period: event.target.value })}
      />
    </div>
  </div>
)
