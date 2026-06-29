import { CommunityPage } from '../community/CommunityPage'
import type { ChatPageState } from './useChatPage'

export type ChatPageCommunityViewProps = Pick<
  ChatPageState,
  'communityAction' | 'communitySidebarSection'
>

export function ChatPageCommunityView({
  communityAction,
  communitySidebarSection,
}: ChatPageCommunityViewProps) {
  return (
    <CommunityPage
      activeAction={communityAction}
      sidebarSection={communitySidebarSection}
    />
  )
}
