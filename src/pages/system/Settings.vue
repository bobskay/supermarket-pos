<script setup>
/**
 * 系统设置（店长专属）
 * ------------------------------------------------------------------
 * 配置项分四块：门店信息 / 收银设置 / 会员与积分 / 权限说明。
 * 左侧竖排 Tab 是「锚点式导航」：门店配置不多，用分段切换比长滚动表单更好定位，
 * 也让演示时讲解更聚焦（点哪讲哪）。
 * 表单结构与 GET /api/settings 返回一致（shop / pos），保存时原样 PUT 回去。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { settingApi } from '@/api'
import { money, clone, MEMBER_LEVEL_STYLE } from '@/utils/format'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import Icon from '@/components/ui/Icon.vue'
import Empty from '@/components/ui/Empty.vue'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import FormField from '@/components/ui/FormField.vue'
import SwitchBox from '@/components/ui/SwitchBox.vue'
import AppButton from '@/components/ui/AppButton.vue'

const toast = useToast()
const { isManager } = useAuth()

const SECTIONS = [
  { key: 'shop', label: '门店信息', desc: '用于小票抬头、报表页眉与门店档案', icon: 'store' },
  { key: 'pos', label: '收银设置', desc: '积分、折扣、抹零、支付与打印规则', icon: 'cart' },
  { key: 'member', label: '会员与积分', desc: '积分规则与会员等级权益说明', icon: 'members' },
  { key: 'permission', label: '权限说明', desc: '收银员与店长的功能权限对照', icon: 'shield' },
]
const active = ref('shop')

const ROUND_MODES = [
  { value: 'round', label: '四舍五入（round）' },
  { value: 'fen', label: '抹分（抹去分位）' },
  { value: 'jiao', label: '抹角（抹去角位）' },
]
const PAY_METHODS = [
  { value: 'cash', label: '现金' },
  { value: 'wechat', label: '微信' },
  { value: 'alipay', label: '支付宝' },
  { value: 'card', label: '储值卡' },
]
/** 会员等级权益：与会员新建页的说明保持一致，改政策时两处一起改 */
const BENEFITS = [
  { level: 'normal', name: '普通会员', rate: 1, discount: '无折扣' },
  { level: 'silver', name: '银卡会员', rate: 1, discount: '95 折' },
  { level: 'gold', name: '金卡会员', rate: 1.2, discount: '95 折' },
  { level: 'diamond', name: '钻石会员', rate: 1.5, discount: '9 折' },
]

const loading = ref(true)
const saving = ref(false)
const form = reactive({
  shop: { name: '', code: '', address: '', phone: '', license: '', manager: '' },
  pos: {
    pointsEnabled: true,
    pointsRate: 1,
    pointsDeductRate: 100,
    memberDiscount: true,
    roundMode: 'round',
    receiptFooter: '',
    autoPrint: false,
    defaultPayMethod: 'wechat',
    warnThreshold: 20,
  },
})
const roleMatrix = ref([])
const permissions = ref({})

async function load() {
  loading.value = true
  try {
    const res = await settingApi.detail()
    const d = res.data || {}
    // 深拷贝一份到表单，避免直接改到接口返回的数据（演示环境里那是共享内存）
    Object.assign(form.shop, clone(d.shop || {}))
    Object.assign(form.pos, clone(d.pos || {}))
    roleMatrix.value = d.roleMatrix || []
    permissions.value = d.permissions || {}
  } finally {
    loading.value = false
  }
}
onMounted(load)

const currentSection = computed(() => SECTIONS.find((s) => s.key === active.value) || SECTIONS[0])

const roundModeName = computed(
  () => ROUND_MODES.find((r) => r.value === form.pos.roundMode)?.label || form.pos.roundMode,
)
const payMethodName = computed(
  () => PAY_METHODS.find((p) => p.value === form.pos.defaultPayMethod)?.label || form.pos.defaultPayMethod,
)

