import type { ChildProcess } from 'node:child_process'
import { logStructured } from '../../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { recordDiagnosticEvent } from '../../diagnostics-log'
import type { CommunityHttpClient } from '../community-http.client'
import {
  createInitialHubStatus,
  type CommunityHubStatus,
} from './types'

export let childProcess: ChildProcess | null = null
export let httpClient: CommunityHttpClient | null = null
export let currentStatus: CommunityHubStatus = createInitialHubStatus()

export function setChildProcess(process: ChildProcess | null): void {
  childProcess = process
}

export function setHttpClient(client: CommunityHttpClient | null): void {
  httpClient = client
}

export function setCurrentStatus(status: CommunityHubStatus): void {
  currentStatus = status
}

export function log(message: string, error?: unknown): void {
  if (error !== undefined) {
    logStructured('community.hub', 'error', `${message}`, { detail: error })
    const errMessage = toErrorMessage(error, String(error))
    recordDiagnosticEvent('community-hub', 'error', `${message}: ${errMessage}`)
    return
  }
  logStructured('community.hub', 'info', `${message}`)
}
