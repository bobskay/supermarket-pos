<script setup>
/**
 * 订单管理
 * ------------------------------------------------------------------
 * 收银员与店长共用本页，但可见范围不同：
 *   - 收银员：只允许看自己开的单，operatorId 恒定锁成当前账号，
 *     并在页面顶部给出明确提示（否则会误以为是数据缺失）
 *   - 店长：可看全部门店订单，并额外获得「收银员」筛选与「退款」权限
 *
 * 数据来源全部走 orderApi.list（mock 后端已支持 status/type/operatorId/
 * startDate/endDate 与排序分页），分页/筛选/排序统一交给 useTable 编排。
 */
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { orderApi, userApi } from '@/api'
import { money, qty, percent, dateOnly, timeShort, sumBy, ORDER_STATUS_STYLE, MEMBER_LEVEL_STYLE } from '@/utils/format'
import { exportXls } from '@/utils/export'
import { useAuth } from '@/composables/useAuth'
import { useTable } from '@/composables/useTable'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useI18n } from '@/i18n'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import StatusTag from '@/components/ui/StatusTag.vue'
import AppModal from '@/components/ui/AppModal.vue'
import FormField from '@/components/ui/FormField.vue'
import Icon from '@/components/ui/Icon.vue'

const router = useRouter()
const { user, isManager } = useAuth()
const toast = useToast()
const confirm = useConfirm()
const { t, tl } = useI18n()

/* --------------------- 状态码 / 等级码 → 字典文案 --------------------- */
/** 状态码 → 字典键；mock 数据里的中文名只作兜底 */
const STATUS_KEY = {
  paid: 'order.statusPaid',
  unpaid: 'order.statusUnpaid',
  refunded: 'order.statusRefunded',
  partial_refund: 'order.statusPartialRefund',
  void: 'order.statusVoid',
}
const LEVEL_KEY = {
  normal: 'member.levelNormal',
  silver: 'member.levelSilver',
  gold: 'member.levelGold',
  diamond: 'member.levelDiamond',
}

/** 徽章映射：配色沿用 utils/format 的 ORDER_STATUS_STYLE，文案按当前语言取 */
const statusMap = computed(() => {
  const out = {}
  for (const [code, cfg] of Object.entries(ORDER_STATUS_STYLE)) {
    out[code] = { ...cfg, label: STATUS_KEY[code] ? t(STATUS_KEY[code]) : cfg.label }
  }
  return out
})

function statusText(row) {
  return STATUS_KEY[row?.status] ? t(STATUS_KEY[row.status]) : tl(row, 'statusName', row?.status || '')
}

/** 订单里的会员只有中文等级名（mock 未提供 level 码），按名称反查字典键 */
const LEVEL_NAME_KEY = {
  '普通会员': 'member.levelNormal',
  '银卡会员': 'member.levelSilver',
  '金卡会员': 'member.levelGold',
  '钻石会员': 'member.levelDiamond',
}

/** 会员等级：优先按等级码取字典，缺码时按中文名反查，最后回退原值 */
function levelText(row) {
  if (row?.memberLevel && LEVEL_KEY[row.memberLevel]) return t(LEVEL_KEY[row.memberLevel])
  const key = LEVEL_NAME_KEY[row?.memberLevelName]
  return key ? t(key) : tl(row, 'memberLevelName')
}

const STATUS_OPTIONS = computed(() => [
  { value: '', label: t('order.allStatus') },
  { value: 'paid', label: t('order.statusPaid') },
  { value: 'unpaid', label: t('order.statusUnpaid') },
  { value: 'refunded', label: t('order.statusRefunded') },
  { value: 'partial_refund', label: t('order.statusPartialRefund') },
])

const TYPE_OPTIONS = computed(() => [
  { value: '', label: t('order.allTypes') },
  { value: 'member', label: t('pos.memberOrder') },
  { value: 'normal', label: t('pos.normalOrder') },
])

/** 数据源要能感知角色：收银员不带 operatorId 反而会看到全部，所以这里提前锁定 */
function fetchOrders(params) {
  const p = { ...params, sortBy: 'createdAt', sortOrder: 'desc' }
  if (!isManager.value) p.operatorId = user.value?.id || ''
  return orderApi.list(p)
}

const table = useTable(fetchOrders, {
  filters: { keyword: '', status: '', type: '', operatorId: '', startDate: '', endDate: '' },
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
})
// 解构出 ref 与常用方法：模板里直接写 list / total / loading，避免对象内 ref 解包带来的不确定性
const { list, total, loading, errorMsg, page, size, sort, query, isEmpty, reload, refresh, setFilter, reset, onPageChange, onSort, patchLocal, removeLocal, unshiftLocal, fetchAll, setList } = table


