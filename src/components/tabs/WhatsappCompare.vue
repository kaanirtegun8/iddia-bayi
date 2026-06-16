<template>
  <div class="wa-wrapper">
    <!-- ÜST: LİSTE GÖNDERME -->
    <div class="card">
      <h2>WhatsApp Numara Listesi Gönder</h2>
      <p class="subtitle">
        Chrome eklentisinin panoya kopyaladığı numaraları aşağıya yapıştır.
        Her gönderdiğin liste <strong>Firebase'de saklanır</strong> ve en son üye
        listesiyle karşılaştırılır. Format önemli değil; numaraları otomatik ayıklarım.
      </p>

      <div class="fields">
        <label class="field">
          <span>WhatsApp numaraları</span>
          <textarea
            v-model="rawNumbers"
            rows="8"
            placeholder="+90 532 000 00 00&#10;0533...&#10;533..."
          ></textarea>
        </label>
      </div>

      <div class="row">
        <span class="hint">Ayıklanan numara: <strong>{{ parsedNumbers.length }}</strong></span>
        <label class="field-day">
          <span>Karşılaştırılacak üye günü</span>
          <select v-model="selectedMemberDay" :disabled="!availableDays.length">
            <option value="" disabled>Seç...</option>
            <option v-for="d in availableDays" :key="d" :value="d">{{ d }}</option>
          </select>
        </label>
      </div>

      <div class="actions">
        <button
          class="primary-btn"
          :disabled="isSaving || !parsedNumbers.length"
          @click="saveAndCompare"
        >
          <span v-if="!isSaving">Kaydet & Karşılaştır</span>
          <span v-else>İşleniyor...</span>
        </button>

        <button
          class="ghost-btn"
          :disabled="isComparing || !latestList"
          @click="compareLatest"
          title="Yeni liste yapıştırmadan, en son kayıtlı listeyle karşılaştır"
        >
          En son liste ile karşılaştır
        </button>
      </div>

      <p v-if="message" :class="['message', message.type]">{{ message.text }}</p>
    </div>

    <!-- GEÇMİŞ LİSTELER -->
    <div class="card" v-if="savedLists.length">
      <h2>Geçmiş WhatsApp Listeleri</h2>
      <div class="history">
        <label class="field">
          <span>Kayıtlı liste seç</span>
          <select v-model="selectedListId">
            <option value="" disabled>Seç...</option>
            <option v-for="l in savedLists" :key="l.id" :value="l.id">
              {{ formatStamp(l.createdAtIso) }} · {{ l.groupName || "grup" }} · {{ l.count }} numara
            </option>
          </select>
        </label>
        <button
          class="ghost-btn"
          :disabled="isComparing || !selectedListId"
          @click="compareSelected"
        >
          Seçili liste ile karşılaştır
        </button>
      </div>
    </div>

    <!-- SONUÇLAR -->
    <div class="card" v-if="result">
      <div class="result-head">
        <h2>Karşılaştırma Sonucu</h2>
        <div class="meta">
          <span>WhatsApp: <strong>{{ result.waCount }}</strong> numara</span>
          <span>Üye günü: <strong>{{ result.memberDay }}</strong> ({{ result.memberCount }} üye)</span>
          <span>Eşleşen: <strong>{{ result.matchedCount }}</strong></span>
        </div>
      </div>

      <div class="result-grid">
        <!-- ÜYE OLUP GRUPTA OLMAYANLAR -->
        <div class="result-block">
          <div class="block-head">
            <h3>Üye olup grupta olmayanlar ({{ result.membersNotInGroup.length }})</h3>
            <button
              class="small-btn"
              :disabled="!result.membersNotInGroup.length"
              @click="exportMembersExcel(result.membersNotInGroup, `uye-grupta-yok-${result.memberDay}.xlsx`)"
            >
              Excel indir
            </button>
          </div>
          <p class="block-sub">Gruba davet edilecekler</p>
          <div class="table-scroll" v-if="result.membersNotInGroup.length">
            <table>
              <thead>
                <tr><th>Üye ID</th><th>Telefon</th><th>Toplam Ciro</th><th>Bakiye</th></tr>
              </thead>
              <tbody>
                <tr v-for="u in result.membersNotInGroup" :key="u.memberId">
                  <td>{{ u.memberId }}</td>
                  <td>{{ u.phoneNumber || "-" }}</td>
                  <td>{{ u.totalAmountValueStr ?? "0,00" }}</td>
                  <td>{{ u.totalBalanceStr ?? u.totalBalanceValueStr ?? "-" }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty">Hepsi grupta görünüyor 🎉</p>
        </div>

        <!-- GRUPTA OLUP ÜYE OLMAYANLAR -->
        <div class="result-block">
          <div class="block-head">
            <h3>Grupta olup üye olmayanlar ({{ result.numbersNotMembers.length }})</h3>
            <div class="head-actions">
              <button
                class="small-btn"
                :disabled="!result.numbersNotMembers.length"
                @click="exportNumbersExcel(result.numbersNotMembers, `grupta-var-uye-yok-${result.memberDay}.xlsx`)"
              >
                Excel indir
              </button>
              <button
                class="small-btn"
                :disabled="!result.numbersNotMembers.length"
                @click="copyNumbers(result.numbersNotMembers)"
              >
                Numaraları kopyala
              </button>
            </div>
          </div>
          <p class="block-sub">Üye yapılacak potansiyel kişiler</p>
          <div class="table-scroll" v-if="result.numbersNotMembers.length">
            <table>
              <thead><tr><th>#</th><th>Telefon</th></tr></thead>
              <tbody>
                <tr v-for="(n, i) in result.numbersNotMembers" :key="n">
                  <td>{{ i + 1 }}</td>
                  <td>{{ displayPhone(n) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty">Gruptaki herkes zaten üye 🎉</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import {
  collection,
  doc,
  getDocs,
  addDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore"
import ExcelJS from "exceljs"
import { db } from "../../firebase"

type Member = {
  memberId: number
  phoneNumber?: string | null
  totalAmountValue?: number | null
  totalAmountValueStr?: string | null
  totalBalanceStr?: string | null
  totalBalanceValueStr?: string | null
  lastOrderMonth?: string | null
  [key: string]: any
}

type SavedList = {
  id: string
  groupName: string
  count: number
  createdAtIso: string
  numbers: string[]
}

// --- STATE ---
const rawNumbers = ref("")
const groupName = ref("")
const isSaving = ref(false)
const isComparing = ref(false)
const message = ref<null | { type: "success" | "error"; text: string }>(null)

const availableDays = ref<string[]>([])
const selectedMemberDay = ref("")

const savedLists = ref<SavedList[]>([])
const selectedListId = ref("")

const result = ref<null | {
  memberDay: string
  memberCount: number
  waCount: number
  matchedCount: number
  membersNotInGroup: Member[]
  numbersNotMembers: string[]
}>(null)

const latestList = computed(() => savedLists.value[0] ?? null)

// --- TELEFON NORMALİZASYON ---
// Tüm rakamları al, son 10 haneyi anahtar yap (+90 / 0 / boşluk farkı önemsiz)
const normPhone = (raw: unknown): string => {
  const d = String(raw ?? "").replace(/\D/g, "")
  return d.length >= 10 ? d.slice(-10) : ""
}

const displayPhone = (n10: string): string => {
  if (n10.length !== 10) return n10
  return "0" + n10.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4")
}

// Yapıştırılan metinden numaraları ayıkla
const parsedNumbers = computed<string[]>(() => {
  const matches = rawNumbers.value.match(/\+?\d[\d\s\-()]{7,}\d/g) || []
  const set = new Set<string>()
  for (const m of matches) {
    const n = normPhone(m)
    if (n) set.add(n)
  }
  return [...set]
})

// --- FIRESTORE: GÜNLER & LİSTELER ---
const loadAvailableDays = async () => {
  const q = query(collection(db, "dailyUsers"), orderBy("date", "desc"))
  const snap = await getDocs(q)
  const days: string[] = []
  snap.forEach((d) => days.push(d.id))
  availableDays.value = days
  if (days.length && !selectedMemberDay.value) selectedMemberDay.value = days[0]
}

const loadSavedLists = async () => {
  const q = query(
    collection(db, "whatsappLists"),
    orderBy("createdAtIso", "desc"),
    limit(50),
  )
  const snap = await getDocs(q)
  const lists: SavedList[] = []
  snap.forEach((d) => {
    const data = d.data() as any
    lists.push({
      id: d.id,
      groupName: data.groupName ?? "",
      count: data.count ?? (data.numbers?.length ?? 0),
      createdAtIso: data.createdAtIso ?? "",
      numbers: Array.isArray(data.numbers) ? data.numbers : [],
    })
  })
  savedLists.value = lists
  if (lists.length && !selectedListId.value) selectedListId.value = lists[0].id
}

const getUsersOfDay = async (day: string): Promise<Member[]> => {
  const parentRef = doc(db, "dailyUsers", day)
  const snap = await getDocs(collection(parentRef, "users"))
  const result: Member[] = []
  snap.forEach((d) => result.push(d.data() as Member))
  return result
}

// --- KARŞILAŞTIRMA ÇEKİRDEĞİ ---
const runComparison = async (waNumbers: string[]) => {
  const day = selectedMemberDay.value || availableDays.value[0]
  if (!day) {
    message.value = { type: "error", text: "Karşılaştırılacak üye günü bulunamadı." }
    return
  }

  const waSet = new Set(waNumbers.filter((n) => n.length === 10))
  const members = await getUsersOfDay(day)

  const memberKeys = new Set<string>()
  const membersNotInGroup: Member[] = []
  for (const m of members) {
    const key = normPhone(m.phoneNumber)
    if (key) memberKeys.add(key)
    // telefonu olan ama grupta olmayan üyeler
    if (key && !waSet.has(key)) membersNotInGroup.push(m)
  }

  // grupta var ama hiçbir üyenin telefonuyla eşleşmiyor
  const numbersNotMembers: string[] = []
  for (const n of waSet) {
    if (!memberKeys.has(n)) numbersNotMembers.push(n)
  }

  const matchedCount = waSet.size - numbersNotMembers.length

  membersNotInGroup.sort(
    (a, b) => (b.totalAmountValue ?? 0) - (a.totalAmountValue ?? 0),
  )
  numbersNotMembers.sort()

  result.value = {
    memberDay: day,
    memberCount: members.length,
    waCount: waSet.size,
    matchedCount,
    membersNotInGroup,
    numbersNotMembers,
  }
}

// --- AKSİYONLAR ---
const saveAndCompare = async () => {
  message.value = null
  const numbers = parsedNumbers.value
  if (!numbers.length) {
    message.value = { type: "error", text: "Geçerli numara bulunamadı." }
    return
  }

  isSaving.value = true
  try {
    // 1) Firestore'a kaydet (her liste saklanır)
    const createdAtIso = new Date().toISOString()
    await addDoc(collection(db, "whatsappLists"), {
      groupName: groupName.value.trim(),
      count: numbers.length,
      numbers,
      createdAtIso,
      createdAt: serverTimestamp(),
    })

    // 2) Karşılaştır
    await runComparison(numbers)

    // 3) Geçmişi tazele
    await loadSavedLists()

    message.value = {
      type: "success",
      text: `✅ ${numbers.length} numaralı liste kaydedildi ve karşılaştırıldı.`,
    }
    rawNumbers.value = ""
  } catch (err: any) {
    console.error(err)
    message.value = {
      type: "error",
      text: "Kaydetme/karşılaştırma hatası: " + (err?.message ?? String(err)),
    }
  } finally {
    isSaving.value = false
  }
}

const compareLatest = async () => {
  message.value = null
  if (!latestList.value) return
  isComparing.value = true
  try {
    await runComparison(latestList.value.numbers)
    message.value = {
      type: "success",
      text: `En son liste (${formatStamp(latestList.value.createdAtIso)}) ile karşılaştırıldı.`,
    }
  } catch (err: any) {
    console.error(err)
    message.value = { type: "error", text: "Hata: " + (err?.message ?? String(err)) }
  } finally {
    isComparing.value = false
  }
}

const compareSelected = async () => {
  message.value = null
  const list = savedLists.value.find((l) => l.id === selectedListId.value)
  if (!list) return
  isComparing.value = true
  try {
    await runComparison(list.numbers)
    message.value = {
      type: "success",
      text: `Seçili liste (${list.count} numara) ile karşılaştırıldı.`,
    }
  } catch (err: any) {
    console.error(err)
    message.value = { type: "error", text: "Hata: " + (err?.message ?? String(err)) }
  } finally {
    isComparing.value = false
  }
}

// --- YARDIMCILAR ---
const formatStamp = (iso: string): string => {
  if (!iso) return "-"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("tr-TR")
}

const copyNumbers = async (numbers: string[]) => {
  const text = numbers.map(displayPhone).join("\n")
  try {
    await navigator.clipboard.writeText(text)
    message.value = { type: "success", text: `${numbers.length} numara panoya kopyalandı.` }
  } catch {
    message.value = { type: "error", text: "Panoya kopyalanamadı." }
  }
}

const exportNumbersExcel = async (numbers: string[], filename: string) => {
  if (!numbers.length) return
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Numaralar")

  const headerRow = sheet.addRow(["#", "Telefon"])
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } }
    cell.font = { bold: true, color: { argb: "FFE5E7EB" } }
  })

  numbers.forEach((n, i) => {
    sheet.addRow([i + 1, displayPhone(n)])
  })

  sheet.columns.forEach((col, i) => {
    if (col) col.width = i === 0 ? 8 : 20
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

const exportMembersExcel = async (members: Member[], filename: string) => {
  if (!members.length) return
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Üyeler")

  const headerRow = sheet.addRow(["Üye ID", "Telefon", "Toplam Ciro", "Bakiye", "Son İşlem Ayı"])
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } }
    cell.font = { bold: true, color: { argb: "FFE5E7EB" } }
  })

  members.forEach((u) => {
    sheet.addRow([
      u.memberId,
      u.phoneNumber ?? "",
      u.totalAmountValueStr ?? "0,00",
      u.totalBalanceStr ?? u.totalBalanceValueStr ?? "",
      u.lastOrderMonth || "",
    ])
  })

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
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

