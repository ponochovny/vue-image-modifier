# Image modifier

## Demo

[DEMO](https://ponochovny.github.io/vue-image-modifier/)

## Preview

<img width="974" height="358" alt="image" src="https://github.com/user-attachments/assets/7c561fc6-a9b6-4866-88c7-6d4f9b341f0f" />
<img width="989" height="528" alt="image" src="https://github.com/user-attachments/assets/7facad39-3980-423b-9c4b-59904cba69ea" />
<img width="985" height="586" alt="image" src="https://github.com/user-attachments/assets/dee02a2a-b492-44e4-84ef-c11b5be262b4" />

## Project Setup

```sh
npm install
```

```sh
npm run dev
```

## Completed status

### Requirements

# Image Lab

A non-destructive image editor for print-oriented preparation. It keeps the uploaded file as the source of truth and derives both the preview and downloaded image from the same operation pipeline.

## Run locally

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run type-check
npm test
npm run build
```

## Architecture

- `src/stores/editor.ts` owns the editable operation snapshot plus undo/redo history. The UI does not implement history itself.
- `src/utils/imageOps.ts` contains the serializable operation model, validation, filter generation, export formats, and the explicit replay order: crop, transform, then filters.
- `ImageEditor.vue` owns browser concerns only: file/object URL lifecycle, cropper integration, canvas rendering, and download actions.
- Preview updates are scheduled with `requestAnimationFrame` and reuse one decoded source image. Slider movement remains live without decoding a 4K image for every reactive tick.

## Trade-offs

Canvas rendering is intentionally used instead of CSS filters on the preview image. This keeps preview and export pixel-identical and avoids applying the same filter twice. The source image remains untouched, while the current flattened operation snapshot is exported as JSON together with an explicit pipeline description for replay.

The cropper remains an interaction surface for selecting a crop, but the applied crop is stored in the operation snapshot. Importing an operations file therefore updates both the canvas pipeline and the cropper selection.

## Features

Image upload and drag-and-drop, crop with aspect ratios and zoom, brightness/contrast/saturation, grayscale, sepia, blur, hue rotation, opacity, rotate, flip, presets, undo/redo, PNG/JPEG/WebP export, and JSON operation export/import.
