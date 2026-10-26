<template>
  <div class="ftj-wrapper">
    <div class="card">
      <div class="card-head">
        <div>
          <h2>İlk Kez Gelenler ({{ formatDate(START_DAY) }} ve sonrası)</h2>
          <p class="subtitle">
            {{ formatDate(START_DAY) }} tarihinden itibaren listemize <strong>ilk kez</strong> giren
            tüm üyeler. Her yeni gün yüklendikçe liste büyür. Daha önce herhangi bir günde
            görünüp çıkıp tekrar gelenler bu listede yer almaz. Ciro ve bakiye, üyenin
            göründüğü en son günün datasından gelir.
          </p>
        </div>
        <div class="head-actions">
          <select v-model="sortMode" class="sort-select" :disabled="isLoading">
            <option value="joinDate">Sıralama: Katılım (yeni → eski)</option>
            <option value="turnoverDesc">Sıralama: Ciro (yüksek → düşük)</option>
            <option value="turnoverAsc">Sıralama: Ciro (düşük → yüksek)</option>
          </select>
          <button class="small-btn" :disabled="isLoading || !joiners.length" @click="downloadExcel">
            Excel İndir
          </button>
          <button class="small-btn" :disabled="isLoading" @click="load">
            {{ isLoading ? "Yükleniyor..." : "Yenile" }}
          </button>
        </div>
      </div>

      <div class="day-chips" v-if="!isLoading">
        <span class="chip chip-total">Toplam: {{ joiners.length }} üye</span>
        <span v-for="d in dayCounts" :key="d.day" class="chip chip-ok">
          {{ formatDate(d.day) }}: {{ d.count }} ilk kez gelen
        </span>
      </div>

      <p v-if="error" class="message error">{{ error }}</p>

      <div v-if="!isLoading && !error">
        <div class="table-scroll" v-if="joiners.length">
          <table>
            <thead>
              <tr>
                <th>Üye ID</th>
                <th>Telefon</th>
                <th class="sortable" @click="toggleTurnoverSort">
                  Toplam Ciro
                  <span v-if="sortMode === 'turnoverDesc'">↓</span>
                  <span v-else-if="sortMode === 'turnoverAsc'">↑</span>
                </th>
                <th>Son İşlem Ayı</th>
                <th>Bakiye</th>
                <th class="sortable" @click="sortMode = 'joinDate'">
                  İlk Görülme
                  <span v-if="sortMode === 'joinDate'">↓</span>
                </th>
                <th>Son Görülme</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in sortedJoiners" :key="u.memberId">
                <td>{{ u.memberId }}</td>
                <td>{{ u.phoneNumber }}</td>
                <td>{{ u.totalAmountValueStr ?? '0,00' }}</td>
                <td>{{ u.lastOrderMonth || '-' }}</td>
                <td>{{ u.totalBalanceValueStr ?? u.totalBalanceStr ?? '-' }}</td>
                <td>{{ formatDate(u.firstSeenDate) }}</td>
                <td :class="{ 'gone': u.lastSeenDate !== latestDay }">
                  {{ formatDate(u.lastSeenDate) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty">Bu tarihten beri ilk kez gelen üye yok.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// GEÇİCİ TAB: START_DAY'den itibaren listemize ilk kez katılan üyeleri biriktirerek listeler.
// İlk görülme mantığı SyncUpload.vue'daki ile aynıdır; tab kaldırılırken
// bu dosya ve App.vue'daki buton/import silinmesi yeterli.
import { ref, computed, onMounted } from "vue"
import { collection, doc, getDoc, getDocs } from "firebase/firestore"
import ExcelJS from "exceljs"
import { db } from "../../firebase"

// Takibin başladığı gün: bu günden önce hiç görülmemiş üyeler "ilk kez gelen" sayılır.
const START_DAY = "2026-10-20"

type DailyUser = {
  memberId: number
  phoneNumber: string
  totalAmountValue?: number | null
  totalAmountValueStr?: string | null
  lastOrderMonth?: string | null
  totalBalanceStr?: string | null
  totalBalanceValueStr?: string | null
  firstSeenDate?: string | null
  lastSeenDate?: string | null
  [key: string]: any
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("tr-TR")
}

const isLoading = ref(false)
const error = ref<string | null>(null)
const dayCounts = ref<{ day: string; count: number }[]>([])
const joiners = ref<DailyUser[]>([])
const latestDay = ref<string | null>(null)

type SortMode = "joinDate" | "turnoverDesc" | "turnoverAsc"
const sortMode = ref<SortMode>("joinDate")

const byTurnover = (a: DailyUser, b: DailyUser) =>
  (a.totalAmountValue ?? 0) - (b.totalAmountValue ?? 0)

// joinDate: en yeni katılanlar üstte, aynı gün içinde ciroya göre
const sortedJoiners = computed(() => {
  const list = [...joiners.value]
  if (sortMode.value === "turnoverDesc") return list.sort((a, b) => byTurnover(b, a))
  if (sortMode.value === "turnoverAsc") return list.sort(byTurnover)
  return list.sort(
    (a, b) =>
      (b.firstSeenDate ?? "").localeCompare(a.firstSeenDate ?? "") || byTurnover(b, a),
  )
})

const toggleTurnoverSort = () => {
  sortMode.value = sortMode.value === "turnoverDesc" ? "turnoverAsc" : "turnoverDesc"
}

const getUsersOfDay = async (day: string): Promise<DailyUser[]> => {
  const snap = await getDocs(collection(doc(db, "dailyUsers", day), "users"))
  return snap.docs.map((d) => d.data() as DailyUser)
}

// Hızlı yol: metadata'daki memberIds indeksi; yoksa kullanıcı dökümanlarına düş.
const getMemberIdsOfDay = async (day: string): Promise<number[]> => {
  const snap = await getDoc(doc(db, "dailyUsers", day))
  const data = snap.data()
  if (data && Array.isArray(data.memberIds)) return data.memberIds as number[]
  const users = await getUsersOfDay(day)
  return users.map((u) => u.memberId).filter((id): id is number => id != null)
}

const getMemberIdsOfDays = async (days: string[]): Promise<number[][]> => {
  const CONCURRENCY = 12
  const all: number[][] = []
  for (let i = 0; i < days.length; i += CONCURRENCY) {
    all.push(...(await Promise.all(days.slice(i, i + CONCURRENCY).map(getMemberIdsOfDay))))
  }
  return all
}

const load = async () => {
  isLoading.value = true
  error.value = null
  joiners.value = []
  dayCounts.value = []

  try {
    const daysSnap = await getDocs(collection(db, "dailyUsers"))
    const allDays = daysSnap.docs.map((d) => d.id).sort()
    const earlierDays = allDays.filter((d) => d < START_DAY)
    const trackedDays = allDays.filter((d) => d >= START_DAY)
    latestDay.value = trackedDays[trackedDays.length - 1] ?? null
    if (!trackedDays.length) return

    // START_DAY'den önceki herhangi bir günde görülmüş üyeler "ilk kez" sayılmaz
    const seenBefore = new Set<number>()
    for (const ids of await getMemberIdsOfDays(earlierDays)) {
      for (const id of ids) seenBefore.add(id)
    }

    // Takip edilen günleri eskiden yeniye tara: ilk ve son görülme günlerini bul
    const firstSeen = new Map<number, string>()
    const lastSeen = new Map<number, string>()
    const trackedIds = await getMemberIdsOfDays(trackedDays)
    trackedDays.forEach((day, i) => {
      for (const id of trackedIds[i]) {
        if (seenBefore.has(id)) continue
        if (!firstSeen.has(id)) firstSeen.set(id, day)
        lastSeen.set(id, day)
      }
    })

    // Üye datası: göründüğü en son günden. Gün başına bir kez okunur.
    const idsByLastDay = new Map<string, Set<number>>()
    for (const [id, day] of lastSeen) {
      if (!idsByLastDay.has(day)) idsByLastDay.set(day, new Set())
      idsByLastDay.get(day)!.add(id)
    }

    const result: DailyUser[] = []
    for (const [day, ids] of idsByLastDay) {
      for (const u of await getUsersOfDay(day)) {
        if (u.memberId == null || !ids.has(u.memberId)) continue
        result.push({
          ...u,
          firstSeenDate: firstSeen.get(u.memberId),
          lastSeenDate: day,
        })
      }
    }

    joiners.value = result

    const counts = new Map<string, number>()
    for (const day of firstSeen.values()) counts.set(day, (counts.get(day) ?? 0) + 1)
    dayCounts.value = trackedDays.map((day) => ({ day, count: counts.get(day) ?? 0 }))
  } catch (err: any) {
    console.error(err)
    error.value = "Liste alınırken hata: " + (err?.message ?? String(err))
  } finally {
    isLoading.value = false
  }
}

onMounted(load)

// Ekrandaki listeyi aynı sırayla Excel'e aktar.
// Son yüklenen günde artık görünmeyen üyelerin "Son Görülme" hücresi kırmızı.
const downloadExcel = async () => {
  if (!joiners.value.length) return

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("İlk Kez Gelenler")

  const headerRow = sheet.addRow([
    "Üye ID",
    "Telefon",
    "Toplam Ciro",
    "Son İşlem Ayı",
    "Bakiye",
    "İlk Görülme",
    "Son Görülme",
  ])
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } }
    cell.font = { bold: true, color: { argb: "FFE5E7EB" } }
  })

  for (const u of sortedJoiners.value) {
    const row = sheet.addRow([
      u.memberId,
      u.phoneNumber,
      u.totalAmountValueStr ?? "0,00",
      u.lastOrderMonth || "",
      u.totalBalanceValueStr ?? u.totalBalanceStr ?? "",
      formatDate(u.firstSeenDate),
      formatDate(u.lastSeenDate),
    ])
    if (u.lastSeenDate !== latestDay.value) {
      row.getCell(7).font = { bold: true, color: { argb: "FFDC2626" } }
    }
  }

  sheet.columns.forEach((col) => {
    if (col) col.width = 18
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `ilk-kez-gelenler-${START_DAY}-${latestDay.value ?? ""}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.ftj-wrapper {
  animation: fadeIn 0.2s ease-out;
}

.card {
  padding: 16px;
  border-radius: 16px;
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.4);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.7);
  color: #e5e7eb;
  max-width: 1200px;
  margin: 0 auto;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

h2 {
  margin: 0 0 8px;
  font-size: 1.2rem;
}

.subtitle {
  margin: 0 0 12px;
  font-size: 0.9rem;
  color: #9ca3af;
}

.day-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-select {
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid #374151;
  background: #020617;
  color: #e5e7eb;
  font-size: 0.8rem;
}

th.sortable {
  cursor: pointer;
  user-select: none;
}

th.sortable:hover {
  color: #e5e7eb;
}

.chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
}

.chip-ok {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.5);
  color: #bbf7d0;
}

.chip-total {
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.5);
  color: #c7d2fe;
  font-weight: 600;
}

/* Son yüklenen günde artık görünmeyen üye */
.gone {
  color: #f87171;
}

.small-btn {
  padding: 6px 12px;
  border-radius: 999px;
  border: none;
  background: #1f2937;
  color: #e5e7eb;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
}

.small-btn:hover:enabled {
  background: #374151;
}

.small-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message.error {
  color: #fecaca;
  font-size: 0.9rem;
}

.empty {
  color: #9ca3af;
  font-size: 0.9rem;
}

.table-scroll {
  max-height: 600px;
  overflow: auto;
  border-radius: 12px;
  border: 1px solid rgba(51, 65, 85, 0.8);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

th,
td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(51, 65, 85, 0.8);
  text-align: left;
  white-space: nowrap;
}

th {
  color: #9ca3af;
  font-weight: 500;
  position: sticky;
  top: 0;
  background: #0f172a;
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
