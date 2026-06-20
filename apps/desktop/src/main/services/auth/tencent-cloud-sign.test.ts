import { describe, expect, it } from 'vitest'

import { signTencentCloudRequest } from './tencent-cloud-sign'

describe('tencent-cloud-sign', () => {
  it('produces stable TC3 authorization headers', () => {
    const headers = signTencentCloudRequest({
      secretId: 'AKIDTEST',
      secretKey: 'secret-key',
      service: 'sms',
      host: 'sms.tencentcloudapi.com',
      region: 'ap-guangzhou',
      action: 'SendSms',
      version: '2021-01-11',
      payload: '{"PhoneNumberSet":["+8613800138000"]}',
      timestamp: 1_700_000_000,
    })

    expect(headers.Authorization).toMatch(/^TC3-HMAC-SHA256 Credential=AKIDTEST\//)
    expect(headers['X-TC-Action']).toBe('SendSms')
    expect(headers['X-TC-Region']).toBe('ap-guangzhou')
  })
})