onMounted(async () => {
  try {
    await Promise.all([loadAvailableDays(), loadSavedLists()])
  } catch (err: any) {
    console.error(err)
    message.value = {
      type: "error",
      text: "Veri yüklenirken hata: " + (err?.message ?? String(err)),
    }
  }
})
</script>

<style scoped>
.wa-wrapper {
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
  width: 100%;
  box-sizing: border-box;
}

h2 {
  margin: 0 0 8px;
  font-size: 1.2rem;
}

h3 {
  margin: 0;
  font-size: 0.95rem;
}

.subtitle {
  margin: 0 0 16px;
  font-size: 0.9rem;
  color: #9ca3af;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.field,
.field-day {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.9rem;
}

.field input,
.field select,
.field-day select {
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
  min-height: 140px;
}

.row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.hint {
  font-size: 0.85rem;
  color: #9ca3af;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.primary-btn {
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

.primary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  background: #4b5563;
}

.primary-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(34, 197, 94, 0.4);
}

.ghost-btn {
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid #475569;
  background: #1e293b;
  color: #cbd5e1;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.ghost-btn:hover:not(:disabled) {
  background: #334155;
}

.ghost-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.history {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.history .field {
  flex: 1;
  min-width: 240px;
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

.result-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.result-head .meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: #cbd5e1;
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.result-block {
  background: radial-gradient(circle at top left, #111827, #020617);
  border: 1px solid #1f2937;
  border-radius: 12px;
  padding: 12px;
}

.block-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.head-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.block-sub {
  margin: 4px 0 8px;
  font-size: 0.78rem;
  color: #9ca3af;
}

.small-btn {
  padding: 6px 10px;
  border-radius: 999px;
  border: none;
  background: #1f2937;
  color: #e5e7eb;
  font-size: 0.78rem;
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

.table-scroll {
  max-height: 420px;
  overflow-y: auto;
  border-radius: 10px;
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
  background: #0b1220;
}

.empty {
  font-size: 0.85rem;
  color: #9ca3af;
  padding: 8px 2px;
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