/** 收银员下拉：仅店长加载，避免收银员多打一次无关请求 */
const cashierRows = ref([])
if (isManager.value) {
  userApi.list({ role: 'cashier', pageSize: 0 }).then((res) => {
    cashierRows.value = res.data?.list || []
  })
}
const cashierOptions = computed(() => [
  { id: '', name: t('order.allCashiers') },
  ...cashierRows.value.map((u) => ({ id: u.id, name: u.name })),
  { id: user.value?.id, name: t('order.managerTag', { name: user.value?.name || t('user.me') }) },
])

/* ------------------------------- 汇总条（本页统计） ------------------------------- */
const pageStats = computed(() => {
  const rows = list.value
  const total = sumBy(rows, (r) => r.finalAmount)
  const memberCount = rows.filter((r) => r.type === 'member').length
  return {
    count: rows.length,
    amount: total,
    memberRate: rows.length ? (memberCount / rows.length) * 100 : 0,
  }
})

/* ------------------------------- 表格列 ------------------------------- */
const columns = computed(() => [
  { key: 'orderNo', label: t('order.orderNo'), width: 152 },
  { key: 'createdAt', label: t('order.createdAt'), width: 152, sortable: true },
  { key: 'customer', label: t('order.customer'), width: 148 },
  { key: 'itemCount', label: t('order.items'), width: 76, align: 'right' },
  { key: 'grossAmount', label: t('order.grossAmount'), width: 98, align: 'right', format: (r) => money(r.grossAmount) },
  { key: 'discountAmount', label: t('order.discount'), width: 86, align: 'right' },
  { key: 'finalAmount', label: t('order.finalAmount'), width: 112, align: 'right', sortable: true },
  { key: 'payments', label: t('order.payMethod'), width: 150 },
  { key: 'status', label: t('order.status'), width: 98 },
  { key: 'operatorName', label: t('order.cashier'), width: 92 },
  { key: 'actions', label: t('common.actions'), width: 188, align: 'right' },
])

const PAY_TONE = {
  cash: 'var(--c-success)',
  wechat: 'var(--c-accent)',
  alipay: 'var(--c-info)',
  card: 'var(--c-purple)',
}
const PAY_ICON = { cash: 'money', wechat: 'phone', alipay: 'qrcode', card: 'card' }
/** 支付方式码 → 字典键（与收银台共用 pos.* 文案） */
const PAY_KEY = { cash: 'pos.cash', wechat: 'pos.wechat', alipay: 'pos.alipay', card: 'pos.storedCard' }

function payTone(method) {
  return PAY_TONE[method] || 'var(--c-text-2)'
}
function payIcon(method) {
  return PAY_ICON[method] || 'wallet'
}
function payLabel(p) {
  if (PAY_KEY[p.method]) return t(PAY_KEY[p.method])
  return p.methodName || p.method
}

/** 退款：只对未退款的已结算/部分退款单开放，且只有店长能操作 */
function canRefund(row) {
  return row.status === 'paid' || row.status === 'partial_refund'
}

/* ------------------------------- 退款流程 ------------------------------- */
const refundVisible = ref(false)
const refundTarget = ref(null)
// type 默认全额：门店最常见的退款场景就是整单退回
const refundForm = reactive({ type: 'full', amount: 0, reason: '' })

function openRefund(row) {
  // 收银员点了要给明确反馈，而不是静默无反应
  if (!isManager.value) {
    toast.warning(t('order.noRefundPermission'))
    return
  }
  refundTarget.value = row
  refundForm.type = 'full'
  refundForm.amount = row.finalAmount || 0
  refundForm.reason = ''
  refundVisible.value = true
}

/** 切换退款类型时同步金额，减少手输 */
function onRefundTypeChange() {
  if (refundForm.type === 'full') refundForm.amount = refundTarget.value?.finalAmount || 0
}

