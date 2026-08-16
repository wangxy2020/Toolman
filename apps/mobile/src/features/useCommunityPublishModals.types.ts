export type SharedPublishProps = {
  visible: boolean
  hubBaseUrl: string
  userId?: string | null
  onClose: () => void
  onPublished: () => void
  embedded?: boolean
}
