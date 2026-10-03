<script setup>
/**
 * 新建 / 编辑会员（整页表单）
 * ------------------------------------------------------------------
 * - 路由 name=member-create 没有 id；带 ?id=xxx 时复用为「编辑会员」，
 *   只需维护一套表单，和商品模块的写法保持一致。
 * - 「保存并继续新建」是收银场景的高频操作：录完一位顾客立刻录下一位，
 *   因此保存后只清空姓名 / 手机号 / 备注，保留性别与等级，减少重复点击。
 */
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { memberApi } from '@/api'
import { MEMBER_LEVEL_STYLE } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import { useI18n } from '@/i18n'
import Icon from '@/components/ui/Icon.vue'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import FormField from '@/components/ui/FormField.vue'
import AppButton from '@/components/ui/AppButton.vue'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const { t, tl } = useI18n()

/* --------------------- 等级码 → 字典文案 --------------------- */
const LEVEL_KEY = {
  normal: 'member.levelNormal',
  silver: 'member.levelSilver',
  gold: 'member.levelGold',
  diamond: 'member.levelDiamond',
}
const LEVEL_NAME_KEY = {
  '普通会员': 'member.levelNormal',
  '银卡会员': 'member.levelSilver',
  '金卡会员': 'member.levelGold',
  '钻石会员': 'member.levelDiamond',
}

const LEVELS = computed(() => [
  { value: 'normal', label: t('member.levelNormal') },
  { value: 'silver', label: t('member.levelSilver') },
  { value: 'gold', label: t('member.levelGold') },
  { value: 'diamond', label: t('member.levelDiamond') },
])

/** 等级文案：优先按等级码取字典，缺码时按中文名反查，最后回退原值 */
function levelText(rec) {
  if (rec?.level && LEVEL_KEY[rec.level]) return t(LEVEL_KEY[rec.level])
  const key = LEVEL_NAME_KEY[rec?.levelName]
  return key ? t(key) : tl(rec, 'levelName')
}

function levelNameOf(code) {
  return LEVEL_KEY[code] ? t(LEVEL_KEY[code]) : code
}

/** 等级权益：积分倍率与会员折扣（收银员可据此向顾客现场解释） */
const BENEFITS = computed(() => [
  { level: 'normal', name: t('member.levelNormal'), rate: '1x', discount: t('member.discountNone'), rule: t('member.ruleNormal') },
  { level: 'silver', name: t('member.levelSilver'), rate: '1x', discount: t('member.discount95'), rule: t('member.ruleSilver') },
  { level: 'gold', name: t('member.levelGold'), rate: '1.2x', discount: t('member.discount95'), rule: t('member.ruleGold') },
  { level: 'diamond', name: t('member.levelDiamond'), rate: '1.5x', discount: t('member.discount90'), rule: t('member.ruleDiamond') },
])

const PHONE_RE = /^1\d{10}$/

/** 会员号：VIP + 5 位数字，前端生成并只读（演示环境里的「后端自动编号」） */
function genMemberNo() {
  return `VIP${Math.floor(10000 + Math.random() * 89999)}`
}

const editingId = computed(() => String(route.query.id || ''))
const isEdit = computed(() => !!editingId.value)

const form = reactive({
  memberNo: genMemberNo(),
  name: '',
  phone: '',
  gender: 'male',
  level: 'normal',
  remark: '',
})
const errors = reactive({ name: '', phone: '' })
const saving = ref(false)
const loading = ref(false)

/* --------------------------- 手机号查重 --------------------------- */
const dupMember = ref(null)
const checking = ref(false)
let timer = null

async function checkPhone() {
  const phone = form.phone.trim()
  if (!PHONE_RE.test(phone)) {
    dupMember.value = null
    return
  }
  checking.value = true
  const res = await memberApi.search(phone)
  checking.value = false
  // 异步返回时用户可能已经改了号码，比对一次避免提示张冠李戴
  if (form.phone.trim() !== phone) return
  const hit = res.data
  dupMember.value = hit && hit.id !== editingId.value ? hit : null
}

function onPhoneInput() {
  errors.phone = ''
  dupMember.value = null
  clearTimeout(timer)
  // 输入停顿后再查重，避免每敲一个数字就打一次接口
  timer = setTimeout(checkPhone, 420)
}

onBeforeUnmount(() => clearTimeout(timer))