async function submitRefund() {
  const row = refundTarget.value
  if (!row) return
  const amount = refundForm.type === 'full' ? Number(row.finalAmount || 0) : Number(refundForm.amount || 0)
  if (amount <= 0 || amount > Number(row.finalAmount || 0)) {
    toast.warning(t('order.refundAmountInvalid'))
    return
  }
  const reason = refundForm.reason.trim() || t('order.refundDefaultReason')

  const go = await confirm({
    title: t('order.confirmRefund'),
    content: t('order.refundConfirmContent', {
      no: row.orderNo,
      amount: money(amount),
      type: refundForm.type === 'full' ? t('order.refundFullShort') : t('order.refundPartialShort'),
      reason,
    }),
    danger: true,
    confirmText: t('order.confirmRefund'),
  })
  if (!go) return

  const res = await orderApi.refund(row.id, { type: refundForm.type, amount, reason })
  toast.ok(res.message)

  // 演示环境后端不落库：本地把这一行改成退款后的样子，界面立刻有变化
  patchLocal(row.id, {
    status: refundForm.type === 'full' ? 'refunded' : 'partial_refund',
    refund: {
      id: res.data?.refundNo || `TK${Date.now()}`,
      amount,
      type: refundForm.type,
      reason,
      operator: user.value?.name || '',
      createdAt: `${dateOnly(new Date().toISOString())} ${new Date().toTimeString().slice(0, 8)}`,
    },
  })

  refundVisible.value = false
  refundTarget.value = null
}

/* ------------------------------- 打印小票 ------------------------------- */
const printingId = ref('')

async function printReceipt(row) {
  printingId.value = row.id
  const res = await orderApi.print(row.id)
  printingId.value = ''
  toast.ok(res.message)
}

/* ------------------------------- 导出 ------------------------------- */
const exporting = ref(false)

async function onExport() {
  exporting.value = true
  const rows = await fetchAll()
  exporting.value = false
  exportXls(
    `${t('order.exportName')}_${dateOnly(new Date().toISOString())}`,
    [
      t('order.orderNo'),
      t('order.createdAt'),
      t('order.customer'),
      t('order.isMember'),
      t('order.items'),
      t('order.grossAmount'),
      t('order.discount'),
      t('order.finalAmount'),
      t('order.payMethod'),
      t('order.status'),
      t('order.cashier'),
    ],
    rows.map((r) => [
      r.orderNo,
      r.createdAt,
      r.memberName || t('order.guest'),
      r.type === 'member' ? t('order.isMemberYes') : t('order.isMemberNo'),
      r.itemCount,
      money(r.grossAmount),
      money(r.discountAmount),
      money(r.finalAmount),
      (r.payments || []).map((p) => `${payLabel(p)} ${money(p.amount)}`).join(' / '),
      statusText(r),
      r.operatorName,
    ]),
    t('order.exportSheet'),
  )
  toast.ok(t('order.exportedOk', { n: rows.length }))
}

function onQuery() {
  setFilter({
    keyword: query.keyword,
    status: query.status,
    type: query.type,
    operatorId: query.operatorId,
    startDate: query.startDate,
    endDate: query.endDate,
  })
}

function onReset() {
  reset()
}

function goDetail(id) {
  router.push({ name: 'order-detail', params: { id } })
}
</script>

