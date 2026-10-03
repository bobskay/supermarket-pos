<script setup>
/**
 * 顶部请求进度条：假 axios 请求期间显示一条 2px 的进度，让演示更有真实感。
 * 这是「提高效率」的细节之一：不用每个页面自己维护全局 loading。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import http from '@/api/request'

const active = ref(false)
const progress = ref(0)
let timer = null

let un = null
onMounted(() => {
  un = http.onPendingChange((count) => {
    if (count > 0) {
      active.value = true
      progress.value = Math.max(progress.value, 8)
      clearInterval(timer)
      timer = setInterval(() => {
        if (progress.value < 88) progress.value += Math.random() * 9 + 2
      }, 120)
    } else {
      progress.value = 100
      clearInterval(timer)
      setTimeout(() => {
        active.value = false
        progress.value = 0
      }, 220)
    }
  })
})

onBeforeUnmount(() => {
  clearInterval(timer)
  un?.()
})
</script>

<template>
  <div
    v-show="active"
    class="fixed top-0 left-0 right-0 z-[2000] pointer-events-none"
    style="height: 2px"
  >
    <div
      class="h-full transition-all duration-200 ease-out"
      :style="{
        width: `${progress}%`,
        background: 'var(--c-primary)',
        boxShadow: '0 0 8px var(--c-primary)',
      }"
    />
  </div>
</template>
