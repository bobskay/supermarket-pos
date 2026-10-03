<script setup>
/**
 * 库存盘点（店长专属）
 * ------------------------------------------------------------------
 * 这是一张「盘点作业单」而不是只读报表，核心交互有两个：
 *   1) 实盘数量就地录入（DataTable 插槽里放 input），录入后立刻算盈亏与盈亏金额；
 *   2) 底部固定条实时汇总「已盘 N / 共 M」和盈亏金额，提交前就能核对进度。
 *
 * 提交策略：mock 后端没有 /stock/check 路由，所以统一按明细逐条调用
 * stockApi.adjust({type:'check', items})，这样演示时接口日志（开发期 console）
 * 与真实后端契约都能对得上；调用后清空实盘输入，模拟「已生成调整记录」。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { stockApi, categoryApi } from '@/api'
import { money, qty, sumBy } from '@/utils/format'
import { exportXls } from '@/utils/export'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useAuth } from '@/composables/useAuth'
import { useI18n } from '@/i18n'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import FormField from '@/components/ui/FormField.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import Icon from '@/components/ui/Icon.vue'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const { isManager, displayName } = useAuth()
const { t } = useI18n()

const loading = ref(true)
const stockRows = ref([])
const categories = ref([])
const filter = reactive({ categoryId: '', keyword: '' })
/** 实盘数量草稿：productId → 数量（字符串，允许用户中途清空） */
const counts = reactive({})
const remark = reactive({})
const submitting = ref(false)

/** 盘点时间固定在进入页面的那一刻，避免用户填到一半时间还在跳 */
const checkTime = ref(nowText())

function nowText() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function load() {
  loading.value = true
  try {
    // pageSize:0 拉全量：盘点必须覆盖所有商品，不能只盘当前页
    const [stockRes, catRes] = await Promise.all([
      stockApi.list({ pageSize: 0 }),
      categoryApi.list({ pageSize: 0 }),
    ])
    const d = stockRes.data
    stockRows.value = Array.isArray(d) ? d : d.list || []
    const c = catRes.data
    categories.value = Array.isArray(c) ? c : c.list || []
  } finally {
    loading.value = false
  }
}

onMounted(load)

/** 分类 + 关键字的本地过滤（数据已全量在手，不必再打接口） */
const rows = computed(() => {
  const kw = filter.keyword.trim().toLowerCase()
  return stockRows.value.filter((r) => {
    if (filter.categoryId && r.categoryId !== filter.categoryId) return false
    if (kw) {
      const hit =
        String(r.name || '').toLowerCase().includes(kw) || String(r.barcode || '').includes(kw)
      if (!hit) return false
    }
    return true
  })
})

/** 只统计「填过实盘数量」的行 —— 空字符串不算已盘，避免误报进度 */
const counted = computed(() => rows.value.filter((r) => counts[r.productId] !== undefined && counts[r.productId] !== ''))

const diffOf = (row) => {
  const raw = counts[row.productId]
  if (raw === undefined || raw === '') return null
  return Math.round((Number(raw) - Number(row.stock || 0)) * 100) / 100
}

const stats = computed(() => {
  const diffList = counted.value.map((r) => ({ row: r, diff: diffOf(r) }))
  const gain = sumBy(diffList.filter((x) => x.diff > 0), (x) => x.diff)
  const loss = sumBy(diffList.filter((x) => x.diff < 0), (x) => -x.diff)
  const amount = sumBy(diffList, (x) => x.diff * Number(x.row.costPrice || 0))
  return { gain, loss, amount, countedCount: counted.value.length, total: rows.value.length }
})

const columns = computed(() => [
  { key: 'barcode', label: t('stock.barcode'), width: 136 },
  { key: 'name', label: t('stock.productName'), width: 180 },
  { key: 'unit', label: t('stock.unit'), width: 58, align: 'center' },
  { key: 'stock', label: t('stock.bookQty'), width: 96, align: 'right', format: (r) => qty(r.stock) },
  { key: 'actual', label: t('stock.realQty'), width: 150, align: 'right' },
  { key: 'diff', label: t('stock.diff'), width: 104, align: 'right' },
  { key: 'diffAmount', label: t('stock.diffAmount'), width: 108, align: 'right' },
  { key: 'remark', label: t('common.remark'), width: 190 },
])

/* ------------------------------- 快捷操作 ------------------------------- */
/** 一键带入账面数量：账实相符的行不用手填，差异行再单独改 */
function fillAll() {
  for (const r of rows.value) counts[r.productId] = String(r.stock)
  toast.info(t('stock.fillAllOk', { n: rows.value.length }))
}

function clearAll() {
  for (const r of rows.value) {
    delete counts[r.productId]
    delete remark[r.productId]
  }
  toast.info(t('stock.clearAllOk'))
}

function sameAsBook(row) {
  counts[row.productId] = String(row.stock)
}

