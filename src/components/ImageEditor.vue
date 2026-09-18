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
const imageInput = ref<HTMLInputElement | null>(null)
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

  originalFileName.value = file.name
  originalImageUrl.value = URL.createObjectURL(file)
  editor.clear()
  previewImageUrl.value = null
  isLoaded.value = true

  sourceImage.value = null
  refreshCropper()
  schedulePreview()
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

const triggerImageLoad = () => {
  imageInput.value?.click()
}

const handleNativeFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) loadFile(file)
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
        <div class="brand-lockup">
          <div class="brand-mark"><v-icon icon="mdi-image-filter-center-focus" /></div>
          <div>
            <div class="text-overline">PRINT / IMAGE LAB</div>
            <div class="editor-title">Image editor</div>
          </div>
        </div>
        <div class="editor-status"><span class="status-dot" /> Original preserved</div>
      </v-card-title>
      <v-card-text>
        <p class="editor-intro mb-5">
          Shape your image, keep the source safe, and export when it feels right.
        </p>
        <v-snackbar v-model="snackbarVisible" :type="statusType" location="top">
          {{ statusMessage }}
        </v-snackbar>
        <div
          class="drop-zone"
          :class="{ 'drop-active': dragOver }"
          role="button"
          tabindex="0"
          aria-label="Choose an image"
          @click="triggerImageLoad"
          @keydown.enter.prevent="triggerImageLoad"
          @keydown.space.prevent="triggerImageLoad"
          @drop.prevent="handleDrop"
          @dragover.prevent="handleDragOver"
          @dragleave.prevent="handleDragLeave"
        >
          <input
            ref="imageInput"
            class="image-input"
            type="file"
            accept="image/*"
            @change="handleNativeFileChange"
          />
          <div class="upload-content">
            <div class="upload-icon"><v-icon icon="mdi-cloud-upload-outline" size="28" /></div>
            <div>
              <div class="upload-title">Bring in an image</div>
              <div class="drop-zone-label">Drop a file here, or browse from your device</div>
            </div>
            <div class="browse-action"><v-icon icon="mdi-folder-open-outline" /> Browse files</div>
          </div>
        </div>

        <v-alert type="info" variant="tonal" density="compact" class="mt-4 mb-0 source-note">
          <template #prepend><v-icon icon="mdi-shield-check-outline" /></template>
          Preview and export use the same pipeline. Your source file is never changed.
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
              <div class="workspace-label"><span>01</span> Frame your image</div>
              <div class="cropper-shell">
                <vue-cropper
                  v-if="originalImageUrl"
                  ref="cropperRef"
                  :src="originalImageUrl"
                  alt="Source image"
                />
              </div>

              <v-card variant="outlined" class="tool-card mt-4">
                <v-card-title class="panel-title"
                  ><v-icon icon="mdi-crop" /> Crop & frame</v-card-title
                >
                <v-card-text>
                  <div class="d-flex flex-wrap ga-2">
                    <v-btn color="primary" prepend-icon="mdi-check" @click="applyCrop"
                      >Apply crop</v-btn
                    >
                    <v-btn
                      variant="outlined"
                      prepend-icon="mdi-magnify-plus-outline"
                      @click="zoomCropper(0.1)"
                      >Zoom in</v-btn
                    >
                    <v-btn
                      variant="outlined"
                      prepend-icon="mdi-magnify-minus-outline"
                      @click="zoomCropper(-0.1)"
                      >Zoom out</v-btn
                    >
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
              <div class="workspace-label"><span>02</span> Check the result</div>
              <v-card class="preview-panel" variant="flat">
                <v-card-title class="result-heading">
                  <span><v-icon icon="mdi-eye-outline" /> Result</span>
                  <span class="live-pill"><span class="status-dot" /> Live</span>
                </v-card-title>
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
                  <v-btn variant="text" prepend-icon="mdi-restore" @click="resetEdits">Reset</v-btn>
                </v-card-actions>
              </v-card>
              <div class="workspace-label export-label"><span>04</span> Take it with you</div>
              <v-card variant="outlined" class="tool-card export-card">
                <v-card-title class="panel-title"
                  ><v-icon icon="mdi-export-variant" /> Export</v-card-title
                >
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
                    <v-btn color="success" prepend-icon="mdi-download" @click="exportImage"
                      >Download image</v-btn
                    >
                    <v-btn variant="tonal" prepend-icon="mdi-code-json" @click="downloadOperations"
                      >Save settings</v-btn
                    >
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

          <v-row>
            <v-col cols="12" md="7" class="workspace-column">
              <div class="workspace-label"><span>03</span> Tune the mood</div>
              <v-card variant="outlined" class="tool-card adjustment-card">
                <v-card-title class="panel-title">
                  <span><v-icon icon="mdi-tune-variant" /> Adjustments</span>
                  <span class="control-count">{{ filterControls.length }} controls</span>
                </v-card-title>
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
                  <div class="filter-preview mb-4">
                    <v-icon icon="mdi-chart-bubble" /> {{ operationsSummary }}
                  </div>
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
                    <v-btn
                      variant="tonal"
                      prepend-icon="mdi-upload-outline"
                      @click="triggerOperationsLoad"
                      >Load settings</v-btn
                    >
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
          </v-row>
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  background: #e9eee9;
  color: #1f2b2a;
  font-family: 'Trebuchet MS', 'Segoe UI', sans-serif;
}

.editor-page {
  min-height: 100vh;
  padding-top: 36px !important;
  padding-bottom: 60px !important;
  background:
    radial-gradient(circle at 8% 4%, rgba(231, 111, 81, 0.13), transparent 24rem),
    radial-gradient(circle at 96% 20%, rgba(42, 157, 143, 0.12), transparent 26rem), #e9eee9;
}

