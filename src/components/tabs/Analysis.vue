<template>
  <div class="analysis-page">
    <!-- ÜST BAŞLIK -->
    <div class="analysis-header">
      <div>
        <h2>📊 Ayrılan Üye Analizi</h2>
        <p class="subtitle">
          Excel raporlarındaki <strong>Kupon Oynama</strong> hareketlerini,
          <strong>mevcut üyeler listesi</strong> ile karşılaştırıyoruz.
          Sadece <strong>bizde üye olmayan (last4 eşleşmeyen)</strong> telefonlar listelenir.
        </p>
      </div>

      <div v-if="results.length" class="summary-chip">
        <span>Toplam Kupon Tutarı</span>
        <strong>{{ formatAmount(totalAmount) }}</strong>
      </div>
    </div>

    <!-- KONTROLLER KARTI -->
    <div class="card controls-card">
      <div class="controls-grid">
        <div class="field">
          <label>Tek Dosya Seç</label>
          <select v-model="selectedFileId">
            <option value="" disabled>Dosya seçiniz...</option>
            <option
              v-for="file in files"
              :key="file.id"
              :value="file.id"
            >
              {{ file.fileName }} ({{ file.rowCount }} satır)
            </option>
          </select>
        </div>

        <div class="buttons-col">
          <button
            class="btn primary"
            :disabled="!selectedFileId || loadingAnalysis || files.length === 0"
            @click="runSingleFileAnalysis"
          >
            {{ loadingAnalysis && analysisMode === 'single'
              ? 'Seçili dosya analiz ediliyor...'
              : 'Seçili Dosyada Analiz Yap' }}
          </button>

          <button
            class="btn ghost"
            :disabled="loadingAnalysis || files.length === 0"
            @click="runAllFilesAnalysis"
          >
            {{ loadingAnalysis && analysisMode === 'all'
              ? 'Tüm dosyalar analiz ediliyor...'
              : 'Tüm Dosyalarda Analiz Yap' }}
          </button>
        </div>
      </div>

      <p v-if="files.length === 0" class="hint error">
        Henüz analiz edilecek bir Excel dosyası yok. Önce <strong>Dosya Ekleme</strong> sekmesinden rapor yükleyin.
      </p>
      <p v-else class="hint">
        Toplam <strong>{{ files.length }}</strong> dosya yüklü. Dilersen tek dosya, dilersen tüm dosyalar üzerinden analiz yapabilirsin.
      </p>
    </div>

    <!-- ANALİZ SONUCU KARTI -->
    <div v-if="results.length > 0" class="card results-card">
      <div class="results-header">
        <div>
          <h3>🎯 Ayrılmış Kullanıcılar</h3>
          <p class="subtitle small">
            Mod:
            <strong>
              {{ analysisMode === 'all' ? 'Tüm dosyalar' : 'Tek dosya' }}
            </strong>
            • Kayıt sayısı: <strong>{{ results.length }}</strong>
          </p>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Maskeli Telefon</th>
              <th>Son 4</th>
              <th>Toplam Kupon Tutarı</th>
              <th>İşlem Sayısı</th>
              <th>Kullanılan Dosyalar</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in results" :key="row.key">
              <td>{{ row.phone }}</td>
              <td>{{ row.last4 }}</td>
              <td>{{ formatAmount(row.totalAmount) }}</td>
              <td>{{ row.operations }}</td>
              <td class="files-cell">
                <span
                  v-for="name in row.files"
                  :key="name"
                  class="file-pill"
                >
                  {{ name }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-else-if="analysisDone && !loadingAnalysis"
      class="card empty-card"
    >
      <p>
        Analiz tamamlandı fakat
        <strong>bizden ayrılmış kullanıcı bulunamadı.</strong><br />
        Tüm <code>last4</code> değerleri mevcut üyeler ile eşleşiyor görünüyor.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { db } from "../../firebase"
import {
  collection,
  getDocs,
  Timestamp
} from "firebase/firestore"
import type { UserReport } from "./Members.vue" // Members.vue içerisinden export ettiğimiz type

type ExcelEntry = {
  date: string
  phone: string
  last4: string | null
  amount: number
  description: string
}

type ExcelFile = {
  id: string
  fileName: string
  rowCount: number
  uploadedAt?: Date | null
  entries: ExcelEntry[]
}

type Candidate = {
  key: string              // last4 + '|' + phone
  last4: string
  phone: string            // maskeli telefon (0531***9588 gibi)
  totalAmount: number
  operations: number
  files: string[]
}

const props = defineProps<{
  users: UserReport[]
}>()

const files = ref<ExcelFile[]>([])
const selectedFileId = ref<string>("")
const loadingFiles = ref(true)
const filesError = ref<string | null>(null)

const loadingAnalysis = ref(false)
const analysisMode = ref<"single" | "all" | null>(null)
const results = ref<Candidate[]>([])
const analysisDone = ref(false)

const totalAmount = computed(() =>
  results.value.reduce((sum, r) => sum + r.totalAmount, 0)
)

// Mevcut üyelerden last4 set'i oluştur
const memberLast4Set = computed(() => {
  const set = new Set<string>()
  for (const u of props.users || []) {
    const digits = (u.phoneNumber ?? "").replace(/\D/g, "")
    if (digits.length >= 4) {
      set.add(digits.slice(-4))
    }
  }
  return set
})

const fetchFiles = async () => {
  loadingFiles.value = true
  filesError.value = null

  try {
    const snap = await getDocs(collection(db, "excelFiles"))
    const loaded: ExcelFile[] = snap.docs.map((d) => {
      const data = d.data() as any
      const ts = data.uploadedAt as Timestamp | undefined
      return {
        id: d.id,
        fileName: data.fileName ?? d.id,
        rowCount: data.rowCount ?? (data.entries?.length ?? 0),
        uploadedAt: ts ? ts.toDate() : null,
        entries: (data.entries ?? []) as ExcelEntry[]
      }
    })

    files.value = loaded.sort((a, b) => {
      const aTime = a.uploadedAt?.getTime() ?? 0
      const bTime = b.uploadedAt?.getTime() ?? 0
      return bTime - aTime
    })

    if (!selectedFileId.value && files.value.length > 0) {
      selectedFileId.value = files.value[0].id
    }
  } catch (e) {
    console.error("excelFiles alınırken hata:", e)
    filesError.value = "Excel dosyaları alınırken bir hata oluştu."
  } finally {
    loadingFiles.value = false
  }
}

// Asıl analiz fonksiyonu
const analyzeFiles = (targetFiles: ExcelFile[]): Candidate[] => {
  const map = new Map<string, Candidate>()

  for (const file of targetFiles) {
    for (const entry of file.entries || []) {
      if (!entry.last4) continue

      // Bu last4 bizim mevcut üyelerimizden birine aitse -> SKIP
      if (memberLast4Set.value.has(entry.last4)) continue

      const phone = entry.phone || "Bilinmiyor"
      const key = `${entry.last4}|${phone}`

      if (!map.has(key)) {
        map.set(key, {
          key,
          last4: entry.last4,
          phone,
          totalAmount: 0,
          operations: 0,
          files: []
        })
      }

      const item = map.get(key)!
      item.totalAmount += Number(entry.amount ?? 0)
      item.operations += 1
      if (!item.files.includes(file.fileName)) {
        item.files.push(file.fileName)
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.totalAmount - a.totalAmount
  )
}

const runSingleFileAnalysis = () => {
  if (!selectedFileId.value) return
  analysisMode.value = "single"
  loadingAnalysis.value = true
  analysisDone.value = false
  results.value = []

  const file = files.value.find((f) => f.id === selectedFileId.value)
  if (!file) {
    loadingAnalysis.value = false
    return
  }

  const res = analyzeFiles([file])
  results.value = res
  loadingAnalysis.value = false
  analysisDone.value = true
}

const runAllFilesAnalysis = () => {
  if (files.value.length === 0) return
  analysisMode.value = "all"
  loadingAnalysis.value = true
  analysisDone.value = false
  results.value = []

  const res = analyzeFiles(files.value)
  results.value = res
  loadingAnalysis.value = false
  analysisDone.value = true
}

const formatAmount = (val: number): string => {
  if (!val) return "0,00"
  // Türkçe format
  return val
    .toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

onMounted(() => {
  fetchFiles()
})
</script>

<style scoped>
.analysis-page {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ÜST BAŞLIK */
.analysis-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 4px;
}

.analysis-header h2 {
  font-size: 1.3rem;
  font-weight: 600;
  margin-bottom: 6px;
}

.subtitle {
  font-size: 0.85rem;
  color: #9ca3af;
}

.subtitle.small {
  font-size: 0.8rem;
}

/* Sağdaki toplam chip */
.summary-chip {
  padding: 8px 14px;
  border-radius: 999px;
  background: radial-gradient(circle at top left, rgba(129, 140, 248, 0.2), rgba(15, 23, 42, 0.9));
  border: 1px solid rgba(129, 140, 248, 0.5);
  font-size: 0.8rem;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.summary-chip span {
  color: #cbd5f5;
}

.summary-chip strong {
  font-size: 0.95rem;
}

/* Kart genel */
.card {
  background: radial-gradient(circle at top left, #111827, #020617);
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  padding: 14px 16px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.7);
}

/* Kontroller */
.controls-card {
  margin-top: 4px;
}

.controls-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 16px;
  align-items: center;
}

@media (max-width: 768px) {
  .controls-grid {
    grid-template-columns: 1fr;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 0.8rem;
  color: #e5e7eb;
}

.field select {
  min-width: 220px;
  max-width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  background: #020617;
  border: 1px solid #374151;
  color: #e5e7eb;
  font-size: 0.85rem;
}

.buttons-col {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.btn {
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 0.8rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition: 0.2s ease;
  white-space: nowrap;
}

.btn.primary {
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: white;
  border-color: rgba(129, 140, 248, 0.7);
}

.btn.primary:hover:not(:disabled) {
  filter: brightness(1.05);
  transform: translateY(-1px);
}

.btn.primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn.ghost {
  background: transparent;
  color: #e5e7eb;
  border-color: #4b5563;
}

.btn.ghost:hover:not(:disabled) {
  background: rgba(15, 23, 42, 0.9);
}

.hint {
  margin-top: 10px;
  font-size: 0.8rem;
  color: #9ca3af;
}

.hint.error {
  color: #f97373;
}

/* Sonuçlar */
.results-card {
  margin-top: 4px;
}

.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.results-header h3 {
  font-size: 1.05rem;
  font-weight: 600;
}

.table-container {
  margin-top: 6px;
  border-radius: 12px;
  border: 1px solid #1f2937;
  overflow: hidden;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

thead {
  background: rgba(15, 23, 42, 0.95);
}

th,
td {
  padding: 6px 8px;
  border-bottom: 1px solid #111827;
  text-align: left;
  white-space: nowrap;
}

th {
  color: #9ca3af;
  font-weight: 500;
}

tbody tr:nth-child(even) {
  background: rgba(15, 23, 42, 0.5);
}

tbody tr:hover {
  background: rgba(55, 65, 81, 0.4);
}

/* Dosya pill'leri */
.files-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.file-pill {
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  border: 1px solid rgba(148, 163, 184, 0.35);
  font-size: 0.75rem;
}

/* Boş state */
.empty-card {
  margin-top: 4px;
  text-align: left;
  font-size: 0.85rem;
  color: #e5e7eb;
}

.empty-card code {
  background: rgba(15, 23, 42, 0.9);
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 0.8rem;
}
</style>