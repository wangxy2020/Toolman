import { assertHttpFetchUrlAllowed } from '../http-fetch-policy'
import { parseEnvironmentVariables } from '../permission.service'
import type { ToolExecutionContext } from './types'

export async function executeHttpFetch(args: Record<string, unknown>) {
  const url = String(args.url ?? '')
  if (!url) throw new Error('缺少 url')

  assertHttpFetchUrlAllowed(url)

  const method = String(args.method ?? 'GET').toUpperCase()
  const response = await fetch(url, { method })
  const text = await response.text()
  const header = `HTTP ${response.status} ${response.statusText}\n`
  const body = text.length > 100_000 ? `${text.slice(0, 100_000)}\n...(已截断)` : text
  return `${header}\n${body}`
}

export async function executeGithubRequest(args: Record<string, unknown>, context: ToolExecutionContext) {
  const path = String(args.path ?? '')
  if (!path) throw new Error('缺少 path')

  const env = {
    ...process.env,
    ...parseEnvironmentVariables(context.environmentVariables),
  }
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN
  if (!token) {
    throw new Error('未配置 GITHUB_TOKEN，请在智能体高级设置的环境变量中添加')
  }

  const method = String(args.method ?? 'GET').toUpperCase()
  const response = await fetch(`https://api.github.com${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: args.body ? String(args.body) : undefined,
  })

  return `HTTP ${response.status}\n${await response.text()}`
}
