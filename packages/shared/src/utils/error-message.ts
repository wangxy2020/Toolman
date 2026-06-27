import { ZodError, type ZodIssue } from 'zod'

const FIELD_LABELS: Record<string, string> = {
  inviteToken: '邀请码',
  inviteUrl: '邀请链接',
  name: '名称',
  workspaceId: '群组',
  displayName: '显示名称',
  email: '邮箱',
  password: '密码',
  phone: '手机号',
}

function fieldLabel(path: Array<string | number>): string {
  const key = path.filter((segment) => typeof segment === 'string').join('.')
  if (!key) return '请求参数'
  return FIELD_LABELS[key] ?? key
}

function formatZodIssue(issue: ZodIssue): string {
  const label = fieldLabel(issue.path)

  if (issue.path[0] === 'inviteToken' && issue.code === 'too_small') {
    return '群组邀请初始化失败，请检查网络连接或更新到最新版本'
  }

  switch (issue.code) {
    case 'too_small':
      if (issue.type === 'string') {
        return `${label}不能为空`
      }
      return `${label}无效`
    case 'too_big':
      return `${label}超出允许范围`
    case 'invalid_type':
      return `${label}格式不正确`
    case 'invalid_string':
      return `${label}格式不正确`
    default:
      return issue.message || `${label}无效`
  }
}

export function formatZodError(error: ZodError): string {
  const first = error.issues[0]
  return first ? formatZodIssue(first) : '请求参数无效'
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ZodError) {
    return formatZodError(error)
  }
  return error instanceof Error ? error.message : fallback
}
