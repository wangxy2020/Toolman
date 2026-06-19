import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unlinkSync, existsSync } from 'node:fs'
import {
  createDatabase,
  runMigrations,
  getMigrationsPath,
  seedDefaultData,
  createSessionRepository,
  createMessageRepository,
} from '../src/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = join(__dirname, '../.demo-toolman.db')

function main() {
  if (existsSync(dbPath)) unlinkSync(dbPath)

  const db = createDatabase(dbPath)
  const migrationsPath = getMigrationsPath(join(__dirname, '..'))
  runMigrations(db, migrationsPath)
  seedDefaultData(db)

  const workspaceId = '00000000-0000-0000-0000-000000000002'
  const modelId = '00000000-0000-0000-0000-000000000004:gpt-4o-mini'

  const sessions = createSessionRepository(db)
  const messages = createMessageRepository(db)

  console.log('=== Session / Message 持久化 Demo ===\n')

  const session = sessions.create({
    workspaceId,
    title: 'Demo 会话',
    modelId,
  })
  console.log('CREATE Session:', session)

  messages.create({
    sessionId: session.id,
    role: 'user',
    content: '你好，Toolman！',
  })
  const reply = messages.create({
    sessionId: session.id,
    role: 'assistant',
    content: '你好！我是 Toolman 助手。',
    modelId,
  })
  console.log('\nCREATE Messages:')
  console.log('  user:', messages.list({ sessionId: session.id })[0])
  console.log('  assistant:', reply)

  const updated = sessions.update(session.id, { title: 'Demo 会话（已更新）' })
  console.log('\nUPDATE Session:', updated)

  const edited = messages.update(reply.id, { content: '你好！我是 Toolman 助手。（已编辑）' })
  console.log('\nUPDATE Message:', edited)

  console.log('\nLIST Sessions:', sessions.list({ workspaceId }))
  console.log('LIST Messages:', messages.list({ sessionId: session.id }))
  console.log('COUNT Messages:', messages.countBySession(session.id))

  messages.delete(reply.id)
  console.log('\nDELETE Message:', reply.id)
  console.log('LIST Messages after delete:', messages.list({ sessionId: session.id }))

  sessions.delete(session.id)
  console.log('\nDELETE Session (soft):', session.id)
  console.log('LIST Sessions (default):', sessions.list({ workspaceId }))
  console.log('LIST Sessions (includeDeleted):', sessions.list({ workspaceId, includeDeleted: true }))

  console.log('\n✅ Demo 完成，数据库文件:', dbPath)
}

main()
