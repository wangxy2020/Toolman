export interface ToolDisplayMeta {
  title: string
  description: string
  commandStyle: boolean
  buildCommand: (args: Record<string, unknown>) => string
}