function goDupMember() {
  if (dupMember.value) router.push({ name: 'member-detail', params: { id: dupMember.value.id } })
}

/* ------------------------------ 加载 ------------------------------ */
async function loadMember() {
  if (!isEdit.value) return
  loading.value = true
  try {
    const res = await memberApi.detail(editingId.value)
    const m = res.data || {}
    Object.assign(form, {
      memberNo: m.memberNo || form.memberNo,
      name: m.name || '',
      phone: m.phone || '',
      gender: m.gender || 'male',
      level: m.level || 'normal',
      remark: m.remark || '',
    })
  } finally {
    loading.value = false
  }
}
onMounted(loadMember)

/* ------------------------------ 保存 ------------------------------ */
function validate() {
  errors.name = form.name.trim() ? '' : t('member.nameRequired')
  errors.phone = PHONE_RE.test(form.phone.trim()) ? '' : t('member.phoneInvalid')
  if (dupMember.value) errors.phone = t('member.phoneDuplicateWarn')
  return !errors.name && !errors.phone
}

function payload() {
  return {
    memberNo: form.memberNo,
    name: form.name.trim(),
    phone: form.phone.trim(),
    gender: form.gender,
    level: form.level,
    levelName: levelNameOf(form.level),
    remark: form.remark.trim(),
  }
}

function resetForNext() {
  form.name = ''
  form.phone = ''
  form.remark = ''
  form.memberNo = genMemberNo()
  errors.name = ''
  errors.phone = ''
  dupMember.value = null
}

