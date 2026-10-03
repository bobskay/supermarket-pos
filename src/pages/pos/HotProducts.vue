<script setup>
/**
 * 热销商品快捷加车
 * 收银现场最高频的场景是「顾客拿了常见的几样东西」，
 * 与其每次搜索，不如把热销榜直接放在左侧。
 *
 * 两种点击：
 *   · 点商品行     → 加入购物车
 *   · 点左边小图   → 放大查看完整商品图（顾客问「是不是这个」时很有用）
 */
import { ref, onMounted } from 'vue'
import { reportApi } from '@/api'
import { productImage } from '@/utils/product-image'
import Icon from '@/components/ui/Icon.vue'

const emit = defineEmits(['pick', 'preview'])

const loading = ref(true)
const list = ref([])
/** 记录加载失败的图片，避免显示破图 */
const broken = ref([])

function imgSrc(row) {
  return productImage(row.barcode)
}

function markBroken(barcode) {
  if (!broken.value.includes(barcode)) broken.value.push(barcode)
}

onMounted(async () => {
  try {
    const res = await reportApi.productRank(12)
    list.value = res.data || []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div v-if="loading" class="space-y-1.5">
      <div v-for="i in 6" :key="i" class="skeleton" style="height: 46px" />
    </div>

    <template v-else>
      <div
        v-for="(p, i) in list"
        :key="p.productId"
        class="flex items-center gap-2 p-1.5 rounded-md mb-1 transition-colors hover:border-primary"
        :style="{ border: '1px solid var(--c-line)' }"
      >
        <!-- 小图：点击看大图 -->
        <button
          class="shrink-0 rounded-md overflow-hidden flex items-center justify-center"
          :style="{ width: '36px', height: '36px', background: 'var(--c-surface-2)', border: '1px solid var(--c-line)' }"
          :title="`查看「${p.name}」完整图片`"
          @click.stop="emit('preview', p)"
        >
          <img
            v-if="imgSrc(p) && !broken.includes(p.barcode)"
            :src="imgSrc(p)"
            :alt="p.name"
            class="w-full h-full object-cover"
            loading="lazy"
            @error="markBroken(p.barcode)"
          />
          <Icon v-else name="product" :size="15" class="text-text-3" />
        </button>

        <!-- 商品信息：点击加车 -->
        <button class="min-w-0 flex-1 text-left" :title="`加入购物车：${p.name}`" @click="emit('pick', p)">
          <span class="flex items-center gap-1.5">
            <span
              class="w-[16px] h-[16px] rounded flex items-center justify-center text-[10px] font-semibold shrink-0"
              :style="{
                background: i < 3 ? 'var(--c-primary-soft)' : 'var(--c-surface-3)',
                color: i < 3 ? 'var(--c-primary)' : 'var(--c-text-3)',
              }"
              >{{ i + 1 }}</span
            >
            <span class="text-[12.5px] truncate">{{ p.name }}</span>
          </span>
          <span class="flex items-center justify-between mt-0.5 text-[10.5px] text-text-3">
            <span class="font-mono truncate">{{ p.barcode }}</span>
            <span class="shrink-0">销量 {{ p.qty }}{{ p.unit }}</span>
          </span>
        </button>

        <button
          class="shrink-0 text-text-3 hover:text-primary"
          title="加入购物车"
          @click.stop="emit('pick', p)"
        >
          <Icon name="plus" :size="15" />
        </button>
      </div>

      <div v-if="!list.length" class="text-[11.5px] text-text-3 px-1">暂无热销数据，请使用扫码或搜索</div>
    </template>
  </div>
</template>