<template>
  <PageShell>
    <PageHeader :title="$t('order.title')" :desc="$t('order.desc')" icon="receipt">
      <template #actions>
        <AppButton icon="refresh" :loading="loading" @click="refresh()">{{ $t('common.refresh') }}</AppButton>
        <AppButton icon="download" :loading="exporting" @click="onExport">{{ $t('order.exportOrders') }}</AppButton>
      </template>
    </PageHeader>

    <!-- 数据范围提示：收银员看不到别人的单，必须说明，避免被当成数据丢失 -->
    <div
      class="card card-pad flex items-center gap-2.5 flex-wrap border-line"
      :style="{ background: isManager ? 'var(--c-surface)' : 'var(--c-primary-soft)', borderColor: isManager ? 'var(--c-line)' : 'var(--c-primary-soft-2)' }"
    >
      <Icon :name="isManager ? 'shieldCheck' : 'alert'" :size="16" :style="{ color: isManager ? 'var(--c-success)' : 'var(--c-primary)' }" />
      <span class="text-[13px] font-medium">
        {{ isManager ? $t('order.managerScope') : $t('order.onlyMine') }}
      </span>
      <span class="text-[12px] text-text-3">
        {{ isManager ? $t('order.managerScopeDesc') : $t('order.cashierScopeDesc') }}
      </span>
      <span class="badge badge-muted ml-auto">{{ user?.name }} · {{ user?.roleName }}</span>
    </div>

    <!-- 筛选栏 -->
    <div class="card card-pad mt-3 flex items-end gap-3 flex-wrap">
      <div class="field">
        <label class="field-label">{{ $t('common.keyword') }}</label>
        <SearchInput
          v-model="query.keyword"
          :placeholder="$t('order.searchPlaceholder')"
          width="228px"
          @search="onQuery"
          @enter="onQuery"
        />
      </div>

      <div class="field">
        <label class="field-label">{{ $t('order.status') }}</label>
        <select v-model="query.status" class="input w-[130px]" @change="onQuery">
          <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>

      <div class="field">
        <label class="field-label">{{ $t('order.orderType') }}</label>
        <select v-model="query.type" class="input w-[130px]" @change="onQuery">
          <option v-for="o in TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>

      <div v-if="isManager" class="field">
        <label class="field-label">{{ $t('order.cashier') }}</label>
        <select v-model="query.operatorId" class="input w-[150px]" @change="onQuery">
          <option v-for="c in cashierOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <div class="field">
        <label class="field-label">{{ $t('common.startDate') }}</label>
        <input v-model="query.startDate" type="date" class="input w-[150px]" @change="onQuery" />
      </div>

      <div class="field">
        <label class="field-label">{{ $t('common.endDate') }}</label>
        <input v-model="query.endDate" type="date" class="input w-[150px]" @change="onQuery" />
      </div>

      <div class="flex items-center gap-2">
        <AppButton variant="primary" icon="search" @click="onQuery">{{ $t('common.search') }}</AppButton>
        <AppButton icon="refresh" @click="onReset">{{ $t('common.reset') }}</AppButton>
      </div>
    </div>

    <!-- 本页汇总 -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
      <div class="kpi">
        <div class="flex items-center justify-between">
          <div class="kpi-label">{{ $t('order.statPageOrders') }}</div>
          <span class="flex items-center justify-center rounded-md shrink-0" :style="{ width: '26px', height: '26px', background: 'var(--c-surface-3)', color: 'var(--c-text-2)' }">
            <Icon name="receipt" :size="14" />
          </span>
        </div>
        <div class="kpi-value">{{ pageStats.count }}<span class="text-[13px] text-text-3 ml-1 font-normal">{{ $t('dashboard.unitOrder') }}</span></div>
        <div class="kpi-foot">{{ $t('order.statPageTotal', { n: total }) }}</div>
      </div>

      <div class="kpi">
        <div class="flex items-center justify-between">
          <div class="kpi-label">{{ $t('order.statPageSales') }}</div>
          <span class="flex items-center justify-center rounded-md shrink-0" :style="{ width: '26px', height: '26px', background: 'var(--c-primary-soft)', color: 'var(--c-primary)' }">
            <Icon name="money" :size="14" />
          </span>
        </div>
        <div class="kpi-value" :style="{ color: 'var(--c-primary)' }">{{ money(pageStats.amount) }}</div>
        <div class="kpi-foot">{{ $t('order.statPageSalesFoot') }}</div>
      </div>

      <div class="kpi">
        <div class="flex items-center justify-between">
          <div class="kpi-label">{{ $t('order.statPageMemberRate') }}</div>
          <span class="flex items-center justify-center rounded-md shrink-0" :style="{ width: '26px', height: '26px', background: 'var(--c-purple-soft)', color: 'var(--c-purple)' }">
            <Icon name="members" :size="14" />
          </span>
        </div>
        <div class="kpi-value" :style="{ color: 'var(--c-purple)' }">{{ percent(pageStats.memberRate) }}</div>
        <div class="kpi-foot">{{ $t('order.statPageMemberRateFoot') }}</div>
      </div>
    </div>

    <!-- 订单表格 -->
    <div class="card mt-3">
      <DataTable
        :columns="columns"
        :list="list"
        :loading="loading"
        :sort-by="sort.by"
        :sort-order="sort.order"
        :empty-text="$t('order.emptyText')"
        :empty-hint="$t('order.emptyHint')"
        @sort="onSort"
      >
        <template #cell-orderNo="{ row }">
          <button class="font-mono text-[12.5px] text-primary hover:underline" @click="goDetail(row.id)">
            {{ row.orderNo }}
          </button>
        </template>

        <template #cell-createdAt="{ row }">
          <div class="leading-tight">
            <div class="num text-[13px]">{{ dateOnly(row.createdAt) }}</div>
            <div class="num text-[11.5px] text-text-3">{{ timeShort(row.createdAt) }}</div>
          </div>
        </template>

        <template #cell-customer="{ row }">
          <div v-if="row.type === 'member'" class="flex items-center gap-1.5 min-w-0">
            <span class="truncate">{{ row.memberName }}</span>
            <!-- 等级样式表按 level 编码（gold/silver…）索引，文案按当前语言取 -->
            <span
              v-if="row.memberLevelName"
              class="badge"
              :class="MEMBER_LEVEL_STYLE[row.memberLevel] || 'badge-muted'"
            >
              {{ levelText(row) }}
            </span>
          </div>
          <span v-else class="text-text-3">{{ $t('order.guest') }}</span>
        </template>

        <template #cell-itemCount="{ row }">
          <span class="num">{{ qty(row.itemCount) }}</span>
        </template>

        <template #cell-grossAmount="{ row }">
          <span class="price text-text-2">{{ money(row.grossAmount) }}</span>
        </template>

        <template #cell-discountAmount="{ row }">
          <span v-if="Number(row.discountAmount) || Number(row.pointsDiscount)" class="num text-[13px]" :style="{ color: 'var(--c-danger)' }">
            -{{ money(Number(row.discountAmount || 0) + Number(row.pointsDiscount || 0)) }}
          </span>
          <span v-else class="text-text-3">—</span>
        </template>

        <template #cell-finalAmount="{ row }">
          <span class="price">{{ money(row.finalAmount) }}</span>
        </template>

        <template #cell-payments="{ row }">
          <div class="flex items-center gap-1 flex-wrap">
            <span
              v-for="(p, i) in row.payments || []"
              :key="i"
              class="badge"
              :style="{ background: 'var(--c-surface-3)', color: payTone(p.method) }"
            >
              <Icon :name="payIcon(p.method)" :size="11" />
              {{ payLabel(p) }}
            </span>
            <span v-if="!(row.payments || []).length" class="text-text-3">—</span>
          </div>
        </template>

        <template #cell-status="{ row }">
          <StatusTag :value="row.status" :map="statusMap" />
        </template>

        <template #cell-operatorName="{ row }">
          <span class="text-[13px]">{{ row.operatorName || row.cashierName || '—' }}</span>
        </template>

        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end gap-1" @click.stop>
            <button class="btn btn-ghost btn-sm" :title="$t('common.detail')" @click="goDetail(row.id)">
              <Icon name="eye" :size="14" />
            </button>
            <button
              v-if="canRefund(row)"
              class="btn btn-sm"
              :class="isManager ? 'btn-danger-soft' : 'btn-ghost'"
              :title="isManager ? $t('order.refund') : $t('order.refundNeedManager')"
              @click="openRefund(row)"
            >
              <Icon name="undo" :size="14" />
              {{ $t('order.refund') }}
            </button>
            <button class="btn btn-ghost btn-sm" :title="$t('order.printReceipt')" :disabled="printingId === row.id" @click="printReceipt(row)">
              <Icon name="print" :size="14" />
            </button>
          </div>
        </template>
      </DataTable>

      <div class="px-3 py-3 border-t border-line">
        <Pagination
          :page="page"
          :page-size="size"
          :total="total"
          @change="onPageChange"
        />
      </div>
    </div>

    <!-- 退款弹窗 -->
    <AppModal
      v-model="refundVisible"
      :title="$t('order.refundTitle')"
      :subtitle="refundTarget ? $t('order.refundSubtitle', { no: refundTarget.orderNo, amount: money(refundTarget.finalAmount) }) : ''"
      width="560"
    >
      <div v-if="refundTarget" class="grid grid-cols-2 gap-3">
        <FormField :label="$t('order.refundType')" required>
          <select v-model="refundForm.type" class="input" @change="onRefundTypeChange">
            <option value="full">{{ $t('order.fullRefund') }}</option>
            <option value="partial">{{ $t('order.partialRefund') }}</option>
          </select>
        </FormField>

        <FormField :label="$t('order.refundAmount')" required :hint="$t('order.maxRefund', { amount: money(refundTarget.finalAmount) })">
          <input
            v-model.number="refundForm.amount"
            type="number"
            min="0"
            :max="refundTarget.finalAmount"
            step="0.01"
            class="input num"
            :disabled="refundForm.type === 'full'"
          />
        </FormField>

        <FormField :label="$t('order.refundReason')" required span="2" :hint="$t('order.refundReasonHint')">
          <input v-model="refundForm.reason" class="input" :placeholder="$t('order.refundReasonPlaceholder')" />
        </FormField>

        <div class="col-span-2 flex items-start gap-2.5 p-3 rounded-md" :style="{ background: 'var(--c-warning-soft)' }">
          <Icon name="alert" :size="15" :style="{ color: 'var(--c-warning)' }" class="mt-0.5 shrink-0" />
          <div class="text-[12.5px] leading-relaxed" :style="{ color: 'var(--c-warning)' }">
            {{ $t('order.refundWarn') }}
          </div>
        </div>
      </div>

      <template #footer="{ close }">
        <AppButton @click="close">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="danger" icon="undo" @click="submitRefund">{{ $t('order.confirmRefund') }}</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
