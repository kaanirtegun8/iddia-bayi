<template>
  <div class="list-card">
    <h2>📁 Yüklenen Raporlar</h2>
    <p class="subtitle">
      Firestore'da kayıtlı Excel raporları. İstersen buradan silebilirsin.
    </p>

    <div v-if="loading" class="state-text">Yükleniyor...</div>
    <div v-else-if="error" class="state-text error">{{ error }}</div>
    <div v-else-if="files.length === 0" class="state-text">
      Henüz yüklenmiş bir dosya yok.
    </div>

    <table v-else class="files-table">
      <thead>
        <tr>
          <th>Dosya Adı</th>
          <th>Satır</th>
          <th>Yüklenme</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="file in files" :key="file.id">
          <td>{{ file.fileName }}</td>
          <td>{{ file.rowCount }}</td>
          <td>{{ formatDate(file.uploadedAt) }}</td>
          <td class="actions-cell">
            <button
              class="icon-btn"
              :class="{ deleting: deletingId === file.id }"
              :disabled="deletingId === file.id"
              @click="onDelete(file)"
            >
              <span v-if="deletingId === file.id" class="spinner" />
              <span style="color: red" v-else>🗑</span>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue"
import { db } from "../../firebase"
import {
  collection,
  deleteDoc,
  doc,
  Timestamp,
  query,
  orderBy,
  onSnapshot
} from "firebase/firestore"

type FileItem = {
  id: string
  fileName: string
  rowCount: number
  uploadedAt?: Date | null
}

const files = ref<FileItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const deletingId = ref<string | null>(null)

let unsubscribe: (() => void) | null = null

const setupListener = () => {
  loading.value = true
  error.value = null

  const q = query(
    collection(db, "excelFiles"),
    orderBy("uploadedAt", "desc")
  )

  unsubscribe = onSnapshot(
    q,
    (snap) => {
      files.value = snap.docs.map((d) => {
        const data = d.data() as any
        const ts = data.uploadedAt as Timestamp | undefined

        return {
          id: d.id,
          fileName: data.fileName ?? d.id,
          rowCount: data.rowCount ?? (data.entries?.length ?? 0),
          uploadedAt: ts ? ts.toDate() : null
        }
      })
      loading.value = false
    },
    (err) => {
      console.error("Dosyalar dinlenirken hata:", err)
      error.value = "Dosya listesi alınırken bir hata oluştu."
      loading.value = false
    }
  )
}

const formatDate = (date?: Date | null): string => {
  if (!date) return "-"
  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const year = date.getFullYear()
  const hour = date.getHours().toString().padStart(2, "0")
  const min = date.getMinutes().toString().padStart(2, "0")
  return `${day}.${month}.${year} ${hour}:${min}`
}

const onDelete = async (file: FileItem) => {
  const ok = window.confirm(
    `"${file.fileName}" isimli dosyayı ve içindeki verileri silmek istediğine emin misin?`
  )
  if (!ok) return

  try {
    deletingId.value = file.id
    await deleteDoc(doc(db, "excelFiles", file.id))
    // onSnapshot otomatik tetikleneceği için files'tan manuel silmeye bile gerek yok aslında
  } catch (e) {
    console.error("Silme hatası:", e)
    window.alert("Silme sırasında bir hata oluştu.")
  } finally {
    deletingId.value = null
  }
}

onMounted(() => {
  setupListener()
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})
</script>

<style scoped>
.list-card {
  width: 100%;
  max-width: 520px;
  background: radial-gradient(circle at top right, #020617, #020617);
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  padding: 16px 18px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.4);
  font-size: 0.85rem;
}

h2 {
  font-size: 1.05rem;
  font-weight: 600;
  margin-bottom: 4px;
}

.subtitle {
  font-size: 0.8rem;
  color: #9ca3af;
  margin-bottom: 10px;
}

.state-text {
  margin-top: 8px;
  color: #e5e7eb;
}

.state-text.error {
  color: #fecaca;
}

.files-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
}

.files-table th,
.files-table td {
  padding: 6px 4px;
  border-bottom: 1px solid rgba(31, 41, 55, 0.9);
  text-align: left;
}

.files-table th {
  font-weight: 500;
  color: #9ca3af;
  font-size: 0.78rem;
}

.files-table td {
  font-size: 0.8rem;
}

.actions-cell {
  text-align: right;
}

/* Çöp butonu */
.icon-btn {
  border: none;
  background: rgba(239, 68, 68, 0.08);
  color: #fecaca;
  cursor: pointer;
  font-size: 1rem;
  padding: 4px 8px;
  border-radius: 999px;
  transition: 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.18);
  color: #fee2e2;
  transform: translateY(-1px);
}

.icon-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

/* Loading spinner */
.spinner {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid rgba(248, 250, 252, 0.6);
  border-top-color: transparent;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.icon-btn.deleting {
  background: rgba(239, 68, 68, 0.25);
}
</style>