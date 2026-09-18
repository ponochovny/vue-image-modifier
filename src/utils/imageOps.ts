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

export type ImageOperation =
  | { type: 'crop'; value: ImageCrop }
  | { type: 'transform'; rotate: number; scaleX: number; scaleY: number }
  | {
      type: 'filter'
      values: Pick<
        ImageOperations,
        | 'brightness'
        | 'contrast'
        | 'saturation'
        | 'grayscale'
        | 'sepia'
        | 'blur'
        | 'hueRotate'
        | 'opacity'
      >
    }

export const getOperationPipeline = (operations: ImageOperations): ImageOperation[] => {
  const pipeline: ImageOperation[] = []

  if (operations.crop) {
    pipeline.push({ type: 'crop', value: { ...operations.crop } })
  }

  pipeline.push({
    type: 'transform',
    rotate: operations.rotate,
    scaleX: operations.scaleX,
    scaleY: operations.scaleY,
  })
  pipeline.push({
    type: 'filter',
    values: {
      brightness: operations.brightness,
      contrast: operations.contrast,
      saturation: operations.saturation,
      grayscale: operations.grayscale,
      sepia: operations.sepia,
      blur: operations.blur,
      hueRotate: operations.hueRotate,
      opacity: operations.opacity,
    },
  })

  return pipeline
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
  pipeline: getOperationPipeline(operations),
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

  const candidate = parsed as Record<string, unknown>
  const defaults = defaultOperations()
  const numericKeys: Array<Exclude<keyof ImageOperations, 'crop'>> = [
    'brightness',
    'contrast',
    'saturation',
    'grayscale',
    'sepia',
    'blur',
    'hueRotate',
    'opacity',
    'rotate',
    'scaleX',
    'scaleY',
  ]
  const ranges: Record<string, [number, number]> = {
    brightness: [0, 200],
    contrast: [0, 200],
    saturation: [0, 200],
    grayscale: [0, 100],
    sepia: [0, 100],
    blur: [0, 20],
    hueRotate: [0, 360],
    opacity: [0, 100],
    rotate: [-360, 360],
    scaleX: [-1, 1],
    scaleY: [-1, 1],
  }

  const result = { ...defaults }
  for (const key of numericKeys) {
    const value = candidate[key]
    const range = ranges[key]
    if (!range) {
      return null
    }
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < range[0] ||
      value > range[1]
    ) {
      return null
    }
    result[key] = value
  }

  const crop = candidate.crop
  if (crop !== null && crop !== undefined) {
    if (!crop || typeof crop !== 'object') {
      return null
    }
    const cropValue = crop as Record<string, unknown>
    if (
      !['x', 'y', 'width', 'height'].every(
        (key) => typeof cropValue[key] === 'number' && Number.isFinite(cropValue[key]),
      ) ||
      Number(cropValue.width) <= 0 ||
      Number(cropValue.height) <= 0 ||
      Number(cropValue.x) < 0 ||
      Number(cropValue.y) < 0
    ) {
      return null
    }
    result.crop = {
      x: Number(cropValue.x),
      y: Number(cropValue.y),
      width: Number(cropValue.width),
      height: Number(cropValue.height),
    }
  }

  return result
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