async function save(continueNext = false) {
  if (saving.value) return
  if (!validate()) {
    toast.warning(t('member.fixErrors'))
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      const res = await memberApi.update(editingId.value, payload())
      toast.ok(res.message || t('member.updateOk'))
      router.push({ name: 'member-detail', params: { id: editingId.value } })
      return
    }
    const res = await memberApi.create(payload())
    toast.ok(res.message || t('member.createOk'))
    if (continueNext) {
      resetForNext()
      toast.info(t('member.formCleared'))
    } else {
      router.push({ name: 'members' })
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PageShell>
    <PageHeader
      :title="isEdit ? $t('member.editMember') : $t('member.newMember')"
      :desc="isEdit ? $t('member.editDesc') : $t('member.createDesc')"
      icon="members"
    >
      <template #actions>
        <AppButton icon="arrowLeft" @click="router.push({ name: 'members' })">{{ $t('common.cancel') }}</AppButton>
        <AppButton variant="primary" icon="plus" :loading="saving" @click="save(true)">
          {{ $t('member.saveAndContinue') }}
        </AppButton>
      </template>
    </PageHeader>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3">
      <!-- 表单 -->
      <div class="card">
        <div class="panel-head">
          <div>
            <div class="text-[14px] font-semibold">{{ $t('member.profileTitle') }}</div>
            <div class="text-[11.5px] text-text-3 mt-0.5">
              {{ $t('member.requiredPrefix') }}<span style="color: var(--c-danger)">*</span>{{ $t('member.requiredSuffix') }}
            </div>
          </div>
          <span class="badge" :class="isEdit ? 'badge-warning' : 'badge-primary'">
            {{ isEdit ? $t('member.editMode') : $t('member.createMode') }}
          </span>
        </div>

        <div class="p-4">
          <template v-if="loading">
            <div class="grid grid-cols-2 gap-3">
              <div v-for="i in 6" :key="i" class="skeleton" style="height: 34px" />
            </div>
          </template>

          <div v-else class="grid grid-cols-2 gap-3">
            <FormField :label="$t('member.memberNo')" :hint="$t('member.memberNoAuto')">
              <input class="input w-full font-mono" :value="form.memberNo" disabled />
            </FormField>
            <FormField :label="$t('member.name')" required :error="errors.name">
              <input v-model="form.name" class="input w-full" :placeholder="$t('member.namePlaceholder')" />
            </FormField>

            <FormField
              :label="$t('member.phone')"
              required
              :error="errors.phone"
              :hint="checking ? $t('member.phoneChecking') : $t('member.phoneHint')"
            >
              <input
                v-model="form.phone"
                class="input w-full"
                maxlength="11"
                inputmode="numeric"
                :placeholder="$t('member.phonePlaceholder11')"
                @input="onPhoneInput"
                @blur="checkPhone"
              />
            </FormField>
            <FormField :label="$t('member.gender')">
              <select v-model="form.gender" class="input w-full">
                <option value="male">{{ $t('member.male') }}</option>
                <option value="female">{{ $t('member.female') }}</option>
              </select>
            </FormField>

            <!-- 查重命中：给出会员信息与直达链接，避免同一顾客被重复开卡 -->
            <div
              v-if="dupMember"
              class="col-span-2 flex items-center gap-2 px-3 py-2 rounded-md text-[12.5px]"
              :style="{ background: 'var(--c-warning-soft)', color: 'var(--c-warning)' }"
            >
              <Icon name="alert" :size="15" />
              <span class="flex-1">
                {{ $t('member.phoneDuplicate', { name: dupMember.name }) }}
                （{{ dupMember.memberNo }} · {{ levelText(dupMember) }}）
              </span>
              <button class="underline" @click="goDupMember">{{ $t('member.viewThatMember') }}</button>
            </div>

            <FormField :label="$t('member.levelLabel')" span="2" :hint="$t('member.levelHintFull')">
              <select v-model="form.level" class="input w-full">
                <option v-for="l in LEVELS" :key="l.value" :value="l.value">{{ l.label }}</option>
              </select>
            </FormField>

            <FormField :label="$t('common.remark')" span="2">
              <textarea
                v-model="form.remark"
                class="w-full"
                rows="3"
                :placeholder="$t('member.remarkPlaceholderFull')"
              />
            </FormField>
          </div>
        </div>

        <div class="px-4 py-3 border-t border-line flex items-center justify-end gap-2">
          <AppButton @click="router.push({ name: 'members' })">{{ $t('common.cancel') }}</AppButton>
          <AppButton variant="primary" icon="save" :loading="saving" @click="save(false)">
            {{ isEdit ? $t('member.saveEdit') : $t('member.saveMember') }}
          </AppButton>
        </div>
      </div>

      <!-- 会员权益说明 -->
      <div class="space-y-3">
        <div class="card">
          <div class="panel-head">
            <div>
              <div class="text-[14px] font-semibold">{{ $t('member.benefitTitle') }}</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">{{ $t('member.benefitHighlight') }}</div>
            </div>
            <Icon name="gift" :size="16" class="text-text-3" />
          </div>

          <table class="table-flat">
            <thead>
              <tr>
                <th>{{ $t('member.benefitLevel') }}</th>
                <th class="text-center">{{ $t('member.benefitPoints') }}</th>
                <th class="text-right">{{ $t('member.benefitMemberDiscount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="b in BENEFITS"
                :key="b.level"
                :style="form.level === b.level ? { background: 'var(--c-primary-soft)' } : null"
              >
                <td>
                  <div class="flex items-center gap-1.5">
                    <span class="badge" :class="MEMBER_LEVEL_STYLE[b.level]">{{ b.name }}</span>
                    <Icon
                      v-if="form.level === b.level"
                      name="check"
                      :size="14"
                      :style="{ color: 'var(--c-primary)' }"
                    />
                  </div>
                </td>
                <td class="text-center num">{{ b.rate }}</td>
                <td class="text-right font-medium">{{ b.discount }}</td>
              </tr>
            </tbody>
          </table>

          <div class="px-4 pb-4 pt-3 space-y-1.5">
            <div
              v-for="b in BENEFITS"
              :key="b.level"
              class="flex items-start gap-2 text-[12px] leading-relaxed"
              :style="{ color: form.level === b.level ? 'var(--c-text)' : 'var(--c-text-3)' }"
            >
              <Icon
                :name="form.level === b.level ? 'success' : 'target'"
                :size="13"
                class="mt-0.5"
                :style="{ color: form.level === b.level ? 'var(--c-primary)' : 'var(--c-text-3)' }"
              />
              <span><b>{{ b.name }}</b>：{{ b.rule }}</span>
            </div>
          </div>
        </div>

        <div class="card card-pad">
          <div class="flex items-start gap-2 text-[12px] text-text-3 leading-relaxed">
            <Icon name="info" :size="15" class="mt-0.5 shrink-0" />
            <div>
              <div class="text-text-2 font-medium mb-1">{{ $t('common.tip') }}</div>
              {{ $t('member.formTip') }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageShell>
</template>
