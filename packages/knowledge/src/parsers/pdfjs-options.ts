export function createPdfjsLoadingOptions(buffer: Buffer) {
  return {
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    password: '',
    isEvalSupported: false,
    stopAtErrors: false,
  }
}

export async function loadPdfjsDocument(buffer: Buffer, timeoutMs = 120_000) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument(createPdfjsLoadingOptions(buffer))

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const documentPromise = loadingTask.promise

  try {
    return await Promise.race([
      documentPromise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          void loadingTask.destroy()
          reject(new Error('PDF 加载超时，可能是加密文件或文件损坏'))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
