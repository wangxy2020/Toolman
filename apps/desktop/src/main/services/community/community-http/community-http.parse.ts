import { CommunityHttpError, type CommunityApiResponse } from './community-http.types'

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function parseCommunityApiResponse<T>(text: string, status: number): T {
  let payload: CommunityApiResponse<T>
  if (text) {
    try {
      payload = JSON.parse(text) as CommunityApiResponse<T>
    } catch {
      throw new CommunityHttpError(
        `Community API returned invalid JSON (${status})`,
        status,
        'INVALID_JSON',
      )
    }
  } else if (status < 200 || status >= 300) {
    const hint =
      status === 404
        ? '接口不存在，请重新构建并重启 Community Hub（pnpm build:community-hub 后重启应用）'
        : `Community API request failed (${status})`
    throw new CommunityHttpError(hint, status, 'EMPTY_RESPONSE')
  } else {
    payload = {
      ok: false,
      data: null as T,
      error: { code: 'EMPTY_RESPONSE', message: 'Empty response body' },
    }
  }
  if (status < 200 || status >= 300 || !payload.ok) {
    throw new CommunityHttpError(
      payload.error?.message ?? `Community API request failed: ${status}`,
      status,
      payload.error?.code,
    )
  }

  return payload.data
}
