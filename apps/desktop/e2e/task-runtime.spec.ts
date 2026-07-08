import { expect, test } from './fixtures/electron-app'
import {
  controlAgentTaskViaIpc,
  createAgentTaskViaIpc,
  enableLongTaskModeViaIpc,
  getAgentTaskViaIpc,
  openAgentTasksMenu,
  sidebarTaskListItem,
  sidebarTaskListItemByTitle,
} from './fixtures/task-runtime'

test.describe('Task runtime production E2E', () => {
  test('creates task and controls it from menu + detail panel', async ({ window }) => {
    const title = `E2E task ${Date.now()}`
    const task = await createAgentTaskViaIpc(window, title)

    const menu = window.getByTestId('agent-tasks-menu')
    const sidebar = await openAgentTasksMenu(window)

    const listItem = sidebarTaskListItem(sidebar, task.id)
    await expect(listItem).toBeVisible({ timeout: 15_000 })
    await expect(listItem).toContainText(title)

    await listItem.click()

    const detailPanel = menu.getByTestId('task-detail-panel')
    await expect(detailPanel).toBeVisible()
    await expect(detailPanel).toContainText(title)

    await detailPanel.getByTestId('task-control-pause').click()
    await expect.poll(async () => (await getAgentTaskViaIpc(window, task.id))?.status).toBe('paused')
    await expect(detailPanel.getByTestId('task-status-badge')).toContainText(/已暂停|Paused/)

    await detailPanel.getByTestId('task-control-cancel').click()
    await expect.poll(async () => (await getAgentTaskViaIpc(window, task.id))?.status).toBe('cancelled')
    await expect(detailPanel.getByTestId('task-status-badge')).toContainText(/已取消|Cancelled/)
  })

  test('resumes a paused task from detail panel', async ({ window }) => {
    const title = `E2E resume ${Date.now()}`
    const task = await createAgentTaskViaIpc(window, title)
    await controlAgentTaskViaIpc(window, task.id, 'pause')

    const menu = window.getByTestId('agent-tasks-menu')
    const sidebar = await openAgentTasksMenu(window)
    const listItem = sidebarTaskListItem(sidebar, task.id)
    await expect(listItem).toBeVisible({ timeout: 15_000 })
    await listItem.click()

    const detailPanel = menu.getByTestId('task-detail-panel')
    await expect(detailPanel).toBeVisible()
    await expect(detailPanel.getByTestId('task-status-badge')).toContainText(/已暂停|Paused/)

    await detailPanel.getByTestId('task-control-resume').click()
    await expect
      .poll(async () => (await getAgentTaskViaIpc(window, task.id))?.status)
      .not.toBe('paused')
  })

  test('creates task from composer autonomous mode', async ({ window }) => {
    const title = `E2E composer ${Date.now()}`

    await enableLongTaskModeViaIpc(window)

    await expect(window.getByTestId('autonomous-task-toggle')).toHaveClass(/tm-input-tool--active/)

    await window.getByTestId('chat-message-input').fill(title)
    await window.getByTestId('chat-send-button').click()

    await expect(window.getByTestId('task-activity-panel')).toHaveCount(0)
    await expect(window.getByTestId('task-detail-panel')).toHaveCount(0)

    const sidebar = await openAgentTasksMenu(window)
    await expect(sidebarTaskListItemByTitle(sidebar, title)).toBeVisible({ timeout: 15_000 })
  })

  test('stores resolved working directory metadata on task create', async ({ window }) => {
    const title = `E2E metadata ${Date.now()}`
    const task = await createAgentTaskViaIpc(window, title)
    const stored = await getAgentTaskViaIpc(window, task.id)

    expect(stored?.metadata?.resolvedWorkingDirectory).toBeTruthy()
    expect(typeof stored?.metadata?.resolvedWorkingDirectory).toBe('string')
  })

  test('lists multiple tasks in menu with filter tabs', async ({ window }) => {
    const activeTitle = `E2E active ${Date.now()}`
    const doneTitle = `E2E done ${Date.now() + 1}`

    const activeTask = await createAgentTaskViaIpc(window, activeTitle)
    const doneTask = await createAgentTaskViaIpc(window, doneTitle)
    await controlAgentTaskViaIpc(window, doneTask.id, 'cancel')

    const menu = window.getByTestId('agent-tasks-menu')
    const sidebar = await openAgentTasksMenu(window)
    await expect(sidebarTaskListItem(sidebar, activeTask.id)).toBeVisible({
      timeout: 15_000,
    })
    await expect(sidebarTaskListItem(sidebar, doneTask.id)).toHaveCount(0)

    await menu.getByTestId('task-filter-all').click()
    await expect(sidebarTaskListItem(sidebar, doneTask.id)).toBeVisible()
    await expect(menu.getByTestId('task-filter-active')).toBeVisible()
    await expect(menu.getByTestId('task-filter-done')).toBeVisible()
  })
})
