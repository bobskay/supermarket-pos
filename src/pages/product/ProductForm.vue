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
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FormField from '@/components/ui/FormField.vue'
import Icon from '@/components/ui/Icon.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { isManager } = useAuth()

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
    toast.error('请选择图片文件（JPG / PNG / WebP / SVG）')
    return
  }
  if (file.size > MAX_IMAGE_SIZE) {
    toast.error(`图片不能超过 2MB，当前 ${(file.size / 1024 / 1024).toFixed(1)}MB`)
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    form.value.image = String(reader.result || '')
    imageError.value = false
    toast.success(`已选择图片：${file.name}`)
  }
  reader.onerror = () => toast.error('图片读取失败，请重试')
  reader.readAsDataURL(file)
  // 清空 input，保证连续选同一个文件也能触发 change
  e.target.value = ''
}

function clearImage() {
  form.value.image = ''
  imageError.value = false
  toast.info('已移除商品图片')
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
  if (!barcode) e.barcode = '条码不能为空'
  else if (!/^\d{8,13}$/.test(barcode)) e.barcode = '条码需为 8-13 位数字'
  if (!String(f.name || '').trim()) e.name = '商品名称不能为空'
  if (!f.categoryId) e.categoryId = '请选择商品分类'
  if (f.price === '' || Number(f.price) <= 0) e.price = '售价必须大于 0'
  if (f.costPrice !== '' && Number(f.costPrice) < 0) e.costPrice = '进价不能小于 0'
  if (f.costPrice !== '' && Number(f.costPrice) > Number(f.price)) e.costPrice = '进价不应高于售价'
  if (f.memberPrice !== '' && Number(f.memberPrice) > Number(f.price)) e.memberPrice = '会员价不能高于售价'
  if (f.warnThreshold !== '' && Number(f.warnThreshold) < 0) e.warnThreshold = '预警阈值不能为负数'
  errors.value = e
  return Object.keys(e).length === 0
}

