/**
 * 离线生成 EPC Commercial license.key（需先 pnpm epc:build）
 * 用法: pnpm tsx scripts/epc-generate-license.ts --machine MACHINE-xxx --days 365
 */
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const machineIdx = args.indexOf('--machine')
const daysIdx = args.indexOf('--days')

const machineId = machineIdx >= 0 ? args[machineIdx + 1] : undefined
const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 365

if (!machineId) {
  console.error('Usage: pnpm tsx scripts/epc-generate-license.ts --machine MACHINE-xxx [--days 365]')
  process.exit(1)
}

const expiresAt = Math.floor(Date.now() / 1000) + days * 86400
const cli = path.join(process.cwd(), 'packages/epc-commercial-engine/target/release/epc-commercial-cli')

// 通过临时 Rust 测试二进制签名 — 简化：直接写 JSON 结构，生产应使用 sign_license_payload
// 此处调用内置 sign 需额外 bin；开发请使用 EPC_COMMERCIAL_DEV_SKIP_LICENSE=1
const licensePath = path.join(process.cwd(), 'license.key.example')
const payload = { machineId, expiresAt }
fs.writeFileSync(
  licensePath,
  JSON.stringify(
    {
      note: '请使用 license::sign_license_payload 生成正式 license.key',
      payload
    },
    null,
    2
  )
)
console.log(`Wrote template to ${licensePath}`)
console.log('Dev: export EPC_COMMERCIAL_DEV_SKIP_LICENSE=1')
if (!fs.existsSync(cli)) {
  console.log('Build engine first: pnpm epc:build')
}
