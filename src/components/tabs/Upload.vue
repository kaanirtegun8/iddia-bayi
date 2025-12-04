<template>
  <div class="upload-wrapper">
    <div class="upload-grid">
      <!-- SOL: YÜKLEME KARTI -->
      <div class="upload-card">
        <h2>📤 Excel Raporu Yükle</h2>
        <p class="subtitle">
          Sadece <strong>"Kupon Oynama"</strong> satırları alınacak ve veritabanına kaydedilecektir.
        </p>

        <!-- Dosya Seç Butonu -->
        <label class="file-button">
          <input
            type="file"
            accept=".xlsx,.xls"
            @change="onSelectFile"
            hidden
          />
          <span>📎 Excel Dosyası Seç (.xlsx)</span>
        </label>

        <!-- Seçilen Dosya Bilgisi -->
        <div v-if="selectedFile" class="file-info">
          <p class="file-name">
            <strong>Seçilen dosya:</strong> {{ selectedFile.name }}
          </p>
          <p class="confirm-text">
            Bu dosya <strong>Firestore'a "{{ selectedFile.name }}" adıyla</strong>
            eklenecektir. Onaylıyor musunuz?
          </p>

          <div class="actions">
            <button
              class="btn primary"
              :disabled="isUploading"
              @click="onConfirmUpload"
            >
              {{ isUploading ? "Yükleniyor..." : "Onayla ve Yükle" }}
            </button>
            <button
              class="btn ghost"
              :disabled="isUploading"
              @click="clearSelection"
            >
              İptal
            </button>
          </div>
        </div>

        <!-- Durum Mesajı -->
        <p v-if="statusMessage" :class="['status', statusType]">
          {{ statusMessage }}
        </p>
      </div>

      <!-- SAĞ: YÜKLENEN DOSYALAR LİSTESİ -->
      <UploadedFilesList />
    </div>
  </div>
</template>

<script setup lang="ts">
import UploadedFilesList from "./UploadedFilesList.vue"
import { ref } from "vue"
import * as XLSX from "xlsx"
import { db } from "../../firebase"
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "firebase/firestore"

type CleanRow = {
  date: string
  phone: string
  last4: string | null
  amount: number
  description: string
}

const selectedFile = ref<File | null>(null)
const isUploading = ref(false)
const statusMessage = ref("")
const statusType = ref<"info" | "success" | "error">("info")

const onSelectFile = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] || null
  selectedFile.value = file
  statusMessage.value = ""
  statusType.value = "info"
}

const clearSelection = () => {
  selectedFile.value = null
  statusMessage.value = ""
  statusType.value = "info"
}

// Tek dosya için Kupon Oynama satırlarını parse eden fonksiyon
const parseFile = async (file: File): Promise<CleanRow[]> => {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet)

  const cleanRows: CleanRow[] = rows
    .filter((r) => {
      const desc = r["AÇIKLAMA"]
      return desc && desc.toString().trim() === "Kupon Oynama"
    })
    .map((r) => {
      const phoneRaw = r["OYUNCU GSM"]?.toString() ?? ""
      const digits = phoneRaw.replace(/\D/g, "")
      const last4 = digits.length >= 4 ? digits.slice(-4) : null

      return {
        date: String(r["TARİH"] ?? ""),
        phone: phoneRaw,
        last4,
        amount: Number(r["TUTAR"] ?? 0),
        description: "Kupon Oynama"
      }
    })

  console.log("🎯 Kupon Oynama (cleanRows):")
  console.table(cleanRows)

  return cleanRows
}

const onConfirmUpload = async () => {
  if (!selectedFile.value) return

  isUploading.value = true
  statusMessage.value = ""
  statusType.value = "info"

  try {
    const fileName = selectedFile.value.name // Kullanıcının dosya adı birebir kullanılıyor
    const fileDocRef = doc(db, "excelFiles", fileName)

    // 🔍 1) Aynı isimde dosya daha önce yüklenmiş mi kontrol et
    const existing = await getDoc(fileDocRef)
    if (existing.exists()) {
      statusMessage.value =
        `❌ "${fileName}" adıyla daha önce bir dosya yüklenmiş. ` +
        `Lütfen farklı bir dosya seçin.`
      statusType.value = "error"
      isUploading.value = false
      return
    }

    // 🧠 2) Dosyayı parse et
    const cleanRows = await parseFile(selectedFile.value)

    if (cleanRows.length === 0) {
      statusMessage.value =
        "Bu dosyada 'Kupon Oynama' satırı bulunamadı. Yükleme yapılmadı."
      statusType.value = "error"
      isUploading.value = false
      return
    }

    // 💾 3) Firestore'a kaydet (tek doküman, entries array'i ile)
    await setDoc(fileDocRef, {
      fileName,
      uploadedAt: serverTimestamp(),
      rowCount: cleanRows.length,
      entries: cleanRows
    })

    statusMessage.value =
      `✅ "${fileName}" başarıyla yüklendi. (${cleanRows.length} satır kaydedildi)`
    statusType.value = "success"
    console.log("✅ Firestore'a kaydedilen veri:", {
      fileName,
      entries: cleanRows
    })

    // Seçimi temizle
    selectedFile.value = null
  } catch (err) {
    console.error("Upload error:", err)
    statusMessage.value = "❌ Yükleme sırasında bir hata oluştu."
    statusType.value = "error"
  } finally {
    isUploading.value = false
  }
}
</script>

<style scoped>
.upload-wrapper {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.upload-grid {
  width: 100%;
  max-width: 1100px;
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
}

.upload-card {
  flex: 1 1 320px;
}

/* list-card için width ayarını UploadedFilesList.vue içinden yaptık */
.upload-wrapper {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.upload-card {
  width: 100%;
  max-width: 520px;
  background: radial-gradient(circle at top left, #111827, #020617);
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  padding: 20px 22px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.6);
}

h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 6px;
}

.subtitle {
  font-size: 0.85rem;
  color: #9ca3af;
  margin-bottom: 18px;
}

/* Dosya seçme butonu */
.file-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border-radius: 999px;
  background: #1e293b;
  border: 1px solid #4b5563;
  color: #e5e7eb;
  font-size: 0.9rem;
  cursor: pointer;
  transition: 0.2s ease;
}

.file-button:hover {
  background: #111827;
  border-color: #6366f1;
  transform: translateY(-1px);
}

/* Seçilen dosya bilgisi */
.file-info {
  margin-top: 18px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(55, 65, 81, 0.9);
  font-size: 0.85rem;
}

.file-name {
  margin-bottom: 6px;
}

.confirm-text {
  margin-bottom: 10px;
  color: #9ca3af;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

/* Butonlar */
.btn {
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 0.85rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition: 0.2s ease;
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
  background: rgba(15, 23, 42, 0.8);
}

/* Status mesajları */
.status {
  margin-top: 14px;
  font-size: 0.85rem;
}

.status.info {
  color: #e5e7eb;
}

.status.success {
  color: #bbf7d0;
}

.status.error {
  color: #fecaca;
}
</style>