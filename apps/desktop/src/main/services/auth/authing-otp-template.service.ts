import { EmailTemplateType, ManagementClient } from 'authing-js-sdk'
import { toErrorMessage } from '@toolman/shared'

import { OTP_CODE_TTL_SECONDS } from './auth-otp.constants.js'
import { getAuthingConfig, getAuthingOtpTtlSeconds } from './authing-auth.config.js'

const VERIFY_EMAIL_TEMPLATE_TYPES = new Set<EmailTemplateType>([
  EmailTemplateType.ChangePassword,
  EmailTemplateType.VerifyEmail,
  EmailTemplateType.ChangeEmail,
  EmailTemplateType.ResetPassword,
])

type EmailTemplateRow = {
  type: EmailTemplateType
  name: string
  subject: string
  sender: string
  content: string
  redirectTo?: string | null
  hasURL?: boolean | null
  expiresIn?: number | null
  enabled?: boolean | null
  isSystem?: boolean | null
}

type GraphqlClientLike = {
  request: (input: { query: string; variables?: Record<string, unknown>; token: string }) => Promise<{
    emailTemplates?: EmailTemplateRow[]
    configEmailTemplate?: EmailTemplateRow
  }>
}

type ManagementInternals = {
  graphqlClient: GraphqlClientLike
  tokenProvider: { getToken: () => Promise<string> }
}

let templateTtlEnsured = false

export function resetAuthingOtpTemplateStateForTests(): void {
  templateTtlEnsured = false
}

export async function ensureAuthingOtpTemplateTtl(): Promise<void> {
  if (templateTtlEnsured) return

  const config = getAuthingConfig()
  if (!config?.appSecret) {
    templateTtlEnsured = true
    return
  }

  try {
    const ttlSeconds = getAuthingOtpTtlSeconds(OTP_CODE_TTL_SECONDS)
    const management = new ManagementClient({
      userPoolId: config.userPoolId,
      secret: config.appSecret,
    })
    const internals = management as unknown as ManagementInternals

    const token = await internals.tokenProvider.getToken()
    const listResult = await internals.graphqlClient.request({
      query: `
        query emailTemplates {
          emailTemplates {
            type
            name
            subject
            sender
            content
            redirectTo
            hasURL
            expiresIn
            enabled
            isSystem
          }
        }
      `,
      token,
    })

    for (const template of listResult.emailTemplates ?? []) {
      if (!VERIFY_EMAIL_TEMPLATE_TYPES.has(template.type)) continue
      if (template.expiresIn === ttlSeconds) continue

      await internals.graphqlClient.request({
        query: `
          mutation configEmailTemplate($input: ConfigEmailTemplateInput!) {
            configEmailTemplate(input: $input) {
              type
              expiresIn
            }
          }
        `,
        variables: {
          input: {
            type: template.type,
            name: template.name,
            subject: template.subject,
            sender: template.sender,
            content: template.content,
            redirectTo: template.redirectTo ?? undefined,
            hasURL: template.hasURL ?? undefined,
            expiresIn: ttlSeconds,
          },
        },
        token,
      })
    }
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    console.warn('[authing] OTP email template sync skipped:', message)
  }

  templateTtlEnsured = true
}
