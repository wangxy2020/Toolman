import { z } from 'zod'

export const PdfParserBackendSchema = z.enum(['builtin', 'opendataloader'])
export type PdfParserBackend = z.infer<typeof PdfParserBackendSchema>

export const DocumentParseProfileSchema = z.enum([
  'knowledge',
  'chat',
  'translation',
  'metadata',
])
export type DocumentParseProfile = z.infer<typeof DocumentParseProfileSchema>
