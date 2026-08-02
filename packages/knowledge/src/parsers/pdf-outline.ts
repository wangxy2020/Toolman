import { existsSync } from 'node:fs'
import { flattenPdfOutline, type CourseOutlineEntry, type PdfOutlineNode } from '../outline/extract-course-outline.js'
import { getCachedPdfDocument } from './render-pdf-pages.js'

export async function extractPdfOutlineEntries(filePath: string): Promise<CourseOutlineEntry[]> {
  if (!filePath || !existsSync(filePath)) return []
  try {
    const document = await getCachedPdfDocument(filePath)
    const outline = (await document.getOutline()) as PdfOutlineNode[] | null
    return flattenPdfOutline(outline)
  } catch {
    return []
  }
}
