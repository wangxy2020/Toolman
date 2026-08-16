import {
  normalizeReflectionVerdict,
  type AgentTask,
  type TaskReflectionResult,
} from '@toolman/shared'

import { taskPlanToStepRecords } from '../planner/plan-to-steps'
import { ensureExecutableTaskPlan } from '../planner/plan-repair'
import {
  replaceTaskPendingSteps,
  updateAgentTaskRecord,
} from '../store'
import { emitTaskFinished } from '../task-event.service'
import { validateTaskPassEvidence } from './reflection-evidence'

export function applyReflectionTokenUsage(
  task: AgentTask,
  usage?: { prompt?: number; completion?: number; total?: number },
): AgentTask {
  if (!usage) return task
  const reflectionTokens = usage.total ?? (usage.prompt ?? 0) + (usage.completion ?? 0)
  if (reflectionTokens <= 0) return task

  return updateAgentTaskRecord(task.id, {
    budget: {
      ...task.budget,
      used: {
        ...task.budget.used,
        reflection: task.budget.used.reflection + reflectionTokens,
        total: task.budget.used.total + reflectionTokens,
      },
    },
  })
}

function hasPendingExecutableWork(task: AgentTask): boolean {
  return task.history.some((step) => step.status === 'pending' && step.kind === 'tool')
}

export function applyReflectionVerdict(
  task: AgentTask,
  reflection: TaskReflectionResult,
  verdict: ReturnType<typeof normalizeReflectionVerdict>,
): AgentTask {
  const metadata = {
    ...task.metadata,
    lastReflection: {
      verdict: reflection.verdict,
      reason: reflection.reason,
      summary: reflection.summary,
      at: Date.now(),
    },
  }

  if (verdict === 'fail') {
    const failed = updateAgentTaskRecord(task.id, {
      status: 'failed',
      metadata,
    })
    emitTaskFinished(failed, 'failed')
    return failed
  }

  if (verdict === 'replan') {
    const nextSteps = reflection.nextSteps ?? []
    const withSteps =
      nextSteps.length > 0
        ? replaceTaskPendingSteps(
            task.id,
            taskPlanToStepRecords(
              ensureExecutableTaskPlan({ goal: task.goal ?? task.title, steps: nextSteps }, task),
              task,
            ),
          )
        : task
    return updateAgentTaskRecord(withSteps.id, {
      status: 'pending',
      metadata,
    })
  }

  if (reflection.verdict === 'continue') {
    if (!hasPendingExecutableWork(task)) {
      const completed = updateAgentTaskRecord(task.id, {
        status: 'completed',
        currentStepId: null,
        metadata,
      })
      emitTaskFinished(completed, 'completed')
      return completed
    }
    return updateAgentTaskRecord(task.id, {
      status: 'pending',
      metadata,
    })
  }

  if (verdict === 'pass' && !hasPendingExecutableWork(task)) {
    const completed = updateAgentTaskRecord(task.id, {
      status: 'completed',
      currentStepId: null,
      metadata,
    })
    emitTaskFinished(completed, 'completed')
    return completed
  }

  return updateAgentTaskRecord(task.id, {
    status: 'pending',
    metadata,
  })
}

export function buildReflectionParseFallback(task: AgentTask, reason: string): TaskReflectionResult {
  const pending = task.history.some((step) => step.status === 'pending' && step.kind === 'tool')
  if (pending) {
    return {
      verdict: 'continue',
      reason,
      summary: '反思结果不完整，继续执行剩余步骤。',
    }
  }

  const evidence = validateTaskPassEvidence(task)
  if (evidence.ok) {
    return {
      verdict: 'pass',
      reason,
      summary: '反思结果不完整，但工具步骤已有可验证产出。',
    }
  }

  return {
    verdict: 'fail',
    reason: evidence.reason,
    summary: `反思结果不完整，且缺少可验证产出：${evidence.reason}`,
  }
}
