import {
  KnowledgeHostCreateClassroomKbResponseSchema,
  KnowledgeHostGenerateSyllabusResponseSchema,
  KnowledgeHostListClassroomKbResponseSchema,
  KnowledgeHostListMetaResponseSchema,
  type AgentHostCapability,
  type KnowledgeHostRequest,
  type KnowledgeMetaItem,
} from '@toolman/shared'
import { createReachableMobileSyncClient, getMobileSyncBaseUrl } from '../sync/mobileSync'

async function resolveDesktopHostDeviceId(preferred?: string): Promise<string | null> {
  if (preferred) return preferred
  const client = await createReachableMobileSyncClient()
  const hosts = await client.listHosts()
  return hosts.find((item) => item.agentHost && item.deviceKind === 'desktop')?.deviceId ?? null
}

export async function invokeDesktopAgent(options: {
  hostDeviceId: string
  capability: Exclude<AgentHostCapability, 'knowledge-search'>
  message: string
  onDelta: (text: string) => void
  onError: (message: string) => void
}): Promise<void> {
  const client = await createReachableMobileSyncClient()
  try {
    for await (const chunk of client.invokeHost({
      hostDeviceId: options.hostDeviceId,
      capability: options.capability,
      message: options.message,
      stream: true,
    })) {
      if (chunk.type === 'error') {
        options.onError(chunk.error ?? '桌面宿主调用失败')
        return
      }
      if (chunk.type === 'delta' && chunk.text) options.onDelta(chunk.text)
    }
  } catch (error) {
    options.onError(error instanceof Error ? error.message : String(error))
  }
}

async function invokeKnowledgeHost(
  request: KnowledgeHostRequest,
  hostDeviceId?: string,
): Promise<string> {
  let deviceId: string | null
  try {
    deviceId = await resolveDesktopHostDeviceId(hostDeviceId)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`无法连接桌面 Sync Hub（${getMobileSyncBaseUrl()}）：${detail}`)
  }
  if (!deviceId) {
    throw new Error(
      `未找到在线桌面宿主（当前 Sync：${getMobileSyncBaseUrl()}。请确认桌面已开启移动端同步并重启）`,
    )
  }

  const client = await createReachableMobileSyncClient()
  let text = ''
  for await (const chunk of client.invokeHost({
    hostDeviceId: deviceId,
    capability: 'knowledge-search',
    message: JSON.stringify(request),
    stream: true,
  })) {
    if (chunk.type === 'error') {
      throw new Error(chunk.error ?? '知识检索失败')
    }
    if (chunk.text) text = chunk.text
  }
  if (!text) throw new Error('桌面宿主未返回知识检索结果')
  return text
}

export async function listDesktopKnowledgeMeta(hostDeviceId?: string) {
  const raw = await invokeKnowledgeHost({ op: 'list-meta' }, hostDeviceId)
  return KnowledgeHostListMetaResponseSchema.parse(JSON.parse(raw)).items
}

export async function listDesktopClassroomKnowledgeBases(
  hostDeviceId?: string,
): Promise<KnowledgeMetaItem[]> {
  const raw = await invokeKnowledgeHost({ op: 'list-classroom-kb' }, hostDeviceId)
  return KnowledgeHostListClassroomKbResponseSchema.parse(JSON.parse(raw)).items
}

export async function createDesktopClassroomKnowledgeBase(input: {
  name: string
  description?: string
  hostDeviceId?: string
}): Promise<KnowledgeMetaItem> {
  const raw = await invokeKnowledgeHost(
    {
      op: 'create-classroom-kb',
      name: input.name,
      description: input.description,
    },
    input.hostDeviceId,
  )
  return KnowledgeHostCreateClassroomKbResponseSchema.parse(JSON.parse(raw)).item
}

export async function requestDesktopSyllabusGenerate(input: {
  sessionId: string
  modelId?: string
  hostDeviceId?: string
}): Promise<{ started: boolean; message?: string }> {
  const raw = await invokeKnowledgeHost(
    {
      op: 'generate-syllabus',
      sessionId: input.sessionId,
      modelId: input.modelId,
    },
    input.hostDeviceId,
  )
  const parsed = KnowledgeHostGenerateSyllabusResponseSchema.parse(JSON.parse(raw))
  return { started: parsed.started, message: parsed.message }
}
