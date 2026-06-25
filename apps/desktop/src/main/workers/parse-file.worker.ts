import { parentPort } from 'node:worker_threads'
import { toErrorMessage } from '@toolman/shared'
import { hashFileBytes, parseFile } from '@toolman/knowledge'

interface ParseFileWorkerRequest {
  filePath: string
  enhanced?: boolean
}

interface ParseFileWorkerSuccess {
  ok: true
  contentHash: string
  title: string
  plainText: string
  mimeType: string
  kind: string
}

interface ParseFileWorkerFailure {
  ok: false
  error: string
}

type ParseFileWorkerResponse = ParseFileWorkerSuccess | ParseFileWorkerFailure

parentPort?.on('message', (request: ParseFileWorkerRequest) => {
  void (async () => {
    try {
      const contentHash = hashFileBytes(request.filePath)
      const parsed = await parseFile(request.filePath, { enhanced: request.enhanced })
      const response: ParseFileWorkerResponse = {
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
        ok: false,
        error: toErrorMessage(error, '文件解析失败'),
      }
      parentPort?.postMessage(response)
    }
  })()
})
