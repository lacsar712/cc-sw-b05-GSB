<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api.js'

const role = ref(localStorage.getItem('role') || '')
// 只有校准员（writer）可以改看窗宽度，巡检员（reader）只能看
const canTune = computed(() => role.value === 'writer')

function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function startOfCurrentHour() {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  return d
}

const presets = [
  { label: '当前小时', currentHour: true },
  { label: '最近 4 小时', hours: 4 },
  { label: '最近 24 小时', hours: 24 },
]

function computeWindow(p) {
  const e = new Date()
  const s = p.currentHour ? startOfCurrentHour() : new Date(e.getTime() - p.hours * 3600 * 1000)
  return [s, e]
}

// 跟随预设窗口（默认当前小时）：刷新时窗口端点随当前时刻重锚；
// 一旦手动改过起止时刻，则严格按所填时刻统计。
const activePreset = ref(presets[0])
const startInput = ref('')
const endInput = ref('')
const summary = ref(null)
const err = ref('')
const loading = ref(false)

async function reload() {
  err.value = ''
  if (activePreset.value) {
    const [s, e] = computeWindow(activePreset.value)
    startInput.value = toLocalInput(s)
    endInput.value = toLocalInput(e)
  }
  const s = new Date(startInput.value)
  const e = new Date(endInput.value)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    summary.value = null
    err.value = '请先填好窗口开始与结束时刻'
    return
  }
  loading.value = true
  try {
    const q = `start=${encodeURIComponent(s.toISOString())}&end=${encodeURIComponent(e.toISOString())}`
    summary.value = await api(`/api/audit/summary?${q}`)
  } catch (e2) {
    summary.value = null
    err.value = String(e2.message || e2)
  } finally {
    loading.value = false
  }
}

function applyPreset(p) {
  if (!canTune.value) return
  activePreset.value = p
  reload()
}

function onWindowChanged() {
  // 改窗后立刻让服务端重算；本页只展示服务端聚合结果，不拿总览列表自行加总
  activePreset.value = null
  reload()
}

const ratioText = computed(() => {
  const r = summary.value && summary.value.out_of_tolerance_ratio
  return r === null || r === undefined ? '—' : `${(r * 100).toFixed(1)}%`
})

const windowText = computed(() => {
  if (!summary.value) return ''
  const fmt = (iso) => new Date(iso).toLocaleString('zh-CN', { hour12: false })
  return `${fmt(summary.value.window.start)} ~ ${fmt(summary.value.window.end)}`
})

onMounted(() => {
  role.value = localStorage.getItem('role') || ''
  reload()
})
</script>

<template>
  <div class="audit-page">
    <h2>时段超差盘点台</h2>
    <p v-if="err" class="err">{{ err }}</p>

    <!-- 上块：选小时窗 -->
    <section class="block">
      <h3>① 选择小时窗</h3>
      <div class="presets">
        <button
          v-for="p in presets"
          :key="p.label"
          type="button"
          :class="{ on: activePreset === p }"
          :disabled="!canTune"
          @click="applyPreset(p)"
        >{{ p.label }}</button>
      </div>
      <div class="window-inputs">
        <label>
          窗口开始
          <input type="datetime-local" step="1" v-model="startInput" :disabled="!canTune" @change="onWindowChanged" />
        </label>
        <label>
          窗口结束
          <input type="datetime-local" step="1" v-model="endInput" :disabled="!canTune" @change="onWindowChanged" />
        </label>
      </div>
      <p v-if="canTune" class="hint">校准员可改看窗宽度，改动后本页立即重算。</p>
      <p v-else class="hint">只读会话：仅校准员可改看窗宽度，当前按默认当前小时窗展示。</p>
    </section>

    <!-- 中块：该窗入队量 / 合格量 / 超差量 / 超差占比 -->
    <section class="block">
      <h3>② 窗口盘点</h3>
      <p v-if="windowText" class="hint">
        统计窗口：{{ windowText }}<span v-if="loading">（重算中…）</span>
      </p>
      <div v-if="summary" class="stats">
        <div class="stat">
          <div class="num">{{ summary.enqueued }}</div>
          <div class="lbl">入队量</div>
        </div>
        <div class="stat">
          <div class="num ok">{{ summary.qualified }}</div>
          <div class="lbl">合格量</div>
        </div>
        <div class="stat">
          <div class="num bad">{{ summary.out_of_tolerance }}</div>
          <div class="lbl">超差量</div>
        </div>
        <div class="stat">
          <div class="num ratio">{{ ratioText }}</div>
          <div class="lbl">超差占比</div>
        </div>
      </div>
      <p v-if="summary" class="hint">其中待处理未结案 {{ summary.pending }} 笔，不计入合格量或超差量。</p>
    </section>

    <!-- 下块：刷新与口径说明 -->
    <section class="block">
      <h3>③ 刷新与统计口径</h3>
      <p>
        <button type="button" :disabled="loading" @click="reload">刷新</button>
      </p>
      <ul class="caliber">
        <li>以上数字一律由服务端按任务的创建（入队）时刻落在所选窗口内聚合得出，本页不在浏览器端加总。</li>
        <li>入队量：窗口内创建的全部任务数（含待处理）。</li>
        <li>合格量 / 超差量：窗口内已结案且结论为「合格」/「超差」的任务数；待处理未结案行不计入。</li>
        <li>超差占比 = 超差量 ÷（合格量 + 超差量）；窗口内无已结案行时显示「—」。</li>
        <li>预设窗口（当前小时 / 最近 N 小时）的终点随刷新时刻前滚；手动改窗后严格按所填起止时刻统计。</li>
        <li>判定允差 ±{{ summary ? summary.tolerance_nm : 0.08 }} nm，偏差不超过允差判合格。</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.audit-page h2 {
  margin: 8px 0 16px;
}
.block {
  margin: 16px 0;
  padding: 12px 16px;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
}
.block h3 {
  margin-top: 4px;
}
.presets {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.presets button {
  cursor: pointer;
  padding: 4px 12px;
}
.presets button.on {
  border-color: #1a2332;
  background: #1a2332;
  color: #fff;
}
.presets button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.window-inputs {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.window-inputs label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.window-inputs input:disabled {
  background: #f0f0f0;
  color: #777;
}
.stats {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 10px 0;
}
.stat {
  flex: 1;
  min-width: 120px;
  text-align: center;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 12px 8px;
  background: #f8fafc;
}
.num {
  font-size: 28px;
  font-weight: 700;
}
.num.ok {
  color: #16794c;
}
.num.bad {
  color: #b00020;
}
.num.ratio {
  color: #8a5a00;
}
.lbl {
  margin-top: 4px;
  color: #555;
  font-size: 13px;
}
.hint {
  color: #666;
  font-size: 13px;
}
.err {
  color: #b00020;
}
.caliber {
  color: #444;
  font-size: 13px;
  line-height: 1.7;
  padding-left: 18px;
}
</style>
