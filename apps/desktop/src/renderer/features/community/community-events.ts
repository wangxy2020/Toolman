/** Fired when RSS sources are created, deleted, or fetched. */
export const COMMUNITY_NEWS_SOURCES_CHANGED_EVENT = 'toolman.community.news-sources.changed'

/** Fired when community data affecting「我的」or管理统计 should refresh. */
export const COMMUNITY_USER_DATA_CHANGED_EVENT = 'toolman.community.user-data.changed'

const USER_DATA_CHANGED_DEBOUNCE_MS = 400
let userDataChangedTimer: number | null = null

export function notifyCommunityNewsSourcesChanged(): void {
  window.dispatchEvent(new Event(COMMUNITY_NEWS_SOURCES_CHANGED_EVENT))
}

export function notifyCommunityUserDataChanged(): void {
  if (userDataChangedTimer !== null) {
    window.clearTimeout(userDataChangedTimer)
  }
  userDataChangedTimer = window.setTimeout(() => {
    userDataChangedTimer = null
    window.dispatchEvent(new Event(COMMUNITY_USER_DATA_CHANGED_EVENT))
  }, USER_DATA_CHANGED_DEBOUNCE_MS)
}

export function notifyCommunityBoardChanged(): void {
  notifyCommunityUserDataChanged()
}
