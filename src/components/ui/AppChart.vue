<script setup>
/**
 * ECharts 封装
 * ------------------------------------------------------------------
 * 1) 按需引入，避免全量打包
 * 2) 自动跟随主题：切换 clean / midnight 时重新取 CSS 变量并刷新图表
 * 3) 自动 resize（容器尺寸变化）
 *
 * 用法：
 *   <AppChart type="line" :data="trend" x-key="date" :series="[{key:'amount',name:'销售额'}]" height="280px" />
 *   或直接传 ECharts option：<AppChart :option="myOption" />
 */
import { ref, shallowRef, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart, RadarChart, GaugeChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  MarkLineComponent,
  GraphicComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useTheme } from '@/composables/useTheme'

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  RadarChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  MarkLineComponent,
  GraphicComponent,
  CanvasRenderer,
])

const props = defineProps({
  /** 预设类型：line | bar | pie | stackBar | hbar */
  type: { type: String, default: 'line' },
  /** 数据源 */
  data: { type: Array, default: () => [] },
  xKey: { type: String, default: 'date' },
  /** [{ key, name, color, area, stack, yAxisIndex }] */
  series: { type: Array, default: () => [] },
  /** 直接覆盖 / 自定义 option（优先级最高） */
  option: { type: Object, default: null },
  height: { type: String, default: '280px' },
  /** 是否显示图例 */
  legend: { type: Boolean, default: true },
  /** y 轴是否格式化金额 */
  money: { type: Boolean, default: false },
  smooth: { type: Boolean, default: true },
  /** 饼图取数字段 */
  valueKey: { type: String, default: 'amount' },
  nameKey: { type: String, default: 'name' },
  colors: { type: Array, default: () => [] },
})

const el = ref(null)
const chart = shallowRef(null)
let ro = null
const { theme } = useTheme()

/** 读取当前主题的 CSS 变量，让图表和 UI 完全同色 */
function tokens() {
  const cs = getComputedStyle(document.documentElement)
  const get = (k, fallback) => (cs.getPropertyValue(k) || '').trim() || fallback

  // 图表文字比页面正文需要更高对比度：坐标轴标签太浅会看不清
  // 这里给坐标轴单独一档更深的颜色，仍然来自主题变量（保证三套皮肤都跟得上）
  const text = get('--c-text', '#16202f')
  const text2 = get('--c-text-2', '#47536b')

  return {
    text,
    text2,
    text3: get('--c-text-3', '#7a8698'),
    /** 坐标轴刻度：用次文字色，比辅助色更清晰 */
    axis: text2,
    /** 图例文字：用主文字色，保证一眼能读 */
    legend: text,
    /** 轴线与网格：比分割线略深一点 */
    axisLine: get('--c-line-strong', '#d3d8e3'),
    line: get('--c-line', '#e6e9f0'),
    surface: get('--c-surface', '#fff'),
    primary: get('--c-primary', '#1a6df0'),
    accent: get('--c-accent', '#0f9d8f'),
    success: get('--c-success', '#10a05a'),
    warning: get('--c-warning', '#d98600'),
    danger: get('--c-danger', '#e0413f'),
    purple: get('--c-purple', '#7a5af5'),
  }
}

function palette(t) {
  return props.colors.length
    ? props.colors
    : [
        t.primary,
        t.accent,
        t.warning,
        t.purple,
        t.success,
        t.danger,
        // 后两色是图表专用的补充色，保证饼图/多系列时有足够区分度
        '#3f7fd9',
        '#c96a2f',
      ]
}

function moneyFmt(v) {
  if (props.money) return `￥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 0 })}`
  return Number(v).toLocaleString('zh-CN')
}

