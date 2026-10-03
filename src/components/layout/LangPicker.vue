<script setup>
/**
 * 语言切换（右上角）
 * 只有两种语言，所以用分段按钮直接切换，比下拉少一次点击。
 */
import { useI18n } from '@/i18n'
import Icon from '@/components/ui/Icon.vue'

const { locale, locales, setLocale } = useI18n()
</script>

<template>
  <div class="flex items-center gap-1.5">
    <Icon name="globe" :size="15" class="text-text-3 hidden sm:block" />
    <div class="lang-seg">
      <button
        v-for="l in locales"
        :key="l.key"
        class="lang-seg-item"
        :class="locale === l.key && 'is-active'"
        :title="l.full"
        @click="setLocale(l.key)"
      >
        {{ l.short }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.lang-seg {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  border-radius: 6px;
  background: var(--c-surface-3);
}
.lang-seg-item {
  height: 22px;
  min-width: 30px;
  padding: 0 7px;
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.3px;
  color: var(--c-text-2);
  transition: background-color 0.15s ease, color 0.15s ease;
}
.lang-seg-item:hover {
  color: var(--c-text);
}
.lang-seg-item.is-active {
  background: var(--c-surface);
  color: var(--c-primary);
  box-shadow: var(--shadow-sm);
}
</style>
