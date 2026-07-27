import {
  useProjectPlanAgentApplyBar,
  type ProjectPlanAgentApplyBarProps as Props,
} from './useProjectPlanAgentApplyBar'

export { clearPmPlanAppliedProject } from './useProjectPlanAgentApplyBar'

/** Compact green text confirm / jump for the assistant message action row. */
export function ProjectPlanAgentApplyBar(props: Props) {
  const { onPlanApplied } = props
  const {
    t,
    applying,
    discarded,
    lastAssistant,
    hasSuggestion,
    canApplyPlan,
    canApplyScheduleOnly,
    selectedProjectId,
    wbsSuggestions,
    scheduleSuggestions,
    appliedProjectId,
    applyAction,
    handleDiscard,
    handleApplyPlan,
    handleApplySchedule,
  } = useProjectPlanAgentApplyBar(props)

  if (!lastAssistant || !hasSuggestion) {
    return null
  }

  if (discarded) {
    return null
  }

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

  const buttonLabel =
    applyAction === 'reapply'
      ? t('projectManagerPage.agent.applyReapply')
      : t('projectManagerPage.agent.applyConfirm')

  return (
    <span className="tm-pm-agent-apply-actions">
      <button
        type="button"
        className="tm-pm-agent-apply-text-btn"
        title={
          canApplyPlan
            ? t('projectManagerPage.agent.applyPlan', { count: wbsSuggestions.length })
            : t('projectManagerPage.agent.applySchedule', { count: scheduleSuggestions.length })
        }
        disabled={applying || (canApplyScheduleOnly && !selectedProjectId)}
        onClick={() => void (canApplyPlan ? handleApplyPlan() : handleApplySchedule())}
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
