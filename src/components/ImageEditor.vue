<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { resolveVueCropperComponent } from '../utils/vueCropperCompat'
import VueCropperRaw from 'vue-cropperjs'
import 'cropperjs/dist/cropper.css'
import { useEditorStore } from '../stores/editor'
import {
  cloneOperations,
  defaultOperations,
  type ImageOperations,
  buildFilterString,
  getExportMimeType,
  serializeOperations,
  deserializeOperations,
  filterPresets,
} from '../utils/imageOps'

type CropperRef = {
  getData: (rounded?: boolean) => { x: number; y: number; width: number; height: number }
  reset: () => void
  replace: (url: string, onlyColorChanged?: boolean) => void
  relativeZoom: (ratio: number) => void
  rotate: (degree: number) => void
  scaleX: (scaleX: number) => void
  scaleY: (scaleY: number) => void
  setAspectRatio: (value: number | null) => void
  setData: (data: { x: number; y: number; width: number; height: number }) => void
}

const editor = useEditorStore()
const selectedFiles = ref<File[]>([])
const originalImageUrl = ref<string | null>(null)
const originalFileName = ref('image.png')
const previewImageUrl = ref<string | null>(null)
const operations = toRef(editor, 'operations')
const isLoaded = ref(false)
const cropperRef = ref<CropperRef | null>(null)
const exportFormat = ref<'png' | 'jpeg' | 'webp'>('png')
const exportQuality = ref(0.92)
const cropAspectRatio = ref<number | null>(null)
const dragOver = ref(false)
const operationsJsonInput = ref<HTMLInputElement | null>(null)
const statusMessage = ref<string | null>(null)
const statusType = ref<'success' | 'error' | 'info'>('info')
const snackbarVisible = ref(false)
let statusTimer: number | null = null
const selectedFilterPreset = ref<string>('default')
const loadedOperationsFile = ref<string | null>(null)
const VueCropper = resolveVueCropperComponent(VueCropperRaw)
const sourceImage = ref<HTMLImageElement | null>(null)
let renderFrame: number | null = null
let sliderSnapshot: ImageOperations | null = null

const filterControls: Array<{
  key: Exclude<keyof ImageOperations, 'rotate' | 'scaleX' | 'scaleY' | 'crop'>
  label: string
  min: number
  max: number
  step: number
  unit: string
}> = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 200, step: 1, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 0, max: 200, step: 1, unit: '%' },
  { key: 'saturation', label: 'Saturation', min: 0, max: 200, step: 1, unit: '%' },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'blur', label: 'Blur', min: 0, max: 20, step: 0.5, unit: 'px' },
  { key: 'hueRotate', label: 'Hue rotate', min: 0, max: 360, step: 1, unit: '°' },
  { key: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, unit: '%' },
]

const filterKeys: Array<Exclude<keyof ImageOperations, 'rotate' | 'scaleX' | 'scaleY' | 'crop'>> = [
  'brightness',
  'contrast',
  'saturation',
  'grayscale',
  'sepia',
  'blur',
  'hueRotate',
  'opacity',
]

const operationsSummary = computed(() => {
  const op = operations.value
  return `B ${op.brightness}% · C ${op.contrast}% · S ${op.saturation}% · G ${op.grayscale}% · Sepia ${op.sepia}% · Blur ${op.blur}px · Hue ${op.hueRotate}° · Opacity ${op.opacity}% · Rotate ${op.rotate}° · Flip ${op.scaleX < 0 ? 'X' : ''}${op.scaleY < 0 ? 'Y' : ''}`
})

const presetItems = computed(() => [
  { title: 'Default', value: 'default' },
  { title: 'Vintage', value: 'vintage' },
  { title: 'Black & White', value: 'bw' },
  { title: 'Warm', value: 'warm' },
])

