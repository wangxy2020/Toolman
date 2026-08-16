import type { Dispatch, FC, SetStateAction } from 'react'
import {
  DEFAULT_GANTT_TASK_COLORS,
  type GanttBarStyle,
  type GanttDateHeaderMode,
  type GanttUiPrefs,
} from '../schedule/pm-gantt-prefs'
import {
  COLOR_FIELDS,
  HEADER_MODE_OPTIONS,
} from './useProjectManagementSettingsPanel'

type Props = {
  t: (key: string) => string
  draft: GanttUiPrefs
  setDraft: Dispatch<SetStateAction<GanttUiPrefs>>
  customFields: Array<{ key: string; label: string; type: string }>
  headerModeLabel: (mode: GanttDateHeaderMode) => string
}

export const ProjectManagementSettingsGanttTab: FC<Props> = ({
  t,
  draft,
  setDraft,
  customFields,
  headerModeLabel,
}) => (
  <div className="tm-kb-settings-form">
    <p className="tm-kb-settings-hint">
      {t('projectManagerPage.domainSettings.ganttHint')}
    </p>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-date-header-mode">
        {t('projectManagerPage.domainSettings.dateHeaderRows')}
      </label>
      <select
        id="pm-date-header-mode"
        className="tm-kb-settings-input"
        value={draft.dateHeaderMode}
        onChange={(event) =>
          setDraft({
            ...draft,
            dateHeaderMode: event.target.value as GanttDateHeaderMode,
          })
        }>
        {HEADER_MODE_OPTIONS.map((mode) => (
          <option key={mode} value={mode}>
            {headerModeLabel(mode)}
          </option>
        ))}
      </select>
    </div>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-gantt-bar-style">
        {t('projectManagerPage.domainSettings.barStyle')}
      </label>
      <select
        id="pm-gantt-bar-style"
        className="tm-kb-settings-input"
        value={draft.barStyle}
        onChange={(event) =>
          setDraft({
            ...draft,
            barStyle: event.target.value as GanttBarStyle,
          })
        }>
        <option value="fill">
          {t('projectManagerPage.domainSettings.barStyleFill')}
        </option>
        <option value="outline">
          {t('projectManagerPage.domainSettings.barStyleOutline')}
        </option>
        <option value="hatch">
          {t('projectManagerPage.domainSettings.barStyleHatch')}
        </option>
      </select>
    </div>
    <div className="tm-kb-settings-field-block">
      <div className="tm-kb-settings-section-head">
        <span className="tm-kb-settings-section-title">
          {t('projectManagerPage.domainSettings.taskColorsTitle')}
        </span>
        <button
          type="button"
          className="tm-kb-settings-link-btn"
          onClick={() =>
            setDraft({
              ...draft,
              taskColors: { ...DEFAULT_GANTT_TASK_COLORS },
            })
          }>
          {t('projectManagerPage.domainSettings.resetColors')}
        </button>
      </div>
      <div className="tm-pm-gantt-color-grid">
        {COLOR_FIELDS.map((field) => (
          <label key={field.key} className="tm-pm-gantt-color-row">
            <span>{t(field.labelKey)}</span>
            <input
              type="color"
              value={draft.taskColors[field.key]}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  taskColors: {
                    ...draft.taskColors,
                    [field.key]: event.target.value,
                  },
                })
              }
            />
            <input
              className="tm-kb-settings-input tm-pm-gantt-color-hex"
              value={draft.taskColors[field.key]}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  taskColors: {
                    ...draft.taskColors,
                    [field.key]: event.target.value,
                  },
                })
              }
            />
          </label>
        ))}
      </div>
    </div>
    {customFields.length > 0 ? (
      <div className="tm-kb-settings-field-block">
        <div className="tm-kb-settings-section-head">
          <span className="tm-kb-settings-section-title">
            {t('projectManagerPage.domainSettings.customFieldsTitle')}
          </span>
        </div>
        <ul className="tm-pm-settings-fields">
          {customFields.map((field) => (
            <li key={field.key}>
              {field.label} · {field.type}
            </li>
          ))}
        </ul>
      </div>
    ) : null}
  </div>
)
