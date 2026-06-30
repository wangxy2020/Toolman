import { parentPort } from 'node:worker_threads'
import { toErrorMessage } from '@toolman/shared'
import { hashFileStream, parseFile, type ParseFileOptions } from '@toolman/knowledge'

type WorkerParseFileOptions = {
  enhanced?: boolean
  pdfTextQuality?: 'strict' | 'lenient' | 'prefer-extracted'
  ocr?: {
    enabled: boolean
    maxPdfPages?: number
  }
}

interface ParseFileWorkerRequest {
  type: 'parse'
  filePath: string
  parseOptions?: WorkerParseFileOptions
}

interface OcrPageRequest {
  type: 'ocr-request'
  requestId: number
  kind: 'page'
  input: unknown
}

interface OcrImageRequest {
  type: 'ocr-request'
  requestId: number
  kind: 'image'
  mimeType: string
  buffer: ArrayBuffer
}

interface OcrResponse {
  type: 'ocr-response'
  requestId: number
  text: string
}

interface ParseFileWorkerSuccess {
  type: 'parse-result'
  ok: true
  contentHash: string
  title: string
  plainText: string
  mimeType: string
  kind: string
}

interface ParseFileWorkerFailure {
  type: 'parse-result'
  ok: false
  error: string
}

type ParseFileWorkerResponse = ParseFileWorkerSuccess | ParseFileWorkerFailure

const ocrPending = new Map<number, (text: string) => void>()

function createOcrProxy(parseOptions?: WorkerParseFileOptions): ParseFileOptions['ocr'] | undefined {
  if (!parseOptions?.ocr?.enabled) return undefined

  let nextRequestId = 1
  return {
    enabled: true,
    maxPdfPages: parseOptions.ocr.maxPdfPages,
    recognizePage: async (input) => {
      const requestId = nextRequestId
      nextRequestId += 1
      return await new Promise<string>((resolve) => {
        ocrPending.set(requestId, resolve)
        parentPort?.postMessage({
          type: 'ocr-request',
          requestId,
          kind: 'page',
          input,
        } satisfies OcrPageRequest)
      })
    },
    recognizeImage: async ({ buffer, mimeType }) => {
      const requestId = nextRequestId
      nextRequestId += 1
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer
      return await new Promise<string>((resolve) => {
        ocrPending.set(requestId, resolve)
        parentPort?.postMessage(
          {
            type: 'ocr-request',
            requestId,
            kind: 'image',
            mimeType,
            buffer: arrayBuffer,
          } satisfies OcrImageRequest,
          [arrayBuffer],
        )
      })
    },
  }
}

parentPort?.on('message', (message: ParseFileWorkerRequest | OcrResponse) => {
  if ('type' in message && message.type === 'ocr-response') {
    ocrPending.get(message.requestId)?.(message.text)
    ocrPending.delete(message.requestId)
    return
  }

  if (!('type' in message) || message.type !== 'parse') {
    return
  }

  void (async () => {
    try {
      const contentHash = await hashFileStream(message.filePath)
      const parsed = await parseFile(message.filePath, {
        enhanced: message.parseOptions?.enhanced,
        pdfTextQuality: message.parseOptions?.pdfTextQuality,
        ocr: createOcrProxy(message.parseOptions),
      })
      const response: ParseFileWorkerResponse = {
        type: 'parse-result',
        ok: true,
        contentHash,
        title: parsed.title,
        plainText: parsed.plainText,
        mimeType: parsed.mimeType,
        kind: parsed.kind,
      }
      parentPort?.postMessage(response)
    } catch (error) {
      const response: ParseFileWorkerResponse = {
        type: 'parse-result',
        ok: false,
        error: toErrorMessage(error, '文件解析失败'),
      }
      parentPort?.postMessage(response)
    }
  })()
})
