import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/**
 * base 的取值分三种情况：
 *   1) GitHub Actions 构建（部署到 GitHub Pages）：必须用 /<仓库名>/，否则子路径下资源 404
 *   2) 其他 CI 或显式指定：通过环境变量 VITE_BASE 覆盖
 *   3) 本地开发 / 预览：相对路径，这样 dist 直接双击 index.html 也能打开
 */
function resolveBase() {
  if (process.env.VITE_BASE) return process.env.VITE_BASE
  if (process.env.GITHUB_ACTIONS && process.env.GITHUB_REPOSITORY) {
    const repo = process.env.GITHUB_REPOSITORY.split('/')[1]
    return `/${repo}/`
  }
  return './'
}

export default defineConfig({
  base: resolveBase(),
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '#mock': fileURLToPath(new URL('./mock-data', import.meta.url)),
    },
  },
  server: {
    port: 5178,
    host: '127.0.0.1',
    watch: {
      /**
       * 这些路径绝不能进入文件监视：
       *   · dist / public/products 产物目录，无需热更新
       *   · 本地诊断工具与 Chrome 缓存目录
       *   · **编辑器/工具写文件时的临时文件**（形如 .Xxx.vue.1234.abc.tmpdir/）： 
       *     这类文件被写入方锁住，watcher 抛 EBUSY 会把 dev server 直接搞崩。
       */
      ignored: [
        '**/dist/**',
        '**/.diag-profile/**',
        '**/.verify-chrome*/**',
        '**/.*.tmpdir/**',
        '**/*.tmpdir/**',
        '**/*.tmp',
        '**/*.swp',
        '**/*.log',
      ],
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
})
