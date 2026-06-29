import type { Dispatch, SetStateAction } from 'react'
import type { CommunityBoardMessage } from '@toolman/shared'
import {
  COMMUNITY_UI_MOCK_ENABLED,
  COMMUNITY_UI_MOCK_IDS,
} from './community-ui-mock'
import { applyUiMockInteractionToMessage } from './community-ui-mock-interactions'

type InteractionAction = 'like' | 'dislike' | 'favorite'

interface Options {
  messageId: string
  action: InteractionAction
  runMockToggle: () => void
  runServerCall: () => Promise<CommunityBoardMessage>
  setItems: Dispatch<SetStateAction<CommunityBoardMessage[]>>
  replaceMessage: (updated: CommunityBoardMessage) => void
  setInteractionId: (value: string | null) => void
  setInteractionAction: (value: InteractionAction | null) => void
  setError: (value: string | null) => void
  notifyCommunityUserDataChanged: () => void
  onErrorMessage: string
}

export async function runCommunityMessageBoardInteraction({
  messageId,
  action,
  runMockToggle,
  runServerCall,
  setItems,
  replaceMessage,
  setInteractionId,
  setInteractionAction,
  setError,
  notifyCommunityUserDataChanged,
  onErrorMessage,
}: Options) {
  setInteractionId(messageId)
  setInteractionAction(action)
  setError(null)
  try {
    if (COMMUNITY_UI_MOCK_ENABLED && messageId === COMMUNITY_UI_MOCK_IDS.message) {
      runMockToggle()
      setItems((current) =>
        current.map((item) => (item.id === messageId ? applyUiMockInteractionToMessage(item) : item)),
      )
      notifyCommunityUserDataChanged()
      return
    }
    const updated = await runServerCall()
    replaceMessage(updated)
    notifyCommunityUserDataChanged()
  } catch (interactionError) {
    const message = interactionError instanceof Error ? interactionError.message : onErrorMessage
    setError(message)
  } finally {
    setInteractionId(null)
    setInteractionAction(null)
  }
}
