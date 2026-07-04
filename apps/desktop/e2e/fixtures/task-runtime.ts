import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export const E2E_DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002'
export const E2E_DEFAULT_ASSISTANT_ID = '00000000-0000-0000-0000-000000000003'

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } }

export interface E2eAgentTask {
  id: string
  title: string
  status: string
  metadata?: Record<string, unknown>
}

export async function createAgentTaskViaIpc(
  window: Page,
  title: string,
): Promise<E2eAgentTask> {
  const result = await window.evaluate(
    async ({ workspaceId, assistantId, title: taskTitle }) => {
      const response = (await window.api.invoke('agent:task:create', {
        workspaceId,
        assistantId,
        title: taskTitle,
        goal: taskTitle,
      })) as IpcResult<{ id: string; title: string; status: string; metadata?: Record<string, unknown> }>

      if (!response.ok) {
        throw new Error(response.error.message)
      }

      return response.data
    },
    {
      workspaceId: E2E_DEFAULT_WORKSPACE_ID,
      assistantId: E2E_DEFAULT_ASSISTANT_ID,
      title,
    },
  )

  return result
}

export async function getAgentTaskViaIpc(window: Page, taskId: string): Promise<E2eAgentTask | null> {
  return window.evaluate(async (id) => {
    const response = (await window.api.invoke('agent:task:get', { taskId: id })) as IpcResult<{
      id: string
      title: string
      status: string
      metadata?: Record<string, unknown>
    } | null>

    if (!response.ok) {
      throw new Error(response.error.message)
    }

    return response.data
  }, taskId)
}

export async function controlAgentTaskViaIpc(
  window: Page,
  taskId: string,
  action: 'pause' | 'resume' | 'cancel',
): Promise<E2eAgentTask> {
  return window.evaluate(
    async ({ id, controlAction }) => {
      const response = (await window.api.invoke('agent:task:control', {
        taskId: id,
        action: controlAction,
      })) as IpcResult<{ task: { id: string; title: string; status: string } }>

      if (!response.ok) {
        throw new Error(response.error.message)
      }

      return response.data.task
    },
    { id: taskId, controlAction: action },
  )
}

export async function enableLongTaskModeViaIpc(window: Page): Promise<void> {
  await window.evaluate(async (assistantId) => {
    const response = (await window.api.invoke('assistant:update', {
      id: assistantId,
      parameters: { longTaskMode: true },
    })) as IpcResult<{ id: string }>

    if (!response.ok) {
      throw new Error(response.error.message)
    }
  }, E2E_DEFAULT_ASSISTANT_ID)

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  const overlay = window.locator('.tm-modal-overlay--auth-guard')
  const laterButton = window.getByRole('button', { name: /稍后再说|Later/i })
  if (await overlay.isVisible({ timeout: 3000 }).catch(() => false)) {
    await laterButton.click()
    await overlay.waitFor({ state: 'hidden', timeout: 5000 })
  }
  await window.getByTestId('chat-message-input').waitFor({ state: 'visible', timeout: 15_000 })
}

export async function openAgentTasksMenu(window: Page) {
  await window.getByTestId('agent-tasks-menu-button').click()
  const menu = window.getByTestId('agent-tasks-menu')
  await expect(menu).toBeVisible()
  return window.getByTestId('task-sidebar')
}