function buildOption() {
  if (props.option) return props.option
  const t = tokens()
  const colors = palette(t)
  const base = {
    color: colors,
    textStyle: { color: t.text2, fontFamily: 'inherit', fontSize: 12 },
    grid: { left: 8, right: 14, top: props.legend ? 34 : 14, bottom: 4, containLabel: true },
    tooltip: {
      trigger: props.type === 'pie' ? 'item' : 'axis',
      backgroundColor: t.surface,
      borderColor: t.line,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.text, fontSize: 12 },
      axisPointer: { type: props.type === 'line' || props.type === 'stackBar' ? 'line' : 'shadow',
        lineStyle: { color: t.line } },
      valueFormatter: (v) => (props.money ? `￥${Number(v).toFixed(2)}` : v),
    },
    legend: props.legend
      ? {
          show: true,
          top: 0,
          right: 0,
          icon: 'roundRect',
          itemWidth: 8,
          itemHeight: 8,
          itemGap: 14,
          textStyle: { color: t.legend, fontSize: 12 },
        }
      : { show: false },
  }

  if (props.type === 'pie') {
    return {
      ...base,
      series: [
        {
          type: 'pie',
          radius: ['52%', '74%'],
          center: ['50%', '54%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: t.surface, borderWidth: 2 },
          label: { color: t.text, fontSize: 12, formatter: '{b} {d}%' },
          labelLine: { lineStyle: { color: t.axisLine } },
          data: props.data.map((d) => ({ name: d[props.nameKey], value: d[props.valueKey] })),
        },
      ],
    }
  }

  if (props.type === 'hbar') {
    const keys = props.series.length ? props.series : [{ key: props.valueKey, name: '数量' }]
    const rows = [...props.data].reverse()
    return {
      ...base,
      grid: { left: 8, right: 44, top: 12, bottom: 4, containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: t.line, type: 'dashed' } },
        axisLabel: { color: t.axis, fontSize: 11, formatter: moneyFmt },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'category',
        data: rows.map((d) => d[props.xKey]),
        axisLine: { lineStyle: { color: t.axisLine } },
        axisTick: { show: false },
        axisLabel: { color: t.text, fontSize: 12, width: 96, overflow: 'truncate' },
      },
      legend: { show: false },
      series: keys.map((s, i) => ({
        name: s.name,
        type: 'bar',
        barWidth: keys.length > 1 ? 10 : 15,
        itemStyle: { color: s.color || colors[i], borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: 'right', color: t.text2, fontSize: 11, formatter: (p) => moneyFmt(p.value) },
        data: rows.map((d) => d[s.key]),
      })),
    }
  }

  const isBar = props.type === 'bar' || props.type === 'stackBar'
  const keys = props.series.length ? props.series : [{ key: props.valueKey, name: '数值' }]

  return {
    ...base,
    xAxis: {
      type: 'category',
      boundaryGap: isBar,
      data: props.data.map((d) => d[props.xKey]),
      axisLine: { lineStyle: { color: t.axisLine } },
      axisTick: { show: false },
      axisLabel: { color: t.axis, fontSize: 11, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.axis, fontSize: 11, formatter: moneyFmt },
      splitLine: { lineStyle: { color: t.line, type: 'dashed' } },
    },
    series: keys.map((s, i) => ({
      name: s.name,
      type: isBar ? 'bar' : 'line',
      stack: s.stack || (props.type === 'stackBar' ? 'total' : undefined),
      smooth: props.smooth,
      showSymbol: props.data.length <= 20,
      symbolSize: 6,
      barMaxWidth: 22,
      itemStyle: {
        color: s.color || colors[i],
        borderRadius: isBar ? [3, 3, 0, 0] : 0,
      },
      lineStyle: { width: 2, color: s.color || colors[i] },
      areaStyle: s.area ? { color: s.color || colors[i], opacity: 0.1 } : undefined,
      data: props.data.map((d) => d[s.key]),
      yAxisIndex: s.yAxisIndex || 0,
    })),
  }
}

function render(notMerge = true) {
  if (!chart.value) return
  chart.value.setOption(buildOption(), notMerge)
}

onMounted(async () => {
  await nextTick()
  chart.value = echarts.init(el.value, null, { renderer: 'canvas' })
  render()
  ro = new ResizeObserver(() => chart.value?.resize())
  ro.observe(el.value)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  chart.value?.dispose()
  chart.value = null
})

// 数据 / 配置变化
watch(() => [props.data, props.series, props.option, props.type], () => render(), { deep: true })

// 主题切换：色值来源于 CSS 变量，需要重新取一次
watch(theme, async () => {
  await nextTick()
  setTimeout(() => render(false), 30)
})

defineExpose({ chart, render, getInstance: () => chart.value })
</script>

<template>
  <div ref="el" :style="{ width: '100%', height }" />
</template>
