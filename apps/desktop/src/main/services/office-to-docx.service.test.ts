import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import {
  buildLegacyWordConversionStatusMessage,
  buildMicrosoftWordMacConversionScript,
  docxWorkingStem,
  ensureNamedSourceForConversion,
  findMicrosoftWordMac,
  hasFormatPreservingConverter,
  hasMicrosoftWordInstalled,
  isLegacyWordPath,
  isNativeDocxPath,
  resolveOfficeSourceKind,
  shouldAllowPlaintextFallback,
} from './office-to-docx.service'

describe('office-to-docx helpers', () => {
  it('detects native docx paths', () => {
    expect(isNativeDocxPath('/tmp/report.docx', 'report.docx')).toBe(true)
    expect(isNativeDocxPath('/tmp/report.doc', 'report.doc')).toBe(false)
    expect(
      isNativeDocxPath(
        '/Users/wangxy/Library/Application Support/@toolman/desktop/storage/blobs/49/hash',
        'report.docx',
      ),
    ).toBe(true)
  })

  it('detects legacy word paths', () => {
    expect(isLegacyWordPath('/tmp/report.doc', 'report.doc')).toBe(true)
    expect(isLegacyWordPath('/tmp/report.wps', 'report.wps')).toBe(true)
    expect(isLegacyWordPath('/tmp/report.docx', 'report.docx')).toBe(false)
    expect(
      isLegacyWordPath(
        '/Users/wangxy/Library/Application Support/@toolman/desktop/storage/blobs/49/hash',
        '某学校项目施工合同初稿.doc',
      ),
    ).toBe(true)
  })

  it('resolves source kind from fileName when blob path has no extension', () => {
    const blobPath =
      '/Users/wangxy/Library/Application Support/@toolman/desktop/storage/blobs/49/hash'
    expect(resolveOfficeSourceKind(blobPath, '某学校项目施工合同初稿.doc')).toBe('doc')
  })

  it('builds working stems from doc, docx, and wps names', () => {
    expect(docxWorkingStem('审核稿.docx')).toBe('审核稿')
    expect(docxWorkingStem('审核稿.doc')).toBe('审核稿')
    expect(docxWorkingStem('审核稿.wps')).toBe('审核稿')
  })

  it('stages blob sources with original file extension', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toolman-office-stage-'))
    const blobPath = join(dir, '49e1e8bb27dc0fa3')
    writeFileSync(blobPath, 'placeholder')

    try {
      const staged = await ensureNamedSourceForConversion(blobPath, '合同初稿.doc')
      expect(staged.inputPath).toMatch(/合同初稿\.doc$/)
      expect(staged.inputPath).not.toBe(blobPath)
      expect(readFileSync(staged.inputPath, 'utf8')).toBe('placeholder')
      await staged.cleanup?.()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('detects Microsoft Word on macOS when installed', async () => {
    const installed = await findMicrosoftWordMac()
    if (process.platform === 'darwin') {
      expect(typeof installed).toBe('boolean')
    } else {
      expect(installed).toBe(false)
    }
  })

  it('builds AppleScript using numeric docx format and active document', () => {
    const script = buildMicrosoftWordMacConversionScript('/tmp/input.doc', '/tmp/output.docx')
    expect(script).toContain('open inputPath')
    expect(script).toContain('set docRef to active document')
    expect(script).toContain('file format 12')
    expect(script).not.toContain('format XML document')
  })

  it('allows plaintext fallback only when Word is not installed', () => {
    expect(
      shouldAllowPlaintextFallback({
        libreOffice: false,
        microsoftWordMac: false,
        microsoftWordWindows: false,
      }),
    ).toBe(true)
    expect(
      shouldAllowPlaintextFallback({
        libreOffice: true,
        microsoftWordMac: true,
        microsoftWordWindows: false,
      }),
    ).toBe(false)
    expect(
      shouldAllowPlaintextFallback({
        libreOffice: false,
        microsoftWordMac: false,
        microsoftWordWindows: true,
      }),
    ).toBe(false)
  })

  it('builds status messages for no-Word environments', () => {
    const noWord = {
      libreOffice: true,
      microsoftWordMac: false,
      microsoftWordWindows: false,
    }

    expect(
      buildLegacyWordConversionStatusMessage({
        fileName: '合同.doc',
        workingName: '修订版_合同.docx',
        method: 'libreoffice',
        capabilities: noWord,
      }),
    ).toContain('未检测到 Microsoft Word')

    expect(
      buildLegacyWordConversionStatusMessage({
        fileName: '合同.doc',
        workingName: '修订版_合同.docx',
        method: 'plaintext',
        capabilities: {
          libreOffice: false,
          microsoftWordMac: false,
          microsoftWordWindows: false,
        },
      }),
    ).toContain('未检测到 Word/LibreOffice')
  })

  it('detects format-preserving converters', () => {
    expect(
      hasFormatPreservingConverter({
        libreOffice: true,
        microsoftWordMac: false,
        microsoftWordWindows: false,
      }),
    ).toBe(true)
    expect(
      hasMicrosoftWordInstalled({
        libreOffice: false,
        microsoftWordMac: false,
        microsoftWordWindows: true,
      }),
    ).toBe(true)
  })
})
