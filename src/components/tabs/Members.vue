<template>
  <div class="user-table-wrapper">
    <!-- Üst bar -->
    <div class="table-header">
      <h2>Üyeler</h2>
      <div class="table-controls">
        <span class="total">
          Toplam: {{ users.length }} üye
          <span v-if="filteredUsers.length !== users.length">
            (Filtrelenen: {{ filteredUsers.length }})
          </span>
        </span>

        <!-- Search -->
        <div class="search-wrapper">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Üye ID veya Telefon ara..."
          />
        </div>

        <label class="page-size">
          Sayfa başına:
          <select v-model.number="pageSize">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </label>
      </div>
    </div>

    <!-- Tablo -->
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Üye ID</th>
            <th>Telefon</th>
            <th>Aktif</th>
            <th>Toplam Tutar</th>
            <th>Son İşlem Ayı</th>
            <th>Son Yükleme Tarihi</th>
            <th>Son Yükleme Tutarı</th>
            <th>Bakiye</th>
            <th>Oynanan Ay</th>
            <th>Haftalık Ort.</th>
            <th>Son 30 Gün</th>
            <th>Son 60 Gün</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in paginatedUsers" :key="user.memberId">
            <td>{{ user.memberId }}</td>
            <td>{{ user.phoneNumber }}</td>
            <td>
              <span
                class="badge"
                :class="user.isActive ? 'badge-active' : 'badge-passive'"
              >
                {{ user.isActive ? "Aktif" : "Pasif" }}
              </span>
            </td>
            <td>{{ user.totalAmountValueStr }}</td>
            <td>{{ user.lastOrderMonth || "-" }}</td>
            <td>{{ formatDate(user.lastDepositeDate) }}</td>
            <td>{{ user.lastDepositeAmountStr || "-" }}</td>
            <td>{{ user.totalBalanceStr }}</td>
            <td>{{ user.playedMonths }}</td>
            <td>{{ user.weeklyAverageStr }}</td>
            <td>
              <span
                class="badge small"
                :class="user.last30DaysAmount ? 'badge-yes' : 'badge-no'"
              >
                {{ user.last30DaysAmount ? "Evet" : "Hayır" }}
              </span>
            </td>
            <td>
              <span
                class="badge small"
                :class="user.last60DaysAmount ? 'badge-yes' : 'badge-no'"
              >
                {{ user.last60DaysAmount ? "Evet" : "Hayır" }}
              </span>
            </td>
          </tr>

          <tr v-if="paginatedUsers.length === 0">
            <td colspan="12" class="empty-row">Kayıt bulunamadı</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="pagination">
      <button
        type="button"
        :disabled="currentPage === 1"
        @click="currentPage--"
      >
        ‹ Önceki
      </button>

      <span class="page-info">
        Sayfa
        <strong>{{ currentPage }}</strong> / {{ totalPages }}
      </span>

      <button
        type="button"
        :disabled="currentPage === totalPages"
        @click="currentPage++"
      >
        Sonraki ›
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"

export type UserReport = {
  isActive: boolean
  totalAmountValue: number | null
  totalAmountValueStr: string
  lastOrderMonth: string
  lastActiveMonthAmountValue: number | null
  lastActiveMonthAmountValueStr: string
  twoMonthsBeforeLastActiveMonthAmountValue: number
  twoMonthsBeforeLastActiveMonthAmountValueStr: string
  lastOrderDate: string | null
  lastDepositeDate: string | null
  lastDepositeAmount: number | null
  lastDepositeAmountStr: string
  last30DaysAmount: boolean
  last60DaysAmount: boolean
  memberId: number
  phoneNumber: string
  totalBalance: number
  totalBalanceStr: string
  playedMonths: number
  weeklyAverage: number
  weeklyAverageStr: string
}

const props = defineProps<{
  users: UserReport[]
}>()

const users = computed(() => props.users ?? [])

// search state
const searchQuery = ref("")

// pagination state
const currentPage = ref(1)
const pageSize = ref(20)

// Search uygulanmış liste
const filteredUsers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return users.value

  return users.value.filter((u) => {
    const phone = (u.phoneNumber ?? "").toLowerCase()
    return phone.includes(q)
  })
})

const totalPages = computed(() =>
  filteredUsers.value.length === 0
    ? 1
    : Math.ceil(filteredUsers.value.length / pageSize.value)
)

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredUsers.value.slice(start, end)
})

// pageSize değişince sayfa başını sıfırla
watch(pageSize, () => {
  currentPage.value = 1
})

// users veya filtreli uzunluk değişirse currentPage clamp'le
watch(
  () => filteredUsers.value.length,
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
    }
  }
)

// search değiştikçe başa dön
watch(searchQuery, () => {
  currentPage.value = 1
})

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "-"
  const day = d.getDate().toString().padStart(2, "0")
  const month = (d.getMonth() + 1).toString().padStart(2, "0")
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}
</script>

<style scoped>
.user-table-wrapper {
  padding: 1.5rem;
  background: #0f172a;
  border-radius: 16px;
  border: 1px solid #1f2937;
  color: #e5e7eb;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  gap: 1rem;
}

.table-header h2 {
  font-size: 1.25rem;
  font-weight: 600;
}

.table-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.875rem;
  flex-wrap: wrap;
}

.table-controls .total {
  opacity: 0.8;
}

/* Search */
.search-wrapper input {
  background: #020617;
  border-radius: 999px;
  border: 1px solid #374151;
  padding: 0.35rem 0.9rem;
  color: #e5e7eb;
  font-size: 0.8rem;
  min-width: 220px;
}

.search-wrapper input::placeholder {
  color: #6b7280;
}

.table-controls .page-size select {
  margin-left: 0.5rem;
  background: #020617;
  color: #e5e7eb;
  border-radius: 999px;
  border: 1px solid #374151;
  padding: 0.25rem 0.75rem;
  font-size: 0.8rem;
}

.table-container {
  width: 100%;
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid #1f2937;
  background: radial-gradient(circle at top left, #111827, #020617);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}

thead {
  background: rgba(15, 23, 42, 0.9);
}

th,
td {
  padding: 0.55rem 0.75rem;
  font-size: 0.8rem;
  text-align: left;
  white-space: nowrap;
}

th {
  font-weight: 500;
  color: #9ca3af;
  border-bottom: 1px solid #1f2937;
  position: sticky;
  top: 0;
  z-index: 1;
  backdrop-filter: blur(10px);
}

tbody tr:nth-child(even) {
  background: rgba(15, 23, 42, 0.5);
}

tbody tr:hover {
  background: rgba(55, 65, 81, 0.4);
}

td {
  border-bottom: 1px solid #111827;
}

.empty-row {
  text-align: center;
  padding: 1.5rem 0.75rem;
  color: #9ca3af;
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

/* Pagination */
.pagination {
  margin-top: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  font-size: 0.85rem;
}

.pagination button {
  background: #111827;
  border-radius: 999px;
  border: 1px solid #374151;
  padding: 0.35rem 0.9rem;
  color: #e5e7eb;
  cursor: pointer;
  font-size: 0.8rem;
  transition: background 0.15s ease, transform 0.1s ease, border-color 0.15s;
}

.pagination button:hover:not(:disabled) {
  background: #1e293b;
  border-color: #4b5563;
  transform: translateY(-1px);
}

.pagination button:disabled {
  opacity: 0.35;
  cursor: default;
}

.page-info strong {
  font-weight: 600;
}
</style>