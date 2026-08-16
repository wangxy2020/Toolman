import type { Dispatch, FC, SetStateAction } from 'react'
import type { GanttUiPrefs } from '../schedule/pm-gantt-prefs'

type Props = {
  t: (key: string) => string
  draft: GanttUiPrefs
  setDraft: Dispatch<SetStateAction<GanttUiPrefs>>
}

export const ProjectManagementSettingsCalendarTab: FC<Props> = ({ t, draft, setDraft }) => (
  <div className="tm-kb-settings-form">
    <p className="tm-kb-settings-hint">
      {t('projectManagerPage.domainSettings.calendarHint')}
    </p>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-week-start">
        {t('projectManagerPage.domainSettings.weekStartsOn')}
      </label>
      <select
        id="pm-week-start"
        className="tm-kb-settings-input"
        value={draft.calendarWeekStartsOn}
        onChange={(event) =>
          setDraft({
            ...draft,
            calendarWeekStartsOn: Number(event.target.value) === 0 ? 0 : 1,
          })
        }>
        <option value={1}>
          {t('projectManagerPage.domainSettings.weekStartsMonday')}
        </option>
        <option value={0}>
          {t('projectManagerPage.domainSettings.weekStartsSunday')}
        </option>
      </select>
    </div>
  </div>
)
