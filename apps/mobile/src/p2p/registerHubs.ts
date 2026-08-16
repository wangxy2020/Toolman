import { normalizeInviteHubUrls } from '@toolman/shared'

export function listRegisterHubCandidates(
  inviteHubs: Array<string | undefined> | undefined,
  extra?: string | null,
): string[] {
  return normalizeInviteHubUrls([...(inviteHubs ?? []), extra])
}
