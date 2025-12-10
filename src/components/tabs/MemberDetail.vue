<template>
  <div class="detail-wrapper">
    <div v-if="user" class="card">
      <!-- Üst header -->
      <div class="header">
        <div>
          <h2>Üye Detayı</h2>
          <p class="subtitle">
            Seçilen üye hakkında günlük özet bilgiler ve haftalık raporlardaki hareketleri.
          </p>
        </div>
        <div class="id-block">
          <div class="member-id">ID: {{ user.memberId }}</div>
          <div class="phone">{{ user.phoneNumber }}</div>
          <span
            class="badge"
            :class="user.isActive ? 'badge-active' : 'badge-passive'"
          >
            {{ user.isActive ? "Aktif" : "Pasif" }}
          </span>
        </div>
      </div>

      <!-- Günlük user datasından özet -->
      <div class="summary-grid">
        <div class="summary-item">
          <span class="label">Toplam Ciro</span>
          <span class="value">{{ user.totalAmountValueStr }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Bakiye</span>
          <span class="value">{{ user.totalBalanceStr }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Haftalık Ortalama</span>
          <span class="value">{{ user.weeklyAverageStr }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Oynanan Ay</span>
          <span class="value">{{ user.playedMonths }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Son İşlem Ayı</span>
          <span class="value">{{ user.lastOrderMonth || "-" }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Son Yükleme Tarihi</span>
          <span class="value">{{ formatDate(user.lastDepositeDate) }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Son Yükleme Tutarı</span>
          <span class="value">{{ user.lastDepositeAmountStr || "-" }}</span>
        </div>
        <div class="summary-item">
          <span class="label">Son 30 Gün</span>
          <span
            class="badge small"
            :class="user.last30DaysAmount ? 'badge-yes' : 'badge-no'"
          >
            {{ user.last30DaysAmount ? "Evet" : "Hayır" }}
          </span>
        </div>
        <div class="summary-item">
          <span class="label">Son 60 Gün</span>
          <span
            class="badge small"
            :class="user.last60DaysAmount ? 'badge-yes' : 'badge-no'"
          >
            {{ user.last60DaysAmount ? "Evet" : "Hayır" }}
          </span>
        </div>
      </div>

      <!-- HAFTALIK RAPOR İNCELEME -->
      <div class="history-card">
        <div class="history-header">
          <div>
            <h3>Raporlarda Üyeyi İncele</h3>
            <p class="subtitle-small">
              Firestore'daki haftalık rapor dosyalarında (excelFiles) bu üyenin tüm kupon oynama
              hareketlerini listeler. Eşleştirme telefon numarasının son 4 hanesiyle yapılır.
            </p>
          </div>
          <button
            class="history-btn"
            :disabled="!user || isLoadingReports"
            @click="loadReports"
          >
            <span v-if="!isLoadingReports">Raporları Getir</span>
            <span v-else>Yükleniyor...</span>
          </button>
        </div>

        <div class="report-summary" v-if="reports.length">
          <div>
            <span class="label">Toplam Kayıt</span>
            <span class="value">{{ reports.length }}</span>
          </div>
          <div>
            <span class="label">Toplam Kupon Tutarı</span>
            <span class="value">
              {{ formatAmount(totalReportAmount) }}
            </span>
          </div>
          <div>
            <span class="label">Aranan Son 4</span>
            <span class="value">{{ targetLast4 || "-" }}</span>
          </div>
        </div>

        <p
          v-if="reportError"
          class="history-message error"
        >
          {{ reportError }}
        </p>

        <p
          v-if="!isLoadingReports && reports.length === 0 && reportsLoadedOnce"
          class="history-message"
        >
          Bu üye için yüklenmiş haftalık raporlarda hareket bulunamadı.
        </p>

        <div v-if="reports.length" class="history-table-container">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Excel Dosyası</th>
                <th>Açıklama</th>
                <th>Tutar</th>
                <th>Excel Telefon</th>
                <th>Son 4</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in reports"
                :key="row.fileName + '-' + row.index"
              >
                <td>{{ row.date }}</td>
                <td>{{ row.fileName }}</td>
                <td>{{ row.description || "-" }}</td>
                <td>{{ formatAmount(row.amount) }}</td>
                <td>{{ row.phone || "-" }}</td>
                <td>{{ row.last4 || "-" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Üye seçilmemişse -->
    <div v-else class="card empty">
      <h2>Üye Detayı</h2>
      <p class="subtitle">
        Detay görmek için soldaki tablodan bir üye seç.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { collection, getDocs } from "firebase/firestore"
import { db } from "../../firebase"
import type { UserReport } from "./Members.vue"

const props = defineProps<{
  user: UserReport | null
}>()

type WeeklyReportEntry = {
  fileName: string
  index: number
  amount: number
  date: string
  description?: string
  last4?: string
  phone?: string
}

const isLoadingReports = ref(false)
const reportError = ref<string | null>(null)
const reports = ref<WeeklyReportEntry[]>([])
const reportsLoadedOnce = ref(false)

const memberPhone = computed(() => props.user?.phoneNumber ?? "")
const targetLast4 = computed(() => {
  const digits = memberPhone.value.replace(/\D/g, "")
  if (!digits) return ""
  return digits.slice(-4)
})

const totalReportAmount = computed(() =>
  reports.value.reduce((sum, r) => sum + (r.amount || 0), 0),
)

watch(
  () => props.user?.memberId,
  () => {
    reports.value = []
    reportError.value = null
    reportsLoadedOnce.value = false
  },
)

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "-"
  const day = d.getDate().toString().padStart(2, "0")
  const month = (d.getMonth() + 1).toString().padStart(2, "0")
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

function formatAmount(value: number | null | undefined): string {
  if (!value || Number.isNaN(value)) return "0,00"
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function parseTrDate(dateStr: string | undefined): number {
  if (!dateStr) return 0
  const m = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return 0
  const day = Number(m[1])
  const month = Number(m[2]) - 1
  const year = Number(m[3])
  const d = new Date(year, month, day)
  return d.getTime()
}

const loadReports = async () => {
  if (!props.user || !targetLast4.value) {
    reportError.value = "Kullanıcının telefon numarasından son 4 hane alınamadı."
    return
  }

  isLoadingReports.value = true
  reportError.value = null
  reports.value = []

  try {
    const colRef = collection(db, "excelFiles")
    const snap = await getDocs(colRef)

    const rows: WeeklyReportEntry[] = []
    const target = targetLast4.value

    snap.forEach((docSnap) => {
      const fileName = docSnap.id
      const data = docSnap.data() as { entries?: any[] }
      const entries = Array.isArray(data.entries) ? data.entries : []

      entries.forEach((entry, index) => {
        const entryLast4 = String(entry.last4 ?? "").trim()
        const entryPhone = typeof entry.phone === "string" ? entry.phone : ""

        const phoneDigits = entryPhone.replace(/\D/g, "")
        const phoneLast4 = phoneDigits ? phoneDigits.slice(-4) : ""

        const matchByLast4 = entryLast4 && entryLast4 === target
        const matchByPhoneDigits = phoneLast4 && phoneLast4 === target
        const matchByContains =
          !matchByPhoneDigits && entryPhone && entryPhone.includes(target)

        if (matchByLast4 || matchByPhoneDigits || matchByContains) {
          rows.push({
            fileName,
            index,
            amount: Number(entry.amount ?? 0),
            date: String(entry.date ?? ""),
            description: entry.description ?? "",
            last4: (entry.last4 ?? phoneLast4) || "",
            phone: entry.phone ?? "",
          })
        }
      })
    })

    rows.sort((a, b) => {
      const diff = parseTrDate(b.date) - parseTrDate(a.date)
      if (diff !== 0) return diff
      return a.fileName.localeCompare(b.fileName)
    })

    reports.value = rows
    reportsLoadedOnce.value = true
  } catch (err: any) {
    console.error(err)
    reportError.value =
      "Raporlar alınırken bir hata oluştu: " + (err?.message ?? String(err))
  } finally {
    isLoadingReports.value = false
  }
}
</script>

<style scoped>
.detail-wrapper {
  height: 100%;
  animation: fadeIn 0.2s ease-out;
}

.card {
  padding: 1.25rem;
  border-radius: 16px;
  background: #020617;
  border: 1f solid #1f2937;
  color: #e5e7eb;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card.empty {
  align-items: flex-start;
  justify-content: center;
}

.header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

h2 {
  margin: 0 0 4px;
  font-size: 1.1rem;
  font-weight: 600;
}

.subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: #9ca3af;
}

.subtitle-small {
  margin: 0;
  font-size: 0.8rem;
  color: #9ca3af;
}

.id-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-size: 0.8rem;
}

.member-id {
  font-weight: 600;
}

.phone {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  opacity: 0.9;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
  font-size: 0.8rem;
}

.summary-item {
  padding: 8px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid #1f2937;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-item .label {
  font-size: 0.7rem;
  color: #9ca3af;
}

.summary-item .value {
  font-size: 0.85rem;
  font-weight: 500;
}

.history-card {
  margin-top: 4px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid #1f2937;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.history-header h3 {
  margin: 0 0 4px;
  font-size: 0.95rem;
}

.history-btn {
  padding: 6px 10px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: #e5e7eb;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.history-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.history-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(79, 70, 229, 0.5);
}

.report-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 0.8rem;
}

.report-summary .label {
  display: block;
  font-size: 0.7rem;
  color: #9ca3af;
}

.report-summary .value {
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
}

.history-message {
  font-size: 0.8rem;
  color: #9ca3af;
}

.history-message.error {
  color: #fecaca;
}

.history-table-container {
  max-height: 280px;
  overflow-y: auto;
  border-radius: 10px;
  border: 1px solid #1f2937;
}

.history-table-container table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.history-table-container th,
.history-table-container td {
  padding: 6px 8px;
  white-space: nowrap;
  border-bottom: 1px solid #111827;
}

.history-table-container thead {
  background: rgba(15, 23, 42, 0.95);
}

.history-table-container th {
  color: #9ca3af;
  font-weight: 500;
}

/* Badge'ler */
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
  font-size: 0.7rem;
  font-weight: 500;
}

.badge.small {
  padding: 0.1rem 0.45rem;
  font-size: 0.7rem;
}

.badge-active {
  background: rgba(34, 197, 94, 0.2);
  color: #bbf7d0;
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.badge-passive {
  background: rgba(148, 163, 184, 0.15);
  color: #e5e7eb;
  border: 1px solid rgba(148, 163, 184, 0.4);
}

.badge-yes {
  background: rgba(56, 189, 248, 0.2);
  color: #bae6fd;
  border: 1px solid rgba(56, 189, 248, 0.4);
}

.badge-no {
  background: rgba(248, 113, 113, 0.15);
  color: #fecaca;
  border: 1px solid rgba(248, 113, 113, 0.4);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0px);
  }
}
</style>