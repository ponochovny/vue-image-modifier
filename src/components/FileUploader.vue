<script lang="ts" setup>
import { ref } from 'vue'

const imageRef = ref<HTMLInputElement | null>(null)
const originalFile = ref<File | null>(null)
const file = ref<File | null>(null)
const imageUrl = ref<string | null>(null)

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    originalFile.value = target.files[0]
    file.value = target.files[0]
    imageUrl.value = URL.createObjectURL(target.files[0])
  }
}
const resetFileInput = () => {
  file.value = null
  imageUrl.value = null
  originalFile.value = null
  if (imageRef.value) {
    imageRef.value.value = ''
  }
}
const exportImage = () => {
  if (file.value) {
    const link = document.createElement('a')
    link.href = imageUrl.value || ''
    link.download = file.value.name
    link.click()
  }
}
const resetModifiers = () => {
  if (originalFile.value) {
    file.value = originalFile.value
    imageUrl.value = URL.createObjectURL(originalFile.value)
  }
}
</script>

<template>
  <div>
    <h2>Upload Image</h2>
    <input ref="imageRef" type="file" accept="image/*" @change="handleFileChange" />
    <div>
      <p v-if="file">Selected file: {{ file.name }}</p>
      <p v-else>No file selected</p>
    </div>
    <div
      v-if="file"
      :style="{
        border: '1px solid #ccc',
        padding: '10px',
        marginTop: '10px',
        display: 'flex',
        justifyContent: 'space-between',
        // alignItems: 'center',
      }"
    >
      <img :src="imageUrl || ''" alt="Uploaded Image" style="max-width: 300px; height: auto" />
      <div
        :style="{
          border: '1px solid #ccc',
          padding: '10px',
        }"
      >
        <h2>Controls</h2>
        <div :style="{ display: 'flex', flexDirection: 'column', gap: '16px' }">
          <button @click="resetModifiers">Reset modifiers</button>
          <button @click="resetFileInput">Remove</button>
          <button @click="exportImage">Export</button>
        </div>
      </div>
    </div>
  </div>
</template>
