import { describe, expect, it } from 'vitest'
import {
  buildTranslationFolderName,
  createDefaultTranslationFolder,
  DEFAULT_TRANSLATION_FOLDER_ID,
  normalizeTranslationData,
} from './translation-storage'

describe('translation folders', () => {
  it('seeds the default 文档翻译 folder when missing', () => {
    const data = normalizeTranslationData({
      documents: [
        {
          id: 'document-1',
          workspaceId: 'ws-1',
          title: 'a.pdf',
          filePath: '/tmp/a.pdf',
          fileName: 'a.pdf',
          kind: 'pdf',
          folderId: '',
          sourceText: '',
          targetText: '',
          languages: ['zh', 'en'],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    expect(data.folders[0]).toMatchObject({
      id: DEFAULT_TRANSLATION_FOLDER_ID,
      name: '文档翻译',
      isDefault: true,
    })
    expect(data.documents[0]?.folderId).toBe(DEFAULT_TRANSLATION_FOLDER_ID)
  })

  it('builds unique folder names like notes notebooks', () => {
    expect(buildTranslationFolderName([createDefaultTranslationFolder()])).toBe('文件夹')
    expect(
      buildTranslationFolderName([
        createDefaultTranslationFolder(),
        { id: 'folder-2', name: '文件夹', createdAt: 1 },
      ]),
    ).toBe('文件夹 2')
  })

  it('keeps the default folder when normalizing renamed aliases', () => {
    const data = normalizeTranslationData({
      folders: [
        {
          id: DEFAULT_TRANSLATION_FOLDER_ID,
          name: '我的翻译',
          isDefault: true,
          createdAt: 1,
        },
      ],
    })
    expect(data.folders[0]?.name).toBe('我的翻译')
    expect(data.folders[0]?.isDefault).toBe(true)
  })
})