.editor-frame {
  overflow: hidden;
  border: 1px solid #d2dbd5;
  border-radius: 22px;
  background: rgba(251, 250, 247, 0.92);
  box-shadow: 0 24px 70px rgba(37, 58, 51, 0.12);
}

.editor-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30px 34px 8px;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-mark {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 12px;
  background: #203d38;
  color: #f6c5a8;
  box-shadow: 0 7px 16px rgba(32, 61, 56, 0.2);
}

.editor-title {
  color: #203d38;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  line-height: 1.05;
}

.editor-status,
.live-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #47736a;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2a9d8f;
  box-shadow: 0 0 0 4px rgba(42, 157, 143, 0.14);
}

.editor-intro {
  max-width: 620px;
  color: #61716b;
  font-size: 1rem;
}

.source-note {
  border: 1px solid rgba(42, 157, 143, 0.2);
}

.drop-zone {
  position: relative;
  border: 1px dashed #a9bcb3;
  border-radius: 14px;
  padding: 20px 22px;
  background: #f3f7f3;
  text-align: left;
  user-select: none;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease;
}

.image-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.drop-zone:hover,
.drop-active {
  border-color: #e76f51;
  background: #fff8f2;
  transform: translateY(-1px);
}

.upload-content {
  display: flex;
  align-items: center;
  gap: 14px;
}

.upload-icon {
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 12px;
  background: #f9d8c8;
  color: #c4553b;
}

.upload-title {
  color: #203d38;
  font-weight: 700;
}

.drop-zone-label {
  margin-top: 3px;
  color: #71817a;
  font-size: 0.86rem;
}

.browse-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding: 11px 16px;
  border: 1px solid #e76f51;
  border-radius: 9px;
  background: #fff;
  color: #c4553b;
  font-size: 0.86rem;
  font-weight: 700;
  flex: 0 0 auto;
}

.drop-zone:focus-visible {
  outline: 3px solid rgba(231, 111, 81, 0.28);
  outline-offset: 3px;
}

.drop-zone:hover .browse-action,
.drop-zone:focus-visible .browse-action {
  background: #fff3ed;
}

.workspace-column {
  align-self: flex-start;
}

.top-workspace {
  align-items: flex-start;
}

.workspace-label {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 4px 0 11px;
  color: #71817a;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-label span {
  color: #e76f51;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1rem;
}

.cropper-shell {
  position: relative;
  min-height: 430px;
  overflow: hidden;
  border: 1px solid #cad4d0;
  border-radius: 14px;
  background: #dfe6e1;
  box-shadow: inset 0 0 0 8px rgba(255, 255, 255, 0.18);
}

.cropper-shell::after {
  position: absolute;
  inset: 14px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 8px;
  pointer-events: none;
  content: '';
}

:deep(.cropper-container) {
  max-width: 100%;
}

:deep(.cropper-view-box),
:deep(.cropper-face) {
  border-radius: 0;
}

.tool-card {
  border: 1px solid #d7e0da !important;
  border-radius: 14px !important;
  background: #fff !important;
  box-shadow: 0 8px 22px rgba(45, 67, 59, 0.05) !important;
}

.panel-title,
.result-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #203d38;
  font-size: 1rem;
  font-weight: 700;
}

.panel-title > span,
.result-heading > span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 9px;
}

.panel-title .v-icon,
.result-heading .v-icon {
  color: #e76f51;
}

.control-count {
  color: #93a19b;
  font-size: 0.72rem;
  font-weight: 600;
}

.preview-panel {
  border: 1px solid #304a45;
  border-radius: 14px;
  background: #202827;
  color: #f5f7f5;
  box-shadow: 0 16px 30px rgba(25, 43, 39, 0.18);
}

.preview-stage {
  display: flex;
  min-height: 430px;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: repeating-conic-gradient(#eef1eb 0% 25%, #dce3dc 0% 50%) 50% / 22px 22px;
}

.preview-image {
  display: block;
  max-width: 100%;
  max-height: 430px;
  height: auto;
  margin: auto;
  object-fit: contain;
  background: #fff;
}

.preview-empty {
  color: #73827b;
}

.preview-actions {
  justify-content: flex-start;
  gap: 10px;
  padding: 16px;
  background: #202827;
}

.preview-actions :deep(.v-btn) {
  color: #eef3ed;
}

.filter-control-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filter-label {
  color: #304a45;
  font-size: 0.88rem;
  font-weight: 700;
}

.filter-value {
  margin-left: 10px;
  color: #e76f51;
  font-size: 0.82rem;
  font-weight: 700;
}

.filter-preview {
  display: flex;
  min-height: 38px;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  padding: 8px 11px;
  border-radius: 8px;
  background: #f1f6f1;
  color: #60716a;
  font-size: 0.75rem;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.filter-preview .v-icon {
  flex: 0 0 auto;
  color: #2a9d8f;
}

.export-card {
  margin-top: 0;
}

.export-label {
  margin-top: 22px;
}

@media (max-width: 900px) {
  .editor-heading {
    padding: 22px 20px 8px;
  }

  .preview-stage,
  .cropper-shell {
    min-height: 260px;
  }

  .upload-content {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .browse-action {
    width: 100%;
    justify-content: center;
    margin: 0;
  }
}

@media (max-width: 600px) {
  .editor-page {
    padding-top: 16px !important;
  }

  .editor-heading {
    align-items: flex-start;
    gap: 14px;
  }

  .editor-status {
    padding-top: 4px;
    font-size: 0.64rem;
  }

  .editor-frame :deep(.v-card-text) {
    padding-right: 16px;
    padding-left: 16px;
  }

  .preview-image {
    max-height: 300px;
  }

  .preview-actions {
    gap: 4px;
    padding: 10px;
  }
}
</style>