const setStatus = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  statusMessage.value = message
  statusType.value = type
  snackbarVisible.value = true
  if (statusTimer !== null) {
    window.clearTimeout(statusTimer)
  }
  statusTimer = window.setTimeout(() => {
    snackbarVisible.value = false
    statusTimer = null
  }, 3200)
}

const resetOperation = (key: keyof ImageOperations) => {
  const defaults = defaultOperations()
  commitOperation((current) => {
    if (key === 'crop') {
      current.crop = null
    } else {
      const k = key as Exclude<keyof ImageOperations, 'crop'>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(current as any)[k] = (defaults as any)[k]
    }
  })
  setStatus(`Reset ${key} to default`, 'info')
}

const applyFilterPreset = (presetName: string) => {
  const preset = filterPresets[presetName] ?? {}
  commitOperation((current) => {
    const defaults = defaultOperations()
    filterKeys.forEach((key) => {
      const k = key as Exclude<keyof ImageOperations, 'crop'>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(current as any)[k] = (preset as any)[k] ?? (defaults as any)[k]
    })
  })
  selectedFilterPreset.value = presetName
  setStatus(`Applied ${presetName} preset`, 'success')
}

const schedulePreview = () => {
  if (renderFrame !== null) {
    window.cancelAnimationFrame(renderFrame)
  }
  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = null
    renderPreview()
  })
}

const commitOperation = (updater: (current: ImageOperations) => void) => {
  const nextOperations = cloneOperations(operations.value)
  updater(nextOperations)
  editor.replace(nextOperations)
  renderPreview()
}

const undo = () => {
  editor.undo()
  renderPreview()
}

const redo = () => {
  editor.redo()
  renderPreview()
}

const renderImageToCanvas = (image: HTMLImageElement, currentOperations: ImageOperations) => {
  const canvas = document.createElement('canvas')
  const crop = currentOperations.crop
  const rotate = currentOperations.rotate
  const scaleX = currentOperations.scaleX
  const scaleY = currentOperations.scaleY

  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight
  const targetWidth = crop?.width ?? sourceWidth
  const targetHeight = crop?.height ?? sourceHeight

  const radians = (rotate * Math.PI) / 180
  const rotatedWidth =
    Math.abs(Math.cos(radians) * targetWidth) + Math.abs(Math.sin(radians) * targetHeight)
  const rotatedHeight =
    Math.abs(Math.sin(radians) * targetWidth) + Math.abs(Math.cos(radians) * targetHeight)

  canvas.width = Math.ceil(rotatedWidth)
  canvas.height = Math.ceil(rotatedHeight)
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    return null
  }

  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.scale(scaleX, scaleY)
  ctx.rotate(radians)
  ctx.filter = buildFilterString(currentOperations)
  ctx.drawImage(
    image,
    crop?.x ?? 0,
    crop?.y ?? 0,
    crop?.width ?? sourceWidth,
    crop?.height ?? sourceHeight,
    -targetWidth / 2,
    -targetHeight / 2,
    targetWidth,
    targetHeight,
  )

  return canvas
}

const renderPreview = () => {
  if (!originalImageUrl.value) {
    return
  }

  const render = (image: HTMLImageElement) => {
    const canvas = renderImageToCanvas(image, cloneOperations(operations.value))
    if (canvas) previewImageUrl.value = canvas.toDataURL('image/png')
  }

  if (sourceImage.value?.complete && sourceImage.value.naturalWidth > 0) {
    render(sourceImage.value)
    return
  }

  const image = new Image()
  image.onload = () => {
    sourceImage.value = image
    render(image)
  }
  image.onerror = () => setStatus('Could not load this image', 'error')
  image.src = originalImageUrl.value
}

const refreshCropper = () => {
  if (!originalImageUrl.value) {
    return
  }

  nextTick(() => {
    cropperRef.value?.replace?.(originalImageUrl.value as string)
    cropperRef.value?.reset?.()
    if (operations.value.crop) {
      cropperRef.value?.setData?.(operations.value.crop)
    }
  })
}

