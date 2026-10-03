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
import Icon from '@/components/ui/Icon.vue'
import PageShell from '@/components/layout/PageShell.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import FormField from '@/components/ui/FormField.vue'
import AppButton from '@/components/ui/AppButton.vue'

const router = useRouter()
const route = useRoute()
const toast = useToast()

const LEVELS = [
  { value: 'normal', label: '普通会员' },
  { value: 'silver', label: '银卡会员' },
  { value: 'gold', label: '金卡会员' },
  { value: 'diamond', label: '钻石会员' },
]
const LEVEL_NAME = Object.fromEntries(LEVELS.map((l) => [l.value, l.label]))
const PHONE_RE = /^1\d{10}$/

/** 等级权益：积分倍率与会员折扣（收银员可据此向顾客现场解释） */
const BENEFITS = [
  { level: 'normal', name: '普通会员', rate: '1x', discount: '无折扣', rule: '注册即享，消费 1 元累计 1 分' },
  { level: 'silver', name: '银卡会员', rate: '1x', discount: '95 折', rule: '累计消费满 300 元可升级' },
  { level: 'gold', name: '金卡会员', rate: '1.2x', discount: '95 折', rule: '累计消费满 1000 元可升级' },
  { level: 'diamond', name: '钻石会员', rate: '1.5x', discount: '9 折', rule: '累计消费满 3000 元可升级' },
]

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
  errors.name = form.name.trim() ? '' : '请输入会员姓名'
  errors.phone = PHONE_RE.test(form.phone.trim()) ? '' : '请输入 11 位有效手机号'
  if (dupMember.value) errors.phone = '该手机号已注册会员，请勿重复开卡'
  return !errors.name && !errors.phone
}

function payload() {
  return {
    memberNo: form.memberNo,
    name: form.name.trim(),
    phone: form.phone.trim(),
    gender: form.gender,
    level: form.level,
    levelName: LEVEL_NAME[form.level],
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
    toast.warning('请先修正表单中标红的内容')
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      const res = await memberApi.update(editingId.value, payload())
      toast.ok(res.message || '会员信息已更新')
      router.push({ name: 'member-detail', params: { id: editingId.value } })
      return
    }
    const res = await memberApi.create(payload())
    toast.ok(res.message || '会员创建成功')
    if (continueNext) {
      resetForNext()
      toast.info('已清空表单，可继续录入下一位会员')
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
      :title="isEdit ? '编辑会员' : '新建会员'"
      :desc="isEdit ? '修改会员基础资料与等级，会员号不可变更' : '录入姓名与手机号即可开卡，会员号由系统自动生成'"
      icon="members"
    >
      <template #actions>
        <AppButton icon="arrowLeft" @click="router.push({ name: 'members' })">取消</AppButton>
        <AppButton variant="primary" icon="plus" :loading="saving" @click="save(true)">
          保存并继续新建
        </AppButton>
      </template>
    </PageHeader>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3">
      <!-- 表单 -->
      <div class="card">
        <div class="panel-head">
          <div>
            <div class="text-[14px] font-semibold">会员资料</div>
            <div class="text-[11.5px] text-text-3 mt-0.5">
              带 <span style="color: var(--c-danger)">*</span> 为必填项
            </div>
          </div>
          <span class="badge" :class="isEdit ? 'badge-warning' : 'badge-primary'">
            {{ isEdit ? '编辑模式' : '新建模式' }}
          </span>
        </div>

        <div class="p-4">
          <template v-if="loading">
            <div class="grid grid-cols-2 gap-3">
              <div v-for="i in 6" :key="i" class="skeleton" style="height: 34px" />
            </div>
          </template>

          <div v-else class="grid grid-cols-2 gap-3">
            <FormField label="会员号" hint="系统自动生成，不可修改">
              <input class="input w-full font-mono" :value="form.memberNo" disabled />
            </FormField>
            <FormField label="姓名" required :error="errors.name">
              <input v-model="form.name" class="input w-full" placeholder="请输入会员姓名" />
            </FormField>

            <FormField
              label="手机号"
              required
              :error="errors.phone"
              :hint="checking ? '正在检查该手机号…' : '11 位手机号，收银台按手机号检索会员'"
            >
              <input
                v-model="form.phone"
                class="input w-full"
                maxlength="11"
                inputmode="numeric"
                placeholder="请输入 11 位手机号"
                @input="onPhoneInput"
                @blur="checkPhone"
              />
            </FormField>
            <FormField label="性别">
              <select v-model="form.gender" class="input w-full">
                <option value="male">男</option>
                <option value="female">女</option>
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
                该手机号已注册会员 <b>{{ dupMember.name }}</b>（{{ dupMember.memberNo }} · {{ dupMember.levelName }}）
              </span>
              <button class="underline" @click="goDupMember">查看该会员</button>
            </div>

            <FormField label="会员等级" span="2" hint="等级决定积分倍率与折扣，保存后可在会员详情中调整">
              <select v-model="form.level" class="input w-full">
                <option v-for="l in LEVELS" :key="l.value" :value="l.value">{{ l.label }}</option>
              </select>
            </FormField>

            <FormField label="备注" span="2">
              <textarea
                v-model="form.remark"
                class="w-full"
                rows="3"
                placeholder="如：企业客户、送货上门、忌口备注等"
              />
            </FormField>
          </div>
        </div>

        <div class="px-4 py-3 border-t border-line flex items-center justify-end gap-2">
          <AppButton @click="router.push({ name: 'members' })">取消</AppButton>
          <AppButton variant="primary" icon="save" :loading="saving" @click="save(false)">
            {{ isEdit ? '保存修改' : '保存会员' }}
          </AppButton>
        </div>
      </div>

      <!-- 会员权益说明 -->
      <div class="space-y-3">
        <div class="card">
          <div class="panel-head">
            <div>
              <div class="text-[14px] font-semibold">会员权益说明</div>
              <div class="text-[11.5px] text-text-3 mt-0.5">当前选中等级已高亮</div>
            </div>
            <Icon name="gift" :size="16" class="text-text-3" />
          </div>

          <table class="table-flat">
            <thead>
              <tr>
                <th>等级</th>
                <th class="text-center">积分倍率</th>
                <th class="text-right">会员折扣</th>
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
              <div class="text-text-2 font-medium mb-1">温馨提示</div>
              保存后可在会员管理中查询、编辑与查看消费记录。会员号由系统自动编号，
              手机号是会员的唯一识别依据，务必核对无误。
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageShell>
</template>
