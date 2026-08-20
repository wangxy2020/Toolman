export const WORKSPACE_EVENT_PAGE_SIZE = 200

/** Walk seq-ascending pages until a short page or a stuck cursor. */
export function collectPagesBySeq<T extends { seq: number }>(
  readPage: (sinceSeq: number, limit: number) => T[],
  pageSize = WORKSPACE_EVENT_PAGE_SIZE,
): T[] {
  const out: T[] = []
  let sinceSeq = 0
  while (true) {
    const batch = readPage(sinceSeq, pageSize)
    if (batch.length === 0) break
    const lastSeq = batch.at(-1)?.seq
    if (lastSeq == null || lastSeq <= sinceSeq) break
    out.push(...batch)
    if (batch.length < pageSize) break
    sinceSeq = lastSeq
  }
  return out
}
