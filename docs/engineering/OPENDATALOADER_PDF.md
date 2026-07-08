# OpenDataLoader PDF integration

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Apps (desktop): knowledge ingest, translation, chat        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  apps/desktop/.../document-parser.service.ts                  │
│  Routing, ODL preview cache, vision OCR fallback              │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  packages/opendataloader (@toolman/opendataloader)            │
│  Profiles, page markers, Java heap, output parsing            │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  @opendataloader/pdf (npm or vendored source)                 │
│  Node wrapper → spawns Java with opendataloader-pdf-cli.jar   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Local JVM only — no network, no hybrid server                │
└─────────────────────────────────────────────────────────────┘
```

## Source vs npm

| Mode | How | When |
|------|-----|------|
| **npm (default)** | `@opendataloader/pdf` from registry; JAR in `node_modules/.../lib/` | `pnpm install` without vendor |
| **vendored source** | Clone [donatomm/open-data-loader-pdf](https://github.com/donatomm/open-data-loader-pdf) → `vendor/open-data-loader-pdf` | `pnpm vendor:odl` then `pnpm install` |

The donatomm repo is a fork of `opendataloader-project/opendataloader-pdf` with Java sources under `java/`, Node SDK under `node/opendataloader-pdf/`.

## Vendoring steps

```bash
pnpm vendor:odl    # clone + build Java JAR + Node wrapper
pnpm install       # link file: dependency
pnpm build
```

`packages/opendataloader/package.json` uses:

```json
"@opendataloader/pdf": "file:../../vendor/open-data-loader-pdf/node/opendataloader-pdf"
```

If `vendor/` is empty, run `pnpm vendor:odl` before install.

## Local-first document pipeline

1. **PDF 解析 = OpenDataLoader** — local Java extraction (text layer, tables, reading order).
2. **ODL Hybrid OCR** (optional) — Toolman **auto-starts** local `opendataloader-pdf-hybrid` on `localhost` when enabled in settings (first run may install a Python venv under user data).
3. **OCR 识别** — when ODL + Hybrid still insufficient, Toolman uses the workspace **local vision model** (e.g. Ollama glm-ocr).

Hybrid targets a **local** server URL (default `http://localhost:5002`); do not point it at cloud APIs if you require files to stay on-device.

## Settings (文档处理)

| Setting | Purpose |
|---------|---------|
| PDF 解析 → OpenDataLoader | Use ODL as primary PDF engine |
| ODL Hybrid OCR | Retry via local hybrid server when local ODL has no text |
| OCR 识别 | Enable local vision OCR fallback |

## Profiles

| Profile | Used by |
|---------|---------|
| `knowledge` | Knowledge base ingest |
| `translation` | Translation document preview |
| `chat` | Chat PDF attachments |
| `metadata` | Page count (still uses pdf.js) |

Defined in `packages/opendataloader/src/profiles.ts`.
