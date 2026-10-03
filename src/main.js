import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/main.css'

const app = createApp(App)

/**
 * 全局错误兜底：演示时不希望因为一个接口异常白屏
 */
app.config.errorHandler = (err, instance, info) => {
  // eslint-disable-next-line no-console
  console.error('[app error]', info, err)
}

app.use(router)
app.mount('#app')
