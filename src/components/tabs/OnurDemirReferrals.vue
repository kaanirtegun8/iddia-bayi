<template>
  <div class="odr-wrapper">
    <div class="card">
      <div class="card-head">
        <div>
          <h2>Onur Demir'den Gelenler</h2>
          <p class="subtitle">
            Fenomen Onur Demir üzerinden gelen kişileri buraya elle ekle.
            Telefon veya üye ID'den en az biri zorunlu, ad soyad isteğe bağlı.
            Aynı telefon ya da üye ID iki kez eklenemez.
          </p>
        </div>
        <div class="head-actions">
          <button class="small-btn" :disabled="isLoading || !contacts.length" @click="downloadExcel">
            Excel İndir
          </button>
          <button class="small-btn" :disabled="isLoading" @click="load">
            {{ isLoading ? "Yükleniyor..." : "Yenile" }}
          </button>
        </div>
      </div>

      <form class="add-form" @submit.prevent="addContact">
        <label class="field">
          <span>Ad Soyad <em>(isteğe bağlı)</em></span>
          <input v-model="fullName" type="text" placeholder="Ör. Ahmet Yılmaz" :disabled="isSaving" />
        </label>
        <label class="field">
          <span>Telefon <em class="req">*</em></span>
          <input
            v-model="phone"
            type="tel"
            inputmode="tel"
            placeholder="05XX XXX XX XX"
            :disabled="isSaving"
          />
        </label>
        <label class="field field-narrow">
          <span>Üye ID <em class="req">*</em></span>
          <input
            v-model="memberIdInput"
            type="text"
            inputmode="numeric"
            placeholder="Ör. 123456"
            :disabled="isSaving"
          />
        </label>
        <button
          class="add-btn"
          type="submit"
          :disabled="isSaving || (!phone.trim() && !memberIdInput.trim())"
        >
          {{ isSaving ? "Kaydediliyor..." : "Ekle" }}
        </button>
      </form>
      <p class="hint"><em class="req">*</em> Telefon veya üye ID'den en az biri doldurulmalı.</p>

      <p v-if="message" class="message" :class="message.type">{{ message.text }}</p>

      <div class="toolbar" v-if="contacts.length">
        <span class="chip chip-total">Toplam: {{ contacts.length }} kişi</span>
        <input v-model="search" class="search" type="search" placeholder="İsim, telefon veya üye ID ara..." />
      </div>

      <p v-if="error" class="message error">{{ error }}</p>

      <div v-if="!isLoading && !error">
        <div class="table-scroll" v-if="filteredContacts.length">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Ad Soyad</th>
                <th>Telefon</th>
                <th>Üye ID</th>
                <th>Eklenme</th>
                <th>Ekleyen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(c, i) in filteredContacts" :key="c.id">
                <td>{{ i + 1 }}</td>
                <td>{{ c.fullName || "-" }}</td>
                <td>{{ c.phoneNumber || "-" }}</td>
                <td>{{ c.memberId ?? "-" }}</td>
                <td>{{ formatDateTime(c.createdAt) }}</td>
                <td>{{ c.createdBy || "-" }}</td>
                <td class="actions">
                  <button class="del-btn" :disabled="deletingId === c.id" @click="removeContact(c)">
                    {{ deletingId === c.id ? "..." : "Sil" }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else-if="contacts.length" class="empty">Aramaya uyan kayıt yok.</p>
        <p v-else class="empty">Henüz kimse eklenmedi.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Fenomen Onur Demir üzerinden gelen kişilerin elle tutulduğu liste.
// Firestore: onurDemirGelenler/{otomatik ID}. Telefon veya üye ID'den en az biri zorunlu;
// eklemeden önce ikisi için de mükerrer kontrolü yapılır.
import { ref, computed, onMounted } from "vue"
import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore"
import ExcelJS from "exceljs"
import { db, auth } from "../../firebase"

const COLLECTION = "onurDemirGelenler"

type Contact = {
  id: string
  fullName: string
  phoneNumber: string
  memberId: number | null
  createdAt: Timestamp | null
  createdBy: string | null
}

const fullName = ref("")
const phone = ref("")
const memberIdInput = ref("")
const search = ref("")
const isSaving = ref(false)
const isLoading = ref(false)
const deletingId = ref<string | null>(null)
const error = ref<string | null>(null)
const message = ref<{ type: "success" | "error"; text: string } | null>(null)
const contacts = ref<Contact[]>([])

// Üye datasındaki formatla aynı: 05XXXXXXXXX (11 hane).
// "+90 532 ...", "90532...", "532..." ve boşluk/tire/parantezli girişleri kabul eder.
const normalizePhone = (raw: string): string | null => {
  let digits = raw.replace(/\D/g, "")
  if (digits.startsWith("90") && digits.length === 12) digits = digits.slice(2)
  if (digits.length === 10 && digits.startsWith("5")) digits = "0" + digits
  return /^05\d{9}$/.test(digits) ? digits : null
}

const formatDateTime = (ts: Timestamp | null) => {
  if (!ts) return "-"
  return ts.toDate().toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })
}

