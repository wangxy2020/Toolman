import type { CommunityHubAuthContext } from '../community-hub-auth.service'

export interface CommunityApiResponse<T> {
  ok: boolean
  data: T
  error?: {
    code: string
    message: string
    retryable?: boolean
  }
}

export interface CommunityHealthData {
  status: string
  version: string
  db: string
  data_dir?: string
  require_review?: boolean
  rate_limit_rpm?: number
  user_count?: number
  resource_count?: number
  federation_peering?: boolean
}

export class CommunityHttpError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'CommunityHttpError'
    this.status = status
    this.code = code
  }
}

export interface CommunityHttpClientOptions {
  port?: number
  host?: string
  baseUrl?: string
  identityId?: string
  fetchImpl?: typeof fetch
  resolveAuth?: () => Promise<CommunityHubAuthContext> | CommunityHubAuthContext
}
