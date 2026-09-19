import { describe, expect, it } from 'vitest'
import { withPdfjsDocumentLock } from './render-pdf-pages.js'

describe('withPdfjsDocumentLock', () => {
  it('runs tasks for the same file one at a time', async () => {
    const seen: number[] = []
    await Promise.all([
      withPdfjsDocumentLock('/tmp/same.pdf', async () => {
        seen.push(1)
        await new Promise((resolve) => setTimeout(resolve, 20))
        seen.push(2)
      }),
      withPdfjsDocumentLock('/tmp/same.pdf', async () => {
        seen.push(3)
      }),
    ])
    expect(seen).toEqual([1, 2, 3])
  })

  it('does not serialize tasks for different files', async () => {
    let releaseA!: () => void
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const taskA = withPdfjsDocumentLock('/tmp/a.pdf', () => gateA)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('different-file task stayed blocked')), 500)
      void withPdfjsDocumentLock('/tmp/b.pdf', async () => {
        clearTimeout(timer)
        resolve()
      })
    })
    releaseA()
    await taskA
  })
})