async function onSave() {
  if (!isManager.value) {
    toast.warning('仅店长可以保存商品信息')
    return
  }
  if (!validate()) {
    toast.warning('请先修正表单中的错误')
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
  toast.ok('保存成功')
  router.push({ name: 'products' })
}

function onCancel() {
  router.push({ name: 'products' })
}

function goBack() {
  router.push({ name: 'products' })
}

/** 流水类型 → 徽章配色：入库为绿，其余为警示色系 */
const LOG_TYPE_STYLE = {
  purchase: { label: '采购入库', class: 'badge-success' },
  loss: { label: '报损', class: 'badge-danger' },
  damage: { label: '损坏', class: 'badge-warning' },
  check: { label: '盘点调整', class: 'badge-info' },
}
</script>

<template>
  <PageShell>
    <PageHeader
      :title="isEdit ? '编辑商品' : '新增商品'"
      :desc="isEdit ? `商品编号 ${productId} · 修改后请保存` : '录入新商品的基础信息、价格与库存预警'"
      icon="product"
    >
      <template #actions>
        <AppButton icon="arrowLeft" @click="goBack">返回</AppButton>
        <AppButton @click="onCancel">取消</AppButton>
        <AppButton variant="primary" icon="save" :loading="saving" @click="onSave">保存</AppButton>
      </template>
    </PageHeader>

    <div v-if="!isManager" class="card card-pad mb-3 flex items-start gap-2.5">
      <Icon name="lock" :size="16" :style="{ color: 'var(--c-warning)' }" />
      <div class="text-[12.5px] text-text-2">
        <span class="font-medium text-text">权限不足</span>：商品档案为店长专属功能，收银员只能查看表单，无法保存。
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-3 items-start">
      <!-- 左侧：表单分区 -->
      <div class="space-y-3 min-w-0">
        <!-- 1. 基础信息 -->
        <div class="card">
          <div class="panel-head">
            <div>
              <div class="text-[14px] font-semibold">基础信息</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">条码可用扫码枪直接扫入，回车即完成输入</div>
            </div>
            <Icon name="tag" :size="15" class="text-text-3" />
          </div>

          <div class="p-4">
            <div v-if="loading" class="space-y-3">
              <div v-for="i in 6" :key="i" class="skeleton" style="height: 34px" />
            </div>

            <div v-else class="grid grid-cols-2 gap-3">
              <FormField label="条码" required :error="errors.barcode" hint="8-13 位数字" span="2">
                <div class="flex items-center gap-2">
                  <input
                    v-model="form.barcode"
                    class="input flex-1 font-mono"
                    :class="errors.barcode && 'is-error'"
                    placeholder="扫码枪扫描或手动输入"
                  />
                  <AppButton icon="barcode" @click="fillBarcode">生成条码</AppButton>
                </div>
              </FormField>

              <FormField label="商品名称" required :error="errors.name" span="2">
                <input
                  v-model="form.name"
                  class="input"
                  :class="errors.name && 'is-error'"
                  placeholder="如：红富士苹果"
                />
              </FormField>

              <!-- 商品图片：支持上传本地图片，也可以直接填图片路径 -->
              <FormField label="商品图片" span="2" hint="支持 JPG / PNG / WebP / SVG，建议方形图，大小不超过 2MB">
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
                      alt="商品图片预览"
                      class="w-full h-full object-cover"
                      @error="imageError = true"
                    />
                    <div v-else class="flex flex-col items-center gap-1 text-text-3">
                      <Icon name="product" :size="24" />
                      <span class="text-[10.5px]">暂无图片</span>
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
                      <AppButton icon="upload" @click="fileInput?.click()">上传图片</AppButton>
                      <AppButton v-if="form.image" icon="trash" variant="default" @click="clearImage">
                        移除图片
                      </AppButton>
                    </div>
                    <input
                      v-model="form.image"
                      class="input font-mono text-[12.5px]"
                      placeholder="或直接填写图片地址，例如 /products/p0001.svg"
                      @input="imageError = false"
                    />
                    <div v-if="imageError" class="field-error">
                      图片无法加载，请检查路径是否正确
                    </div>
                    <div v-else class="text-[11.5px] text-text-3">
                      上传的图片以 Base64 保存在当前页面，刷新后恢复初始图片路径。
                    </div>
                  </div>
                </div>
              </FormField>

              <FormField label="分类" required :error="errors.categoryId">
                <select v-model="form.categoryId" class="input" :class="errors.categoryId && 'is-error'">
                  <option value="">请选择分类</option>
                  <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </FormField>

              <FormField label="单位">
                <select v-model="form.unit" class="input">
                  <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
                </select>
              </FormField>

              <FormField label="状态" span="2" hint="停用后收银台无法扫码销售">
                <div class="seg">
                  <button
                    type="button"
                    class="seg-item"
                    :class="form.status === 'active' && 'is-active'"
                    @click="form.status = 'active'"
                  >
                    在售
                  </button>
                  <button
                    type="button"
                    class="seg-item"
                    :class="form.status === 'inactive' && 'is-active'"
                    @click="form.status = 'inactive'"
                  >
                    停用
                  </button>
                </div>
              </FormField>
            </div>
          </div>
        </div>

        <!-- 2. 价格信息 -->
        <div class="card">
          <div class="panel-head">
            <div class="text-[14px] font-semibold">价格信息</div>
            <Icon name="money" :size="15" class="text-text-3" />
          </div>

          <div class="p-4">
            <div v-if="loading" class="space-y-3">
              <div v-for="i in 4" :key="i" class="skeleton" style="height: 34px" />
            </div>

            <div v-else class="grid grid-cols-2 gap-3">
              <FormField label="进价" :error="errors.costPrice" hint="元 / 单位">
                <input v-model="form.costPrice" type="number" min="0" step="0.01" class="input num" placeholder="0.00" />
              </FormField>

              <FormField label="售价" required :error="errors.price" hint="元 / 单位">
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

              <FormField label="会员价" :error="errors.memberPrice" hint="需 ≤ 售价，留空同售价">
                <input v-model="form.memberPrice" type="number" min="0" step="0.01" class="input num" placeholder="0.00" />
              </FormField>

              <FormField label="毛利率" hint="(售价 - 进价) ÷ 售价">
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
            <div class="text-[14px] font-semibold">库存与预警</div>
            <Icon name="package" :size="15" class="text-text-3" />
          </div>

          <div class="p-4">
            <div class="grid grid-cols-2 gap-3">
              <FormField
                label="当前库存"
                :hint="isEdit ? '库存由入库/盘点流水维护，此处只读' : '新商品初始库存为 0，入库后自动更新'"
              >
                <input :value="isEdit ? form.stock : 0" class="input num" disabled />
              </FormField>

              <FormField label="预警阈值" :error="errors.warnThreshold" hint="库存低于该值触发预警">
                <input v-model="form.warnThreshold" type="number" min="0" class="input num" />
              </FormField>

              <FormField label="备注" span="2">
                <textarea v-model="form.remark" rows="3" class="w-full" placeholder="选填，如供货要求、陈列位置、损耗说明" />
              </FormField>
            </div>
          </div>
        </div>

        <!-- 4. 变动记录（仅编辑模式） -->
        <div class="card">
          <div class="panel-head">
            <div>
              <div class="text-[14px] font-semibold">变动记录</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">该商品最近 8 条库存流水</div>
            </div>
            <Icon name="history" :size="15" class="text-text-3" />
          </div>

          <div class="p-2">
            <div v-if="!isEdit" class="empty py-6">
              <Icon name="info" :size="22" class="text-text-3 opacity-70" />
              <div class="text-[13px]">新增模式下暂无变动记录</div>
              <div class="text-[12px] text-text-3">保存商品后可在库存流水页查看出入库明细</div>
            </div>

            <template v-else>
              <div v-if="logsLoading" class="space-y-2 p-2">
                <div v-for="i in 4" :key="i" class="skeleton" style="height: 30px" />
              </div>

              <div v-else-if="!logs.length" class="empty py-6">
                <Icon name="inbox" :size="22" class="text-text-3 opacity-70" />
                <div class="text-[13px]">暂无库存流水</div>
              </div>

              <div
                v-for="l in logs"
                v-else
                :key="l.id"
                class="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-hover"
              >
                <span class="badge" :class="LOG_TYPE_STYLE[l.type]?.class || 'badge-muted'">
                  {{ LOG_TYPE_STYLE[l.type]?.label || l.typeName || '调整' }}
                </span>
                <span class="flex-1 min-w-0 text-[12.5px] text-text-2 truncate">{{ l.reason || l.relatedNo || '—' }}</span>
                <span
                  class="num text-[12.5px] font-medium"
                  :style="{ color: Number(l.changeQty) >= 0 ? 'var(--c-success)' : 'var(--c-danger)' }"
                >
                  {{ Number(l.changeQty) >= 0 ? '+' : '' }}{{ l.changeQty }}{{ l.unit }}
                </span>
                <span class="num text-[12px] text-text-3 w-[62px] text-right">{{ l.afterQty }} 结存</span>
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
            <div class="text-[13.5px] font-semibold">小提示</div>
          </div>
          <ul class="text-[12.5px] text-text-2 space-y-1.5 leading-relaxed">
            <li>条码建议 13 位，扫码枪扫入后会自动补全。</li>
            <li>会员价留空时默认与售价一致。</li>
            <li>库存请通过采购入库或库存调整维护。</li>
          </ul>
        </div>

        <div class="card card-pad">
          <div class="text-[13.5px] font-semibold mb-3">当前填写摘要</div>
          <div class="space-y-2 text-[12.5px]">
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-3">商品名称</span>
              <span class="truncate">{{ form.name || '—' }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-3">条码</span>
              <span class="font-mono">{{ form.barcode || '—' }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-3">分类</span>
              <span>{{ categories.find((c) => c.id === form.categoryId)?.name || '—' }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-3">售价</span>
              <span class="price">{{ money(form.price) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-3">毛利率</span>
              <span class="num" :style="{ color: 'var(--c-success)' }">{{ percent(grossRate) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-3">状态</span>
              <span class="badge" :class="form.status === 'active' ? 'badge-success' : 'badge-muted'">
                {{ form.status === 'active' ? '在售' : '停用' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageShell>
</template>
