import type { FC } from 'react'
import { Fragment } from 'react'

import { DEFAULT_COST_CURRENCY, costSectionCurrencyKey } from '../cost/pm-cost-currency'
import { PM_COST_PRIMARY_TYPES, PM_COST_RESOURCE_TYPES } from '../cost/pm-cost-catalog'
import { PM_COST_ESTIMATE_TYPE_SET, PM_COST_ESTIMATE_TYPES, formatMoney } from './pm-project-info-dialog-utils'
import type { ProjectInfoDialogState } from './useProjectInfoDialog'

type Props = Pick<
  ProjectInfoDialogState,
  | 't'
  | 'isWorkspaceCost'
  | 'project'
  | 'costStats'
  | 'costTypeLabel'
  | 'costCardCurrency'
  | 'patchCostCardCurrency'
>

export const ProjectInfoDialogCostTab: FC<Props> = ({
  t,
  isWorkspaceCost,
  project,
  costStats,
  costTypeLabel,
  costCardCurrency,
  patchCostCardCurrency,
}) => {
  const renderCostCurrencyInput = (cardKey: string) => (
    <input
      className="tm-kb-settings-input tm-pm-project-info-stat-currency-input"
      value={costCardCurrency(cardKey)}
      onChange={(event) => patchCostCardCurrency(cardKey, event.target.value)}
      placeholder={DEFAULT_COST_CURRENCY}
      aria-label={t('projectManagerPage.projectInfo.fieldCurrency')}
    />
  )

  return (
    <div className="tm-kb-settings-form">
      <p className="tm-kb-settings-hint">
        {isWorkspaceCost
          ? t('projectManagerPage.projectInfo.costHintAllProjects')
          : t('projectManagerPage.projectInfo.costHint')}
      </p>
      <div className="tm-kb-settings-row">
        <label className="tm-kb-settings-label">
          {t('projectManagerPage.projectInfo.fieldResourceScope')}
        </label>
        <span className="tm-kb-settings-readonly">
          {isWorkspaceCost
            ? t('projectManagerPage.headerProject.allProjects')
            : project
              ? [project.code.trim(), project.name.trim()].filter(Boolean).join(' · ') || project.id
              : '—'}
        </span>
      </div>
      <div className="tm-kb-settings-row">
        <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.statCosts')}</label>
        <span className="tm-kb-settings-readonly">{costStats.total}</span>
      </div>
      <div className="tm-kb-settings-row">
        <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.statPriced')}</label>
        <span className="tm-kb-settings-readonly">{costStats.priced}</span>
      </div>
      <div className="tm-kb-settings-row">
        <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.statUnpriced')}</label>
        <span className="tm-kb-settings-readonly">{costStats.unpriced}</span>
      </div>
      <div className="tm-pm-project-info-stats-group">
        <div className="tm-pm-project-info-stats-group-title">
          {t('projectManagerPage.projectInfo.statGroupResource')}
        </div>
        <div className="tm-pm-project-info-stats">
          {PM_COST_RESOURCE_TYPES.map((type) => (
            <div key={type} className="tm-pm-project-info-stat">
              <div className="tm-pm-project-info-stat-label-row">
                <span className="tm-pm-project-info-stat-label">{costTypeLabel(type)}</span>
                <span className="tm-pm-project-info-stat-currency-tag">
                  {t('projectManagerPage.projectInfo.fieldCurrency')}
                </span>
              </div>
              <div className="tm-pm-project-info-stat-value-row">
                <strong>
                  {costStats.amountByType[type] != null ? formatMoney(costStats.amountByType[type]!) : '—'}
                </strong>
                {renderCostCurrencyInput(type)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="tm-pm-project-info-stats-group">
        <div className="tm-pm-project-info-stats-group-title">
          {t('projectManagerPage.projectInfo.statGroupCost')}
        </div>
        <div className="tm-pm-project-info-stats">
          {PM_COST_PRIMARY_TYPES.filter((type) => !PM_COST_ESTIMATE_TYPE_SET.has(type)).map((type) => (
            <Fragment key={type}>
              <div className="tm-pm-project-info-stat">
                <div className="tm-pm-project-info-stat-label-row">
                  <span className="tm-pm-project-info-stat-label">{costTypeLabel(type)}</span>
                  <span className="tm-pm-project-info-stat-currency-tag">
                    {t('projectManagerPage.projectInfo.fieldCurrency')}
                  </span>
                </div>
                <div className="tm-pm-project-info-stat-value-row">
                  <strong>
                    {costStats.amountByType[type] != null
                      ? formatMoney(costStats.amountByType[type]!)
                      : '—'}
                  </strong>
                  {renderCostCurrencyInput(type)}
                </div>
              </div>
              {type === 'comprehensive'
                ? costStats.sections.map((section) => {
                    const sectionName = section.key || t('projectManagerPage.costTable.views.sectionEmpty')
                    const sectionKey = costSectionCurrencyKey(section.key)
                    return (
                      <div key={`section:${section.key || '__empty__'}`} className="tm-pm-project-info-stat">
                        <div className="tm-pm-project-info-stat-label-row">
                          <span className="tm-pm-project-info-stat-label">
                            {t('projectManagerPage.projectInfo.statSectionalWorkNamed', {
                              name: sectionName,
                            })}
                          </span>
                          <span className="tm-pm-project-info-stat-currency-tag">
                            {t('projectManagerPage.projectInfo.fieldCurrency')}
                          </span>
                        </div>
                        <div className="tm-pm-project-info-stat-value-row">
                          <strong>{section.amount != null ? formatMoney(section.amount) : '—'}</strong>
                          {renderCostCurrencyInput(sectionKey)}
                        </div>
                      </div>
                    )
                  })
                : null}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="tm-pm-project-info-stats-group">
        <div className="tm-pm-project-info-stats-group-title">
          {t('projectManagerPage.projectInfo.statGroupEstimate')}
        </div>
        <div className="tm-pm-project-info-stats">
          {PM_COST_ESTIMATE_TYPES.map((type) => (
            <div key={type} className="tm-pm-project-info-stat">
              <div className="tm-pm-project-info-stat-label-row">
                <span className="tm-pm-project-info-stat-label">{costTypeLabel(type)}</span>
                <span className="tm-pm-project-info-stat-currency-tag">
                  {t('projectManagerPage.projectInfo.fieldCurrency')}
                </span>
              </div>
              <div className="tm-pm-project-info-stat-value-row">
                <strong>
                  {costStats.amountByType[type] != null ? formatMoney(costStats.amountByType[type]!) : '—'}
                </strong>
                {renderCostCurrencyInput(type)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
