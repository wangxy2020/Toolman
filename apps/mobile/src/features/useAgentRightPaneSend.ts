import { newUuid } from '../p2p/bytes'
import { unlockAudioPlayback } from '../voice'
import type { AgentChatScope } from '../chat/agentScopes'
import type { ChatMessage, ChatSession } from '../state/MobileAppContext'
import { newAgentId } from './agentPaneUtils'

export async function sendAgentRightPaneMessage(input: {
  text: string
  busy: boolean
  agentScope?: AgentChatScope
  ensureSession: () => ChatSession | null
  upsertSession: (session: ChatSession) => void
  setInput: (value: string) => void
  setBusy: (busy: boolean) => void
  setError: (message: string | null) => void
  clearInput: boolean
  runGroupAgentRelay: (
    base: ChatSession,
    userText: string,
    assistantMsg: ChatMessage,
    userMsg: ChatMessage,
  ) => Promise<void>
  runCompletion: (
    base: ChatSession,
    historyForApi: Array<{ role: ChatMessage['role']; content: string }>,
    userText: string,
    assistantMsg: ChatMessage,
  ) => Promise<void>
}) {
  const {
    text,
    busy,
    agentScope,
    ensureSession,
    upsertSession,
    setInput,
    setBusy,
    setError,
    clearInput,
    runGroupAgentRelay,
    runCompletion,
  } = input
  if (!text || busy) return
  unlockAudioPlayback()
  const base = ensureSession()
  if (!base) {
    setError(
      agentScope === 'classroom'
        ? '请先在侧栏选择一门课程'
        : '请先在侧栏新建智能体或话题',
    )
    return
  }
  if (base.groupAgent?.permission === 'read') {
    setError('该话题为仅阅读，无法调用')
    return
  }
  if (clearInput) setInput('')
  setError(null)
  setBusy(true)

  const useRelayIds = Boolean(base.groupAgent)
  const userMsg: ChatMessage = {
    id: useRelayIds ? newUuid() : newAgentId('msg'),
    role: 'user',
    content: text,
    createdAt: Date.now(),
  }
  const assistantMsg: ChatMessage = {
    id: useRelayIds ? newUuid() : newAgentId('msg'),
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
  }
  const next: ChatSession = {
    ...base,
    title: base.groupAgent || base.messages.length > 0 ? base.title : text.slice(0, 24),
    updatedAt: Date.now(),
    messages: [...base.messages, userMsg, assistantMsg],
  }
  upsertSession(next)

  if (base.groupAgent) {
    await runGroupAgentRelay(next, text, assistantMsg, userMsg)
    return
  }

  await runCompletion(
    next,
    [
      ...base.messages.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: text },
    ],
    text,
    assistantMsg,
  )
}
