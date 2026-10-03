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

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'paid', label: '已结算' },
  { value: 'unpaid', label: '未结算' },
  { value: 'refunded', label: '已退款' },
  { value: 'partial_refund', label: '部分退款' },
]

const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'member', label: '会员订单' },
  { value: 'normal', label: '普通订单' },
]

/** 数据源要能感知角色：收银员不带 operatorId 反而会看到全部，所以这里提前锁定 */
function fetchOrders(params) {
  const p = { ...params, sortBy: 'createdAt', sortOrder: 'desc' }
  if (!isManager.value) p.operatorId = user.value?.id || ''
  return orderApi.list(p)
}

const t = useTable(fetchOrders, {
  filters: { keyword: '', status: '', type: '', operatorId: '', startDate: '', endDate: '' },
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
})
// 解构出 ref 与常用方法：模板里直接写 list / total / loading，避免对象内 ref 解包带来的不确定性
const { list, total, loading, errorMsg, page, size, sort, query, isEmpty, reload, refresh, setFilter, reset, onPageChange, onSort, patchLocal, removeLocal, unshiftLocal, fetchAll, setList } = t


/** 收银员下拉：仅店长加载，避免收银员多打一次无关请求 */
const cashiers = ref([])
if (isManager.value) {
  userApi.list({ role: 'cashier', pageSize: 0 }).then((res) => {
    const rows = res.data?.list || []
    cashiers.value = [
      { id: '', name: '全部收银员' },
      ...rows.map((u) => ({ id: u.id, name: u.name })),
      { id: user.value?.id, name: `${user.value?.name || '我'}（店长）` },
    ]
  })
}

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
const columns = [
  { key: 'orderNo', label: '订单号', width: 152 },
  { key: 'createdAt', label: '下单时间', width: 152, sortable: true },
  { key: 'customer', label: '顾客', width: 148 },
  { key: 'itemCount', label: '件数', width: 76, align: 'right' },
  { key: 'grossAmount', label: '原价', width: 98, align: 'right', format: (r) => money(r.grossAmount) },
  { key: 'discountAmount', label: '优惠', width: 86, align: 'right' },
  { key: 'finalAmount', label: '实收金额', width: 112, align: 'right', sortable: true },
  { key: 'payments', label: '支付方式', width: 150 },
  { key: 'status', label: '订单状态', width: 98 },
  { key: 'operatorName', label: '收银员', width: 92 },
  { key: 'actions', label: '操作', width: 188, align: 'right' },
]

const PAY_TONE = {
  cash: 'var(--c-success)',
  wechat: 'var(--c-accent)',
  alipay: 'var(--c-info)',
  card: 'var(--c-purple)',
}
const PAY_ICON = { cash: 'money', wechat: 'phone', alipay: 'qrcode', card: 'card' }
const PAY_LABEL = { cash: '现金', wechat: '微信', alipay: '支付宝', card: '储值卡' }

