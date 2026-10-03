<script setup>
/**
 * 表单字段容器：标签 / 必填星号 / 错误提示 / 栅格宽度一次搞定
 * 用法：<Field label="商品名称" required :error="errors.name" span="2">
 *         <input v-model="form.name" class="input" />
 *       </Field>
 */
defineProps({
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  error: { type: String, default: '' },
  hint: { type: String, default: '' },
  /** 栅格占列数（配合 .form-grid 使用） */
  span: { type: [String, Number], default: '' },
  labelWidth: { type: String, default: '' },
})
</script>

<template>
  <div class="field" :style="span ? { gridColumn: `span ${span}` } : null">
    <label v-if="label" class="field-label" :style="labelWidth ? { width: labelWidth } : null">
      {{ label }}<span v-if="required" class="req">*</span>
    </label>
    <slot />
    <div v-if="error" class="field-error">{{ error }}</div>
    <div v-else-if="hint" class="field-hint">{{ hint }}</div>
  </div>
</template>

<style scoped>
.field {
  min-width: 0;
}
</style>