const loadFile = (file: File) => {
  if (!file.type.startsWith('image/')) {
    setStatus('Please choose an image file', 'error')
    return
  }
  if (originalImageUrl.value) {
    URL.revokeObjectURL(originalImageUrl.value)
  }

  selectedFiles.value = [file]
  originalFileName.value = file.name
  originalImageUrl.value = URL.createObjectURL(file)
  editor.clear()
  previewImageUrl.value = null
  isLoaded.value = true

  sourceImage.value = null
  refreshCropper()
  schedulePreview()
}

const handleFileChange = (files: File[] | File | null) => {
  const file = Array.isArray(files) ? files[0] : files
  if (file) loadFile(file)
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  dragOver.value = false

  const file = event.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    loadFile(file)
  }
}

const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  dragOver.value = true
}

const handleDragLeave = () => {
  dragOver.value = false
}

const triggerOperationsLoad = () => {
  operationsJsonInput.value?.click()
}

const applyCrop = () => {
  if (!cropperRef.value) {
    return
  }

  const cropData = cropperRef.value.getData(true)
  commitOperation((current) => {
    current.crop = {
      x: Math.round(cropData.x),
      y: Math.round(cropData.y),
      width: Math.round(cropData.width),
      height: Math.round(cropData.height),
    }
  })
}

const rotateImage = (degree: number) => {
  commitOperation((current) => {
    current.rotate = (current.rotate + degree + 360) % 360
  })
}

const flipImage = (axis: 'x' | 'y') => {
  commitOperation((current) => {
    if (axis === 'x') {
      current.scaleX = current.scaleX * -1
    } else {
      current.scaleY = current.scaleY * -1
    }
  })
}

const zoomCropper = (ratio: number) => {
  cropperRef.value?.relativeZoom?.(ratio)
}

const setAspectRatioPreset = (value: number | null) => {
  cropperRef.value?.setAspectRatio(value)
  nextTick(() => {
    cropperRef.value?.reset?.()
  })
}

const resetEdits = () => {
  editor.reset()
  renderPreview()
  cropperRef.value?.reset()
}

const exportImage = () => {
  if (!originalImageUrl.value) {
    return
  }

  const image = new Image()
  image.onload = () => {
    const canvas = renderImageToCanvas(image, cloneOperations(operations.value))

    if (!canvas) {
      return
    }

    const { mimeType, extension } = getExportMimeType(exportFormat.value)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          return
        }

        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.download = `edited-${originalFileName.value.replace(/\.[^.]+$/, '')}.${extension}`
        link.href = url
        link.click()
        URL.revokeObjectURL(url)
      },
      mimeType,
      exportQuality.value,
    )
  }

  image.src = originalImageUrl.value
}

