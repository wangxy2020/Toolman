import { afterEach, describe, expect, it } from 'vitest'
import {
  normalizeJavaToolOptions,
  resolveJavaHeapOptions,
  sanitizeProcessJavaToolOptions,
} from './java-runtime.js'

describe('normalizeJavaToolOptions', () => {
  it('treats placeholder strings as unset', () => {
    expect(normalizeJavaToolOptions(undefined)).toBeUndefined()
    expect(normalizeJavaToolOptions('')).toBeUndefined()
    expect(normalizeJavaToolOptions('   ')).toBeUndefined()
    expect(normalizeJavaToolOptions('undefined')).toBeUndefined()
    expect(normalizeJavaToolOptions('UNDEFINED')).toBeUndefined()
    expect(normalizeJavaToolOptions('null')).toBeUndefined()
  })

  it('keeps valid JVM flags', () => {
    expect(normalizeJavaToolOptions('-Dfile.encoding=UTF-8')).toBe('-Dfile.encoding=UTF-8')
  })
})

describe('sanitizeProcessJavaToolOptions', () => {
  afterEach(() => {
    delete process.env.JAVA_TOOL_OPTIONS
  })

  it('removes invalid placeholder values from process env', () => {
    process.env.JAVA_TOOL_OPTIONS = 'undefined'
    sanitizeProcessJavaToolOptions()
    expect(process.env.JAVA_TOOL_OPTIONS).toBeUndefined()
  })

  it('preserves valid values', () => {
    process.env.JAVA_TOOL_OPTIONS = '-Dfile.encoding=UTF-8'
    sanitizeProcessJavaToolOptions()
    expect(process.env.JAVA_TOOL_OPTIONS).toBe('-Dfile.encoding=UTF-8')
  })
})

describe('resolveJavaHeapOptions', () => {
  afterEach(() => {
    delete process.env.JAVA_TOOL_OPTIONS
  })

  it('adds heap flag when env is unset or invalid', () => {
    expect(resolveJavaHeapOptions(512)).toEqual({ JAVA_TOOL_OPTIONS: '-Xmx512m' })

    process.env.JAVA_TOOL_OPTIONS = 'undefined'
    expect(resolveJavaHeapOptions(512)).toEqual({ JAVA_TOOL_OPTIONS: '-Xmx512m' })
  })

  it('appends heap flag to existing valid options', () => {
    process.env.JAVA_TOOL_OPTIONS = '-Dfile.encoding=UTF-8'
    expect(resolveJavaHeapOptions(768)).toEqual({
      JAVA_TOOL_OPTIONS: '-Dfile.encoding=UTF-8 -Xmx768m',
    })
  })
})