/** 积分规则文案：让店长一眼看懂「怎么送、怎么抵」 */
const pointsRule = computed(() => {
  if (!form.pos.pointsEnabled) return '当前已关闭积分抵扣，消费不再累计积分，也不能用积分抵现。'
  return `每消费 1 元累计 ${form.pos.pointsRate} 分；${form.pos.pointsDeductRate} 积分可抵扣 1 元。`
})

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    const res = await settingApi.update(clone({ shop: form.shop, pos: form.pos }))
    toast.ok(res.message || '设置已保存')
  } finally {
    saving.value = false
  }
}

function navStyle(key) {
  return active.value === key
    ? { background: 'var(--c-primary-soft)', color: 'var(--c-primary)', fontWeight: 500 }
    : { color: 'var(--c-text-2)' }
}
</script>

<template>
  <PageShell>
    <PageHeader
      title="系统设置"
      desc="门店档案、收银规则、会员积分与角色权限集中配置；设置对所有收银终端即时生效"
      icon="settings"
    >
      <template #actions>
        <AppButton icon="refresh" @click="load">重新加载</AppButton>
        <AppButton variant="primary" icon="save" :loading="saving" :disabled="!isManager" @click="save">
          保存设置
        </AppButton>
      </template>
    </PageHeader>

    <div v-if="!isManager" class="card">
      <Empty
        icon="lock"
        title="当前角色无权修改系统设置"
        desc="系统设置属于店长专属模块，请使用店长账号（admin）登录后访问。"
        :size="92"
      />
    </div>

    <template v-else>
      <div class="grid grid-cols-1 xl:grid-cols-[208px_1fr] gap-3">
        <!-- 左侧竖向 Tab -->
        <div class="card card-pad h-max">
          <div class="text-[11.5px] text-text-3 px-3 pb-2">设置分区</div>
          <div class="space-y-1">
            <button
              v-for="s in SECTIONS"
              :key="s.key"
              class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[13px] transition-colors hover:bg-hover text-left"
              :style="navStyle(s.key)"
              @click="active = s.key"
            >
              <Icon :name="s.icon" :size="15" />
              <span class="flex-1">{{ s.label }}</span>
              <Icon v-if="active === s.key" name="chevronRight" :size="13" />
            </button>
          </div>

          <div class="divider my-3" />
          <div class="px-1 text-[11.5px] text-text-3 leading-relaxed">
            设置保存后立即对收银台与库存模块生效，请确认无误后再保存。
          </div>
        </div>

        <!-- 右侧面板 -->
        <div class="card min-w-0">
          <div class="panel-head">
            <div>
              <div class="text-[14px] font-semibold">{{ currentSection.label }}</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">{{ currentSection.desc }}</div>
            </div>
            <span class="badge badge-muted">仅店长可修改</span>
          </div>

          <div v-if="loading" class="p-4 grid grid-cols-2 gap-3">
            <div v-for="i in 8" :key="i" class="skeleton" style="height: 34px" />
          </div>

          <template v-else>
            <!-- 门店信息 -->
            <div v-if="active === 'shop'" class="p-4">
              <div class="text-[12.5px] text-text-3 mb-3">这些信息会打印在小票抬头，并作为报表的统计主体。</div>
              <div class="grid grid-cols-2 gap-3">
                <FormField label="门店名称" required>
                  <input v-model="form.shop.name" class="input w-full" placeholder="如：惠民生活超市（中心店）" />
                </FormField>
                <FormField label="门店编码" hint="用于对账与多门店区分">
                  <input v-model="form.shop.code" class="input w-full font-mono" placeholder="如：HM-001" />
                </FormField>
                <FormField label="联系电话">
                  <input v-model="form.shop.phone" class="input w-full" placeholder="固定电话或手机号" />
                </FormField>
                <FormField label="店长姓名">
                  <input v-model="form.shop.manager" class="input w-full" placeholder="门店负责人" />
                </FormField>
                <FormField label="门店地址" span="2">
                  <input v-model="form.shop.address" class="input w-full" placeholder="省 / 市 / 区 + 详细地址" />
                </FormField>
                <FormField label="营业执照号" span="2" hint="与营业执照保持一致，用于监管备查">
                  <input v-model="form.shop.license" class="input w-full font-mono" placeholder="统一社会信用代码" />
                </FormField>
              </div>
            </div>

            <!-- 收银设置 -->
            <div v-else-if="active === 'pos'" class="p-4">
              <div class="text-[12.5px] text-text-3 mb-3">
                以下规则会在收银台结算时实时生效：积分累计、会员折扣、抹零与默认支付方式。
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div class="card card-pad" :style="{ background: 'var(--c-surface-2)' }">
                  <SwitchBox
                    v-model="form.pos.pointsEnabled"
                    label="启用积分抵扣"
                    hint="关闭后消费不再累计积分，也不能用积分抵现"
                  />
                </div>
                <div class="card card-pad" :style="{ background: 'var(--c-surface-2)' }">
                  <SwitchBox
                    v-model="form.pos.memberDiscount"
                    label="启用会员折扣"
                    hint="按会员等级自动计算折扣（银卡 95 折 / 钻石 9 折）"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 mt-3">
                <FormField label="每消费 1 元累计积分" hint="通常为 1，金卡 / 钻石会员在收银台按倍率上浮">
                  <input v-model.number="form.pos.pointsRate" type="number" min="0" class="input w-full num" />
                </FormField>
                <FormField label="多少积分抵扣 1 元" hint="默认 100 积分 = 1 元">
                  <input v-model.number="form.pos.pointsDeductRate" type="number" min="1" class="input w-full num" />
                </FormField>
                <FormField label="抹零方式" hint="结算时对分位 / 角位的处理规则">
                  <select v-model="form.pos.roundMode" class="input w-full">
                    <option v-for="r in ROUND_MODES" :key="r.value" :value="r.value">{{ r.label }}</option>
                  </select>
                </FormField>
                <FormField label="默认支付方式" hint="收银台打开时预选的支付方式">
                  <select v-model="form.pos.defaultPayMethod" class="input w-full">
                    <option v-for="p in PAY_METHODS" :key="p.value" :value="p.value">{{ p.label }}</option>
                  </select>
                </FormField>
                <FormField label="库存预警默认阈值" hint="新增商品时的默认预警数量，低于该值触发提醒">
                  <input v-model.number="form.pos.warnThreshold" type="number" min="0" class="input w-full num" />
                </FormField>
                <div class="card card-pad flex items-center" :style="{ background: 'var(--c-surface-2)' }">
                  <SwitchBox
                    v-model="form.pos.autoPrint"
                    label="结算后自动打印小票"
                    hint="开启后每笔结算自动调用一次打印"
                  />
                </div>
                <FormField label="小票页脚文案" span="2" hint="打印在小票最下方，可用于会员日、退换货说明">
                  <textarea
                    v-model="form.pos.receiptFooter"
                    class="w-full"
                    rows="2"
                    placeholder="如：谢谢光临，欢迎下次惠顾！"
                  />
                </FormField>
              </div>
            </div>

            <!-- 会员与积分 -->
            <div v-else-if="active === 'member'" class="p-4">
              <div class="text-[12.5px] text-text-3 mb-3">
                会员权益由「折扣」与「积分倍率」两部分组成，收银台绑定会员后自动套用。
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div class="card">
                  <div class="panel-head">
                    <div class="text-[13.5px] font-semibold">等级权益</div>
                    <span class="text-[11.5px] text-text-3">折扣 / 积分倍率</span>
                  </div>
                  <table class="table-flat">
                    <thead>
                      <tr>
                        <th>等级</th>
                        <th class="text-right">会员折扣</th>
                        <th class="text-right">积分倍率</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="b in BENEFITS" :key="b.level">
                        <td><span class="badge" :class="MEMBER_LEVEL_STYLE[b.level]">{{ b.name }}</span></td>
                        <td class="text-right">{{ b.discount }}</td>
                        <td class="text-right num">{{ b.rate }}x</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="space-y-3">
                  <div class="card card-pad">
                    <div class="text-[13.5px] font-semibold mb-2">积分规则</div>
                    <div class="text-[12.5px] text-text-2 leading-relaxed">{{ pointsRule }}</div>
                    <div class="divider my-3" />
                    <ul class="space-y-1.5 text-[12px] text-text-3 leading-relaxed">
                      <li>· 积分按实收金额（扣除折扣与积分抵扣后）计算，四舍五入取整。</li>
                      <li>· 订单退款时同步扣回该笔订单已累计的积分。</li>
                      <li>· 积分不可提现、不可转让，仅限本门店消费抵扣。</li>
                    </ul>
                  </div>

                  <div class="card card-pad">
                    <div class="text-[13.5px] font-semibold mb-3">当前配置摘要</div>
                    <div class="space-y-2 text-[12.5px]">
                      <div class="flex items-center justify-between">
                        <span class="text-text-2">积分抵扣</span>
                        <span class="badge" :class="form.pos.pointsEnabled ? 'badge-success' : 'badge-muted'">
                          {{ form.pos.pointsEnabled ? '已启用' : '已关闭' }}
                        </span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-text-2">会员折扣</span>
                        <span class="badge" :class="form.pos.memberDiscount ? 'badge-success' : 'badge-muted'">
                          {{ form.pos.memberDiscount ? '已启用' : '已关闭' }}
                        </span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-text-2">累计倍率</span>
                        <span class="num">每 1 元 {{ form.pos.pointsRate }} 分</span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-text-2">抵扣比例</span>
                        <span class="num">{{ form.pos.pointsDeductRate }} 分 = {{ money(1) }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-text-2">抹零方式</span>
                        <span>{{ roundModeName }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-text-2">默认支付</span>
                        <span>{{ payMethodName }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 权限说明 -->
            <div v-else class="p-4">
              <div class="text-[12.5px] text-text-3 mb-3">
                权限决定菜单可见性与接口访问范围；收银员账号始终只能查看本人订单，不能查看全店数据。
              </div>

              <table class="table-flat">
                <thead>
                  <tr>
                    <th>功能模块</th>
                    <th class="text-center" style="width: 120px">收银员</th>
                    <th class="text-center" style="width: 120px">店长</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in roleMatrix" :key="r.module">
                    <td>{{ r.module }}</td>
                    <td class="text-center">
                      <Icon
                        :name="r.cashier ? 'check' : 'close'"
                        :size="15"
                        :style="{ color: r.cashier ? 'var(--c-success)' : 'var(--c-text-3)' }"
                      />
                    </td>
                    <td class="text-center">
                      <Icon
                        :name="r.manager ? 'check' : 'close'"
                        :size="15"
                        :style="{ color: r.manager ? 'var(--c-success)' : 'var(--c-text-3)' }"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>

              <div class="card card-pad mt-3" :style="{ background: 'var(--c-surface-2)' }">
                <div class="text-[13px] font-semibold mb-2">收银员接口权限清单</div>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="p in permissions.cashier || []" :key="p" class="badge badge-info font-mono">{{ p }}</span>
                  <span v-if="!(permissions.cashier || []).length" class="text-[12px] text-text-3">暂无配置</span>
                </div>
                <div class="text-[11.5px] text-text-3 mt-2.5 leading-relaxed">
                  店长的权限为 <code class="font-mono text-text-2">*</code>（全部），因此在列表中以全选显示。
                </div>
              </div>
            </div>
          </template>

          <div class="px-4 py-3 border-t border-line flex items-center justify-between gap-2 flex-wrap">
            <span class="text-[11.5px] text-text-3">
              修改后请记得点击保存，未保存的改动不会生效。
            </span>
            <div class="flex items-center gap-2">
              <AppButton icon="refresh" @click="load">放弃修改</AppButton>
              <AppButton variant="primary" icon="save" :loading="saving" @click="save">保存设置</AppButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </PageShell>
</template>
