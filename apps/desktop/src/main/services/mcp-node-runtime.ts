import { app } from 'electron'

/** Node executable for bundled MCP stdio servers in packaged builds. */
export function resolveMcpNodeCommand(): string {
  if (app.isPackaged) {
    return process.execPath
  }
  return process.env.TOOLMAN_MCP_NODE ?? 'node'
}

export function resolveMcpNodeEnv(
  base: Record<string, string> = {},
): Record<string, string> {
  if (!app.isPackaged) {
    return base
  }
  return {
    ...base,
    ELECTRON_RUN_AS_NODE: '1',
  }
}
