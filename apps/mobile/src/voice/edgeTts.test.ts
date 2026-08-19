/**
 * Toolman — Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { describe, expect, it } from 'vitest'
import { isAudioSynthesizeResponse } from './edgeTts'

describe('isAudioSynthesizeResponse', () => {
  it('accepts audio MPEG and rejects SPA HTML', () => {
    expect(
      isAudioSynthesizeResponse(
        new Response('x', { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }),
      ),
    ).toBe(true)
    expect(
      isAudioSynthesizeResponse(
        new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
      ),
    ).toBe(false)
    expect(
      isAudioSynthesizeResponse(
        new Response(JSON.stringify({ error: 'nope' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ).toBe(false)
  })
})
