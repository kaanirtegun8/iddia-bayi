<template>
  <section class="detail-shell">
    <header class="detail-header">
      <button class="back-button" type="button" @click="$emit('close')">← Oyuncu listesi</button>
      <div class="identity-block">
        <p class="eyebrow">Oyuncu davranış dosyası</p>
        <div class="identity-line">
          <h2>{{ player.maskedPhone }}</h2>
          <span :class="['match-badge', player.matchStatus]">{{ matchLabel }}</span>
        </div>
        <p>
          Üye ID <strong>{{ player.memberId ?? "eşleşmedi" }}</strong>
          <span class="dot">•</span>
          {{ player.summary.activePeriods }} rapor döneminde görüldü
        </p>
      </div>
    </header>

    <div class="metric-grid">
      <article class="metric-card gold">
        <span>Toplam ciro</span>
        <strong>{{ money(player.summary.totalStake) }}</strong>
        <small>{{ player.summary.activeDays }} aktif gün</small>
      </article>
      <article class="metric-card ice">
        <span>Toplam kupon</span>
        <strong>{{ nullableCount(player.summary.totalCouponCount) }}</strong>
        <small>{{ averageCouponLabel }}</small>
      </article>
      <article class="metric-card coral">
        <span>En yüksek hafta</span>
        <strong>{{ money(player.summary.peakPeriodStake) }}</strong>
        <small>{{ player.summary.peakPeriodLabel ?? "—" }}</small>
      </article>
      <article class="metric-card violet">
        <span>Son 4 dönem</span>
        <strong>{{ money(player.summary.lastFourPeriodsStake) }}</strong>
        <small :class="trendClass">{{ trendLabel }}</small>
      </article>
    </div>

    <article class="chart-card timeline-card">
      <div class="section-title">
        <div>
          <p class="eyebrow">Zaman çizgisi</p>
          <h3>Haftalık ciro ve kupon hareketi</h3>
        </div>
        <div class="legend">
          <span><i class="line-key" /> Ciro</span>
          <span><i class="bar-key" /> Kupon</span>
        </div>
      </div>

      <div v-if="weeklyChart.length" class="chart-scroll">
        <svg class="weekly-chart" :viewBox="`0 0 ${chartWidth} ${chartHeight}`" role="img" aria-label="Haftalık ciro ve kupon grafiği">
          <g class="grid-lines">
            <line
              v-for="tick in 5"
              :key="tick"
              :x1="chartPadding.left"
              :x2="chartWidth - chartPadding.right"
              :y1="chartPadding.top + ((tick - 1) * chartPlotHeight) / 4"
              :y2="chartPadding.top + ((tick - 1) * chartPlotHeight) / 4"
            />
          </g>

          <g class="coupon-bars">
            <rect
              v-for="point in weeklyChart"
              :key="`bar-${point.importId}`"
              :x="point.x - point.barWidth / 2"
              :y="point.couponY"
              :width="point.barWidth"
              :height="point.couponHeight"
              rx="3"
            >
              <title>{{ point.label }}: {{ nullableCount(point.couponCount) }} kupon</title>
            </rect>
          </g>

          <polyline :points="stakePolyline" class="stake-area-line" />
          <g class="stake-points">
            <circle v-for="point in weeklyChart" :key="point.importId" :cx="point.x" :cy="point.stakeY" r="4">
              <title>{{ point.label }}: {{ money(point.stake) }}</title>
            </circle>
          </g>

          <g class="x-labels">
            <text
              v-for="point in visibleAxisLabels"
              :key="`label-${point.importId}`"
              :x="point.x"
              :y="chartHeight - 14"
              text-anchor="middle"
            >{{ point.shortLabel }}</text>
          </g>
        </svg>
      </div>
      <div v-else class="empty-state">Grafik için tamamlanmış rapor dönemi bulunamadı.</div>
    </article>

    <div class="analysis-grid">
      <article class="chart-card">
        <div class="section-title compact">
          <div>
            <p class="eyebrow">Ay karşılaştırması</p>
            <h3>Hangi ay daha yoğun?</h3>
          </div>
        </div>
        <div v-if="monthlyRows.length" class="month-list">
          <div v-for="month in monthlyRows" :key="month.key" class="month-row">
            <div class="month-copy">
              <strong>{{ month.label }}</strong>
              <span>{{ money(month.stake) }}</span>
            </div>
            <div class="month-track">
              <span :style="{ width: `${month.percent}%` }" />
            </div>
            <small>{{ nullableCount(month.couponCount) }} kupon</small>
          </div>
        </div>
        <div v-else class="empty-state">Aylık analiz için veri yok.</div>
      </article>

      <article class="chart-card pause-card">
        <div class="section-title compact">
          <div>
            <p class="eyebrow">Ara analizi</p>
            <h3>Yüklenen raporlardaki boşluklar</h3>
          </div>
        </div>
        <div v-if="gapRows.length" class="gap-list">
          <div v-for="gap in gapRows" :key="gap.key" class="gap-row">
            <div>
              <strong>{{ gap.periodCount }} dönem görünmedi</strong>
              <span>{{ gap.startLabel }} → {{ gap.endLabel }}</span>
            </div>
            <b>{{ gap.daySpan }} gün</b>
          </div>
        </div>
        <div v-else class="empty-state success">Yüklü dönemler arasında belirgin bir ara görünmüyor.</div>
        <p class="data-note">Yalnızca sisteme yüklenmiş rapor dönemleri değerlendirilir.</p>
      </article>
    </div>

    <article class="chart-card history-card">
      <div class="section-title compact">
        <div>
          <p class="eyebrow">Kaynak dökümü</p>
          <h3>Tüm rapor dönemleri</h3>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Dönem</th>
              <th>Durum</th>
              <th>Ciro</th>
              <th>Kupon</th>
              <th>Aktif gün</th>
              <th>İade</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in periodTableRows" :key="row.importId" :class="{ inactive: !row.period }">
              <td>
                <strong>{{ row.label }}</strong>
                <small>{{ row.fileName }}</small>
              </td>
              <td><span :class="['presence', row.period ? 'seen' : 'missing']">{{ row.period ? "Göründü" : "Yok" }}</span></td>
              <td>{{ money(row.period?.stake ?? 0) }}</td>
              <td>{{ nullableCount(row.period?.couponCount ?? null) }}</td>
              <td>{{ row.period?.activeDays ?? 0 }}</td>
              <td>{{ money(row.period?.refunded ?? 0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue"
import {
  formatIsoDate,
  type TrackingImportRecord,
  type TrackingPlayer,
} from "../../features/specialPlayerTracking"

const props = defineProps<{
  player: TrackingPlayer
  imports: TrackingImportRecord[]
}>()

defineEmits<{ (event: "close"): void }>()

const money = (value: number): string =>
  value.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })

const nullableCount = (value: number | null): string =>
  value === null ? "Veri yok" : value.toLocaleString("tr-TR")

const matchLabel = computed(() => {
  if (props.player.matchStatus === "matched") return "Üyeyle eşleşti"
  if (props.player.matchStatus === "ambiguous") return "Eşleşme belirsiz"
  return "Üye listesinde yok"
})

const averageCouponLabel = computed(() =>
  props.player.summary.averageCouponAmount === null
    ? "Kupon detaylı rapor bekleniyor"
    : `Ortalama ${money(props.player.summary.averageCouponAmount)}`,
)

const trendLabel = computed(() => {
  const trend = props.player.summary.trendPercent
  if (trend === null) return "Karşılaştırma için 8 dönem gerekli"
  return `${trend >= 0 ? "+" : ""}%${Math.abs(trend).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} önceki 4 döneme göre`
})

const trendClass = computed(() => {
  const trend = props.player.summary.trendPercent
  if (trend === null) return "neutral"
  return trend >= 0 ? "positive" : "negative"
})

const completedImports = computed(() =>
  props.imports.filter((item) => item.status === "completed").sort((a, b) => a.startDate.localeCompare(b.startDate)),
)

const periodTableRows = computed(() => {
  const periodMap = new Map(props.player.periods.map((period) => [period.importId, period]))
  return completedImports.value
    .map((item) => ({ ...item, period: periodMap.get(item.id) ?? null }))
    .reverse()
})

const chartWidth = 960
const chartHeight = 300
const chartPadding = { left: 28, right: 28, top: 24, bottom: 46 }
const chartPlotHeight = chartHeight - chartPadding.top - chartPadding.bottom

const weeklyChart = computed(() => {
  const rows = [...periodTableRows.value].reverse()
  const maxStake = Math.max(1, ...rows.map((row) => row.period?.stake ?? 0))
  const maxCoupon = Math.max(1, ...rows.map((row) => row.period?.couponCount ?? 0))
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right
  const step = rows.length > 1 ? plotWidth / (rows.length - 1) : plotWidth
  const barWidth = Math.max(8, Math.min(28, plotWidth / Math.max(1, rows.length) / 2))

  return rows.map((row, index) => {
    const stake = row.period?.stake ?? 0
    const couponCount = row.period?.couponCount ?? null
    const couponHeight = couponCount === null ? 0 : ((couponCount / maxCoupon) * chartPlotHeight * 0.72)
    return {
      importId: row.id,
      label: row.label,
      shortLabel: formatIsoDate(row.startDate).slice(0, 5),
      stake,
      couponCount,
      x: chartPadding.left + (rows.length === 1 ? plotWidth / 2 : index * step),
      stakeY: chartPadding.top + chartPlotHeight - (stake / maxStake) * chartPlotHeight,
      couponY: chartPadding.top + chartPlotHeight - couponHeight,
      couponHeight,
      barWidth,
    }
  })
})

const stakePolyline = computed(() => weeklyChart.value.map((point) => `${point.x},${point.stakeY}`).join(" "))

const visibleAxisLabels = computed(() => {
  const every = Math.max(1, Math.ceil(weeklyChart.value.length / 8))
  return weeklyChart.value.filter((_, index) => index % every === 0 || index === weeklyChart.value.length - 1)
})

const monthNames = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
]

