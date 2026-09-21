export interface LocalWorkflowItem {
  id: string
  name: string
  description?: string
  engine?: string
  updatedAt?: number
  parentId?: string
  sessionId?: string
}
