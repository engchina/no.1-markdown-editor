import { clampScreenshotRect, type ScreenshotRect } from '../../lib/screenshot.ts'

export type ScreenshotTool = 'select' | 'crop' | 'arrow' | 'rectangle' | 'text' | 'mosaic'
export type ScreenshotCropHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export function screenshotToolForKey(key: string): ScreenshotTool | null {
  const tools: Record<string, ScreenshotTool> = {
    c: 'crop',
    a: 'arrow',
    r: 'rectangle',
    t: 'text',
    m: 'mosaic',
    v: 'select',
  }
  return tools[key.toLowerCase()] ?? null
}

interface AnnotationBase {
  id: string
  color: string
  size: number
}

export interface ArrowAnnotation extends AnnotationBase {
  type: 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface RectangleAnnotation extends AnnotationBase {
  type: 'rectangle'
  rect: ScreenshotRect
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text'
  x: number
  y: number
  text: string
}

export interface MosaicAnnotation extends AnnotationBase {
  type: 'mosaic'
  rect: ScreenshotRect
}

export type ScreenshotAnnotation =
  | ArrowAnnotation
  | RectangleAnnotation
  | TextAnnotation
  | MosaicAnnotation

export interface ScreenshotEditSnapshot {
  crop: ScreenshotRect
  annotations: ScreenshotAnnotation[]
}

export function createScreenshotEditSnapshot(width: number, height: number, crop?: ScreenshotRect): ScreenshotEditSnapshot {
  return {
    crop: clampScreenshotRect(crop ?? { x: 0, y: 0, width, height }, width, height),
    annotations: [],
  }
}

export function moveScreenshotCrop(
  crop: ScreenshotRect,
  dx: number,
  dy: number,
  width: number,
  height: number
): ScreenshotRect {
  return {
    ...crop,
    x: Math.max(0, Math.min(Math.round(crop.x + dx), Math.max(0, width - crop.width))),
    y: Math.max(0, Math.min(Math.round(crop.y + dy), Math.max(0, height - crop.height))),
  }
}

export function resizeScreenshotCrop(
  crop: ScreenshotRect,
  handle: ScreenshotCropHandle,
  point: { x: number; y: number },
  width: number,
  height: number
): ScreenshotRect {
  let left = crop.x
  let top = crop.y
  let right = crop.x + crop.width
  let bottom = crop.y + crop.height
  if (handle.includes('w')) left = Math.max(0, Math.min(Math.round(point.x), right - 1))
  if (handle.includes('e')) right = Math.min(width, Math.max(Math.round(point.x), left + 1))
  if (handle.includes('n')) top = Math.max(0, Math.min(Math.round(point.y), bottom - 1))
  if (handle.includes('s')) bottom = Math.min(height, Math.max(Math.round(point.y), top + 1))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function annotationBounds(annotation: ScreenshotAnnotation): ScreenshotRect {
  switch (annotation.type) {
    case 'arrow':
      return {
        x: Math.min(annotation.x1, annotation.x2),
        y: Math.min(annotation.y1, annotation.y2),
        width: Math.max(1, Math.abs(annotation.x2 - annotation.x1)),
        height: Math.max(1, Math.abs(annotation.y2 - annotation.y1)),
      }
    case 'rectangle':
    case 'mosaic':
      return annotation.rect
    case 'text':
      return {
        x: annotation.x,
        y: annotation.y - annotation.size,
        width: Math.max(annotation.size, annotation.text.length * annotation.size * 0.62),
        height: annotation.size * 1.3,
      }
  }
}

export function moveAnnotation(
  annotation: ScreenshotAnnotation,
  dx: number,
  dy: number,
  width: number,
  height: number
): ScreenshotAnnotation {
  const bounds = annotationBounds(annotation)
  const safeDx = Math.max(-bounds.x, Math.min(dx, width - bounds.x - bounds.width))
  const safeDy = Math.max(-bounds.y, Math.min(dy, height - bounds.y - bounds.height))

  switch (annotation.type) {
    case 'arrow':
      return {
        ...annotation,
        x1: annotation.x1 + safeDx,
        y1: annotation.y1 + safeDy,
        x2: annotation.x2 + safeDx,
        y2: annotation.y2 + safeDy,
      }
    case 'rectangle':
    case 'mosaic':
      return { ...annotation, rect: { ...annotation.rect, x: annotation.rect.x + safeDx, y: annotation.rect.y + safeDy } }
    case 'text':
      return { ...annotation, x: annotation.x + safeDx, y: annotation.y + safeDy }
  }
}

export function resizeAnnotation(
  annotation: ScreenshotAnnotation,
  dx: number,
  dy: number,
  width: number,
  height: number
): ScreenshotAnnotation {
  switch (annotation.type) {
    case 'arrow':
      return {
        ...annotation,
        x2: Math.max(0, Math.min(width, annotation.x2 + dx)),
        y2: Math.max(0, Math.min(height, annotation.y2 + dy)),
      }
    case 'rectangle':
    case 'mosaic':
      return {
        ...annotation,
        rect: clampScreenshotRect(
          {
            ...annotation.rect,
            width: Math.max(1, annotation.rect.width + dx),
            height: Math.max(1, annotation.rect.height + dy),
          },
          width,
          height
        ),
      }
    case 'text':
      return { ...annotation, size: Math.max(10, Math.min(96, annotation.size + (dx + dy) / 4)) }
  }
}

export function updateAnnotation(
  snapshot: ScreenshotEditSnapshot,
  annotation: ScreenshotAnnotation
): ScreenshotEditSnapshot {
  return {
    ...snapshot,
    annotations: snapshot.annotations.map((item) => item.id === annotation.id ? annotation : item),
  }
}

export function removeAnnotation(snapshot: ScreenshotEditSnapshot, id: string): ScreenshotEditSnapshot {
  return { ...snapshot, annotations: snapshot.annotations.filter((annotation) => annotation.id !== id) }
}

function drawArrow(context: CanvasRenderingContext2D, annotation: ArrowAnnotation, offsetX: number, offsetY: number): void {
  const x1 = annotation.x1 - offsetX
  const y1 = annotation.y1 - offsetY
  const x2 = annotation.x2 - offsetX
  const y2 = annotation.y2 - offsetY
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = Math.max(10, annotation.size * 4)

  context.strokeStyle = annotation.color
  context.fillStyle = annotation.color
  context.lineWidth = annotation.size
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(x1, y1)
  context.lineTo(x2, y2)
  context.stroke()
  context.beginPath()
  context.moveTo(x2, y2)
  context.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
  context.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
  context.closePath()
  context.fill()
}

function drawMosaic(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  annotation: MosaicAnnotation,
  crop: ScreenshotRect
): void {
  const rect = annotation.rect
  const blockSize = Math.max(4, Math.round(annotation.size * 2))
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.ceil(rect.width / blockSize))
  small.height = Math.max(1, Math.ceil(rect.height / blockSize))
  const smallContext = small.getContext('2d')
  if (!smallContext) return
  smallContext.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, small.width, small.height)
  context.save()
  context.imageSmoothingEnabled = false
  context.drawImage(small, 0, 0, small.width, small.height, rect.x - crop.x, rect.y - crop.y, rect.width, rect.height)
  context.restore()
}