const monthlyRows = computed(() => {
  const months = new Map<string, { key: string; label: string; stake: number; couponCount: number | null; hasCoupons: boolean }>()
  for (const day of props.player.days) {
    const key = day.date.slice(0, 7)
    const [year, month] = key.split("-").map(Number)
    const current = months.get(key) ?? {
      key,
      label: `${monthNames[month - 1]} ${year}`,
      stake: 0,
      couponCount: null,
      hasCoupons: false,
    }
    current.stake += day.stake
    if (day.couponCount !== null) {
      current.couponCount = (current.couponCount ?? 0) + day.couponCount
      current.hasCoupons = true
    }
    months.set(key, current)
  }
  const rows = Array.from(months.values()).sort((a, b) => b.key.localeCompare(a.key))
  const maxStake = Math.max(1, ...rows.map((row) => row.stake))
  return rows.map((row) => ({
    ...row,
    couponCount: row.hasCoupons ? row.couponCount : null,
    percent: Math.max(3, (row.stake / maxStake) * 100),
  }))
})

const gapRows = computed(() => {
  const imports = completedImports.value
  const seenIds = new Set(props.player.periods.map((period) => period.importId))
  const firstSeenIndex = imports.findIndex((item) => seenIds.has(item.id))
  const lastSeenIndex = imports.findLastIndex((item) => seenIds.has(item.id))
  if (firstSeenIndex < 0 || lastSeenIndex <= firstSeenIndex) return []

  const gaps: Array<{ key: string; periodCount: number; startLabel: string; endLabel: string; daySpan: number }> = []
  let cursor = firstSeenIndex
  while (cursor <= lastSeenIndex) {
    if (seenIds.has(imports[cursor].id)) {
      cursor += 1
      continue
    }
    const start = cursor
    while (cursor <= lastSeenIndex && !seenIds.has(imports[cursor].id)) cursor += 1
    const end = cursor - 1
    const startDate = new Date(`${imports[start].startDate}T00:00:00`)
    const endDate = new Date(`${imports[end].endDate}T00:00:00`)
    gaps.push({
      key: `${imports[start].id}-${imports[end].id}`,
      periodCount: end - start + 1,
      startLabel: formatIsoDate(imports[start].startDate),
      endLabel: formatIsoDate(imports[end].endDate),
      daySpan: Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1,
    })
  }
  return gaps.sort((a, b) => b.daySpan - a.daySpan)
})
</script>

