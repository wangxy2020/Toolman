import QRCode from 'qrcode'

interface StyledInviteQrOptions {
  /** CSS display size; canvas renders at size × renderScale for sharpness */
  size?: number
  renderScale?: number
  marginModules?: number
  /** Data module edge length as a fraction of cell size (0–1) */
  moduleScale?: number
  darkColor?: string
  lightColor?: string
  centerLabel?: string
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function isInFinderPattern(row: number, col: number, matrixSize: number): boolean {
  if (row < 7 && col < 7) return true
  if (row < 7 && col >= matrixSize - 7) return true
  if (row >= matrixSize - 7 && col < 7) return true
  return false
}

function drawFinderPattern(
  ctx: CanvasRenderingContext2D,
  startRow: number,
  startCol: number,
  margin: number,
  cellSize: number,
  darkColor: string,
  lightColor: string,
) {
  const x = margin + startCol * cellSize
  const y = margin + startRow * cellSize
  const outerSize = cellSize * 7
  const innerOffset = cellSize * 2
  const innerSize = cellSize * 3
  const outerRadius = cellSize * 1.2
  const innerRadius = cellSize * 0.75

  ctx.fillStyle = darkColor
  roundRect(ctx, x, y, outerSize, outerSize, outerRadius)
  ctx.fill()

  ctx.fillStyle = lightColor
  roundRect(
    ctx,
    x + cellSize,
    y + cellSize,
    outerSize - cellSize * 2,
    outerSize - cellSize * 2,
    outerRadius * 0.7,
  )
  ctx.fill()

  ctx.fillStyle = darkColor
  roundRect(ctx, x + innerOffset, y + innerOffset, innerSize, innerSize, innerRadius)
  ctx.fill()
}

function drawCenterBadge(
  ctx: CanvasRenderingContext2D,
  size: number,
  darkColor: string,
  lightColor: string,
  label: string,
) {
  const badgeSize = size * 0.17
  const center = size / 2
  const pad = badgeSize * 0.24

  ctx.fillStyle = lightColor
  roundRect(
    ctx,
    center - badgeSize / 2 - pad,
    center - badgeSize / 2 - pad,
    badgeSize + pad * 2,
    badgeSize + pad * 2,
    badgeSize * 0.3,
  )
  ctx.fill()

  ctx.fillStyle = darkColor
  roundRect(ctx, center - badgeSize / 2, center - badgeSize / 2, badgeSize, badgeSize, badgeSize * 0.26)
  ctx.fill()

  ctx.fillStyle = lightColor
  ctx.font = `600 ${Math.round(badgeSize * 0.52)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, center, center + 1)
}

export async function createStyledInviteQrDataUrl(
  text: string,
  options: StyledInviteQrOptions = {},
): Promise<string> {
  const displaySize = options.size ?? 220
  const renderScale = options.renderScale ?? 3
  const size = Math.round(displaySize * renderScale)
  const marginModules = options.marginModules ?? 4
  const moduleScale = options.moduleScale ?? 0.74
  const darkColor = options.darkColor ?? '#00a962'
  const lightColor = options.lightColor ?? '#ffffff'
  const centerLabel = options.centerLabel ?? '群'

  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' })
  const matrixSize = qr.modules.size
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法创建二维码画布')
  }

  const totalModules = matrixSize + marginModules * 2
  const cellSize = size / totalModules
  const margin = marginModules * cellSize
  const moduleInset = (cellSize * (1 - moduleScale)) / 2
  const moduleRadius = cellSize * 0.24

  ctx.fillStyle = lightColor
  ctx.fillRect(0, 0, size, size)

  drawFinderPattern(ctx, 0, 0, margin, cellSize, darkColor, lightColor)
  drawFinderPattern(ctx, 0, matrixSize - 7, margin, cellSize, darkColor, lightColor)
  drawFinderPattern(ctx, matrixSize - 7, 0, margin, cellSize, darkColor, lightColor)

  ctx.fillStyle = darkColor
  for (let row = 0; row < matrixSize; row += 1) {
    for (let col = 0; col < matrixSize; col += 1) {
      if (isInFinderPattern(row, col, matrixSize)) continue
      if (!qr.modules.get(row, col)) continue

      const x = margin + col * cellSize + moduleInset
      const y = margin + row * cellSize + moduleInset
      const moduleSize = cellSize * moduleScale
      roundRect(ctx, x, y, moduleSize, moduleSize, moduleRadius)
      ctx.fill()
    }
  }

  drawCenterBadge(ctx, size, darkColor, lightColor, centerLabel)

  return canvas.toDataURL('image/png')
}
