<script setup>
/** 403：角色权限不足 */
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import Icon from '@/components/ui/Icon.vue'
import AppButton from '@/components/ui/AppButton.vue'

const router = useRouter()
const route = useRoute()
const { roleName, user } = useAuth()
</script>

<template>
  <div class="min-h-full flex items-center justify-center p-6" :style="{ background: 'var(--c-bg)' }">
    <div class="w-full max-w-[460px] text-center">
      <div
        class="mx-auto flex items-center justify-center rounded-full mb-5"
        :style="{ width: '64px', height: '64px', background: 'var(--c-warning-soft)', color: 'var(--c-warning)' }"
      >
        <Icon name="lock" :size="28" />
      </div>
      <div class="text-[40px] font-semibold tracking-tight" :style="{ color: 'var(--c-text-3)' }">403</div>
      <h1 class="text-[18px] font-semibold mt-1">当前角色无权访问该模块</h1>
      <p class="text-[13px] text-text-2 mt-2 leading-relaxed">
        你正以「{{ roleName }}」身份登录（{{ user?.name }}）。<br />
        该功能仅对店长开放，如需操作请使用店长账号，或联系门店管理员调整权限。
      </p>
      <div
        v-if="route.query.from"
        class="mt-4 px-3 py-2 rounded-md text-[12px] text-text-3 font-mono break-all text-left"
        :style="{ background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }"
      >
        {{ route.query.from }}
      </div>
      <div class="flex items-center justify-center gap-2 mt-6">
        <AppButton icon="arrowLeft" @click="router.back()">返回上一页</AppButton>
        <AppButton variant="primary" icon="cart" @click="router.replace({ name: 'pos' })">进入收银台</AppButton>
      </div>
    </div>
  </div>
</template>
