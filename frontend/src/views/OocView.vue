<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api } from '../api.js'

const role = ref(localStorage.getItem('role') || '')
const canEditWindow = computed(() => role.value === 'writer')

const PRESETS = [1, 4, 24]
const appliedHours = ref(1)
const inputHours = ref(1)
const stats = ref(null)
const err = ref('')
let timer

async function reload() {
  if (!localStorage.getItem('tok')) return
  try {
    stats.value = await api(`/api/stats/ooc?hours=${appliedHours.value}`)
    err.value = ''
  } catch (e) {
    err.value = String(e.message || e)
  }
}

function applyWindow(hours) {
  if (!canEditWindow.value) return
  const h = Number(hours)
  if (!Number.isFinite(h) || h <= 0) {
    err.value = '窗宽须为正数小时'
    return
  }
  appliedHours.value = h
  inputHours.value = h
  reload()
}

const ratioText = computed(() => {
  if (!stats.value || stats.value.ooc_ratio === null) return '—（窗内无已结案样条）'
  return (stats.value.ooc_ratio * 100).toFixed(1) + '%'
})

function fmtTime(iso) {
  return new Date(iso).toLocaleString()
}

onMounted(() => {
  role.value = localStorage.getItem('role') || ''
  reload()
  timer = setInterval(reload, 2000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="ooc-page">
    <h2>时段超差盘点台</h2>
    <p v-if="err" class="err">{{ err }}</p>

    <section class="block">
      <h3>上块 · 选择小时窗</h3>
      <div class="window-controls">
        <span>窗宽：</span>
        <button
          v-for="p in PRESETS"
          :key="p"
          type="button"
          :class="{ active: appliedHours === p }"
          :disabled="!canEditWindow"
          @click="applyWindow(p)"
        >{{ p }} 小时</button>
        <label>
          自定义（小时）
          <input
            type="number"
            min="0.01"
            step="0.05"
            v-model.number="inputHours"
            :disabled="!canEditWindow"
          />
        </label>
        <button type="button" :disabled="!canEditWindow" @click="applyWindow(inputHours)">
          应用窗口
        </button>
      </div>
      <p v-if="!canEditWindow" class="hint">巡检员只读：可查看盘点结果，不能改窗。</p>
      <p v-if="stats" class="hint">
        当前窗口：{{ fmtTime(stats.window.start) }} ～ {{ fmtTime(stats.window.end) }}
        （宽 {{ stats.window.hours }} 小时，以当前时刻为终点）
      </p>
    </section>

    <section class="block">
      <h3>中块 · 窗口盘点</h3>
      <table v-if="stats" class="stats-table" border="1" cellpadding="8">
        <thead>
          <tr>
            <th>入队量</th>
            <th>合格量</th>
            <th>超差量</th>
            <th>超差占比</th>
            <th>待处理（不计入）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{{ stats.enqueued }}</td>
            <td>{{ stats.qualified }}</td>
            <td>{{ stats.ooc }}</td>
            <td class="ratio">{{ ratioText }}</td>
            <td>{{ stats.pending }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="hint">加载中…</p>
    </section>

    <section class="block">
      <h3>下块 · 刷新与口径说明</h3>
      <p><button type="button" @click="reload">刷新</button>（页面亦每 2 秒自动重取）</p>
      <ul class="spec">
        <li>全部数字由服务端按样条的创建入队时刻（created_at）聚合，本页不读取总览列表自行加总。</li>
        <li>窗口 = 以当前时刻为终点、向前推移所选小时数；改窗后立即向服务端重取并重算。</li>
        <li>待处理未结案行只计入入队量，不进入合格或超差桶。</li>
        <li>超差占比 = 超差量 ÷（合格量 + 超差量）；窗内无已结案样条时占比为空。</li>
        <li>校准员可改看窗宽度；巡检员只能查看，不能改窗。</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.ooc-page h2 {
  margin-bottom: 8px;
}
.block {
  margin: 16px 0;
  padding: 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.block h3 {
  margin-top: 0;
}
.window-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.window-controls button.active {
  font-weight: 700;
  text-decoration: underline;
}
.window-controls input {
  width: 90px;
}
.stats-table {
  border-collapse: collapse;
  width: 100%;
  text-align: center;
}
.stats-table .ratio {
  font-weight: 700;
}
.hint {
  color: #666;
  font-size: 13px;
}
.err {
  color: #b00020;
}
.spec {
  color: #444;
  font-size: 13px;
  line-height: 1.7;
  padding-left: 18px;
}
</style>
