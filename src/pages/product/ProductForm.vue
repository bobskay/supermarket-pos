<script setup>
/**
 * 商品表单（新增 / 编辑二合一）
 * ------------------------------------------------------------------
 * 同一个组件承担两种模式：路由带 :id 就是编辑，否则是新增。
 * 编辑时先 detail 回填，加载期间用骨架占位，避免表单先渲染空值再被覆盖（会闪）。
 * 演示环境：保存仅提示成功，不真正写入 mock-data/*.json。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { productApi, categoryApi, stockApi } from '@/api'
import { money, percent } from '@/utils/format'
import { productImage } from '@/utils/product-image'
import { useToast } from '@/composables/useToast'
import { useAuth } from '@/composables/useAuth'
import { useI18n } from '@/i18n'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import Icon from '@/components/ui/Icon.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { isManager } = useAuth()
const { t, tl } = useI18n()

const productId = route.params.id ? String(route.params.id) : ''
const isEdit = computed(() => !!productId)

const UNITS = ['斤', '个', '盒', '袋', '瓶', '罐', '箱', '排', '桶', '提', '把', '支', '块', '条', '卷', '板', '只']

const loading = ref(false)
const saving = ref(false)
const categories = ref([])
const errors = ref({})

const form = ref({
  barcode: '',
  name: '',
  categoryId: '',
  unit: '个',
  status: 'active',
  costPrice: '',
  price: '',
  memberPrice: '',
  stock: 0,
  warnThreshold: 10,
  remark: '',
  /** 商品图片：存路径（/products/p0001.svg）或上传后的 dataURL */
  image: '',
})

/** 该商品的库存流水（编辑模式才拉） */
const logs = ref([])
const logsLoading = ref(false)

/* --------------------------- 商品图片 --------------------------- */
const fileInput = ref(null)
const imageError = ref(false)
/** 上传限制：太小会导致图片糊，太大会让 base64 体积失控 */
const MAX_IMAGE_SIZE = 2 * 1024 * 1024

