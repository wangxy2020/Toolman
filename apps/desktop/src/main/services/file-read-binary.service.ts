import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import {
  FileReadBinaryInputSchema,
  FileReadBinaryOutputSchema,
  ipcErr,
  ipcOk,
  toErrorMessage,
} from '@toolman/shared'
import { assertPathWithinAllowedRoots } from './path-sandbox.service'

const DEFAULT_MAX_BYTES = 80 * 1024 * 1024

function mimeTypeForPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  switch (ext) {
    case '.pdf':
      return 'application/pdf'
    case '.doc':
      return 'application/msword'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.xls':
      return 'application/vnd.ms-excel'
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case '.csv':
      return 'text/csv'
    default:
      return 'application/octet-stream'
  }
}

export async function readFileBinary(input: unknown) {
  try {
    const data = FileReadBinaryInputSchema.parse(input)
    const filePath = assertPathWithinAllowedRoots(data.path)
    const maxBytes = data.maxBytes ?? DEFAULT_MAX_BYTES
    const stat = statSync(filePath)
    if (!stat.isFile()) {
      return ipcErr({ code: 'VALIDATION_ERROR', message: '不是有效文件', retryable: false })
    }
    if (stat.size > maxBytes) {
      return ipcErr({
        code: 'VALIDATION_ERROR',
        message: `文件过大（超过 ${Math.round(maxBytes / (1024 * 1024))}MB），请用系统应用打开`,
        retryable: false,
      })
    }

    const buffer = readFileSync(filePath)
    return ipcOk(
      FileReadBinaryOutputSchema.parse({
        fileName: basename(filePath),
        mimeType: mimeTypeForPath(filePath),
        base64: buffer.toString('base64'),
        byteLength: buffer.byteLength,
      }),
    )
  } catch (error) {
    return ipcErr({
      code: 'INTERNAL_ERROR',
      message: toErrorMessage(error, '读取文件失败'),
      retryable: false,
    })
  }
}
