<template>
  <div class="ftj-wrapper">
    <div class="card">
      <div class="card-head">
        <div>
          <h2>İlk Kez Gelenler (Dün / Bugün)</h2>
          <p class="subtitle">
            Dün ve bugün listemize <strong>ilk kez</strong> giren üyeler.
            Daha önce herhangi bir günde görünüp çıkıp tekrar gelenler bu listede yer almaz.
            Bugünün datası yüklenmemişse sadece dün gösterilir.
          </p>
        </div>
        <button class="small-btn" :disabled="isLoading" @click="load">
          {{ isLoading ? "Yükleniyor..." : "Yenile" }}
        </button>
      </div>

      <div class="day-chips">
        <span
          v-for="d in targetDays"
          :key="d.day"
          :class="['chip', d.uploaded ? 'chip-ok' : 'chip-missing']"
        >
          {{ d.label }} ({{ formatDate(d.day) }}):
          <template v-if="d.uploaded">{{ d.count }} ilk kez gelen</template>
          <template v-else>data yüklenmemiş</template>
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
                <th>Toplam Ciro</th>
                <th>Son İşlem Ayı</th>
                <th>Bakiye</th>
                <th>İlk Görülme</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in joiners" :key="u.memberId">
                <td>{{ u.memberId }}</td>
                <td>{{ u.phoneNumber }}</td>
                <td>{{ u.totalAmountValueStr ?? '0,00' }}</td>
                <td>{{ u.lastOrderMonth || '-' }}</td>
                <td>{{ u.totalBalanceValueStr ?? u.totalBalanceStr ?? '-' }}</td>
                <td>{{ formatDate(u.firstSeenDate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty">Dün / bugün ilk kez gelen üye yok.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// GEÇİCİ TAB: dün ve bugün ilk kez katılan üyeleri listeler.
// İlk görülme mantığı SyncUpload.vue'daki ile aynıdır; tab kaldırılırken
// bu dosya ve App.vue'daki buton/import silinmesi yeterli.
import { ref, onMounted } from "vue"
import { collection, doc, getDoc, getDocs } from "firebase/firestore"
import { db } from "../../firebase"

type DailyUser = {
  memberId: number
  phoneNumber: string
  totalAmountValue?: number | null
  totalAmountValueStr?: string | null
  lastOrderMonth?: string | null
  totalBalanceStr?: string | null
  totalBalanceValueStr?: string | null
  firstSeenDate?: string | null
  [key: string]: any
}

type TargetDay = { day: string; label: string; uploaded: boolean; count: number }

// Yerel saate göre "YYYY-MM-DD"
const toDayKey = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("tr-TR")
}

const isLoading = ref(false)
const error = ref<string | null>(null)
const targetDays = ref<TargetDay[]>([])
const joiners = ref<DailyUser[]>([])

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

const load = async () => {
  isLoading.value = true
  error.value = null
  joiners.value = []

  try {
    const now = new Date()
    const today = toDayKey(now)
    const yesterday = toDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))

    const daysSnap = await getDocs(collection(db, "dailyUsers"))
    const allDays = daysSnap.docs.map((d) => d.id)
    const uploaded = new Set(allDays)

    const targets: TargetDay[] = [
      { day: yesterday, label: "Dün", uploaded: uploaded.has(yesterday), count: 0 },
      { day: today, label: "Bugün", uploaded: uploaded.has(today), count: 0 },
    ]
    targetDays.value = targets

    const uploadedTargets = targets.filter((t) => t.uploaded)
    if (!uploadedTargets.length) return

    // Dünden önceki tüm günlerde görülmüş üyeler -> bunlar "ilk kez" sayılmaz
    const earlierDays = allDays.filter((d) => d < yesterday)
    const seenBefore = new Set<number>()
    const CONCURRENCY = 12
    for (let i = 0; i < earlierDays.length; i += CONCURRENCY) {
      const results = await Promise.all(
        earlierDays.slice(i, i + CONCURRENCY).map(getMemberIdsOfDay),
      )
      for (const ids of results) for (const id of ids) seenBefore.add(id)
    }

    // Dün önce işlenir; dün ilk kez gelen bugün de varsa tekrar eklenmez
    const result: DailyUser[] = []
    const added = new Set<number>()
    for (const t of uploadedTargets) {
      const users = await getUsersOfDay(t.day)
      for (const u of users) {
        if (u.memberId == null || seenBefore.has(u.memberId) || added.has(u.memberId)) continue
        added.add(u.memberId)
        result.push({ ...u, firstSeenDate: t.day })
        t.count++
      }
    }

    result.sort((a, b) => (b.totalAmountValue ?? 0) - (a.totalAmountValue ?? 0))
    joiners.value = result
  } catch (err: any) {
    console.error(err)
    error.value = "Liste alınırken hata: " + (err?.message ?? String(err))
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
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

.chip-missing {
  background: rgba(148, 163, 184, 0.1);
  border: 1px solid rgba(148, 163, 184, 0.4);
  color: #9ca3af;
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
