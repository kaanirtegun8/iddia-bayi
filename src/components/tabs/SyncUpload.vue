<template>
  <div class="sync-wrapper">
    <div class="card">
      <h2>Günlük Kullanıcı Datası Yükleme (Firebase)</h2>
      <p class="subtitle">
        Elindeki günlük JSON'u aşağıya yapıştırıp,
        <strong>belirttiğin tarihe</strong> kaydedebilirsin.
        Tarih alanı varsayılan olarak bugünün tarihiyle doldurulur.
      </p>

      <div class="fields">
        <label class="field">
          <span>Tarih (YYYY-MM-DD)</span>
          <input v-model="dateKey" type="text" :placeholder="todayStr" />
        </label>

        <label class="field">
          <span>Günlük Kullanıcı JSON'u</span>
          <textarea
            v-model="rawJson"
            rows="12"
            placeholder='[ { "memberId": 123, "phoneNumber": "05..." }, ... ]'
          ></textarea>
        </label>
      </div>

      <button
        class="upload-btn"
        :disabled="isLoading || !rawJson.trim() || !dateKey.trim()"
        @click="handleUpload"
      >
        <span v-if="!isLoading">Firebase'e Yükle</span>
        <span v-else>Yükleniyor...</span>
      </button>

      <p v-if="message" :class="['message', message.type]">
        {{ message.text }}
      </p>
    </div>

    <!-- ALT BLOK: GÜN KARŞILAŞTIRMA -->
    <div class="card compare-card">
      <h2>Gün Karşılaştırma (Gidenler / Yeni Gelenler)</h2>
      <p class="subtitle">
        Firestore'a yüklenmiş günler arasından iki tarih seçip
        <strong>giden kullanıcılar</strong> ve
        <strong>yeni gelen kullanıcılar</strong> listesini görebilir,
        ciroya göre sıralı ve renkli Excel raporu indirebilirsin.
      </p>

      <div class="compare-fields">
        <label class="field">
          <span>Eski Gün (A)</span>
          <select v-model="selectedDayA">
            <option value="" disabled>Seç...</option>
            <option v-for="d in availableDays" :key="d" :value="d">
              {{ d }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Yeni Gün (B)</span>
          <select v-model="selectedDayB">
            <option value="" disabled>Seç...</option>
            <option v-for="d in availableDays" :key="d" :value="d">
              {{ d }}
            </option>
          </select>
        </label>
      </div>

      <div class="compare-buttons">
        <button
          type="button"
          class="small-btn"
          :disabled="!availableDays.length"
          @click="selectLastTwoDays"
        >
          Son iki günü otomatik seç
        </button>

        <button
          type="button"
          class="upload-btn"
          :disabled="diffLoading || !selectedDayA || !selectedDayB || selectedDayA === selectedDayB"
          @click="handleDiff"
        >
          <span v-if="!diffLoading">Günleri Karşılaştır</span>
          <span v-else>Hesaplanıyor...</span>
        </button>
      </div>

      <p v-if="diffMessage" :class="['message', diffMessage.type]">
        {{ diffMessage.text }}
      </p>

      <div v-if="diffResult" class="diff-results">
        <div class="diff-summary">
          <div>
            <strong>Karşılaştırılan Günler:</strong>
            <div>A (Eski): {{ diffResult.dayA }}</div>
            <div>B (Yeni): {{ diffResult.dayB }}</div>
          </div>
          <div>
            <div>
              Giden kullanıcı sayısı:
              <strong>{{ diffResult.leftUsers.length }}</strong>
            </div>
            <div>
              Yeni gelen kullanıcı sayısı:
              <strong>{{ diffResult.joinedUsers.length }}</strong>
            </div>
          </div>
        </div>

        <div class="diff-actions">
          <button
            class="small-btn"
            :disabled="!diffResult.leftUsers.length"
            @click="downloadExcel(diffResult.leftUsers, `giden-kullanicilar-${diffResult.dayA}-vs-${diffResult.dayB}.xlsx`)"
          >
            Gidenleri Excel İndir
          </button>

          <button
            class="small-btn"
            :disabled="!diffResult.joinedUsers.length"
            @click="downloadExcel(diffResult.joinedUsers, `yeni-gelen-kullanicilar-${diffResult.dayA}-vs-${diffResult.dayB}.xlsx`)"
          >
            Yeni Gelenleri Excel İndir
          </button>
        </div>

        <div class="tables">
          <div class="table-block">
            <h3>Gidenler ({{ diffResult.leftUsers.length }})</h3>
            <div class="table-scroll" v-if="diffResult.leftUsers.length">
              <table>
                <thead>
                  <tr>
                    <th>Üye ID</th>
                    <th>Telefon</th>
                    <th>Toplam Ciro</th>
                    <th>Son İşlem Ayı</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="u in diffResult.leftUsers"
                    :key="u.memberId"
                  >
                    <td>{{ u.memberId }}</td>
                    <td>{{ u.phoneNumber }}</td>
                    <td>{{ u.totalAmountValueStr ?? '0,00' }}</td>
                    <td>{{ u.lastOrderMonth || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else>Bu günler arasında giden kullanıcı yok.</p>
          </div>

          <div class="table-block">
            <h3>Yeni Gelenler ({{ diffResult.joinedUsers.length }})</h3>
            <div class="table-scroll" v-if="diffResult.joinedUsers.length">
              <table>
                <thead>
                  <tr>
                    <th>Üye ID</th>
                    <th>Telefon</th>
                    <th>Toplam Ciro</th>
                    <th>Son İşlem Ayı</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="u in diffResult.joinedUsers"
                    :key="u.memberId"
                  >
                    <td>{{ u.memberId }}</td>
                    <td>{{ u.phoneNumber }}</td>
                    <td>{{ u.totalAmountValueStr ?? '0,00' }}</td>
                    <td>{{ u.lastOrderMonth || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else>Bu günler arasında yeni gelen kullanıcı yok.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue"
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore"
import ExcelJS from "exceljs"
import { db } from "../../firebase"

type DailyUser = {
  memberId: number
  phoneNumber: string
  totalAmountValue?: number | null
  totalAmountValueStr?: string | null
  lastOrderMonth?: string | null
  totalBalanceStr?: string | null
  totalBalanceValueStr?: string | null
  [key: string]: any
}

const rawJson = ref("")
const todayStr = new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"
const dateKey = ref(todayStr)
const isLoading = ref(false)
const message = ref<null | { type: "success" | "error"; text: string }>(null)

const MAX_BATCH = 400

// --- GÜNLÜK YÜKLEME ---
const handleUpload = async () => {
  message.value = null

  if (!dateKey.value.trim()) {
    message.value = { type: "error", text: "Tarih alanı boş olamaz." }
    return
  }

  let users: DailyUser[]

  try {
    const parsed = JSON.parse(rawJson.value)
    if (!Array.isArray(parsed)) {
      throw new Error("JSON bir array değil.")
    }
    users = parsed as DailyUser[]
    if (!users.length) {
      throw new Error("JSON içinde kullanıcı yok (boş array).")
    }
  } catch (err: any) {
    console.error(err)
    message.value = {
      type: "error",
      text: "JSON parse edilirken hata: " + (err?.message ?? String(err)),
    }
    return
  }

  isLoading.value = true

  try {
    const trimmedDate = dateKey.value.trim()

    // 1) Gün metadata doc
    const parentRef = doc(db, "dailyUsers", trimmedDate)

    await setDoc(
      parentRef,
      {
        date: trimmedDate,
        totalUsers: users.length,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    )

    // 2) Kullanıcılar: subcollection'a batch ile yaz
    let batch = writeBatch(db)
    let opCount = 0

    for (const user of users) {
      if (user.memberId == null) {
        continue
      }

      const userId = String(user.memberId)
      const userRef = doc(collection(parentRef, "users"), userId)

      batch.set(userRef, {
        ...user,
        memberId: user.memberId,
        phoneNumber: user.phoneNumber ?? "",
      })

      opCount++

      if (opCount >= MAX_BATCH) {
        await batch.commit()
        batch = writeBatch(db)
        opCount = 0
      }
    }

    if (opCount > 0) {
      await batch.commit()
    }

    message.value = {
      type: "success",
      text: `✅ ${trimmedDate} için ${users.length} kullanıcı başarıyla yüklendi.`,
    }

    // Gün listesini yenile
    await loadAvailableDays()
  } catch (err: any) {
    console.error(err)
    message.value = {
      type: "error",
      text: "Yükleme sırasında hata: " + (err?.message ?? String(err)),
    }
  } finally {
    isLoading.value = false
  }
}

// --- ORTAK YARDIMCI FONKSİYONLAR ---

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-"
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString("tr-TR")
  } catch {
    return value
  }
}

// Ciroya göre satır rengi
// 1.000.000+  -> Yeşil
// 100.000 - 999.999 -> Sarı
// 50.000 - 99.999 -> Turuncu
// 50.000 altı -> Kırmızı
const getTurnoverColorCode = (totalAmountValue?: number | null): string => {
  const value = totalAmountValue ?? 0

  if (value >= 1_000_000) {
    return "FF22C55E" // yeşil
  }
  if (value >= 100_000) {
    return "FFFACC15" // sarı
  }
  if (value >= 50_000) {
    return "FFF97316" // turuncu
  }
  return "FFEF4444" // kırmızı
}

// --- GÜN KARŞILAŞTIRMA STATE ---

const availableDays = ref<string[]>([])
const selectedDayA = ref<string>("")
const selectedDayB = ref<string>("")
const diffLoading = ref(false)
const diffMessage = ref<null | { type: "success" | "error"; text: string }>(null)

const diffResult = ref<null | {
  dayA: string
  dayB: string
  leftUsers: DailyUser[]
  joinedUsers: DailyUser[]
}>(null)

// Firestore'dan mevcut günleri çek (tarih alanına göre desc)
const loadAvailableDays = async () => {
  const q = query(
    collection(db, "dailyUsers"),
    orderBy("date", "desc"),
  )

  const snap = await getDocs(q)
  const days: string[] = []
  snap.forEach((docSnap) => {
    days.push(docSnap.id)
  })
  availableDays.value = days

  // Eğer en az 2 gün varsa default olarak son 2 gün
  if (days.length >= 2) {
    selectedDayB.value = days[0]
    selectedDayA.value = days[1]
  }
}

onMounted(async () => {
  await loadAvailableDays()
})

// Gün A'nın tüm kullanıcılarını getir
const getUsersOfDay = async (day: string): Promise<DailyUser[]> => {
  const parentRef = doc(db, "dailyUsers", day)
  const usersCol = collection(parentRef, "users")
  const snap = await getDocs(usersCol)

  const result: DailyUser[] = []
  snap.forEach((docSnap) => {
    result.push(docSnap.data() as DailyUser)
  })
  return result
}

// İki günü diff et
const diffTwoDays = async (dayA: string, dayB: string) => {
  const [usersA, usersB] = await Promise.all([
    getUsersOfDay(dayA),
    getUsersOfDay(dayB),
  ])

  const mapA = new Map<number, DailyUser>()
  const mapB = new Map<number, DailyUser>()

  for (const u of usersA) {
    if (u.memberId != null) mapA.set(u.memberId, u)
  }
  for (const u of usersB) {
    if (u.memberId != null) mapB.set(u.memberId, u)
  }

  const leftUsers: DailyUser[] = []
  const joinedUsers: DailyUser[] = []

  // dayA'da var, dayB'de yok -> gidenler
  for (const [id, user] of mapA.entries()) {
    if (!mapB.has(id)) {
      leftUsers.push(user)
    }
  }

  // dayB'de var, dayA'da yok -> yeni gelenler
  for (const [id, user] of mapB.entries()) {
    if (!mapA.has(id)) {
      joinedUsers.push(user)
    }
  }

  // Ciroya göre (totalAmountValue) büyükten küçüğe sırala
  const sortByTurnoverDesc = (a: DailyUser, b: DailyUser) =>
    (b.totalAmountValue ?? 0) - (a.totalAmountValue ?? 0)

  leftUsers.sort(sortByTurnoverDesc)
  joinedUsers.sort(sortByTurnoverDesc)

  return { leftUsers, joinedUsers }
}

// UI actions
const selectLastTwoDays = () => {
  if (availableDays.value.length >= 2) {
    selectedDayB.value = availableDays.value[0]
    selectedDayA.value = availableDays.value[1]
  }
}

const handleDiff = async () => {
  diffMessage.value = null
  diffResult.value = null

  const dayA = selectedDayA.value
  const dayB = selectedDayB.value

  if (!dayA || !dayB) {
    diffMessage.value = { type: "error", text: "İki tarih de seçilmeli." }
    return
  }
  if (dayA === dayB) {
    diffMessage.value = { type: "error", text: "A ve B günleri farklı olmalı." }
    return
  }

  diffLoading.value = true

  try {
    const { leftUsers, joinedUsers } = await diffTwoDays(dayA, dayB)

    diffResult.value = {
      dayA,
      dayB,
      leftUsers,
      joinedUsers,
    }

    diffMessage.value = {
      type: "success",
      text: `Karşılaştırma tamamlandı. Giden: ${leftUsers.length}, Yeni gelen: ${joinedUsers.length}.`,
    }
  } catch (err: any) {
    console.error(err)
    diffMessage.value = {
      type: "error",
      text: "Karşılaştırma sırasında hata: " + (err?.message ?? String(err)),
    }
  } finally {
    diffLoading.value = false
  }
}

// Diff sonuçlarını renkli Excel olarak indir
const downloadExcel = async (users: DailyUser[], filename: string) => {
  if (!users.length) return

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Rapor")

  // Başlıklar
  const headerRow = sheet.addRow([
    "Üye ID",
    "Telefon",
    "Toplam Ciro",
    "Son İşlem Ayı",
    "Son Kupon Tarihi",
    "Son Yükleme Tarihi",
    "Bakiye",
  ])

  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF111827" },
    }
    cell.font = {
      bold: true,
      color: { argb: "FFE5E7EB" },
    }
  })

  // Güvenlik için tekrar ciroya göre sırala
  const sorted = [...users].sort(
    (a, b) => (b.totalAmountValue ?? 0) - (a.totalAmountValue ?? 0),
  )

  sorted.forEach((u) => {
    const colorCode = getTurnoverColorCode(u.totalAmountValue)

    const row = sheet.addRow([
      u.memberId,
      u.phoneNumber,
      u.totalAmountValueStr ?? "0,00",
      u.lastOrderMonth || "",
      formatDate(u.lastOrderDate),
      formatDate(u.lastDepositeDate),
      u.totalBalanceValueStr ?? u.totalBalanceStr ?? "",
    ])

    // Satırın tamamını ciroya göre boyuyoruz
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colorCode },
      }
    })
  })

  // Kolon genişlikleri
  sheet.columns.forEach((col) => {
    if (!col) return
    col.width = 18
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.sync-wrapper {
  animation: fadeIn 0.2s ease-out;
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.compare-card {
  margin-top: 12px;
}

h2 {
  margin: 0 0 8px;
  font-size: 1.2rem;
}

.subtitle {
  margin: 0 0 16px;
  font-size: 0.9rem;
  color: #9ca3af;
}

.subtitle code {
  background: rgba(15, 23, 42, 0.8);
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 0.8rem;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.9rem;
}

.field input,
.field select {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #4b5563;
  background: #020617;
  color: #e5e7eb;
  font-size: 0.9rem;
}

.field textarea {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #4b5563;
  background: #020617;
  color: #e5e7eb;
  font-size: 0.85rem;
  resize: vertical;
  min-height: 200px;
}

.upload-btn {
  padding: 10px 16px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #ecfdf5;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.95rem;
  transition: all 0.2s ease;
}

.upload-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  background: #4b5563;
}

.upload-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(34, 197, 94, 0.4);
}

.message {
  margin-top: 10px;
  font-size: 0.9rem;
}

.message.success {
  color: #bbf7d0;
}

.message.error {
  color: #fecaca;
}

.compare-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.compare-fields .field {
  flex: 1;
  min-width: 180px;
}

.compare-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.small-btn {
  padding: 6px 10px;
  border-radius: 999px;
  border: none;
  background: #1f2937;
  color: #e5e7eb;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.small-btn:hover:enabled {
  background: #374151;
}

.small-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.diff-results {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diff-summary {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.9rem;
}

.diff-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tables {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.table-block h3 {
  font-size: 0.95rem;
  margin-bottom: 6px;
}

.table-scroll {
  max-height: 400px;
  overflow-y: auto;
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