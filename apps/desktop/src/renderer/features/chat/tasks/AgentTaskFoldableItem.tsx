import type { AgentTask } from '@toolman/shared'

import { AgentTaskCard } from './AgentTaskCard'
import { AgentTaskCompactCard } from './AgentTaskCompactCard'
import { AgentTaskTimeline } from './AgentTaskTimeline'
import { TaskDetailPanel } from './TaskDetailPanel'
import type { useAgentTasks } from './useAgentTasks'

type TaskPanelController = Pick<
  ReturnType<typeof useAgentTasks>,
  'controllingTaskId' | 'controlTask'
>

interface Props extends TaskPanelController {
  task: AgentTask
  bound?: boolean
  expanded: boolean
  collapsible: boolean
  onToggle: () => void
  sessionActiveTaskId?: string | null
  timelineReloadToken?: number
}

export function AgentTaskFoldableItem({
  task,
  bound = false,
  expanded,
  collapsible,
  onToggle,
  sessionActiveTaskId,
  controllingTaskId,
  controlTask,
  timelineReloadToken = 0,
}: Props) {
  const showBody = !collapsible || expanded

  return (
    <section
      className={[
        'tm-agent-task-fold',
        collapsible ? 'tm-agent-task-fold--compact' : 'tm-agent-task-fold--live',
        expanded ? 'tm-agent-task-fold--expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`task-list-item-${task.id}`}
    >
      {collapsible ? (
        <AgentTaskCompactCard task={task} expanded={expanded} onToggle={onToggle} />
      ) : null}

      {showBody ? (
        <div
          className={[
            'tm-agent-task-fold-body',
            collapsible ? 'tm-agent-task-fold-body--nested' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-testid="task-detail-panel"
        >
          {!collapsible ? <AgentTaskCard task={task} bound={bound} asListItem /> : null}
          <AgentTaskTimeline
            key={`${task.id}-${timelineReloadToken}`}
            taskId={task.id}
            task={task}
          />
          <TaskDetailPanel
            embedded
            layout="footer"
            selectedTask={task}
            controllingTaskId={controllingTaskId}
            controlTask={controlTask}
            sessionActiveTaskId={sessionActiveTaskId}
          />
        </div>
      ) : null}
    </section>
  )
}
