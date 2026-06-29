import {
  IpcChannel,
  type CommunityModerationDeviceBanInput,
  type CommunityModerationDeviceUnbanInput,
  type CommunityModerationLog,
  type CommunityModerationLogsListInput,
  type CommunityModerationReport,
  type CommunityModerationReportCreateInput,
  type CommunityModerationReportListInput,
  type CommunityModerationReportResolveInput,
  type CommunityModerationResourceActionInput,
  type CommunityModerationScanOutput,
  type CommunityModerationUserBanInput,
  type CommunityModerationUserUnbanInput,
} from '@toolman/shared'
import { invokeIpc } from './community-api-ipc'

export async function createCommunityModerationReport(
  input: CommunityModerationReportCreateInput,
): Promise<CommunityModerationReport> {
  return invokeIpc(IpcChannel.CommunityModerationReport, input)
}

export async function listCommunityModerationReports(
  input: CommunityModerationReportListInput = {},
): Promise<{ items: CommunityModerationReport[] }> {
  return invokeIpc(IpcChannel.CommunityModerationReportList, input)
}

export async function resolveCommunityModerationReport(
  input: CommunityModerationReportResolveInput,
): Promise<CommunityModerationReport> {
  return invokeIpc(IpcChannel.CommunityModerationReportResolve, input)
}

export async function suspendCommunityModerationResource(
  input: CommunityModerationResourceActionInput,
): Promise<{ id: string; title: string; status: string }> {
  return invokeIpc(IpcChannel.CommunityModerationResourceSuspend, input)
}

export async function approveCommunityModerationResource(
  input: CommunityModerationResourceActionInput,
): Promise<{ id: string; title: string; status: string }> {
  return invokeIpc(IpcChannel.CommunityModerationResourceApprove, input)
}

export async function approveCommunityModerationTask(
  input: CommunityModerationResourceActionInput,
): Promise<{ id: string; title: string; status: string }> {
  return invokeIpc(IpcChannel.CommunityModerationTaskApprove, input)
}

export async function rejectCommunityModerationTask(
  input: CommunityModerationResourceActionInput,
): Promise<{ id: string; title: string; status: string }> {
  return invokeIpc(IpcChannel.CommunityModerationTaskReject, input)
}

export async function banCommunityModerationUser(
  input: CommunityModerationUserBanInput,
): Promise<{ banned: boolean }> {
  return invokeIpc(IpcChannel.CommunityModerationUserBan, input)
}

export async function unbanCommunityModerationUser(
  input: CommunityModerationUserUnbanInput,
): Promise<{ unbanned: boolean }> {
  return invokeIpc(IpcChannel.CommunityModerationUserUnban, input)
}

export async function banCommunityModerationDevice(
  input: CommunityModerationDeviceBanInput,
): Promise<{ banned: boolean }> {
  return invokeIpc(IpcChannel.CommunityModerationDeviceBan, input)
}

export async function unbanCommunityModerationDevice(
  input: CommunityModerationDeviceUnbanInput,
): Promise<{ unbanned: boolean }> {
  return invokeIpc(IpcChannel.CommunityModerationDeviceUnban, input)
}

export async function listCommunityModerationLogs(
  input: CommunityModerationLogsListInput = {},
): Promise<{ items: CommunityModerationLog[] }> {
  return invokeIpc(IpcChannel.CommunityModerationLogsList, input)
}

export async function scanCommunityModerationOnline(): Promise<CommunityModerationScanOutput> {
  return invokeIpc(IpcChannel.CommunityModerationScan)
}

export async function touchCommunityPresenceHeartbeat(): Promise<{ ok: boolean }> {
  return invokeIpc(IpcChannel.CommunityPresenceHeartbeat)
}
