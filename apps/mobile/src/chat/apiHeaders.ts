/** HTTP header values must be ISO-8859-1; browsers reject Unicode in RequestInit.headers. */

export function sanitizeApiKey(raw: string): string {
  return raw
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\u2018\u2019\u201C\u201D]/g, '')
    // API keys are single tokens; pasted keys often include accidental whitespace/newlines.
    .replace(/\s+/g, '')
    .trim()
}

export function isIso8859_1(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 0xff) return false
  }
  return true
}

export type AuthHeaderResult =
  | { ok: true; headers: Record<string, string>; apiKey: string }
  | { ok: false; message: string }

/** Build Authorization headers safe for `fetch` in the browser. */
export function buildApiAuthHeaders(rawApiKey: string): AuthHeaderResult {
  const apiKey = sanitizeApiKey(rawApiKey)
  if (!apiKey) {
    return { ok: false, message: '请先填写 API Key' }
  }
  if (!isIso8859_1(apiKey)) {
    return {
      ok: false,
      message:
        'API Key 含有中文或特殊字符，无法写入请求头。请重新粘贴纯英文/数字的密钥（不要带说明文字）。',
    }
  }
  return {
    ok: true,
    apiKey,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }
}
