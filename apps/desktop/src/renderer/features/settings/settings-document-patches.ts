import type {
  OdlHancomAiOcrStrategy,
  OdlHybridBackend,
  OdlHybridMode,
  OdlHybridSettings,
  PdfParserBackend,
} from '@toolman/shared'
import type { AppSettings } from './app-settings'

export function parsePdfParserBackend(value: string): PdfParserBackend {
  return value === 'opendataloader' ? 'opendataloader' : 'builtin'
}

export function parseOdlHybridBackend(value: string): OdlHybridBackend {
  return value === 'docling-fast' ? 'docling-fast' : 'hancom-ai'
}

export function parseOdlHybridMode(value: string): OdlHybridMode {
  return value === 'full' ? 'full' : 'auto'
}

export function parseHancomOcrStrategy(value: string): OdlHancomAiOcrStrategy {
  return value === 'off' || value === 'force' ? value : 'auto'
}

export function parseMemoryRetentionDays(value: string): number {
  return Number(value) || 30
}

export function patchOdlHybridEnabled(
  odlHybrid: OdlHybridSettings,
  enabled: boolean,
): Partial<AppSettings> {
  return {
    odlHybrid: { ...odlHybrid, enabled },
    ...(enabled ? { pdfParserBackend: 'opendataloader' as const } : {}),
  }
}
