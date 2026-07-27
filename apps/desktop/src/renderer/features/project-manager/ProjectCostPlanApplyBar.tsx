import {
  useProjectCostPlanApplyBar,
  type ProjectCostPlanApplyBarProps as Props,
} from './useProjectCostPlanApplyBar'

/** Confirm costPlan JSON from the cost-management session into Gantt columns. */
export function ProjectCostPlanApplyBar(props: Props) {
  const { onPlanApplied } = props
  const {
    t,
    applying,
    discarded,
    lastAssistant,
    hasSuggestion,
    appliedProjectId,
    count,
    isReapply,
    handleDiscard,
    handleApply,
  } = useProjectCostPlanApplyBar(props)

  if (!lastAssistant || !hasSuggestion) return null

  if (discarded) return null

  if (appliedProjectId) {
    return (
      <span className="tm-pm-agent-apply-actions">
        <button
          type="button"
          className="tm-pm-agent-apply-text-btn"
          title={t('projectManagerPage.agent.applyGoToGantt')}
          onClick={() => onPlanApplied(appliedProjectId)}
        >
          {t('projectManagerPage.agent.applyGoToGantt')}
        </button>
      </span>
    )
  }

  const buttonLabel = isReapply
    ? t('projectManagerPage.agent.applyReapply')
    : t('projectManagerPage.agent.applyConfirm')

  return (
    <span className="tm-pm-agent-apply-actions">
      <button
        type="button"
        className="tm-pm-agent-apply-text-btn"
        title={t('projectManagerPage.agent.applyCostPlan', { count })}
        disabled={applying}
        onClick={() => void handleApply()}
      >
        {applying ? '…' : buttonLabel}
      </button>
      <button
        type="button"
        className="tm-pm-agent-apply-text-btn tm-pm-agent-apply-text-btn--muted"
        title={t('projectManagerPage.agent.applyDiscard')}
        disabled={applying}
        onClick={handleDiscard}
      >
        {t('projectManagerPage.agent.applyDiscard')}
      </button>
    </span>
  )
}