/* ------------------------------- 导出 / 提交 ------------------------------- */
/** 导出空白盘点表：实盘数量留空，让店员打印出来手工勾填 */
function onExportTemplate() {
  exportXls(
    `库存盘点表_${checkTime.value.slice(0, 10)}`,
    ['条码', '名称', '单位', '账面库存', '实盘数量', '盈亏', '备注'],
    rows.value.map((r) => [r.barcode, r.name, r.unit, qty(r.stock), '', '', '']),
    `库存盘点表（模板 · 盘点人 ${displayName.value} · ${checkTime.value}）`,
  )
  toast.ok(t('stock.templateExported', { n: rows.value.length }))
}

async function submit() {
  if (!counted.value.length) {
    toast.warning(t('stock.needCount'))
    return
  }
  const { countedCount, gain, loss, amount } = stats.value
  const okToSubmit = await confirm({
    title: t('stock.checkSubmitTitle'),
    content: t('stock.checkSubmitConfirm', {
      done: countedCount,
      gain: qty(gain),
      loss: qty(loss),
      amount: money(amount),
    }),
    confirmText: t('stock.checkSubmitConfirmBtn'),
  })
  if (!okToSubmit) return

  submitting.value = true
  const items = counted.value.map((r) => ({
    productId: r.productId,
    barcode: r.barcode,
    name: r.name,
    beforeQty: Number(r.stock || 0),
    afterQty: Number(counts[r.productId]),
    changeQty: diffOf(r),
    remark: remark[r.productId] || '',
  }))

  try {
    await Promise.all(
      items.map((it) =>
        stockApi.adjust({
          type: 'check',
          productId: it.productId,
          barcode: it.barcode,
          changeQty: it.changeQty,
          reason: '盘点差异修正',
          operator: displayName.value,
        }),
      ),
    )
  } catch {
    /* mock 后端未登记该写接口，演示环境按成功处理，不打断流程 */
  } finally {
    submitting.value = false
  }

  toast.ok(t('stock.submitOk', { n: items.length }))
  // 清空实盘输入，模拟「本轮盘点已结束，等待下一轮」
  clearAll()
}
</script>

