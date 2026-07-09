import { describe, expect, it } from 'vitest'

import { getClipboardImageFiles } from './clipboard-images'

describe('getClipboardImageFiles', () => {
  it('reads image items from clipboard data', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    const clipboardData = {
      items: [{ type: 'image/png', getAsFile: () => file }],
      files: [],
    } as unknown as DataTransfer

    expect(getClipboardImageFiles(clipboardData)).toEqual([file])
  })

  it('falls back to clipboard files when items are empty', () => {
    const file = new File([new Uint8Array([4, 5, 6])], 'paste.jpg', { type: 'image/jpeg' })
    const clipboardData = {
      items: [],
      files: [file],
    } as unknown as DataTransfer

    expect(getClipboardImageFiles(clipboardData)).toEqual([file])
  })
})
