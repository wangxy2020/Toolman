import { expect, navButton, navigateTo, test } from './fixtures/electron-app'

test.describe('GA critical path', () => {
  test('launches shell and navigates core modules', async ({ window }) => {
    await expect(window.locator('.tm-main')).toBeVisible()
    await expect(navButton(window, '智能体')).toHaveClass(/tm-nav-item--active/)

    await navigateTo(window, '知识库')
    await expect(window.getByRole('button', { name: '添加知识库' })).toBeVisible()

    await navigateTo(window, '社区')
    await expect(window.getByRole('heading', { name: '资讯' })).toBeVisible()

    await navigateTo(window, '群组')
    await expect(window.getByText('我创建的群组')).toBeVisible()

    await navigateTo(window, '设置')
    await expect(navButton(window, '设置')).toHaveClass(/tm-nav-item--active/)
    await expect(window.getByRole('heading', { name: '一般设置' })).toBeVisible()
  })

  test('opens login panel from user account menu', async ({ window }) => {
    await window.getByRole('button', { name: '用户账户', exact: true }).click()
    await expect(
      window.getByRole('heading', { name: /登录 Toolman 账户|注册 Toolman 账户/ }),
    ).toBeVisible()
  })
})
