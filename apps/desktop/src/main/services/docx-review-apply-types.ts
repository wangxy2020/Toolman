export type DocxReviewToolUpdate = {
  toolCallId: string
  name: string
  arguments?: string
  result?: string
  status: 'running' | 'done' | 'failed'
}
