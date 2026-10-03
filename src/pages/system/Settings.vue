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
import { useI18n } from '@/i18n'
import Icon from '@/components/ui/Icon.vue'
import Empty from '@/components/ui/Empty.vue'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import FormField from '@/components/ui/FormField.vue'
import SwitchBox from '@/components/ui/SwitchBox.vue'
import AppButton from '@/components/ui/AppButton.vue'

const toast = useToast()
const { isManager } = useAuth()
const { t, tl } = useI18n()

const SECTIONS = [
  { key: 'shop', labelKey: 'settings.tabShop', descKey: 'settings.tabShopDesc', icon: 'store' },
  { key: 'pos', labelKey: 'settings.tabPos', descKey: 'settings.tabPosDesc', icon: 'cart' },
  { key: 'member', labelKey: 'settings.tabMember', descKey: 'settings.tabMemberDesc', icon: 'members' },
  { key: 'permission', labelKey: 'settings.tabPermission', descKey: 'settings.tabPermissionDesc', icon: 'shield' },
]
const active = ref('shop')

const ROUND_MODES = [
  { value: 'round', labelKey: 'settings.roundRoundFull' },
  { value: 'fen', labelKey: 'settings.roundDownFull' },
  { value: 'jiao', labelKey: 'settings.roundJiaoFull' },
]
const PAY_METHODS = [
  { value: 'cash', labelKey: 'pos.cash' },
  { value: 'wechat', labelKey: 'pos.wechat' },
  { value: 'alipay', labelKey: 'pos.alipay' },
  { value: 'card', labelKey: 'pos.storedCard' },
]
/** 会员等级权益：与会员新建页的说明保持一致，改政策时两处一起改 */
const BENEFITS = [
  { level: 'normal', nameKey: 'settings.memberLevelNormal', rate: 1, discountKey: 'settings.discountNone' },
  { level: 'silver', nameKey: 'settings.memberLevelSilver', rate: 1, discountKey: 'settings.discount95' },
  { level: 'gold', nameKey: 'settings.memberLevelGold', rate: 1.2, discountKey: 'settings.discount95' },
  { level: 'diamond', nameKey: 'settings.memberLevelDiamond', rate: 1.5, discountKey: 'settings.discount90' },
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

const roundModeName = computed(() => {
  const hit = ROUND_MODES.find((r) => r.value === form.pos.roundMode)
  return hit ? t(hit.labelKey) : form.pos.roundMode
})
const payMethodName = computed(() => {
  const hit = PAY_METHODS.find((p) => p.value === form.pos.defaultPayMethod)
  return hit ? t(hit.labelKey) : form.pos.defaultPayMethod
})

/** 积分规则文案：让店长一眼看懂「怎么送、怎么抵」 */
const pointsRule = computed(() => {
  if (!form.pos.pointsEnabled) return t('settings.pointsRuleOff')
  return t('settings.pointsRuleOn', { rate: form.pos.pointsRate, deduct: form.pos.pointsDeductRate })
})

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    const res = await settingApi.update(clone({ shop: form.shop, pos: form.pos }))
    toast.ok(t('settings.saveOk') || res.message)
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
      :title="$t('settings.title')"
      :desc="$t('settings.desc')"
      icon="settings"
    >
      <template #actions>
        <AppButton icon="refresh" @click="load">{{ $t('settings.reload') }}</AppButton>
        <AppButton variant="primary" icon="save" :loading="saving" :disabled="!isManager" @click="save">
          {{ $t('settings.save') }}
        </AppButton>
      </template>
    </PageHeader>

    <div v-if="!isManager" class="card">
      <Empty
        icon="lock"
        :title="$t('settings.noPermissionTitle')"
        :desc="$t('settings.noPermissionDesc')"
        :size="92"
      />
    </div>

    <template v-else>
      <div class="grid grid-cols-1 xl:grid-cols-[208px_1fr] gap-3">
        <!-- 左侧竖向 Tab -->
        <div class="card card-pad h-max">
          <div class="text-[11.5px] text-text-3 px-3 pb-2">{{ $t('settings.sectionLabel') }}</div>
          <div class="space-y-1">
            <button
              v-for="s in SECTIONS"
              :key="s.key"
              class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[13px] transition-colors hover:bg-hover text-left"
              :style="navStyle(s.key)"
              @click="active = s.key"
            >
              <Icon :name="s.icon" :size="15" />
              <span class="flex-1">{{ $t(s.labelKey) }}</span>
              <Icon v-if="active === s.key" name="chevronRight" :size="13" />
            </button>
          </div>

          <div class="divider my-3" />
          <div class="px-1 text-[11.5px] text-text-3 leading-relaxed">
            {{ $t('settings.sectionTip') }}
          </div>
        </div>

        <!-- 右侧面板 -->
        <div class="card min-w-0">
          <div class="panel-head">
            <div>
              <div class="text-[14px] font-semibold">{{ $t(currentSection.labelKey) }}</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">{{ $t(currentSection.descKey) }}</div>
            </div>
            <span class="badge badge-muted">{{ $t('settings.onlyManager') }}</span>
          </div>

          <div v-if="loading" class="p-4 grid grid-cols-2 gap-3">
            <div v-for="i in 8" :key="i" class="skeleton" style="height: 34px" />
          </div>

          <template v-else>
            <!-- 门店信息 -->
            <div v-if="active === 'shop'" class="p-4">
              <div class="text-[12.5px] text-text-3 mb-3">{{ $t('settings.shopTip') }}</div>
              <div class="grid grid-cols-2 gap-3">
                <FormField :label="$t('settings.shopName')" required>
                  <input v-model="form.shop.name" class="input w-full" :placeholder="$t('settings.shopNamePlaceholder')" />
                </FormField>
                <FormField :label="$t('settings.shopCode')" :hint="$t('settings.shopCodeHint')">
                  <input v-model="form.shop.code" class="input w-full font-mono" :placeholder="$t('settings.shopCodePlaceholder')" />
                </FormField>
                <FormField :label="$t('settings.shopPhone')">
                  <input v-model="form.shop.phone" class="input w-full" :placeholder="$t('settings.shopPhonePlaceholder')" />
                </FormField>
                <FormField :label="$t('settings.shopManager')">
                  <input v-model="form.shop.manager" class="input w-full" :placeholder="$t('settings.shopManagerPlaceholder')" />
                </FormField>
                <FormField :label="$t('settings.shopAddress')" span="2">
                  <input v-model="form.shop.address" class="input w-full" :placeholder="$t('settings.shopAddressPlaceholder')" />
                </FormField>
                <FormField :label="$t('settings.shopLicense')" span="2" :hint="$t('settings.shopLicenseHint')">
                  <input v-model="form.shop.license" class="input w-full font-mono" :placeholder="$t('settings.shopLicensePlaceholder')" />
                </FormField>
              </div>
            </div>

            <!-- 收银设置 -->
            <div v-else-if="active === 'pos'" class="p-4">
              <div class="text-[12.5px] text-text-3 mb-3">
                {{ $t('settings.posTip') }}
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div class="card card-pad" :style="{ background: 'var(--c-surface-2)' }">
                  <SwitchBox
                    v-model="form.pos.pointsEnabled"
                    :label="$t('settings.pointsEnabled')"
                    :hint="$t('settings.pointsEnabledHint')"
                  />
                </div>
                <div class="card card-pad" :style="{ background: 'var(--c-surface-2)' }">
                  <SwitchBox
                    v-model="form.pos.memberDiscount"
                    :label="$t('settings.memberDiscount')"
                    :hint="$t('settings.memberDiscountHint')"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 mt-3">
                <FormField :label="$t('settings.pointsRate')" :hint="$t('settings.pointsRateHint')">
                  <input v-model.number="form.pos.pointsRate" type="number" min="0" class="input w-full num" />
                </FormField>
                <FormField :label="$t('settings.pointsDeductRate')" :hint="$t('settings.pointsDeductRateHint')">
                  <input v-model.number="form.pos.pointsDeductRate" type="number" min="1" class="input w-full num" />
                </FormField>
                <FormField :label="$t('settings.roundMode')" :hint="$t('settings.roundModeHint')">
                  <select v-model="form.pos.roundMode" class="input w-full">
                    <option v-for="r in ROUND_MODES" :key="r.value" :value="r.value">{{ $t(r.labelKey) }}</option>
                  </select>
                </FormField>
                <FormField :label="$t('settings.defaultPayMethod')" :hint="$t('settings.defaultPayMethodHint')">
                  <select v-model="form.pos.defaultPayMethod" class="input w-full">
                    <option v-for="p in PAY_METHODS" :key="p.value" :value="p.value">{{ $t(p.labelKey) }}</option>
                  </select>
                </FormField>
                <FormField :label="$t('settings.warnThresholdLabel')" :hint="$t('settings.warnThresholdHint')">
                  <input v-model.number="form.pos.warnThreshold" type="number" min="0" class="input w-full num" />
                </FormField>
                <div class="card card-pad flex items-center" :style="{ background: 'var(--c-surface-2)' }">
                  <SwitchBox
                    v-model="form.pos.autoPrint"
                    :label="$t('settings.autoPrintLabel')"
                    :hint="$t('settings.autoPrintHint')"
                  />
                </div>
                <FormField :label="$t('settings.receiptFooter')" span="2" :hint="$t('settings.receiptFooterHint')">
                  <textarea
                    v-model="form.pos.receiptFooter"
                    class="w-full"
                    rows="2"
                    :placeholder="$t('settings.receiptFooterPlaceholder')"
                  />
                </FormField>
              </div>
            </div>

            <!-- 会员与积分 -->
            <div v-else-if="active === 'member'" class="p-4">
              <div class="text-[12.5px] text-text-3 mb-3">
                {{ $t('settings.memberTip') }}
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div class="card">
                  <div class="panel-head">
                    <div class="text-[13.5px] font-semibold">{{ $t('settings.benefitTitle') }}</div>
                    <span class="text-[11.5px] text-text-3">{{ $t('settings.benefitTableTip') }}</span>
                  </div>
                  <table class="table-flat">
                    <thead>
                      <tr>
                        <th>{{ $t('settings.benefitLevelColumn') }}</th>
                        <th class="text-right">{{ $t('settings.benefitDiscountColumn') }}</th>
                        <th class="text-right">{{ $t('settings.benefitPointsColumn') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="b in BENEFITS" :key="b.level">
                        <td><span class="badge" :class="MEMBER_LEVEL_STYLE[b.level]">{{ $t(b.nameKey) }}</span></td>
                        <td class="text-right">{{ $t(b.discountKey) }}</td>
                        <td class="text-right num">{{ b.rate }}x</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="space-y-3">
                  <div class="card card-pad">
                    <div class="text-[13.5px] font-semibold mb-2">{{ $t('settings.pointsRule') }}</div>
                    <div class="text-[12.5px] text-text-2 leading-relaxed">{{ pointsRule }}</div>
                    <div class="divider my-3" />
                    <ul class="space-y-1.5 text-[12px] text-text-3 leading-relaxed">
                      <li>{{ $t('settings.pointsRuleNote1') }}</li>
                      <li>{{ $t('settings.pointsRuleNote2') }}</li>
                      <li>{{ $t('settings.pointsRuleNote3') }}</li>
                    </ul>
                  </div>

                  <div class="card card-pad">
                    <div class="text-[13.5px] font-semibold mb-3">{{ $t('settings.pointsRuleNow') }}</div>
                    <div class="space-y-2 text-[12.5px]">
                      <div class="flex items-center justify-between">
                        <span class="text-text-2">{{ $t('settings.summaryPointsDeduct') }}</span>
                        <span class="badge" :class="form.pos.pointsEnabled ? 'badge-success' : 'badge-muted'">
                          {{ form.pos.pointsEnabled ? $t('settings.statusOn') : $t('settings.statusOff') }}
                        </span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-text-2">{{ $t('settings.summaryMemberDiscount') }}</span>
                        <span class="badge" :class="form.pos.memberDiscount ? 'badge-success' : 'badge-muted'">
                          {{ form.pos.memberDiscount ? $t('settings.statusOn') : $t('settings.statusOff') }}
                        </span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-text-2">{{ $t('settings.summaryRate') }}</span>
                        <span class="num">{{ $t('settings.summaryRateValue', { rate: form.pos.pointsRate }) }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-text-2">{{ $t('settings.summaryDeductRate') }}</span>
                        <span class="num">{{ $t('settings.summaryDeductValue', { points: form.pos.pointsDeductRate, amount: money(1) }) }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-text-2">{{ $t('settings.summaryRoundMode') }}</span>
                        <span>{{ roundModeName }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-text-2">{{ $t('settings.summaryDefaultPay') }}</span>
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
                {{ $t('settings.permissionTip') }}
              </div>

              <table class="table-flat">
                <thead>
                  <tr>
                    <th>{{ $t('settings.moduleColumn') }}</th>
                    <th class="text-center" style="width: 120px">{{ $t('settings.cashierColumn') }}</th>
                    <th class="text-center" style="width: 120px">{{ $t('settings.managerColumn') }}</th>
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
                <div class="text-[13px] font-semibold mb-2">{{ $t('settings.cashierPermTitle') }}</div>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="p in permissions.cashier || []" :key="p" class="badge badge-info font-mono">{{ p }}</span>
                  <span v-if="!(permissions.cashier || []).length" class="text-[12px] text-text-3">{{ $t('settings.noneConfigured') }}</span>
                </div>
                <div class="text-[11.5px] text-text-3 mt-2.5 leading-relaxed">
                  {{ $t('settings.managerPermTip') }}
                </div>
              </div>
            </div>
          </template>

          <div class="px-4 py-3 border-t border-line flex items-center justify-between gap-2 flex-wrap">
            <span class="text-[11.5px] text-text-3">
              {{ $t('settings.footTip') }}
            </span>
            <div class="flex items-center gap-2">
              <AppButton icon="refresh" @click="load">{{ $t('settings.discard') }}</AppButton>
              <AppButton variant="primary" icon="save" :loading="saving" @click="save">{{ $t('settings.save') }}</AppButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </PageShell>
</template>