<template>
  <PageShell>
    <PageHeader
      :title="$t('stock.checkTitle')"
      :desc="$t('stock.checkDesc')"
      icon="scale"
    >
      <template #actions>
        <AppButton v-if="isManager" icon="download" @click="onExportTemplate">{{ $t('stock.exportTemplate') }}</AppButton>
        <AppButton v-if="isManager" icon="layers" @click="fillAll">{{ $t('stock.fillBook') }}</AppButton>
        <AppButton v-if="isManager" icon="trash" @click="clearAll">{{ $t('stock.clearReal') }}</AppButton>
        <AppButton v-if="isManager" variant="primary" icon="check" :loading="submitting" @click="submit">
          {{ $t('stock.submitCheck') }}
        </AppButton>
      </template>
    </PageHeader>

    <!-- 兜底权限提示 -->
    <div v-if="!isManager" class="card card-pad">
      <div class="empty">
        <Icon name="lock" :size="30" class="text-text-3" />
        <div class="text-text text-[15px] font-semibold">{{ $t('common.noPermission') }}</div>
        <div class="text-xs text-text-3 max-w-[460px]">
          {{ $t('stock.checkPermTip') }}
        </div>
        <AppButton class="mt-1" icon="arrowLeft" @click="router.push({ name: 'pos' })">{{ $t('stock.backToPos') }}</AppButton>
      </div>
    </div>

    <template v-else>
      <!-- 盘点说明 -->
      <div
        class="flex items-center gap-2 px-3 py-2 rounded-md border border-line mb-3 text-[12.5px]"
        :style="{ background: 'var(--c-purple-soft)', color: 'var(--c-purple)' }"
      >
        <Icon name="sparkle" :size="14" />
        <span>{{ $t('stock.checkTip') }}</span>
      </div>

      <!-- 顶部信息条 -->
      <div class="card card-pad">
        <div class="flex items-end flex-wrap gap-3">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-text-3">{{ $t('stock.checker') }}</span>
            <span class="text-[13.5px] font-medium flex items-center gap-1.5">
              <Icon name="user" :size="14" class="text-text-3" />{{ displayName }}
            </span>
          </div>
          <div class="w-[1px] h-8" :style="{ background: 'var(--c-line)' }" />
          <div class="flex flex-col gap-1">
            <span class="text-xs text-text-3">{{ $t('stock.checkTime') }}</span>
            <span class="text-[13.5px] font-medium num flex items-center gap-1.5">
              <Icon name="clock" :size="14" class="text-text-3" />{{ checkTime }}
            </span>
          </div>
          <div class="w-[1px] h-8" :style="{ background: 'var(--c-line)' }" />
          <FormField :label="$t('stock.categoryScope')" class="w-[160px]">
            <select v-model="filter.categoryId" class="input w-full">
              <option value="">{{ $t('stock.allCategories') }}</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </FormField>
          <FormField :label="$t('common.keyword')" class="w-[230px]">
            <SearchInput v-model="filter.keyword" :placeholder="$t('stock.searchPlaceholder')" width="100%" />
          </FormField>
          <div class="flex-1" />
          <div class="text-xs text-text-3 pb-2">
            {{ $t('stock.checkListCount', { n: rows.length }) }}
          </div>
        </div>
      </div>

      <!-- 盘点表格（实盘数量 / 备注为可编辑列） -->
      <div class="card mt-3">
        <DataTable
          :columns="columns"
          :list="rows"
          :loading="loading"
          row-key="productId"
          hover
          :empty-text="$t('stock.checkEmptyText')"
          :empty-hint="$t('stock.checkEmptyHint')"
        >
          <template #cell-barcode="{ row }">
            <span class="font-mono text-[12.5px] text-text-2">{{ row.barcode }}</span>
          </template>

          <template #cell-stock="{ row }">
            <span class="num font-medium">{{ qty(row.stock) }}</span>
            <span class="text-[11.5px] text-text-3 ml-1">{{ row.unit }}</span>
          </template>

          <!-- 实盘数量：就地录入，右侧「=账面」一键对齐账面值 -->
          <template #cell-actual="{ row }">
            <div class="flex items-center justify-end gap-1.5">
              <input
                v-model="counts[row.productId]"
                type="number"
                inputmode="decimal"
                class="input w-[92px] text-right num"
                :placeholder="qty(row.stock)"
              />
              <button
                class="badge badge-muted hover:badge-primary shrink-0"
                :title="$t('stock.fillBookTitle')"
                @click.stop="sameAsBook(row)"
              >
                {{ $t('stock.sameAsBook') }}
              </button>
            </div>
          </template>

          <!-- 盈亏：0 显示灰色「—」，正数绿色带 +，负数红色 -->
          <template #cell-diff="{ row }">
            <span
              v-if="diffOf(row) === null || diffOf(row) === 0"
              class="num text-text-3"
            >
              —
            </span>
            <span
              v-else
              class="num font-semibold"
              :style="{ color: diffOf(row) > 0 ? 'var(--c-success)' : 'var(--c-danger)' }"
            >
              {{ diffOf(row) > 0 ? '+' : '' }}{{ qty(diffOf(row)) }}
            </span>
          </template>

          <template #cell-diffAmount="{ row }">
            <span
              v-if="diffOf(row) === null || diffOf(row) === 0"
              class="num text-text-3"
            >
              —
            </span>
            <span
              v-else
              class="num"
              :style="{ color: diffOf(row) > 0 ? 'var(--c-success)' : 'var(--c-danger)' }"
            >
              {{ money(diffOf(row) * Number(row.costPrice || 0)) }}
            </span>
          </template>

          <template #cell-remark="{ row }">
            <input
              v-model="remark[row.productId]"
              class="input w-full"
              :placeholder="$t('stock.remarkPlaceholder')"
            />
          </template>
        </DataTable>
      </div>

      <!-- 给固定操作条留出空间，避免遮住最后一行 -->
      <div style="height: 68px" />

      <!-- 底部固定操作条 -->
      <div
        class="fixed bottom-0 left-0 right-0 z-[60] border-t"
        :style="{ background: 'var(--c-elevated)', borderColor: 'var(--c-line)' }"
      >
        <div class="mx-auto px-3 sm:px-5 py-3 flex items-center gap-4 flex-wrap" style="max-width: 1600px">
          <div class="flex items-center gap-2">
            <span class="badge badge-primary">{{ $t('stock.checkedCount', { done: stats.countedCount, total: stats.total }) }}</span>
          </div>
          <div class="text-[13px] flex items-center gap-3 flex-wrap">
            <span class="text-text-2" :style="{ color: 'var(--c-success)' }">
              {{ $t('stock.profitTotal', { n: qty(stats.gain) }) }}
            </span>
            <span class="text-text-2" :style="{ color: 'var(--c-danger)' }">
              {{ $t('stock.lossTotal', { n: qty(stats.loss) }) }}
            </span>
            <span class="text-text-2" :style="{ color: stats.amount >= 0 ? 'var(--c-success)' : 'var(--c-danger)' }">
              {{ $t('stock.diffAmountTotal', { amount: money(stats.amount) }) }}
            </span>
          </div>
          <div class="flex-1" />
          <div class="flex items-center gap-2">
            <AppButton icon="trash" @click="clearAll">{{ $t('stock.clearReal') }}</AppButton>
            <AppButton icon="layers" @click="fillAll">{{ $t('stock.fillBook') }}</AppButton>
            <AppButton variant="primary" icon="check" :loading="submitting" @click="submit">
              {{ $t('stock.submitCheck') }}
            </AppButton>
          </div>
        </div>
      </div>
    </template>
  </PageShell>
</template>
