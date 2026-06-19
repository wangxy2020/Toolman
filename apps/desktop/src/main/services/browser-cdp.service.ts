import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'

interface BrowserSession {
  id: string
  window: BrowserWindow
  lastUsed: number
}

const MAX_SESSIONS = 5
const IDLE_MS = 5 * 60 * 1000
const sessions = new Map<string, BrowserSession>()

function evictIdleSessions() {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.lastUsed > IDLE_MS) {
      if (!session.window.isDestroyed()) session.window.destroy()
      sessions.delete(id)
    }
  }

  if (sessions.size <= MAX_SESSIONS) return

  const sorted = [...sessions.values()].sort((a, b) => a.lastUsed - b.lastUsed)
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sorted.shift()
    if (!oldest) break
    if (!oldest.window.isDestroyed()) oldest.window.destroy()
    sessions.delete(oldest.id)
  }
}

function getSession(sessionId?: string): BrowserSession {
  if (sessionId) {
    const session = sessions.get(sessionId)
    if (!session || session.window.isDestroyed()) {
      throw new Error(`浏览器会话不存在: ${sessionId}`)
    }
    session.lastUsed = Date.now()
    return session
  }

  const existing = [...sessions.values()].sort((a, b) => b.lastUsed - a.lastUsed)[0]
  if (existing && !existing.window.isDestroyed()) {
    existing.lastUsed = Date.now()
    return existing
  }

  throw new Error('没有可用的浏览器会话，请先调用 browser_open')
}

function revealBrowserWindow(window: BrowserWindow): void {
  if (window.isDestroyed() || window.isVisible()) return

  const showWindow = () => {
    if (!window.isDestroyed()) window.show()
  }

  if (!window.webContents.isLoading() && window.webContents.getURL()) {
    showWindow()
    return
  }

  window.once('ready-to-show', showWindow)
}

function createSession(visible = false): BrowserSession {
  evictIdleSessions()

  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (visible) {
    revealBrowserWindow(window)
  }

  const session: BrowserSession = {
    id: randomUUID().slice(0, 8),
    window,
    lastUsed: Date.now(),
  }

  window.on('closed', () => {
    sessions.delete(session.id)
  })

  sessions.set(session.id, session)
  return session
}

async function waitForLoad(window: BrowserWindow, timeoutMs = 30_000): Promise<void> {
  if (window.webContents.getURL() && !window.webContents.isLoading()) return

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('页面加载超时')), timeoutMs)
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timer)
      resolve()
    })
    window.webContents.once('did-fail-load', (_event, _code, description) => {
      clearTimeout(timer)
      reject(new Error(description || '页面加载失败'))
    })
  })
}

export async function browserOpen(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? '').trim()
  if (!url) throw new Error('缺少 url')

  const show = Boolean(args.show)
  const sessionId = typeof args.sessionId === 'string' ? args.sessionId : undefined
  let session: BrowserSession

  if (sessionId && sessions.has(sessionId)) {
    session = getSession(sessionId)
    if (show) revealBrowserWindow(session.window)
  } else {
    session = createSession(show)
  }

  await session.window.loadURL(url)
  await waitForLoad(session.window)
  session.lastUsed = Date.now()

  const title = session.window.webContents.getTitle()
  return `已打开 ${url}\n会话: ${session.id}\n标题: ${title || '(无标题)'}`
}

export async function browserExecute(args: Record<string, unknown>): Promise<string> {
  const script = String(args.script ?? args.code ?? '').trim()
  if (!script) throw new Error('缺少 script')

  const session = getSession(typeof args.sessionId === 'string' ? args.sessionId : undefined)
  const result = await session.window.webContents.executeJavaScript(script, true)
  session.lastUsed = Date.now()

  if (typeof result === 'string') return result
  return JSON.stringify(result, null, 2)
}

export async function browserScreenshot(args: Record<string, unknown>): Promise<string> {
  const session = getSession(typeof args.sessionId === 'string' ? args.sessionId : undefined)
  const image = await session.window.webContents.capturePage()
  session.lastUsed = Date.now()

  const png = image.toPNG()
  const maxBytes = 120_000
  if (png.length <= maxBytes) {
    return `会话: ${session.id}\n截图 PNG base64:\n${png.toString('base64')}`
  }
  return `会话: ${session.id}\n截图过大 (${png.length} bytes)，已截断前 ${maxBytes} bytes base64:\n${png.subarray(0, maxBytes).toString('base64')}`
}

export async function browserFetch(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? '').trim()
  if (!url) throw new Error('缺少 url')

  const session = createSession(false)
  try {
    await session.window.loadURL(url)
    await waitForLoad(session.window)
    const text = await session.window.webContents.executeJavaScript(
      'document.body ? document.body.innerText : ""',
      true,
    )
    const title = session.window.webContents.getTitle()
    const body = String(text ?? '')
    const clipped = body.length > 100_000 ? `${body.slice(0, 100_000)}\n...(已截断)` : body
    return `会话: ${session.id}\n标题: ${title}\n\n${clipped}`
  } finally {
    if (!session.window.isDestroyed()) session.window.destroy()
    sessions.delete(session.id)
  }
}

export function destroyAllBrowserSessions() {
  for (const session of sessions.values()) {
    if (!session.window.isDestroyed()) session.window.destroy()
  }
  sessions.clear()
}
