import { describe, expect, it } from 'vitest'

import { extractLlmJsonArray } from './llm-json-parse.js'

describe('extractLlmJsonArray', () => {
  it('parses fenced json array', () => {
    expect(extractLlmJsonArray('```json\n[{"id":"1"}]\n```')).toEqual([{ id: '1' }])
  })

  it('parses raw array substring', () => {
    expect(extractLlmJsonArray('issues:\n[{"id":"1"}]')).toEqual([{ id: '1' }])
  })

  it('returns null for invalid input', () => {
    expect(extractLlmJsonArray('not json')).toBeNull()
  })
})
