import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  _electron as electron,
  test as base,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

const DESKTOP_ROOT = process.cwd()
const MAIN_ENTRY = path.join(DESKTOP_ROOT, 'out/main/index.js')

function launchEnv(userDataDir: string): NodeJS.ProcessEnv {
  const { ELECTRON_RUN_AS_NODE: _drop, ...baseEnv } = process.env
  return {
    ...baseEnv,
    NODE_ENV: 'test',
    TOOLMAN_E2E_USER_DATA_DIR: userDataDir,
    TOOLMAN_COMMUNITY_HUB_MODE: 'local',
    TOOLMAN_BILLING_MOCK: '1',
  }
}

async function dismissBlockingModals(window: Page): Promise<void> {
  const overlay = window.locator('.tm-modal-overlay--auth-guard')
  const laterButton = window.getByRole('button', { name: /稍后再说|Later/i })
  if (await overlay.isVisible({ timeout: 3000 }).catch(() => false)) {
    await laterButton.click()
    await overlay.waitFor({ state: 'hidden', timeout: 5000 })
  }
}

export const test = base.extend<{ electronApp: ElectronApplication; window: Page }>({
  // Playwright fixture with no injected dependencies.
  // eslint-disable-next-line no-empty-pattern -- intentional empty destructure
  electronApp: async ({}, use) => {
    if (!fs.existsSync(MAIN_ENTRY)) {
      throw new Error(
        `Desktop main bundle missing at ${MAIN_ENTRY}. Run: pnpm --filter @toolman/desktop build`,
      )
    }

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolman-e2e-'))

    const app = await electron.launch({
      args: [MAIN_ENTRY],
      cwd: DESKTOP_ROOT,
      env: launchEnv(userDataDir),
    })

    try {
      await use(app)
    } finally {
      await app.close()
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await dismissBlockingModals(window)
    await use(window)
  },
})

export { expect }

function navButton(window: Page, label: string) {
  return window
    .locator('.tm-nav, .tm-top-bar-leading, .tm-top-bar-trailing')
    .getByRole('button', { name: label, exact: true })
}

export { navButton }

export async function navigateTo(window: Page, label: string): Promise<void> {
  const button = navButton(window, label)
  await button.click()
  await expect(button).toHaveClass(/tm-nav-item--active/)
}
