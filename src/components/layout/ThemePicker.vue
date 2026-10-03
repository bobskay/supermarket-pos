<script setup>
/**
 * 皮肤切换器（顶栏与登录页共用）
 * ------------------------------------------------------------------
 * 三套皮肤平铺展示，点一下立刻预览。
 * 交互约定：点「当前已选中」的皮肤 → 收起面板（不再做无意义的重复切换）。
 */
import { ref, computed } from 'vue'
import { useTheme, THEMES } from '@/composables/useTheme'
import { useI18n } from '@/i18n'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  /** 按钮样式：icon 只显示图标（顶栏）/ full 显示完整按钮（登录页） */
  variant: { type: String, default: 'icon' },
  /** 面板对齐方向 */
  align: { type: String, default: 'right' },
})

const { theme, setTheme } = useTheme()
const { t } = useI18n()
const open = ref(false)

/** 皮肤名与说明都来自字典，缺键时回退到 useTheme 里的中文名 */
const currentName = computed(() => {
  const cur = THEMES.find((x) => x.key === theme.value)
  return cur ? t(`theme.${cur.key}`, undefined, cur.name) : ''
})
const currentDesc = computed(() => {
  const cur = THEMES.find((x) => x.key === theme.value)
  return cur ? t(`theme.${cur.key}Desc`, undefined, cur.desc) : ''
})

function toggle() {
  open.value = !open.value
}

function pick(t) {
  // 点的就是当前皮肤 → 直接关闭选择面板
  if (t.key === theme.value) {
    open.value = false
    return
  }
  setTheme(t.key)
}
</script>

<template>
  <div class="relative">
    <button
      v-if="variant === 'icon'"
      class="icon-btn"
      :title="t('theme.current', { name: currentName })"
      @click="toggle"
    >
      <Icon name="palette" :size="17" />
    </button>
    <button
      v-else
      class="btn btn-default btn-sm"
      :title="t('theme.current', { name: currentName })"
      @click="toggle"
    >
      <Icon name="palette" :size="14" />
      {{ t('theme.switch') }}
      <Icon name="chevronDown" :size="12" class="opacity-70" />
    </button>

    <Transition name="theme-pop">
      <div
        v-if="open"
        class="absolute top-[calc(100%+6px)] z-[80] p-2 rounded-lg"
        :class="align === 'right' ? 'right-0' : 'left-0'"
        :style="{
          width: '268px',
          background: 'var(--c-elevated)',
          border: '1px solid var(--c-line)',
          boxShadow: 'var(--shadow-md)',
        }"
      >
        <div class="px-1.5 pb-1.5 text-[11px] text-text-3">
          {{ t('theme.count', { n: THEMES.length }) }}
        </div>

        <!-- 注意循环变量不能叫 t，否则会遮蔽 i18n 的 t() -->
        <div class="grid grid-cols-3 gap-1.5">
          <button
            v-for="opt in THEMES"
            :key="opt.key"
            class="p-1.5 rounded-md text-left transition-colors"
            :style="{
              border: `1px solid ${theme === opt.key ? 'var(--c-primary)' : 'var(--c-line)'}`,
              background: theme === opt.key ? 'var(--c-primary-soft)' : 'transparent',
            }"
            @click="pick(opt)"
          >
            <!-- 色板预览：页面底 / 卡片 / 主色 -->
            <span class="flex rounded overflow-hidden" style="border: 1px solid var(--c-line)">
              <span v-for="c in opt.preview" :key="c" class="flex-1 h-[26px]" :style="{ background: c }" />
            </span>
            <span class="flex items-center gap-1 mt-1.5">
              <span
                class="text-[12px] truncate"
                :style="{
                  color: theme === opt.key ? 'var(--c-primary)' : 'var(--c-text)',
                  fontWeight: theme === opt.key ? 600 : 400,
                }"
              >
                {{ t(`theme.${opt.key}`, undefined, opt.name) }}
              </span>
              <Icon v-if="theme === opt.key" name="check" :size="12" :style="{ color: 'var(--c-primary)' }" />
            </span>
          </button>
        </div>

        <div class="px-1.5 pt-1.5 mt-1.5 border-t border-line text-[11px] text-text-3 leading-relaxed">
          {{ currentDesc }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.icon-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--c-text-2);
  transition: background-color 0.15s ease, color 0.15s ease;
}
.icon-btn:hover {
  background: var(--c-hover);
  color: var(--c-text);
}
.theme-pop-enter-active,
.theme-pop-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.theme-pop-enter-from,
.theme-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
