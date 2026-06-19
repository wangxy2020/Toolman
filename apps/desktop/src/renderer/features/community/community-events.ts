export const COMMUNITY_BOARD_CHANGED_EVENT = 'toolman.community.board.changed'

export function notifyCommunityBoardChanged(): void {
  window.dispatchEvent(new Event(COMMUNITY_BOARD_CHANGED_EVENT))
}
