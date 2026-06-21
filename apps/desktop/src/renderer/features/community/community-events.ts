/** Fired when RSS sources are created, deleted, or fetched. */
export const COMMUNITY_NEWS_SOURCES_CHANGED_EVENT = 'toolman.community.news-sources.changed'

/** Fired when community data affecting「我的」or管理统计 should refresh. */
export const COMMUNITY_USER_DATA_CHANGED_EVENT = 'toolman.community.user-data.changed'

/** @deprecated Use COMMUNITY_USER_DATA_CHANGED_EVENT */
export const COMMUNITY_BOARD_CHANGED_EVENT = COMMUNITY_USER_DATA_CHANGED_EVENT

export function notifyCommunityNewsSourcesChanged(): void {
  window.dispatchEvent(new Event(COMMUNITY_NEWS_SOURCES_CHANGED_EVENT))
}

export function notifyCommunityUserDataChanged(): void {
  window.dispatchEvent(new Event(COMMUNITY_USER_DATA_CHANGED_EVENT))
}

export function notifyCommunityBoardChanged(): void {
  notifyCommunityUserDataChanged()
}