// Türkçe karakterleri de doğru küçültmek için tr-TR
const lower = (s: string) => s.toLocaleLowerCase("tr-TR")

const filteredContacts = computed(() => {
  const q = lower(search.value.trim())
  if (!q) return contacts.value
  const qDigits = q.replace(/\D/g, "")
  return contacts.value.filter(
    (c) =>
      lower(c.fullName).includes(q) ||
      (qDigits &&
        (c.phoneNumber.includes(qDigits) || String(c.memberId ?? "").includes(qDigits))),
  )
})

const load = async () => {
  isLoading.value = true
  error.value = null
  try {
    const snap = await getDocs(collection(db, COLLECTION))
    contacts.value = snap.docs
      .map((d) => {
        const data = d.data()
        return {
          id: d.id,
          fullName: data.fullName ?? "",
          phoneNumber: data.phoneNumber ?? "",
          memberId: data.memberId ?? null,
          createdAt: data.createdAt ?? null,
          createdBy: data.createdBy ?? null,
        }
      })
      // En son eklenen üstte
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
  } catch (err: any) {
    console.error(err)
    error.value = "Liste alınırken hata: " + (err?.message ?? String(err))
  } finally {
    isLoading.value = false
  }
}

const addContact = async () => {
  message.value = null
  const phoneRaw = phone.value.trim()
  const memberIdRaw = memberIdInput.value.trim()

  if (!phoneRaw && !memberIdRaw) {
    message.value = { type: "error", text: "Telefon veya üye ID'den en az birini gir." }
    return
  }

  const normalized = phoneRaw ? normalizePhone(phoneRaw) : ""
  if (normalized === null) {
    message.value = { type: "error", text: "Geçerli bir cep telefonu gir (ör. 0532 123 45 67)." }
    return
  }

  // Üye datasında memberId sayı olarak tutuluyor
  if (memberIdRaw && !/^\d+$/.test(memberIdRaw)) {
    message.value = { type: "error", text: "Üye ID sadece rakamlardan oluşmalı." }
    return
  }
  const memberId = memberIdRaw ? Number(memberIdRaw) : null

  isSaving.value = true
  try {
    const col = collection(db, COLLECTION)
    const checks = []
    if (normalized) checks.push(getDocs(query(col, where("phoneNumber", "==", normalized))))
    if (memberId !== null) checks.push(getDocs(query(col, where("memberId", "==", memberId))))
    const existing = (await Promise.all(checks)).flatMap((s) => s.docs)[0]
    if (existing) {
      const data = existing.data()
      const label = [data.fullName, data.phoneNumber, data.memberId && `ID ${data.memberId}`]
        .filter(Boolean)
        .join(" · ")
      message.value = { type: "error", text: `Bu kişi zaten listede (${label}).` }
      return
    }

    const name = fullName.value.trim()
    await addDoc(col, {
      fullName: name,
      phoneNumber: normalized,
      memberId,
      source: "Onur Demir",
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.email ?? null,
    })

    message.value = { type: "success", text: `${name || normalized || `ID ${memberId}`} eklendi.` }
    fullName.value = ""
    phone.value = ""
    memberIdInput.value = ""
    await load()
  } catch (err: any) {
    console.error(err)
    message.value = { type: "error", text: "Kaydedilemedi: " + (err?.message ?? String(err)) }
  } finally {
    isSaving.value = false
  }
}

