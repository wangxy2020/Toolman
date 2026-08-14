import { describe, expect, it } from 'vitest'
import {
  ABOUT_EXTERNAL_LINK_URLS,
  ABOUT_LINK_IDS,
  resolveAboutLinkUrl,
  TOOLMAN_GITHUB_URL,
} from './about'

describe('about settings links', () => {
  it('matches desktop about link ids and public urls', () => {
    expect([...ABOUT_LINK_IDS]).toEqual([
      'docs',
      'changelog',
      'website',
      'license',
      'thirdParty',
      'feedback',
      'enterprise',
      'email',
      'join',
    ])
    expect(resolveAboutLinkUrl('docs')).toBe(`${TOOLMAN_GITHUB_URL}#readme`)
    expect(resolveAboutLinkUrl('website')).toBe(ABOUT_EXTERNAL_LINK_URLS.website)
    expect(resolveAboutLinkUrl('feedback')).toBeUndefined()
    expect(resolveAboutLinkUrl('join')).toBeUndefined()
  })
})
