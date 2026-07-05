# Test Task — Image Editor (Vue 3)

We work in the printing industry, where preparing and adjusting images for output is everyday work. This task is a small browser-based image editor in that spirit. We're mainly interested in how you model the edits, not just the pixels.

Plan for roughly a day. Get the requirements working first; the bonus section is optional.

## Stack & setup

- Expected technologies
  - Vue 3
  - Vuetify 3
  - Pinia
  - TypeScript
- Scaffold the app however you like.
- Using cropping library such as cropperjs is fine.
- It must run with `npm i && npm run dev`.

## Requirements

- ✅ Load an image via file upload.
- ✅ Crop uploaded image
- ✅ Adjust it with live sliders with a real-time preview.
  - ✅ brightness
  - ✅ contrast
  - ✅ saturation
- ✅ Reset / view original: a way back to the unedited image. Edits must stay non-destructive — keep the original and derive the preview rather than writing changes into the source.
- ✅ Export the result by downloading it.

## ★ Bonus (optional)

- ✅ Add at least one filter (greyscale, sepia, etc.).
- ✅ Export the operations as JSON alongside the image. It should describe applied operations so that that replaying them on the original image reproduces the result. You design the shape; be ready to explain it.

## Constraints & notes

- Editing must stay non-destructive;
- AI is allowed and encouraged. The design decisions (op model, pipeline, UX) are yours to explain.

## What to submit

- A link to git repo or zip file that runs with `npm i && npm run dev`.
- A short notes or comments on your key decisions and trade-offs, and whether you attempted the bonus (and how you modeled the operations, if so).

## Dependency / file audit

### Installed and actively used

- ✅ Vue 3 — core framework; used for the app, reactivity and component rendering.
- ✅ Vuetify — UI library; used for the editor layout, dialogs, controls and notifications.
- ✅ Pinia — installed and wired in the app bootstrap; not strictly required for the current feature set, but useful for future state management.
- ✅ vue-cropperjs — main cropper integration; directly used in the editor for crop UI and image replacement.
- ✅ Vite + Vue plugin + TypeScript toolchain — required for dev server, production build and type checking.
- ✅ Vitest + jsdom — used for unit tests in the image operations and cropper compatibility helpers.
- ✅ @mdi/font — required for the Material Design icons used by Vuetify.

### Installed but effectively unused / can be cleaned up

- ⚠️ Pinia state management is currently overkill for this app because the editor state is kept locally in the component.

## Completed status

### Requirements

- ✅ Load an image via file upload.
- ✅ Crop uploaded image.
- ✅ Adjust it with live sliders with a real-time preview.
  - ✅ brightness
  - ✅ contrast
  - ✅ saturation
- ✅ Reset / view original without destructive edits.
- ✅ Export the result by downloading it.

### Bonus

- ✅ Added multiple extra filters: grayscale, sepia, blur, hue rotate and opacity.
- ✅ Exported the operations as JSON so the effect can be replayed on the original image.

### Additional features

- ✅ Undo / redo history for edits.
- ✅ Rotate, flip and aspect-ratio presets for cropping.
- ✅ Filter presets, status feedback and export format/quality controls.
