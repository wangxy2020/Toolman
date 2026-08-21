import { describe, expect, it } from 'vitest'
import {
  TRIAL_LLM_MONTHLY_CONVERSATION_CAP,
  TRIAL_LLM_MONTHLY_TOKEN_CAP,
  TRIAL_LLM_RATE_PER_MINUTE,
  emptyTrialQuota,
  evaluateTrialQuota,
  hasUserConfiguredApiKey,
  normalizeTrialQuota,
  recordTrialAttempt,
  recordTrialSuccess,
  remainingTrialConversations,
  remainingTrialTokens,
  trialMonthKey,
} from './trial-llm.js'

describe('trial llm quota', () => {
  it('treats blank keys as unconfigured', () => {
    expect(hasUserConfiguredApiKey('')).toBe(false)
    expect(hasUserConfiguredApiKey('   ')).toBe(false)
    expect(hasUserConfiguredApiKey('sk-test')).toBe(true)
  })

  it('rolls over unused quota on a new UTC month', () => {
    const january = Date.UTC(2026, 0, 31, 23, 0, 0)
    const february = Date.UTC(2026, 1, 1, 0, 30, 0)
    const used = recordTrialSuccess(emptyTrialQuota(january), 9_000, january)
    expect(used.monthKey).toBe('2026-01')
    const next = normalizeTrialQuota(used, february)
    expect(next.monthKey).toBe('2026-02')
    expect(next.tokensUsed).toBe(0)
    expect(next.conversationsUsed).toBe(0)
  })

  it('blocks after 50 conversations or 200k tokens', () => {
    const now = Date.UTC(2026, 7, 21, 12, 0, 0)
    const byTurns = {
      monthKey: trialMonthKey(now),
      tokensUsed: 10,
      conversationsUsed: TRIAL_LLM_MONTHLY_CONVERSATION_CAP,
      recentRequestAt: [],
    }
    expect(evaluateTrialQuota(byTurns, now).ok).toBe(false)
    expect(remainingTrialConversations(byTurns, now)).toBe(0)

    const byTokens = {
      monthKey: trialMonthKey(now),
      tokensUsed: TRIAL_LLM_MONTHLY_TOKEN_CAP,
      conversationsUsed: 1,
      recentRequestAt: [],
    }
    expect(evaluateTrialQuota(byTokens, now).ok).toBe(false)
    expect(remainingTrialTokens(byTokens, now)).toBe(0)
  })

  it('allows 3 attempts per minute then rate-limits', () => {
    const t0 = Date.UTC(2026, 7, 21, 12, 0, 0)
    let state = emptyTrialQuota(t0)
    for (let i = 0; i < TRIAL_LLM_RATE_PER_MINUTE; i += 1) {
      const decision = evaluateTrialQuota(state, t0 + i)
      expect(decision.ok).toBe(true)
      state = recordTrialAttempt(state, t0 + i)
    }
    const blocked = evaluateTrialQuota(state, t0 + 3)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.reason).toBe('rate')
    const later = evaluateTrialQuota(state, t0 + 60_001)
    expect(later.ok).toBe(true)
  })
})
