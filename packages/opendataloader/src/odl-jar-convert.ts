import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildArgs, type ConvertOptions } from '@opendataloader/pdf'

const JAR_NAME = 'opendataloader-pdf-cli.jar'

function resolveJarPath(): string {
  // Resolve via package entry (package.json is not in "exports").
  const entryPath = fileURLToPath(import.meta.resolve('@opendataloader/pdf'))
  const jarPath = join(dirname(entryPath), '..', 'lib', JAR_NAME)
  if (!existsSync(jarPath)) {
    throw new Error(`OpenDataLoader JAR not found at ${jarPath}`)
  }
  return jarPath
}

/** Run opendataloader-pdf CLI with optional extra flags not yet in ConvertOptions typings. */
export function runOpenDataLoaderConvert(
  inputPath: string,
  options: ConvertOptions,
  extraCliArgs: string[] = [],
): Promise<void> {
  const jarPath = resolveJarPath()
  const args = ['-jar', jarPath, inputPath, ...buildArgs(options), ...extraCliArgs]

  return new Promise((resolve, reject) => {
    const javaProcess = spawn('java', args)
    let stdout = ''
    let stderr = ''

    javaProcess.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString()
      if (!options.quiet) process.stdout.write(chunk)
      stdout += chunk
    })
    javaProcess.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString()
      if (!options.quiet) process.stderr.write(chunk)
      stderr += chunk
    })
    javaProcess.on('error', (error) => {
      if (error.message.includes('ENOENT')) {
        reject(new Error("'java' command not found. Please install Java 11+."))
        return
      }
      reject(error)
    })
    javaProcess.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `The opendataloader-pdf CLI exited with code ${code}.\n\n${stderr || stdout}`,
        ),
      )
    })
  })
}
