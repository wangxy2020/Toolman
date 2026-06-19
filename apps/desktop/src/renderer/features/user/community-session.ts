const COMMUNITY_SESSION_KEY = 'toolman.community.session.active'
export const COMMUNITY_SESSION_CHANGED_EVENT = 'toolman:community-session-changed'

export function isCommunitySessionActive(): boolean {
  try {
    return localStorage.getItem(COMMUNITY_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function setCommunitySessionActive(active: boolean): void {
  try {
    if (active) {
      localStorage.setItem(COMMUNITY_SESSION_KEY, '1')
    } else {
      localStorage.removeItem(COMMUNITY_SESSION_KEY)
    }
    window.dispatchEvent(new CustomEvent(COMMUNITY_SESSION_CHANGED_EVENT, { detail: { active } }))
  } catch {
    // Ignore storage errors in restricted environments.
  }
}
