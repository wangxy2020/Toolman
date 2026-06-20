import { AuthLoginError } from './auth-login.error.js'
import { signTencentCloudRequest } from './tencent-cloud-sign.js'
import type { TencentSmsConfig } from './tencent-auth.config.js'

interface SendSmsResponse {
  Response?: {
    SendStatusSet?: Array<{ Code?: string; Message?: string }>
    Error?: { Code?: string; Message?: string }
  }
}

function mapSmsError(message: string): string {
  if (message.includes('LimitExceeded')) return '短信发送频率超限，请稍后再试'
  if (message.includes('InvalidParameterValue')) return '短信模板或签名配置错误'
  return message
}

export async function sendTencentSmsCode(
  config: TencentSmsConfig,
  phone: string,
  code: string,
): Promise<void> {
  const host = 'sms.tencentcloudapi.com'
  const service = 'sms'
  const action = 'SendSms'
  const version = '2021-01-11'
  const timestamp = Math.floor(Date.now() / 1000)

  const payload = JSON.stringify({
    PhoneNumberSet: [phone],
    SmsSdkAppId: config.smsSdkAppId,
    SignName: config.signName,
    TemplateId: config.templateId,
    TemplateParamSet: [code, '5'],
  })

  const headers = signTencentCloudRequest({
    secretId: config.secretId,
    secretKey: config.secretKey,
    service,
    host,
    region: config.region,
    action,
    version,
    payload,
    timestamp,
  })

  const response = await fetch(`https://${host}`, {
    method: 'POST',
    headers,
    body: payload,
  })

  const data = (await response.json()) as SendSmsResponse
  const apiError = data.Response?.Error
  if (apiError?.Message) {
    throw new AuthLoginError(mapSmsError(apiError.Message), apiError.Code)
  }

  const status = data.Response?.SendStatusSet?.[0]
  if (!status || status.Code !== 'Ok') {
    throw new AuthLoginError(mapSmsError(status?.Message ?? '短信发送失败'))
  }
}