export function drawScreenshotRasterPreview(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  snapshot: ScreenshotEditSnapshot
): void {
  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const fullImage = { x: 0, y: 0, width, height }
  for (const annotation of snapshot.annotations) {
    if (annotation.type === 'mosaic') {
      drawMosaic(context, image, annotation, fullImage)
      continue
    }
    if (annotation.type === 'arrow') {
      drawArrow(context, annotation, 0, 0)
      continue
    }
    if (annotation.type === 'rectangle') {
      context.strokeStyle = annotation.color
      context.lineWidth = annotation.size
      context.lineJoin = 'round'
      context.strokeRect(annotation.rect.x, annotation.rect.y, annotation.rect.width, annotation.rect.height)
      continue
    }
    context.fillStyle = annotation.color
    context.font = `${annotation.size}px ui-sans-serif, system-ui, sans-serif`
    context.textBaseline = 'alphabetic'
    context.fillText(annotation.text, annotation.x, annotation.y)
  }
}

export async function renderScreenshotPng(
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  snapshot: ScreenshotEditSnapshot
): Promise<Blob> {
  const crop = clampScreenshotRect(snapshot.crop, imageWidth, imageHeight)
  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')

  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)

  for (const annotation of snapshot.annotations) {
    if (annotation.type === 'mosaic') {
      drawMosaic(context, image, annotation, crop)
      continue
    }
    if (annotation.type === 'arrow') {
      drawArrow(context, annotation, crop.x, crop.y)
      continue
    }
    if (annotation.type === 'rectangle') {
      context.strokeStyle = annotation.color
      context.lineWidth = annotation.size
      context.lineJoin = 'round'
      context.strokeRect(
        annotation.rect.x - crop.x,
        annotation.rect.y - crop.y,
        annotation.rect.width,
        annotation.rect.height
      )
      continue
    }
    context.fillStyle = annotation.color
    context.font = `${annotation.size}px ui-sans-serif, system-ui, sans-serif`
    context.textBaseline = 'alphabetic'
    context.fillText(annotation.text, annotation.x - crop.x, annotation.y - crop.y)
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png')
  })
}
