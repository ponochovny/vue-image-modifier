export type ImageCrop = {
  x: number
  y: number
  width: number
  height: number
}

export type DisplayRect = {
  x: number
  y: number
  width: number
  height: number
}

export type ImageOperations = {
  brightness: number
  contrast: number
  saturation: number
  grayscale: number
  sepia: number
  blur: number
  hueRotate: number
  opacity: number
  rotate: number
  scaleX: number
  scaleY: number
  crop: ImageCrop | null
}

export const defaultOperations = (): ImageOperations => ({
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  blur: 0,
  hueRotate: 0,
  opacity: 100,
  rotate: 0,
  scaleX: 1,
  scaleY: 1,
  crop: null,
})

export const cloneOperations = (operations: ImageOperations): ImageOperations => ({
  ...operations,
  crop: operations.crop ? { ...operations.crop } : null,
})

export const buildFilterString = (operations: ImageOperations): string => {
  const parts = [
    `brightness(${operations.brightness}%)`,
    `contrast(${operations.contrast}%)`,
    `saturate(${operations.saturation}%)`,
    `grayscale(${operations.grayscale}%)`,
    `sepia(${operations.sepia}%)`,
    `blur(${operations.blur}px)`,
    `hue-rotate(${operations.hueRotate}deg)`,
    `opacity(${operations.opacity}%)`,
  ]

  return parts.join(' ')
}

export const getImageDisplayRect = (
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): DisplayRect => {
  const containerAspect = containerWidth / containerHeight
  const imageAspect = naturalWidth / naturalHeight

  if (imageAspect > containerAspect) {
    const height = containerHeight
    const width = height * imageAspect

    return {
      x: (containerWidth - width) / 2,
      y: 0,
      width,
      height,
    }
  }

  const width = containerWidth
  const height = width / imageAspect

  return {
    x: 0,
    y: (containerHeight - height) / 2,
    width,
    height,
  }
}

export const clipSelectionToDisplayRect = (
  selection: { x: number; y: number; width: number; height: number },
  displayRect: DisplayRect,
) => {
  const clippedX = Math.max(selection.x, displayRect.x)
  const clippedY = Math.max(selection.y, displayRect.y)
  const clippedRight = Math.min(selection.x + selection.width, displayRect.x + displayRect.width)
  const clippedBottom = Math.min(selection.y + selection.height, displayRect.y + displayRect.height)

  return {
    x: clippedX,
    y: clippedY,
    width: Math.max(1, clippedRight - clippedX),
    height: Math.max(1, clippedBottom - clippedY),
  }
}

export const mapSelectionToImageCoordinates = (
  selection: { x: number; y: number; width: number; height: number },
  displayRect: DisplayRect,
  naturalWidth: number,
  naturalHeight: number,
): ImageCrop => {
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  const left = clamp((selection.x - displayRect.x) / displayRect.width)
  const top = clamp((selection.y - displayRect.y) / displayRect.height)
  const right = clamp((selection.x + selection.width - displayRect.x) / displayRect.width)
  const bottom = clamp((selection.y + selection.height - displayRect.y) / displayRect.height)

  return {
    x: Math.round(left * naturalWidth),
    y: Math.round(top * naturalHeight),
    width: Math.max(1, Math.round((right - left) * naturalWidth)),
    height: Math.max(1, Math.round((bottom - top) * naturalHeight)),
  }
}

export const serializeOperations = (operations: ImageOperations, originalName: string) => ({
  version: 3,
  originalName,
  operations: {
    brightness: operations.brightness,
    contrast: operations.contrast,
    saturation: operations.saturation,
    grayscale: operations.grayscale,
    sepia: operations.sepia,
    blur: operations.blur,
    hueRotate: operations.hueRotate,
    opacity: operations.opacity,
    rotate: operations.rotate,
    scaleX: operations.scaleX,
    scaleY: operations.scaleY,
    crop: operations.crop,
  },
})

export const deserializeOperations = (value: unknown): ImageOperations | null => {
  if (!value || typeof value !== 'object' || !('operations' in value)) {
    return null
  }

  const parsed = (value as { operations?: unknown }).operations
  if (!parsed || typeof parsed !== 'object') {
    return null
  }

  const defaults = defaultOperations()
  return {
    ...defaults,
    ...parsed,
  } as ImageOperations
}

export const filterPresets: Record<string, Partial<ImageOperations>> = {
  default: {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
    sepia: 0,
    blur: 0,
    hueRotate: 0,
    opacity: 100,
  },
  vintage: {
    brightness: 110,
    contrast: 120,
    saturation: 120,
    grayscale: 0,
    sepia: 30,
    blur: 0.5,
    hueRotate: 10,
    opacity: 100,
  },
  bw: {
    brightness: 100,
    contrast: 130,
    saturation: 0,
    grayscale: 100,
    sepia: 0,
    blur: 0,
    hueRotate: 0,
    opacity: 100,
  },
  warm: {
    brightness: 115,
    contrast: 105,
    saturation: 120,
    grayscale: 0,
    sepia: 12,
    blur: 0,
    hueRotate: 15,
    opacity: 100,
  },
}

export const getExportMimeType = (format: 'png' | 'jpeg' | 'webp') => {
  switch (format) {
    case 'jpeg':
      return { mimeType: 'image/jpeg', extension: 'jpg' }
    case 'webp':
      return { mimeType: 'image/webp', extension: 'webp' }
    default:
      return { mimeType: 'image/png', extension: 'png' }
  }
}