function onPickImage(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.error(t('product.imageTypeError'))
    return
  }
  if (file.size > MAX_IMAGE_SIZE) {
    toast.error(t('product.imageTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }))
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    form.value.image = String(reader.result || '')
    imageError.value = false
    toast.success(t('product.imageUploaded', { name: file.name }))
  }
  reader.onerror = () => toast.error(t('product.imageReadFailed'))
  reader.readAsDataURL(file)
  // 清空 input，保证连续选同一个文件也能触发 change
  e.target.value = ''
}

function clearImage() {
  form.value.image = ''
  imageError.value = false
  toast.info(t('product.imageRemoved'))
}

/** 毛利率：(售价 - 进价) / 售价，售价为 0 时按 0 处理，避免出现 Infinity */
const grossRate = computed(() => {
  const price = Number(form.value.price || 0)
  const cost = Number(form.value.costPrice || 0)
  if (!price) return 0
  return ((price - cost) / price) * 100
})

/** 13 位模拟条码 */
function genBarcode() {
  let body = ''
  for (let i = 0; i < 10; i++) body += Math.floor(Math.random() * 10)
  return `69${body}0`
}

function fillBarcode() {
  form.value.barcode = genBarcode()
  errors.value.barcode = ''
}

async function loadLogs(barcode) {
  logsLoading.value = true
  try {
    const res = await stockApi.logs({ keyword: barcode, pageSize: 8 })
    const d = res.data
    logs.value = Array.isArray(d) ? d : d.list || []
  } finally {
    logsLoading.value = false
  }
}

onMounted(async () => {
  const catRes = await categoryApi.list({ pageSize: 0 })
  categories.value = catRes.data?.list || catRes.data || []

  if (!isEdit.value) {
    form.value.barcode = genBarcode()
    return
  }

  loading.value = true
  try {
    const res = await productApi.detail(productId)
    const p = res.data || {}
    form.value = {
      barcode: p.barcode || '',
      name: p.name || '',
      categoryId: p.categoryId || '',
      unit: p.unit || '个',
      status: p.status || 'active',
      costPrice: p.costPrice ?? '',
      price: p.price ?? '',
      memberPrice: p.memberPrice ?? '',
      stock: p.stock ?? 0,
      warnThreshold: p.warnThreshold ?? 0,
      remark: p.remark || '',
      // 编辑已有商品时，默认带出系统按条码生成的商品图；新增商品时留空
      image: p.stock ? productImage(p) : '',
    }
    await loadLogs(p.barcode || '')
  } finally {
    loading.value = false
  }
})

function validate() {
  const f = form.value
  const e = {}
  const barcode = String(f.barcode || '').trim()
  if (!barcode) e.barcode = t('product.errBarcodeRequired')
  else if (!/^\d{8,13}$/.test(barcode)) e.barcode = t('product.errBarcodeFormat')
  if (!String(f.name || '').trim()) e.name = t('product.errNameRequired')
  if (!f.categoryId) e.categoryId = t('product.errCategoryRequired')
  if (f.price === '' || Number(f.price) <= 0) e.price = t('product.errPricePositive')
  if (f.costPrice !== '' && Number(f.costPrice) < 0) e.costPrice = t('product.errCostNegative')
  if (f.costPrice !== '' && Number(f.costPrice) > Number(f.price)) e.costPrice = t('product.errCostAbovePrice')
  if (f.memberPrice !== '' && Number(f.memberPrice) > Number(f.price)) e.memberPrice = t('product.errMemberPrice')
  if (f.warnThreshold !== '' && Number(f.warnThreshold) < 0) e.warnThreshold = t('product.errThresholdNegative')
  errors.value = e
  return Object.keys(e).length === 0
}

async function onSave() {
  if (!isManager.value) {
    toast.warning(t('product.onlyManagerSave'))
    return
  }
  if (!validate()) {
    toast.warning(t('product.fixErrors'))
    return
  }

  saving.value = true
  const f = form.value
  const cat = categories.value.find((c) => c.id === f.categoryId)
  const payload = {
    barcode: String(f.barcode).trim(),
    name: String(f.name).trim(),
    categoryId: f.categoryId,
    categoryName: cat?.name || '',
    categoryCode: cat?.code || '',
    unit: f.unit,
    status: f.status,
    costPrice: Number(f.costPrice || 0),
    price: Number(f.price || 0),
    memberPrice: Number(f.memberPrice || f.price || 0),
    warnThreshold: Number(f.warnThreshold || 0),
    remark: f.remark,
  }

  // 演示环境写接口一律成功；即便 mock 未登记该路由也不让页面卡住
  if (isEdit.value) await productApi.update(productId, payload).catch(() => null)
  else await productApi.create(payload).catch(() => null)

  saving.value = false
  toast.ok(t('product.saveOk'))
  router.push({ name: 'products' })
}

function onCancel() {
  router.push({ name: 'products' })
}

function goBack() {
  router.push({ name: 'products' })
}

/** 流水类型 → 文案 key 与徽章配色：入库为绿，其余为警示色系 */
const LOG_TYPE_KEY = {
  purchase: 'stock.typePurchase',
  loss: 'stock.typeLoss',
  damage: 'stock.typeDamage',
  check: 'stock.typeCheckUp',
}
const LOG_TYPE_STYLE = {
  purchase: { class: 'badge-success' },
  loss: { class: 'badge-danger' },
  damage: { class: 'badge-warning' },
  check: { class: 'badge-info' },
}

/** 优先按类型码取字典，取不到时回退到后端给的中文 name */
function logTypeText(l) {
  return LOG_TYPE_KEY[l.type] ? t(LOG_TYPE_KEY[l.type]) : tl(l, 'typeName', t('stock.typeOther'))
}
</script>

<template>
  <PageShell>
    <PageHeader
      :title="isEdit ? $t('product.editProduct') : $t('product.newProduct')"
      :desc="isEdit ? $t('product.editDesc', { id: productId }) : $t('product.createDesc')"
      icon="product"
    >
      <template #actions>
        <AppButton icon="arrowLeft" @click="goBack">{{ $t('common.back') }}</AppButton>
        <AppButton @click="onCancel">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" icon="save" :loading="saving" @click="onSave">{{ $t('common.save') }}</AppButton>
      </template>
    </PageHeader>

    <div v-if="!isManager" class="card card-pad mb-3 flex items-start gap-2.5">
      <Icon name="lock" :size="16" :style="{ color: 'var(--c-warning)' }" />
      <div class="text-[12.5px] text-text-2">
        <span class="font-medium text-text">{{ $t('common.noPermission') }}</span>：{{ $t('product.permTipForm') }}
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-3 items-start">
      <!-- 左侧：表单分区 -->
      <div class="space-y-3 min-w-0">
        <!-- 1. 基础信息 -->
        <div class="card">
          <div class="panel-head">
            <div>
              <div class="text-[14px] font-semibold">{{ $t('product.baseInfo') }}</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">{{ $t('product.baseInfoDesc') }}</div>
            </div>
            <Icon name="tag" :size="15" class="text-text-3" />
          </div>

          <div class="p-4">
            <div v-if="loading" class="space-y-3">
              <div v-for="i in 6" :key="i" class="skeleton" style="height: 34px" />
            </div>

            <div v-else class="grid grid-cols-2 gap-3">
              <FormField :label="$t('product.barcode')" required :error="errors.barcode" :hint="$t('product.barcodeHint')" span="2">
                <div class="flex items-center gap-2">
                  <input
                    v-model="form.barcode"
                    class="input flex-1 font-mono"
                    :class="errors.barcode && 'is-error'"
                    :placeholder="$t('product.barcodePlaceholder')"
                  />
                  <AppButton icon="barcode" @click="fillBarcode">{{ $t('product.generateBarcode') }}</AppButton>
                </div>
              </FormField>

              <FormField :label="$t('product.name')" required :error="errors.name" span="2">
                <input
                  v-model="form.name"
                  class="input"
                  :class="errors.name && 'is-error'"
                  :placeholder="$t('product.namePlaceholder')"
                />
              </FormField>

              <!-- 商品图片：支持上传本地图片，也可以直接填图片路径 -->
              <FormField :label="$t('product.imageTitle')" span="2" :hint="$t('product.imageHint')">
                <div class="flex items-start gap-3">
                  <div
                    class="shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
                    :style="{
                      width: '96px',
                      height: '96px',
                      border: '1px dashed var(--c-line-strong)',
                      background: 'var(--c-surface-2)',
                    }"
                  >
                    <img
                      v-if="form.image"
                      :src="form.image"
                      :alt="$t('product.imagePreviewAlt')"
                      class="w-full h-full object-cover"
                      @error="imageError = true"
                    />
                    <div v-else class="flex flex-col items-center gap-1 text-text-3">
                      <Icon name="product" :size="24" />
                      <span class="text-[10.5px]">{{ $t('product.noImageShort') }}</span>
                    </div>
                  </div>

                  <div class="flex-1 min-w-0 space-y-2">
                    <input
                      ref="fileInput"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      class="hidden"
                      @change="onPickImage"
                    />
                    <div class="flex items-center gap-2 flex-wrap">
                      <AppButton icon="upload" @click="fileInput?.click()">{{ $t('product.uploadImage') }}</AppButton>
                      <AppButton v-if="form.image" icon="trash" variant="default" @click="clearImage">
                        {{ $t('product.removeImage') }}
                      </AppButton>
                    </div>
                    <input
                      v-model="form.image"
                      class="input font-mono text-[12.5px]"
                      :placeholder="$t('product.imagePathPlaceholder')"
                      @input="imageError = false"
                    />
                    <div v-if="imageError" class="field-error">
                      {{ $t('product.imageInvalid') }}
                    </div>
                    <div v-else class="text-[11.5px] text-text-3">
                      {{ $t('product.imageBase64Tip') }}
                    </div>
                  </div>
                </div>
              </FormField>

              <FormField :label="$t('product.category')" required :error="errors.categoryId">
                <select v-model="form.categoryId" class="input" :class="errors.categoryId && 'is-error'">
                  <option value="">{{ $t('product.selectCategory') }}</option>
                  <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </FormField>

              <FormField :label="$t('common.unit')">
                <select v-model="form.unit" class="input">
                  <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
                </select>
              </FormField>

              <FormField :label="$t('product.status')" span="2" :hint="$t('product.statusHint')">
                <div class="seg">
                  <button
                    type="button"
                    class="seg-item"
                    :class="form.status === 'active' && 'is-active'"
                    @click="form.status = 'active'"
                  >
                    {{ $t('product.active') }}
                  </button>
                  <button
                    type="button"
                    class="seg-item"
                    :class="form.status === 'inactive' && 'is-active'"
                    @click="form.status = 'inactive'"
                  >
                    {{ $t('product.inactive') }}
                  </button>
                </div>
              </FormField>
            </div>
          </div>
        </div>

        <!-- 2. 价格信息 -->
        <div class="card">
          <div class="panel-head">
            <div class="text-[14px] font-semibold">{{ $t('product.priceInfo') }}</div>
            <Icon name="money" :size="15" class="text-text-3" />
          </div>

          <div class="p-4">
            <div v-if="loading" class="space-y-3">
              <div v-for="i in 4" :key="i" class="skeleton" style="height: 34px" />
            </div>

            <div v-else class="grid grid-cols-2 gap-3">
              <FormField :label="$t('product.costPrice')" :error="errors.costPrice" :hint="$t('product.unitCost')">
                <input v-model="form.costPrice" type="number" min="0" step="0.01" class="input num" placeholder="0.00" />
              </FormField>

              <FormField :label="$t('product.price')" required :error="errors.price" :hint="$t('product.unitCost')">
                <input
                  v-model="form.price"
                  type="number"
                  min="0"
                  step="0.01"
                  class="input num"
                  :class="errors.price && 'is-error'"
                  placeholder="0.00"
                />
              </FormField>

              <FormField :label="$t('product.memberPrice')" :error="errors.memberPrice" :hint="$t('product.memberPriceHint')">
                <input v-model="form.memberPrice" type="number" min="0" step="0.01" class="input num" placeholder="0.00" />
              </FormField>

              <FormField :label="$t('product.grossRate')" :hint="$t('product.grossFormula')">
                <div
                  class="flex items-center gap-2 px-3 rounded-md"
                  :style="{
                    height: '34px',
                    background: 'var(--c-surface-3)',
                    color: grossRate >= 0 ? 'var(--c-success)' : 'var(--c-danger)',
                  }"
                >
                  <Icon name="percent" :size="14" />
                  <span class="num font-medium">{{ percent(grossRate) }}</span>
                </div>
              </FormField>
            </div>
          </div>
        </div>

        <!-- 3. 库存与预警 -->
        <div class="card">
          <div class="panel-head">
            <div class="text-[14px] font-semibold">{{ $t('product.stockInfo') }}</div>
            <Icon name="package" :size="15" class="text-text-3" />
          </div>

          <div class="p-4">
            <div class="grid grid-cols-2 gap-3">
              <FormField
                :label="$t('product.currentStock')"
                :hint="isEdit ? $t('product.stockHintEdit') : $t('product.stockHintNew')"
              >
                <input :value="isEdit ? form.stock : 0" class="input num" disabled />
              </FormField>

              <FormField :label="$t('product.warnThreshold')" :error="errors.warnThreshold" :hint="$t('product.warnThresholdHint')">
                <input v-model="form.warnThreshold" type="number" min="0" class="input num" />
              </FormField>

              <FormField :label="$t('common.remark')" span="2">
                <textarea v-model="form.remark" rows="3" class="w-full" :placeholder="$t('product.remarkPlaceholderForm')" />
              </FormField>
            </div>
          </div>
        </div>

        <!-- 4. 变动记录（仅编辑模式） -->
        <div class="card">
          <div class="panel-head">
            <div>
              <div class="text-[14px] font-semibold">{{ $t('product.changeLog') }}</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">{{ $t('product.changeLogDesc') }}</div>
            </div>
            <Icon name="history" :size="15" class="text-text-3" />
          </div>

          <div class="p-2">
            <div v-if="!isEdit" class="empty py-6">
              <Icon name="info" :size="22" class="text-text-3 opacity-70" />
              <div class="text-[13px]">{{ $t('product.changeLogNewEmpty') }}</div>
              <div class="text-[12px] text-text-3">{{ $t('product.changeLogNewHint') }}</div>
            </div>

            <template v-else>
              <div v-if="logsLoading" class="space-y-2 p-2">
                <div v-for="i in 4" :key="i" class="skeleton" style="height: 30px" />
              </div>

              <div v-else-if="!logs.length" class="empty py-6">
                <Icon name="inbox" :size="22" class="text-text-3 opacity-70" />
                <div class="text-[13px]">{{ $t('product.changeLogEmpty') }}</div>
              </div>

              <div
                v-for="l in logs"
                v-else
                :key="l.id"
                class="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-hover"
              >
                <span class="badge" :class="LOG_TYPE_STYLE[l.type]?.class || 'badge-muted'">
                  {{ logTypeText(l) }}
                </span>
                <span class="flex-1 min-w-0 text-[12.5px] text-text-2 truncate">{{ l.reason || l.relatedNo || '—' }}</span>
                <span
                  class="num text-[12.5px] font-medium"
                  :style="{ color: Number(l.changeQty) >= 0 ? 'var(--c-success)' : 'var(--c-danger)' }"
                >
                  {{ Number(l.changeQty) >= 0 ? '+' : '' }}{{ l.changeQty }}{{ l.unit }}
                </span>
                <span class="num text-[12px] text-text-3 w-[62px] text-right">{{ l.afterQty }} {{ $t('product.stockBalance') }}</span>
                <span class="text-[12px] text-text-3 w-[110px] text-right truncate">{{ l.operator }}</span>
                <span class="text-[12px] text-text-3 w-[92px] text-right">{{ String(l.createdAt).slice(5, 16) }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 右侧：提示与摘要 -->
      <div class="space-y-3">
        <div class="card card-pad">
          <div class="flex items-center gap-2 mb-2">
            <Icon name="info" :size="15" :style="{ color: 'var(--c-primary)' }" />
            <div class="text-[13.5px] font-semibold">{{ $t('product.catTip') }}</div>
          </div>
          <ul class="text-[12.5px] text-text-2 space-y-1.5 leading-relaxed">
            <li>{{ $t('product.formTip1') }}</li>
            <li>{{ $t('product.formTip2') }}</li>
            <li>{{ $t('product.formTip3') }}</li>
          </ul>
        </div>

        <div class="card card-pad">
          <div class="text-[13.5px] font-semibold mb-3">{{ $t('product.summaryTitle') }}</div>
          <div class="space-y-2 text-[12.5px]">
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-3">{{ $t('product.name') }}</span>
              <span class="truncate">{{ form.name || '—' }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-3">{{ $t('product.barcode') }}</span>
              <span class="font-mono">{{ form.barcode || '—' }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-3">{{ $t('product.category') }}</span>
              <span>{{ categories.find((c) => c.id === form.categoryId)?.name || '—' }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-3">{{ $t('product.price') }}</span>
              <span class="price">{{ money(form.price) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-3">{{ $t('product.grossRate') }}</span>
              <span class="num" :style="{ color: 'var(--c-success)' }">{{ percent(grossRate) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-3">{{ $t('product.status') }}</span>
              <span class="badge" :class="form.status === 'active' ? 'badge-success' : 'badge-muted'">
                {{ form.status === 'active' ? $t('product.active') : $t('product.inactive') }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageShell>
</template>
