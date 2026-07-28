/** @param {import('app-builder-lib').AfterPackContext} context */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.CSC_NAME || process.env.CSC_LINK) return

  const { execFileSync } = await import('node:child_process')
  const { join } = await import('node:path')

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

  try {
    execFileSync('codesign', ['--verify', appPath], { stdio: 'ignore' })
    return
  } catch {
    // Fall through to adhoc sign the full bundle.
  }

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', appPath], { stdio: 'inherit' })
}
