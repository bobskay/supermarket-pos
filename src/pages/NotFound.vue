<script setup>
/** 404 */
import { useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import AppButton from '@/components/ui/AppButton.vue'
import { useAuth } from '@/composables/useAuth'
import { useI18n } from '@/i18n'

const router = useRouter()
const { isLogin } = useAuth()
const { t, tl } = useI18n()
</script>

<template>
  <div class="min-h-full flex items-center justify-center p-6" :style="{ background: 'var(--c-bg)' }">
    <div class="w-full max-w-[460px] text-center">
      <div
        class="mx-auto flex items-center justify-center rounded-full mb-5"
        :style="{ width: '64px', height: '64px', background: 'var(--c-surface-3)', color: 'var(--c-text-3)' }"
      >
        <Icon name="search" :size="28" />
      </div>
      <div class="text-[40px] font-semibold tracking-tight" :style="{ color: 'var(--c-text-3)' }">404</div>
      <h1 class="text-[18px] font-semibold mt-1">{{ $t('notFound.title') }}</h1>
      <p class="text-[13px] text-text-2 mt-2">{{ $t('notFound.desc') }}</p>
      <div class="flex items-center justify-center gap-2 mt-6">
        <AppButton v-if="isLogin" variant="primary" icon="dashboard" @click="router.replace({ name: 'dashboard' })">
          {{ $t('notFound.backDashboard') }}
        </AppButton>
        <AppButton v-else variant="primary" @click="router.replace({ name: 'login' })">{{ $t('notFound.goLogin') }}</AppButton>
      </div>
    </div>
  </div>
</template>