<style scoped>
.detail-shell { display: flex; flex-direction: column; gap: 18px; }
.detail-header { display: flex; align-items: flex-start; gap: 22px; padding: 4px 2px 2px; }
.back-button { border: 1px solid #334155; background: #0f172a; color: #cbd5e1; border-radius: 10px; padding: 9px 12px; cursor: pointer; }
.back-button:hover { border-color: #67e8f9; color: #ecfeff; }
.back-button:focus-visible { outline: 2px solid #67e8f9; outline-offset: 2px; }
.identity-block { flex: 1; }
.eyebrow { margin: 0 0 5px; color: #94a3b8; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; }
.identity-line { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.identity-line h2 { margin: 0; color: #f8fafc; font-size: clamp(1.6rem, 3vw, 2.35rem); letter-spacing: -0.035em; font-variant-numeric: tabular-nums; }
.identity-block > p:last-child { color: #94a3b8; margin: 7px 0 0; }
.identity-block strong { color: #e2e8f0; }
.dot { margin: 0 7px; color: #475569; }
.match-badge, .presence { border-radius: 999px; padding: 4px 9px; font-size: 0.72rem; font-weight: 700; }
.match-badge.matched, .presence.seen { background: rgba(34, 197, 94, 0.12); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.25); }
.match-badge.unmatched, .presence.missing { background: rgba(251, 113, 133, 0.11); color: #fda4af; border: 1px solid rgba(251, 113, 133, 0.24); }
.match-badge.ambiguous { background: rgba(250, 204, 21, 0.12); color: #fde047; border: 1px solid rgba(250, 204, 21, 0.24); }
.metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.metric-card { position: relative; overflow: hidden; min-height: 126px; padding: 17px; border-radius: 14px; background: #0b1220; border: 1px solid #1e293b; display: flex; flex-direction: column; }
.metric-card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--accent); }
.metric-card.gold { --accent: #fbbf24; } .metric-card.ice { --accent: #67e8f9; }
.metric-card.coral { --accent: #fb7185; } .metric-card.violet { --accent: #a78bfa; }
.metric-card span { color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; }
.metric-card strong { margin-top: auto; color: #f8fafc; font-size: 1.45rem; font-variant-numeric: tabular-nums; }
.metric-card small { margin-top: 5px; color: #94a3b8; }
.metric-card small.positive { color: #86efac; } .metric-card small.negative { color: #fda4af; }
.chart-card { background: #07101e; border: 1px solid #1e293b; border-radius: 16px; padding: 18px; }
.section-title { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 14px; }
.section-title.compact { margin-bottom: 18px; }
.section-title h3 { margin: 0; color: #f1f5f9; font-size: 1.05rem; }
.legend { display: flex; gap: 14px; color: #94a3b8; font-size: 0.75rem; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.line-key { width: 18px; height: 2px; background: #fbbf24; }
.bar-key { width: 9px; height: 11px; background: rgba(103, 232, 249, 0.42); border: 1px solid #67e8f9; border-radius: 2px; }
.chart-scroll { overflow-x: auto; }
.weekly-chart { width: 100%; min-width: 700px; height: auto; }
.grid-lines line { stroke: #1e293b; stroke-width: 1; }
.coupon-bars rect { fill: rgba(103, 232, 249, 0.2); stroke: rgba(103, 232, 249, 0.55); }
.stake-area-line { fill: none; stroke: #fbbf24; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
.stake-points circle { fill: #07101e; stroke: #fbbf24; stroke-width: 2.5; }
.x-labels text { fill: #64748b; font-size: 10px; }
.analysis-grid { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 14px; }
.month-list, .gap-list { display: flex; flex-direction: column; gap: 13px; }
.month-row { display: grid; grid-template-columns: 148px minmax(100px, 1fr) 88px; gap: 12px; align-items: center; }
.month-copy { display: flex; flex-direction: column; }
.month-copy strong { color: #e2e8f0; font-size: 0.85rem; }
.month-copy span, .month-row small { color: #94a3b8; font-size: 0.74rem; }
.month-track { height: 8px; background: #172033; border-radius: 999px; overflow: hidden; }
.month-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #67e8f9, #fbbf24); }
.month-row small { text-align: right; }
.gap-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px; border-left: 2px solid #fb7185; background: rgba(251, 113, 133, 0.06); }
.gap-row div { display: flex; flex-direction: column; gap: 2px; }
.gap-row strong { color: #fecdd3; font-size: 0.84rem; }
.gap-row span { color: #94a3b8; font-size: 0.74rem; }
.gap-row b { color: #fb7185; white-space: nowrap; }
.data-note { margin: 16px 0 0; color: #64748b; font-size: 0.73rem; }
.empty-state { color: #94a3b8; padding: 28px 0; text-align: center; }
.empty-state.success { color: #86efac; }
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; min-width: 720px; }
th { padding: 9px 10px; color: #64748b; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; text-align: left; border-bottom: 1px solid #243044; }
td { padding: 12px 10px; color: #cbd5e1; font-size: 0.82rem; border-bottom: 1px solid #172033; font-variant-numeric: tabular-nums; }
td:first-child { display: flex; flex-direction: column; }
td:first-child small { color: #64748b; }
tr.inactive td { color: #64748b; }
@media (max-width: 980px) { .metric-grid { grid-template-columns: repeat(2, 1fr); } .analysis-grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .detail-header { flex-direction: column; } .metric-grid { grid-template-columns: 1fr; } .month-row { grid-template-columns: 112px minmax(80px, 1fr); } .month-row small { grid-column: 2; } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>
