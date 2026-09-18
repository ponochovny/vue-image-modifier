import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { cloneOperations, defaultOperations, type ImageOperations } from '../utils/imageOps'

export const useEditorStore = defineStore('editor', () => {
  const operations = ref<ImageOperations>(defaultOperations())
  const history = ref<ImageOperations[]>([])
  const future = ref<ImageOperations[]>([])

  const canUndo = computed(() => history.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  const commit = (updater: (current: ImageOperations) => void) => {
    history.value = [...history.value, cloneOperations(operations.value)].slice(-20)
    updater(operations.value)
    future.value = []
  }

  const commitSnapshot = (snapshot: ImageOperations) => {
    history.value = [...history.value, cloneOperations(snapshot)].slice(-20)
    future.value = []
  }

  const replace = (next: ImageOperations, clearHistory = false) => {
    if (!clearHistory) {
      history.value = [...history.value, cloneOperations(operations.value)].slice(-20)
    }
    operations.value = cloneOperations(next)
    future.value = []
  }

  const reset = () => replace(defaultOperations())

  const undo = () => {
    const previous = history.value.at(-1)
    if (!previous) return
    future.value = [cloneOperations(operations.value), ...future.value]
    history.value = history.value.slice(0, -1)
    operations.value = cloneOperations(previous)
  }

  const redo = () => {
    const next = future.value[0]
    if (!next) return
    history.value = [...history.value, cloneOperations(operations.value)].slice(-20)
    future.value = future.value.slice(1)
    operations.value = cloneOperations(next)
  }

  const clear = () => {
    operations.value = defaultOperations()
    history.value = []
    future.value = []
  }

  return { operations, canUndo, canRedo, commit, commitSnapshot, replace, reset, undo, redo, clear }
})