const removeContact = async (c: Contact) => {
  const label = c.fullName || c.phoneNumber || `ID ${c.memberId}`
  if (!confirm(`${label} listeden silinsin mi?`)) return
  deletingId.value = c.id
  try {
    await deleteDoc(doc(db, COLLECTION, c.id))
    contacts.value = contacts.value.filter((x) => x.id !== c.id)
    message.value = { type: "success", text: `${label} silindi.` }
  } catch (err: any) {
    console.error(err)
    message.value = { type: "error", text: "Silinemedi: " + (err?.message ?? String(err)) }
  } finally {
    deletingId.value = null
  }
}

const downloadExcel = async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Onur Demir'den Gelenler")

  const headerRow = sheet.addRow(["Ad Soyad", "Telefon", "Üye ID", "Eklenme", "Ekleyen"])
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } }
    cell.font = { bold: true, color: { argb: "FFE5E7EB" } }
  })

  for (const c of contacts.value) {
    sheet.addRow([
      c.fullName,
      c.phoneNumber,
      c.memberId ?? "",
      formatDateTime(c.createdAt),
      c.createdBy ?? "",
    ])
  }
  sheet.columns.forEach((col) => {
    if (col) col.width = 24
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "onur-demirden-gelenler.xlsx"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

onMounted(load)
</script>

<style scoped>
.odr-wrapper {
  animation: fadeIn 0.2s ease-out;
}

.card {
  padding: 16px;
  border-radius: 16px;
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.4);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.7);
  color: #e5e7eb;
  max-width: 1000px;
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

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-form {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px;
  margin-bottom: 12px;
  border-radius: 12px;
  background: #020617;
  border: 1px solid #1f2937;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
  color: #9ca3af;
  flex: 1;
  min-width: 200px;
}

.field em {
  font-style: normal;
  color: #6b7280;
}

.field-narrow {
  flex: 0.6;
  min-width: 140px;
}

em.req {
  font-style: normal;
  color: #f87171;
}

.hint {
  margin: -6px 0 12px;
  font-size: 0.75rem;
  color: #6b7280;
}

.field input,
.search {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #374151;
  background: #0f172a;
  color: #e5e7eb;
  font-size: 0.9rem;
}

.field input:focus,
.search:focus {
  outline: none;
  border-color: #6366f1;
}

.add-btn {
  padding: 9px 20px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.search {
  min-width: 240px;
}

.chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
}

.chip-total {
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.5);
  color: #c7d2fe;
  font-weight: 600;
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

.del-btn {
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(248, 113, 113, 0.5);
  background: transparent;
  color: #fca5a5;
  font-size: 0.75rem;
  cursor: pointer;
}

.del-btn:hover:enabled {
  background: rgba(220, 38, 38, 0.15);
}

.message {
  font-size: 0.9rem;
  margin: 0 0 12px;
}

.message.error {
  color: #fecaca;
}

.message.success {
  color: #bbf7d0;
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
  font-size: 0.85rem;
}

th,
td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(51, 65, 85, 0.8);
  text-align: left;
  white-space: nowrap;
}

td.actions {
  text-align: right;
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

/* TELEFON */
@media (max-width: 640px) {
  .card {
    padding: 14px 12px;
  }

  .card-head {
    flex-direction: column;
    align-items: stretch;
  }

  .head-actions {
    flex-wrap: wrap;
  }

  .head-actions > * {
    flex: 1 1 auto;
  }

  .field,
  .field-narrow {
    flex: 1 1 100%;
    min-width: 0;
  }

  .add-btn {
    flex: 1 1 100%;
    padding: 12px;
  }

  .search {
    flex: 1 1 100%;
    min-width: 0;
  }
}
</style>
