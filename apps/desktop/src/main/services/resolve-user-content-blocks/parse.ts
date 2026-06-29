import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import {
  isImageFilePath,
  isSupportedKnowledgeFile,
  mimeTypeForKind,
  parseFile,
  resolveFileKind,
} from '@toolman/knowledge'
import { buildChatParseOptions } from '../chat-parse-options.service'
import { tryGetIndexedPlainText } from '../indexed-document-text.service'
import { isDocumentOcrEnabled } from '../runtime-app-settings.service'
import { withTimeout } from '../../utils/async-timeout'
import {
  CHAT_PARSE_TIMEOUT_MS,
  DEFAULT_MAX_BYTES,
  guessMimeType,
  isLikelyTextFile,
  truncateText,
  type ParseAttachmentOptions,
  type ParsedChatFile,
} from './helpers'

export async function parseChatFileAttachment(
  readPath: string,
  options: ParseAttachmentOptions,
): Promise<ParsedChatFile> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const documentOcrEnabled = options.documentOcrEnabled ?? isDocumentOcrEnabled()
  const workspaceId = options.workspaceId
  const sourcePath = options.sourcePath ?? readPath
  const fileName = options.fileName ?? basename(sourcePath)
  const parseOptions = workspaceId
    ? buildChatParseOptions(workspaceId, {
        documentOcrEnabled,
        onStatus: options.onStatus,
      })
    : undefined

  const stat = statSync(readPath)
  if (!stat.isFile()) {
    throw new Error('不是有效文件')
  }

  if (isImageFilePath(sourcePath) || isImageFilePath(fileName)) {
    throw new Error('请使用图片附件类型上传图片文件')
  }

  const kind = resolveFileKind({
    path: sourcePath,
    fileName,
    mimeType: options.mimeType,
  })

  if (kind && kind !== 'image') {
    if (workspaceId && !isSupportedKnowledgeFile(sourcePath, { ocrEnabled: documentOcrEnabled })) {
      throw new Error('暂不支持该文件类型')
    }

    const indexedText =
      workspaceId && kind === 'pdf' ? tryGetIndexedPlainText(workspaceId, sourcePath) : null
    if (indexedText) {
      const { text, truncated } = truncateText(indexedText, maxBytes)
      if (!text) throw new Error('未能从文件中提取到文本内容')
      return {
        name: fileName,
        content: text,
        mimeType: mimeTypeForKind(kind, sourcePath),
        ...(truncated ? { truncated: true } : {}),
      }
    }

    const parsed = await withTimeout(
      parseFile(readPath, { ...parseOptions, kind }),
      CHAT_PARSE_TIMEOUT_MS,
      '文件解析超时，扫描件 PDF 可能需要较长时间，请稍后重试',
    )
    const { text, truncated } = truncateText(parsed.plainText.trim(), maxBytes)
    if (!text) {
      throw new Error('未能从文件中提取到文本内容')
    }
    return {
      name: fileName,
      content: text,
      mimeType: parsed.mimeType,
      ...(truncated ? { truncated: true } : {}),
    }
  }

  if (!isLikelyTextFile(sourcePath) && !isLikelyTextFile(fileName)) {
    throw new Error('暂不支持该文件类型')
  }

  const buffer = readFileSync(readPath)
  const truncated = buffer.length > maxBytes
  const slice = truncated ? buffer.subarray(0, maxBytes) : buffer
  const content = slice.toString('utf-8').trim()
  if (!content) {
    throw new Error('文件内容为空')
  }

  return {
    name: fileName,
    content,
    mimeType: guessMimeType(fileName),
    ...(truncated ? { truncated: true } : {}),
  }
}
