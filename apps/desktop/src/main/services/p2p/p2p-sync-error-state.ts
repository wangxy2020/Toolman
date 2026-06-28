/** Whether peer sync loop should transition workspace status to idle. */
export function shouldSetWorkspaceIdleAfterPeerSync(syncHadError: boolean): boolean {
  return !syncHadError
}