const downloadOperations = () => {
  const blob = new Blob(
    [JSON.stringify(serializeOperations(operations.value, originalFileName.value), null, 2)],
    {
      type: 'application/json',
    },
  )
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${originalFileName.value.replace(/\.[^.]+$/, '')}.json`
  link.click()
  URL.revokeObjectURL(url)
  setStatus('Exported operations JSON', 'success')
}

const applyOperationsFromJson = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) {
    return
  }

  const text = await file.text()
  try {
    const parsed = JSON.parse(text)
    const loaded = deserializeOperations(parsed)
    if (loaded) {
      loadedOperationsFile.value = file.name
      selectedFilterPreset.value = 'custom'
      editor.replace(loaded)
      refreshCropper()
      schedulePreview()
      setStatus(`Loaded operations from ${file.name}`, 'success')
      return
    }

    setStatus('JSON file does not contain operations', 'error')
  } catch {
    setStatus('Invalid JSON file', 'error')
  }
}

watch(originalImageUrl, (newUrl, oldUrl) => {
  if (!newUrl || newUrl === oldUrl) {
    return
  }

  refreshCropper()
})

const updateFilter = (
  key: Exclude<keyof ImageOperations, 'rotate' | 'scaleX' | 'scaleY' | 'crop'>,
  value: number,
) => {
  if (!sliderSnapshot) sliderSnapshot = cloneOperations(operations.value)
  operations.value[key] = Number(value)
  selectedFilterPreset.value = 'custom'
  schedulePreview()
}

const finishFilter = () => {
  if (sliderSnapshot) {
    editor.commitSnapshot(sliderSnapshot)
    sliderSnapshot = null
  }
}

onBeforeUnmount(() => {
  if (originalImageUrl.value) URL.revokeObjectURL(originalImageUrl.value)
  if (renderFrame !== null) window.cancelAnimationFrame(renderFrame)
  if (statusTimer !== null) window.clearTimeout(statusTimer)
})
</script>

<template>
  <v-container class="editor-page pa-4 pa-md-8">
    <v-card class="editor-frame mx-auto" max-width="1400">
      <v-card-title class="editor-heading">
        <div>
          <div class="text-overline">PRINT / IMAGE LAB</div>
          <div class="text-h4">Image editor</div>
        </div>
        <div class="editor-badge">NON-DESTRUCTIVE</div>
      </v-card-title>
      <v-card-text>
        <p class="editor-intro mb-5">
          Prepare a clean, print-ready image while keeping the original untouched.
        </p>
        <v-snackbar v-model="snackbarVisible" :type="statusType" location="top">
          {{ statusMessage }}
        </v-snackbar>
        <div
          class="drop-zone"
          :class="{ 'drop-active': dragOver }"
          @drop.prevent="handleDrop"
          @dragover.prevent="handleDragOver"
          @dragleave.prevent="handleDragLeave"
        >
          <v-file-input
            v-model="selectedFiles"
            accept="image/*"
            label="Choose image"
            prepend-icon="mdi-image"
            show-size
            @update:model-value="handleFileChange"
          />
          <div class="drop-zone-label">Drag and drop an image here or click to choose a file</div>
        </div>

        <v-alert type="info" variant="tonal" density="compact" class="mt-4 mb-0">
          Preview and export use the same operation pipeline. Your source file is never changed.
        </v-alert>

        <input
          ref="operationsJsonInput"
          type="file"
          accept="application/json"
          style="display: none"
          @change="applyOperationsFromJson"
        />

        <div v-if="isLoaded" class="mt-6">
          <v-row class="top-workspace align-start">
            <v-col cols="12" md="7" class="workspace-column">
              <div class="cropper-shell">
                <vue-cropper
                  v-if="originalImageUrl"
                  ref="cropperRef"
                  :src="originalImageUrl"
                  alt="Source image"
                />
              </div>

              <v-card variant="outlined" class="mt-4">
                <v-card-title class="text-subtitle-1">Cropper controls</v-card-title>
                <v-card-text>
                  <div class="d-flex flex-wrap ga-2">
                    <v-btn color="primary" @click="applyCrop">Apply</v-btn>
                    <v-btn variant="outlined" @click="zoomCropper(0.1)">Zoom +</v-btn>
                    <v-btn variant="outlined" @click="zoomCropper(-0.1)">Zoom -</v-btn>
                  </div>
                  <div class="d-flex flex-wrap gap-2 mt-3 align-center">
                    <v-select
                      v-model="cropAspectRatio"
                      :items="[
                        { title: 'Free', value: null },
                        { title: '1:1', value: 1 },
                        { title: '4:3', value: 4 / 3 },
                        { title: '16:9', value: 16 / 9 },
                      ]"
                      label="Crop ratio"
                      density="compact"
                      style="max-width: 220px"
                      @update:model-value="setAspectRatioPreset"
                    />
                  </div>
                </v-card-text>
              </v-card>
            </v-col>
            <v-col cols="12" md="5" class="workspace-column">
              <v-card class="preview-panel" variant="flat">
                <v-card-title class="panel-title">Result</v-card-title>
                <v-card-text class="preview-stage">
                  <img
                    v-if="previewImageUrl"
                    :src="previewImageUrl"
                    alt="Edited preview"
                    class="preview-image"
                  />
                  <div v-else class="preview-empty">Rendering preview...</div>
                </v-card-text>
                <v-card-actions class="preview-actions flex-wrap">
                  <v-btn
                    icon="mdi-rotate-right"
                    variant="tonal"
                    title="Rotate right"
                    @click="rotateImage(90)"
                  />
                  <v-btn
                    icon="mdi-rotate-left"
                    variant="tonal"
                    title="Rotate left"
                    @click="rotateImage(-90)"
                  />
                  <v-btn
                    icon="mdi-flip-horizontal"
                    variant="tonal"
                    title="Flip horizontally"
                    @click="flipImage('x')"
                  />
                  <v-btn
                    icon="mdi-flip-vertical"
                    variant="tonal"
                    title="Flip vertically"
                    @click="flipImage('y')"
                  />
                  <v-divider vertical class="mx-1" />
                  <v-btn
                    icon="mdi-undo"
                    variant="text"
                    title="Undo"
                    :disabled="!editor.canUndo"
                    @click="undo"
                  />
                  <v-btn
                    icon="mdi-redo"
                    variant="text"
                    title="Redo"
                    :disabled="!editor.canRedo"
                    @click="redo"
                  />
                  <v-btn variant="text" @click="resetEdits">Reset</v-btn>
                </v-card-actions>
              </v-card>
            </v-col>
          </v-row>

          <v-row>
            <v-col cols="12" md="7" class="workspace-column">
              <v-card variant="outlined">
                <v-card-title class="text-subtitle-1">Live adjustments</v-card-title>
                <v-card-text>
                  <div class="preset-row mb-4">
                    <v-select
                      v-model="selectedFilterPreset"
                      :items="presetItems"
                      label="Filter preset"
                      density="compact"
                      style="max-width: 240px"
                      @update:model-value="applyFilterPreset"
                    />
                    <div class="d-flex flex-wrap ga-2">
                      <v-btn variant="tonal" @click="applyFilterPreset('default')">Default</v-btn>
                      <v-btn variant="tonal" @click="applyFilterPreset('vintage')">Vintage</v-btn>
                      <v-btn variant="tonal" @click="applyFilterPreset('bw')">B&W</v-btn>
                    </div>
                  </div>
                  <div class="filter-preview mb-4">{{ operationsSummary }}</div>
                  <div
                    v-for="control in filterControls"
                    :key="control.key"
                    class="filter-control-row"
                  >
                    <div class="filter-control-header">
                      <div>
                        <span class="filter-label">{{ control.label }}</span>
                        <span class="filter-value"
                          >{{ operations[control.key] }}{{ control.unit }}</span
                        >
                      </div>
                      <v-btn icon variant="tonal" size="small" @click="resetOperation(control.key)">
                        <!-- <span class="material-icons">refresh</span> -->
                        <v-icon icon="mdi-refresh"></v-icon>
                      </v-btn>
                    </div>
                    <v-slider
                      :model-value="operations[control.key]"
                      :min="control.min"
                      :max="control.max"
                      :step="control.step"
                      thumb-label
                      @update:model-value="updateFilter(control.key, $event)"
                      @end="finishFilter"
                    />
                  </div>
                  <div class="mt-4">
                    <v-btn variant="tonal" @click="triggerOperationsLoad">Load ops JSON</v-btn>
                    <div class="text-body-2 mt-2">
                      {{
                        loadedOperationsFile
                          ? `Loaded operations: ${loadedOperationsFile}`
                          : 'No operations file loaded'
                      }}
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </v-col>

            <v-col cols="12" md="5" class="workspace-column">
              <v-card variant="outlined" class="mt-4">
                <v-card-title class="panel-title">Export</v-card-title>
                <v-card-text>
                  <div class="d-flex flex-wrap gap-2">
                    <v-select
                      v-model="exportFormat"
                      :items="[
                        { title: 'PNG', value: 'png' },
                        { title: 'JPEG', value: 'jpeg' },
                        { title: 'WebP', value: 'webp' },
                      ]"
                      label="Export format"
                      density="compact"
                      style="max-width: 180px"
                    />
                    <v-btn color="success" @click="exportImage">Export image</v-btn>
                    <v-btn variant="tonal" @click="downloadOperations">Export JSON</v-btn>
                  </div>
                  <v-slider
                    v-if="exportFormat !== 'png'"
                    v-model="exportQuality"
                    :label="`Quality ${Math.round(exportQuality * 100)}%`"
                    min="0.5"
                    max="1"
                    step="0.01"
                    style="max-width: 220px"
                    class="mt-4"
                  />
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
.cropper-shell {
  position: relative;
  background: #e9edf0;
  border: 1px solid #d5dce0;
  border-radius: 4px;
  overflow: hidden;
  min-height: 320px;
}

.workspace-column {
  align-self: flex-start;
}

.top-workspace {
  align-items: flex-start;
}

:deep(.cropper-container) {
  max-width: 100%;
}

:deep(.cropper-view-box),
:deep(.cropper-face) {
  border-radius: 0;
}

.preview-image {
  display: block;
  max-width: 100%;
  max-height: 430px;
  height: auto;
  margin: auto;
  object-fit: contain;
  background: #ffffff;
}

.editor-page {
  min-height: 100vh;
  background: #e8eceb;
}

.editor-frame {
  overflow: hidden;
  border: 1px solid #ccd5d5;
  border-radius: 6px;
  background: #f8faf9;
}

.editor-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26px 28px 10px;
}

.editor-intro {
  color: #52605f;
}

.editor-badge {
  padding: 6px 10px;
  border: 1px solid #7d9990;
  border-radius: 3px;
  color: #42675e;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.panel-title {
  font-weight: 650;
  letter-spacing: 0;
}

.preview-panel {
  border: 1px solid #ccd5d5;
  background: #202827;
  color: #f5f7f5;
}

.preview-stage {
  display: flex;
  min-height: 320px;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: repeating-conic-gradient(#f7f8f6 0% 25%, #e5e9e6 0% 50%) 50% / 20px 20px;
}

.preview-empty {
  color: #52605f;
}

.drop-zone {
  border: 2px dashed rgba(0, 0, 0, 0.16);
  border-radius: 4px;
  padding: 18px;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
  position: relative;
  text-align: center;
  user-select: none;
}

.drop-zone:hover {
  border-color: rgba(25, 118, 210, 0.6);
}

.drop-zone-label {
  margin-top: 10px;
  color: rgba(0, 0, 0, 0.65);
}

.drop-active {
  border-color: #1976d2;
  background: rgba(25, 118, 210, 0.08);
}

.preview-actions {
  justify-content: flex-start;
  padding: 16px;
  gap: 10px;
}

.filter-control-row {
  /* margin-bottom: 18px; */
}

.filter-control-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  /* margin-bottom: 8px; */
}

.filter-label {
  font-weight: 500;
}

.filter-value {
  color: rgba(0, 0, 0, 0.6);
  margin-left: 10px;
}

.filter-preview {
  font-size: 0.95rem;
  color: rgba(0, 0, 0, 0.75);
}

@media (max-width: 900px) {
  .cropper-shell {
    min-height: 260px;
  }

  .drop-zone {
    padding: 14px;
  }

  .editor-heading {
    padding: 20px 18px 8px;
  }

  .preview-stage {
    min-height: 240px;
  }

  .d-flex.flex-wrap {
    flex-direction: column;
  }

  .d-flex.flex-wrap .v-btn,
  .d-flex.flex-wrap .v-select {
    width: 100%;
  }
}

@media (max-width: 600px) {
  .cropper-shell {
    min-height: 220px;
  }

  .preview-image {
    max-height: 300px;
  }
}
</style>