function payTone(method) {
  return PAY_TONE[method] || 'var(--c-text-2)'
}
function payIcon(method) {
  return PAY_ICON[method] || 'wallet'
}
function payLabel(p) {
  return p.methodName || PAY_LABEL[p.method] || p.method
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
    toast.warning('权限不足：退款需由店长操作')
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
    toast.warning('退款金额需大于 0 且不超过实收金额')
    return
  }
  const reason = refundForm.reason.trim() || '顾客申请退款'

  const go = await confirm({
    title: '确认退款',
    content: `订单 ${row.orderNo}\n退款金额 ${money(amount)}（${refundForm.type === 'full' ? '全额' : '部分'}退款）\n退款原因：${reason}\n\n退款后库存与积分将一并回滚。`,
    danger: true,
    confirmText: '确认退款',
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
    `订单导出_${dateOnly(new Date().toISOString())}`,
    ['订单号', '下单时间', '顾客', '是否会员', '商品件数', '原价金额', '优惠金额', '实收金额', '支付方式', '订单状态', '收银员'],
    rows.map((r) => [
      r.orderNo,
      r.createdAt,
      r.memberName || '散客',
      r.type === 'member' ? '会员' : '普通',
      r.itemCount,
      money(r.grossAmount),
      money(r.discountAmount),
      money(r.finalAmount),
      (r.payments || []).map((p) => `${payLabel(p)} ${money(p.amount)}`).join(' / '),
      ORDER_STATUS_STYLE[r.status]?.label || r.statusName || r.status,
      r.operatorName,
    ]),
    '订单列表导出',
  )
  toast.ok(`已导出 ${rows.length} 条订单`)
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
    <PageHeader title="订单管理" desc="查询门店历史订单，支持退款与小票补打" icon="receipt">
      <template #actions>
        <AppButton icon="refresh" :loading="loading" @click="refresh()">刷新</AppButton>
        <AppButton icon="download" :loading="exporting" @click="onExport">导出订单</AppButton>
      </template>
    </PageHeader>

    <!-- 数据范围提示：收银员看不到别人的单，必须说明，避免被当成数据丢失 -->
    <div
      class="card card-pad flex items-center gap-2.5 flex-wrap border-line"
      :style="{ background: isManager ? 'var(--c-surface)' : 'var(--c-primary-soft)', borderColor: isManager ? 'var(--c-line)' : 'var(--c-primary-soft-2)' }"
    >
      <Icon :name="isManager ? 'shieldCheck' : 'alert'" :size="16" :style="{ color: isManager ? 'var(--c-success)' : 'var(--c-primary)' }" />
      <span class="text-[13px] font-medium">
        {{ isManager ? '当前以店长身份查看全部门店订单' : '当前仅显示我开的订单' }}
      </span>
      <span class="text-[12px] text-text-3">
        {{ isManager ? '可按收银员、状态、类型与日期区间筛选，并处理退款' : '如需查看其他收银员的订单，请使用店长账号登录' }}
      </span>
      <span class="badge badge-muted ml-auto">{{ user?.name }} · {{ user?.roleName }}</span>
    </div>

    <!-- 筛选栏 -->
    <div class="card card-pad mt-3 flex items-end gap-3 flex-wrap">
      <div class="field">
        <label class="field-label">关键字</label>
        <SearchInput
          v-model="query.keyword"
          placeholder="订单号 / 顾客姓名 / 手机号"
          width="228px"
          @search="onQuery"
          @enter="onQuery"
        />
      </div>

      <div class="field">
        <label class="field-label">订单状态</label>
        <select v-model="query.status" class="input w-[130px]" @change="onQuery">
          <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>

      <div class="field">
        <label class="field-label">订单类型</label>
        <select v-model="query.type" class="input w-[130px]" @change="onQuery">
          <option v-for="o in TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>

      <div v-if="isManager" class="field">
        <label class="field-label">收银员</label>
        <select v-model="query.operatorId" class="input w-[150px]" @change="onQuery">
          <option v-for="c in cashiers" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <div class="field">
        <label class="field-label">开始日期</label>
        <input v-model="query.startDate" type="date" class="input w-[150px]" @change="onQuery" />
      </div>

      <div class="field">
        <label class="field-label">结束日期</label>
        <input v-model="query.endDate" type="date" class="input w-[150px]" @change="onQuery" />
      </div>

      <div class="flex items-center gap-2">
        <AppButton variant="primary" icon="search" @click="onQuery">查询</AppButton>
        <AppButton icon="refresh" @click="onReset">重置</AppButton>
      </div>
    </div>

    <!-- 本页汇总 -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
      <div class="kpi">
        <div class="flex items-center justify-between">
          <div class="kpi-label">订单数（本页）</div>
          <span class="flex items-center justify-center rounded-md shrink-0" :style="{ width: '26px', height: '26px', background: 'var(--c-surface-3)', color: 'var(--c-text-2)' }">
            <Icon name="receipt" :size="14" />
          </span>
        </div>
        <div class="kpi-value">{{ pageStats.count }}<span class="text-[13px] text-text-3 ml-1 font-normal">单</span></div>
        <div class="kpi-foot">共 {{ total }} 单（当前筛选）</div>
      </div>

      <div class="kpi">
        <div class="flex items-center justify-between">
          <div class="kpi-label">销售总额（本页）</div>
          <span class="flex items-center justify-center rounded-md shrink-0" :style="{ width: '26px', height: '26px', background: 'var(--c-primary-soft)', color: 'var(--c-primary)' }">
            <Icon name="money" :size="14" />
          </span>
        </div>
        <div class="kpi-value" :style="{ color: 'var(--c-primary)' }">{{ money(pageStats.amount) }}</div>
        <div class="kpi-foot">按实收金额合计</div>
      </div>

      <div class="kpi">
        <div class="flex items-center justify-between">
          <div class="kpi-label">会员单占比（本页）</div>
          <span class="flex items-center justify-center rounded-md shrink-0" :style="{ width: '26px', height: '26px', background: 'var(--c-purple-soft)', color: 'var(--c-purple)' }">
            <Icon name="members" :size="14" />
          </span>
        </div>
        <div class="kpi-value" :style="{ color: 'var(--c-purple)' }">{{ percent(pageStats.memberRate) }}</div>
        <div class="kpi-foot">会员订单 ÷ 本页订单数</div>
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
        empty-text="没有符合条件的订单"
        empty-hint="试试调整筛选条件或日期区间"
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
            <!-- 等级样式表按 level 编码（gold/silver…）索引，展示仍用中文等级名 -->
            <span
              v-if="row.memberLevelName"
              class="badge"
              :class="MEMBER_LEVEL_STYLE[row.memberLevel] || 'badge-muted'"
            >
              {{ row.memberLevelName }}
            </span>
          </div>
          <span v-else class="text-text-3">散客</span>
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
          <StatusTag :value="row.status" :map="ORDER_STATUS_STYLE" />
        </template>

        <template #cell-operatorName="{ row }">
          <span class="text-[13px]">{{ row.operatorName || row.cashierName || '—' }}</span>
        </template>

        <template #cell-actions="{ row }">
          <div class="flex items-center justify-end gap-1" @click.stop>
            <button class="btn btn-ghost btn-sm" title="查看详情" @click="goDetail(row.id)">
              <Icon name="eye" :size="14" />
            </button>
            <button
              v-if="canRefund(row)"
              class="btn btn-sm"
              :class="isManager ? 'btn-danger-soft' : 'btn-ghost'"
              :title="isManager ? '退款' : '退款需店长权限'"
              @click="openRefund(row)"
            >
              <Icon name="undo" :size="14" />
              退款
            </button>
            <button class="btn btn-ghost btn-sm" title="打印小票" :disabled="printingId === row.id" @click="printReceipt(row)">
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
    <AppModal v-model="refundVisible" title="订单退款" :subtitle="refundTarget ? `${refundTarget.orderNo} · 实收 ${money(refundTarget.finalAmount)}` : ''" width="560">
      <div v-if="refundTarget" class="grid grid-cols-2 gap-3">
        <FormField label="退款类型" required>
          <select v-model="refundForm.type" class="input" @change="onRefundTypeChange">
            <option value="full">全额退款</option>
            <option value="partial">部分退款</option>
          </select>
        </FormField>

        <FormField label="退款金额" required :hint="`最高可退 ${money(refundTarget.finalAmount)}`">
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

        <FormField label="退款原因" required span="2" hint="将记录到退款单与操作日志中">
          <input v-model="refundForm.reason" class="input" placeholder="如：商品质量问题 / 重复付款 / 顾客取消" />
        </FormField>

        <div class="col-span-2 flex items-start gap-2.5 p-3 rounded-md" :style="{ background: 'var(--c-warning-soft)' }">
          <Icon name="alert" :size="15" :style="{ color: 'var(--c-warning)' }" class="mt-0.5 shrink-0" />
          <div class="text-[12.5px] leading-relaxed" :style="{ color: 'var(--c-warning)' }">
            退款为不可撤销操作：确认后退回款项、回滚库存，并扣回该单已发放的积分。
          </div>
        </div>
      </div>

      <template #footer="{ close }">
        <AppButton @click="close">取消</AppButton>
        <AppButton variant="danger" icon="undo" @click="submitRefund">确认退款</AppButton>
      </template>
    </AppModal>
  </PageShell>
</template>
