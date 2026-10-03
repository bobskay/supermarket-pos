import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { t, tl, formatDateTime, formatMoney, locale } from './i18n'
import './styles/main.css'

const app = createApp(App)

/**
 * 全局注入多语言助手，这样 24 个页面可以直接在模板里写 {{ $t('common.save') }}，
 * 不必每个文件都 import 一遍，新增页面也不会漏。
 * 说明：$t 内部读取响应式 locale，因此语言切换时所有用到的模板都会自动重渲染。
 */
app.config.globalProperties.$t = (key, params, fallback) => t(key, params, fallback)
app.config.globalProperties.$tl = (record, field, fallback) => tl(record, field, fallback)
app.config.globalProperties.$date = (v) => formatDateTime(v)
app.config.globalProperties.$money = (v) => formatMoney(v)
app.config.globalProperties.$locale = locale

/**
 * 全局错误兜底：演示时不希望因为一个接口异常白屏
 */
app.config.errorHandler = (err, instance, info) => {
  // eslint-disable-next-line no-console
  console.error('[app error]', info, err)
}

app.use(router)
app.mount('#app')
