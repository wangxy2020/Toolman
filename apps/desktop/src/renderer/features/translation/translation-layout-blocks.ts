/**
 * Layout-preserving dual pane (P4).
 *
 * When parsers emit per-block geometry (normalized 0–1 page coords), the right
 * pane can absolute-position translated text over the page box. Documents
 * without geometry keep the P2/P3 reading layout.
 */

export type TranslationLayoutBlockKind = 'title' | 'paragraph' | 'table' | 'field' | 'other'

export interface TranslationLayoutBBox {
  /** Left edge as fraction of page width (0–1). */
  x: number
  /** Top edge as fraction of page height (0–1). */
  y: number
  /** Width as fraction of page width (0–1). */
  w: number
  /** Height as fraction of page height (0–1). */
  h: number
}

export interface TranslationLayoutBlock {
  id: string
  kind: TranslationLayoutBlockKind
  bbox: TranslationLayoutBBox
  sourceText: string
  translatedText?: string
}

export function hasUsableLayoutBlocks(
  blocks: TranslationLayoutBlock[] | null | undefined,
): blocks is TranslationLayoutBlock[] {
  return Array.isArray(blocks) && blocks.length > 0 && blocks.every(isValidLayoutBlock)
}

function isValidLayoutBlock(block: TranslationLayoutBlock): boolean {
  if (!block || typeof block !== 'object') return false
  const { bbox } = block
  if (!bbox) return false
  const values = [bbox.x, bbox.y, bbox.w, bbox.h]
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) return false
  if (bbox.w <= 0 || bbox.h <= 0) return false
  if (bbox.x < 0 || bbox.y < 0 || bbox.x + bbox.w > 1.05 || bbox.y + bbox.h > 1.05) return false
  return Boolean((block.sourceText ?? '').trim() || (block.translatedText ?? '').trim())
}

/** Normalize optional snapshot geometry; drop invalid entries. */
export function normalizeLayoutBlocks(raw: unknown): TranslationLayoutBlock[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const blocks: TranslationLayoutBlock[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Partial<TranslationLayoutBlock> & {
      bbox?: Partial<TranslationLayoutBBox>
    }
    const bbox = record.bbox
    if (!bbox) continue
    const block: TranslationLayoutBlock = {
      id: typeof record.id === 'string' && record.id ? record.id : `block-${blocks.length + 1}`,
      kind:
        record.kind === 'title' ||
        record.kind === 'paragraph' ||
        record.kind === 'table' ||
        record.kind === 'field' ||
        record.kind === 'other'
          ? record.kind
          : 'other',
      bbox: {
        x: Number(bbox.x),
        y: Number(bbox.y),
        w: Number(bbox.w),
        h: Number(bbox.h),
      },
      sourceText: typeof record.sourceText === 'string' ? record.sourceText : '',
      ...(typeof record.translatedText === 'string'
        ? { translatedText: record.translatedText }
        : {}),
    }
    if (isValidLayoutBlock(block)) blocks.push(block)
  }
  return blocks.length > 0 ? blocks : undefined
}
