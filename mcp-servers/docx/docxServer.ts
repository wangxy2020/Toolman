#!/usr/bin/env node
/**
 * Toolman bundled DOCX MCP server.
 *
 * Word editing tools come from @knorq/docx-mcp-server (OpenXML engine).
 * Legacy .doc / .wps conversion is handled upstream by Toolman desktop via
 * toolman-docx-core (office_oxide + LibreOffice) before MCP receives .docx paths.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function resolveKnorqEntry(): string {
  try {
    return require.resolve('@knorq/docx-mcp-server/dist/index.js')
  } catch {
    return join(currentDir, '..', 'node_modules', '@knorq', 'docx-mcp-server', 'dist', 'index.js')
  }
}

const entry = resolveKnorqEntry()
await import(pathToFileURL(entry).href)
