import { describe, expect, it } from 'vitest'
import {
  buildFilterString,
  clipSelectionToDisplayRect,
  defaultOperations,
  getExportMimeType,
  getImageDisplayRect,
  mapSelectionToImageCoordinates,
  serializeOperations,
} from './imageOps'

describe('image operations', () => {
  it('builds a css filter string from editor operations', () => {
    const operations = defaultOperations()
    operations.brightness = 120
    operations.contrast = 80
    operations.saturation = 140
    operations.grayscale = 25
    operations.sepia = 10
    operations.blur = 5
    operations.hueRotate = 45
    operations.opacity = 80

    expect(buildFilterString(operations)).toBe(
      'brightness(120%) contrast(80%) saturate(140%) grayscale(25%) sepia(10%) blur(5px) hue-rotate(45deg) opacity(80%)',
    )
  })

  it('calculates the visible image rectangle when the image is letterboxed', () => {
    expect(getImageDisplayRect(400, 300, 800, 400)).toEqual({
      x: -100,
      y: 0,
      width: 600,
      height: 300,
    })
  })

  it('maps a crop selection to real image coordinates while respecting empty side areas', () => {
    const displayRect = getImageDisplayRect(400, 300, 800, 400)
    const crop = mapSelectionToImageCoordinates(
      { x: 200, y: 60, width: 100, height: 60 },
      displayRect,
      800,
      400,
    )

    expect(crop).toEqual({ x: 400, y: 80, width: 133, height: 80 })
  })

  it('clips a selection to the visible image bounds before mapping', () => {
    const displayRect = { x: 50, y: 20, width: 200, height: 100 }
    const clipped = clipSelectionToDisplayRect(
      { x: 10, y: 10, width: 300, height: 200 },
      displayRect,
    )

    expect(clipped).toEqual({ x: 50, y: 20, width: 200, height: 100 })
  })

  it('serializes operations for replay', () => {
    const payload = serializeOperations(defaultOperations(), 'sample.png')

    expect(payload.originalName).toBe('sample.png')
    expect(payload.version).toBe(3)
    expect(payload.operations.crop).toBeNull()
    expect(payload.operations.rotate).toBe(0)
    expect(payload.operations.blur).toBe(0)
    expect(payload.operations.opacity).toBe(100)
  })

  it('maps export formats to browser-safe mime types', () => {
    expect(getExportMimeType('png')).toEqual({ mimeType: 'image/png', extension: 'png' })
    expect(getExportMimeType('jpeg')).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' })
    expect(getExportMimeType('webp')).toEqual({ mimeType: 'image/webp', extension: 'webp' })
  })
})
