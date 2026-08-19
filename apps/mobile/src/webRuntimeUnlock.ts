/**
 * Toolman — Copyright (C) 2024–2026 Toolman Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Source: https://github.com/wangxy2020/Toolman
 */
import { primeLocalNetworkAccess } from './sync/localNetworkFetch'
import { unlockAudioPlayback } from './voice/audioUnlock'

/** First click / keypress: unlock TTS autoplay and Chrome local-network access together. */
export function unlockWebRuntime(): void {
  unlockAudioPlayback()
  void primeLocalNetworkAccess()
}
