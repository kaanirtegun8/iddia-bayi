<template>
  <div class="user-table-wrapper">
    <!-- Üst bar -->
    <div class="table-header">
      <div>
        <h2>Üyeler</h2>
      </div>

      <div class="table-controls">
        <span class="total">
          Toplam: {{ users.length }} üye
          <span v-if="filteredUsers.length !== users.length">
            (Filtrelenen: {{ filteredUsers.length }})
          </span>
        </span>

        <!-- Search -->
        <div class="search-wrapper">
          <input v-model="searchQuery" type="text" placeholder="Üye ID veya Telefon ara..." />
        </div>

        <!-- Telefonu eksik olanlar filtresi -->
        <button class="filter-btn" :class="{ active: filterMissingPhone }"
          @click="filterMissingPhone = !filterMissingPhone">
          📵 Telefonu Eksik Olanlar
        </button>

        <!-- Extra filters & sort -->
        <div class="advanced-controls">
          <!-- Aktif/Pasif -->
          <select v-model="statusFilter" class="chip-select">
            <option value="all">Tümü</option>
            <option value="active">Sadece Aktif</option>
            <option value="passive">Sadece Pasif</option>
          </select>

          <!-- Son 30/60 -->
          <select v-model="lastDaysFilter" class="chip-select">
            <option value="all">30/60: Tümü</option>
            <option value="last30">Son 30 gün: Evet</option>
            <option value="last60">Son 60 gün: Evet</option>
            <option value="none">Son 30/60: Hayır</option>
          </select>

          <!-- Sıralama alanı -->
          <select v-model="sortKey" class="chip-select">
            <option value="memberId">Üye ID</option>
            <option value="phoneNumber">Telefon</option>
            <option value="totalAmountValue">Toplam Tutar</option>
            <option value="totalBalance">Bakiye</option>
            <option value="playedMonths">Oynanan Ay</option>
            <option value="weeklyAverage">Haftalık Ort.</option>
            <option value="lastDepositeDate">Son Yükleme Tarihi</option>
          </select>

          <!-- Artan/Azalan -->
          <button class="filter-btn" @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">
            {{ sortDir === "asc" ? "⬆️ Artan" : "⬇️ Azalan" }}
          </button>

          <!-- Temizle -->
          <button class="filter-btn danger" :disabled="!hasAnyFilter" @click="resetFilters">
            🧹 Filtreleri Temizle
          </button>
        </div>

        <div class="export-controls">
          <button
            class="filter-btn export-btn"
            :disabled="!zeroTurnoverUsers.length"
            @click="downloadZeroTurnoverExcel"
          >
            📤 0 Ciro Excel ({{ zeroTurnoverUsers.length }})
          </button>
          <button
            class="filter-btn export-btn secondary"
            :disabled="!zeroBalanceTurnoverUsers.length"
            @click="downloadZeroBalanceTurnoverExcel"
          >
            📤 Ciro > 0 & Bakiye 0 Excel ({{ zeroBalanceTurnoverUsers.length }})
          </button>
          <button
            class="filter-btn export-btn high"
            :disabled="!highTurnoverUsers.length"
            @click="downloadHighTurnoverExcel"
          >
            💰 Ciro 1M+ Excel ({{ highTurnoverUsers.length }})
          </button>
        </div>

        <div class="inactive-export-card">
          <div class="inactive-export-copy">
            <strong>Bakiye / Son Oynama Raporu</strong>
            <span>
              Bakiyesi belirlediğin tutar veya altında olan eski üyeleri Excel'e aktar
            </span>
          </div>

          <label class="cutoff-picker">
            <span>Son oynama</span>
            <select v-model="selectedCutoffMonth">
              <option
                v-for="month in cutoffMonthOptions"
                :key="month.value"
                :value="month.value"
              >
                {{ month.label }} ve öncesi ({{ month.endDateLabel }})
              </option>
            </select>
          </label>

          <label class="balance-limit-picker" :class="{ invalid: balanceLimit === null }">
            <span>Bakiye üst sınırı</span>
            <div class="balance-limit-input">
              <input
                v-model="balanceLimitInput"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="Örn. 50 veya 10,50"
                aria-label="Bakiye üst sınırı"
              />
              <span>TL ve altında</span>
            </div>
          </label>

          <button
            class="filter-btn inactive-export-btn"
            :disabled="
              balanceLimit === null
              || !inactiveBalanceUsers.length
              || isInactiveExporting
            "
            @click="downloadInactiveBalanceExcel"
          >
            {{
              isInactiveExporting
                ? "Excel hazırlanıyor..."
                : balanceLimit === null
                  ? "Geçerli tutar gir"
                  : `Excel İndir (${inactiveBalanceUsers.length})`
            }}
          </button>
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
            <th class="sortable" :class="{ active: sortKey === 'memberId' }" @click="toggleSort('memberId')">
              Üye ID <span v-if="sortKey === 'memberId'" class="arrow">{{ sortArrow }}</span>
            </th>

            <th class="sortable" :class="{ active: sortKey === 'phoneNumber' }" @click="toggleSort('phoneNumber')">
              Telefon <span v-if="sortKey === 'phoneNumber'" class="arrow">{{ sortArrow }}</span>
            </th>

            <th>Aktif</th>

            <th class="sortable" :class="{ active: sortKey === 'totalAmountValue' }"
              @click="toggleSort('totalAmountValue')">
              Toplam Tutar
              <span v-if="sortKey === 'totalAmountValue'" class="arrow">{{ sortArrow }}</span>
            </th>

            <th>Son İşlem Ayı</th>

            <th class="sortable" :class="{ active: sortKey === 'lastDepositeDate' }"
              @click="toggleSort('lastDepositeDate')">
              Son Yükleme Tarihi
              <span v-if="sortKey === 'lastDepositeDate'" class="arrow">{{ sortArrow }}</span>
            </th>

            <th>Son Yükleme Tutarı</th>

            <th class="sortable" :class="{ active: sortKey === 'totalBalance' }" @click="toggleSort('totalBalance')">
              Bakiye <span v-if="sortKey === 'totalBalance'" class="arrow">{{ sortArrow }}</span>
            </th>

            <th class="sortable" :class="{ active: sortKey === 'playedMonths' }" @click="toggleSort('playedMonths')">
              Oynanan Ay <span v-if="sortKey === 'playedMonths'" class="arrow">{{ sortArrow }}</span>
            </th>

            <th class="sortable" :class="{ active: sortKey === 'weeklyAverage' }" @click="toggleSort('weeklyAverage')">
              Haftalık Ort. <span v-if="sortKey === 'weeklyAverage'" class="arrow">{{ sortArrow }}</span>
            </th>

            <th>Son 30 Gün</th>
            <th>Son 60 Gün</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in paginatedUsers" :key="user.memberId" class="row-clickable" @click="onRowClick(user)">
            <td>{{ user.memberId }}</td>
            <td>{{ user.phoneNumber || "-" }}</td>
            <td>
              <span class="badge" :class="user.isActive ? 'badge-active' : 'badge-passive'">
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
              <span class="badge small" :class="user.last30DaysAmount ? 'badge-yes' : 'badge-no'">
                {{ user.last30DaysAmount ? "Evet" : "Hayır" }}
              </span>
            </td>
            <td>
              <span class="badge small" :class="user.last60DaysAmount ? 'badge-yes' : 'badge-no'">
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
      <button type="button" :disabled="currentPage === 1" @click="currentPage--">
        ‹ Önceki
      </button>

      <span class="page-info">
        Sayfa <strong>{{ currentPage }}</strong> / {{ totalPages }}
      </span>

      <button type="button" :disabled="currentPage === totalPages" @click="currentPage++">
        Sonraki ›
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import ExcelJS from "exceljs"

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
  phoneNumber: string | null
  totalBalance: number
  totalBalanceStr: string
  playedMonths: number
  weeklyAverage: number
  weeklyAverageStr: string
}

const props = defineProps<{
  users: UserReport[]
}>()

const emit = defineEmits<{
  (e: "select-user", user: UserReport): void
}>()

const users = computed(() => props.users ?? [])

const TURKISH_MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const

const REPORT_YEAR = 2026

const cutoffMonthOptions = TURKISH_MONTHS.map((month, index) => {
  const monthNumber = index + 1
  const endDay = new Date(REPORT_YEAR, monthNumber, 0).getDate()

  return {
    value: `${REPORT_YEAR}-${String(monthNumber).padStart(2, "0")}`,
    label: `${month} ${REPORT_YEAR}`,
    endDateLabel: `${String(endDay).padStart(2, "0")}.${String(monthNumber).padStart(2, "0")}.${REPORT_YEAR}`,
    filenameSlug: month
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i")
      .replace(/ş/g, "s")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c"),
  }
})

const selectedCutoffMonth = ref(`${REPORT_YEAR}-05`)
const balanceLimitInput = ref("0")
const isInactiveExporting = ref(false)

// filtre state
const filterMissingPhone = ref(false)

// search state
const searchQuery = ref("")

// pagination state
const currentPage = ref(1)
const pageSize = ref(20)

type SortDir = "asc" | "desc"
type StatusFilter = "all" | "active" | "passive"
type LastDaysFilter = "all" | "last30" | "last60" | "none"

const statusFilter = ref<StatusFilter>("all")
const lastDaysFilter = ref<LastDaysFilter>("all")

const sortKey = ref<
  | "memberId"
  | "phoneNumber"
  | "totalAmountValue"
  | "totalBalance"
  | "playedMonths"
  | "weeklyAverage"
  | "lastDepositeDate"
>("memberId")

const sortDir = ref<SortDir>("desc")

const sortArrow = computed(() => (sortDir.value === "asc" ? "▲" : "▼"))

const toggleSort = (key: typeof sortKey.value) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc"
  } else {
    sortKey.value = key
    // ilk tıklamada desc istiyorsan desc bırak, asc istiyorsan "asc" yap
    sortDir.value = "desc"
  }
}

// Search + filtre + sıralama uygulanmış liste
const filteredUsers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()

  let base = users.value

  // 1) Telefonu eksik olanlar
  if (filterMissingPhone.value) {
    base = base.filter((u) => !u.phoneNumber || u.phoneNumber.trim() === "")
  }

  // 2) Aktif/Pasif filtresi
  if (statusFilter.value !== "all") {
    const wantActive = statusFilter.value === "active"
    base = base.filter((u) => u.isActive === wantActive)
  }

  // 3) Son 30/60 filtresi
  if (lastDaysFilter.value !== "all") {
    if (lastDaysFilter.value === "last30") base = base.filter((u) => u.last30DaysAmount)
    if (lastDaysFilter.value === "last60") base = base.filter((u) => u.last60DaysAmount)
    if (lastDaysFilter.value === "none") {
      base = base.filter((u) => !u.last30DaysAmount && !u.last60DaysAmount)
    }
  }

  // 4) Search (telefon veya üye id)
  if (q) {
    base = base.filter((u) => {
      const phone = (u.phoneNumber ?? "").toLowerCase()
      const memberIdStr = String(u.memberId ?? "").toLowerCase()
      return phone.includes(q) || memberIdStr.includes(q)
    })
  }

  // 5) Sorting (immutable)
  const sorted = [...base].sort((a, b) => {
    const dir = sortDir.value === "asc" ? 1 : -1
    const key = sortKey.value

    // date
    if (key === "lastDepositeDate") {
      const at = a.lastDepositeDate ? new Date(a.lastDepositeDate).getTime() : 0
      const bt = b.lastDepositeDate ? new Date(b.lastDepositeDate).getTime() : 0
      return (at - bt) * dir
    }

    // string
    if (key === "phoneNumber") {
      const av = (a.phoneNumber ?? "").toLowerCase()
      const bv = (b.phoneNumber ?? "").toLowerCase()
      return av.localeCompare(bv) * dir
    }

    // numbers (null-safe)
    const av = (a[key] as number | null) ?? 0
    const bv = (b[key] as number | null) ?? 0
    return (av - bv) * dir
  })

  return sorted
})

const zeroTurnoverUsers = computed(() =>
  filteredUsers.value.filter((u) => (u.totalAmountValue ?? 0) === 0),
)

const zeroBalanceTurnoverUsers = computed(() =>
  filteredUsers.value.filter(
    (u) => (u.totalAmountValue ?? 0) > 0 && (u.totalBalance ?? 0) === 0,
  ),
)

const highTurnoverUsers = computed(() =>
  filteredUsers.value.filter((u) => (u.totalAmountValue ?? 0) >= 1_000_000),
)

const parseLocalizedAmount = (value: string | null | undefined): number | null => {
  const raw = value?.trim().replace(/\s/g, "").replace("₺", "")
  if (!raw) return null

  let normalized = raw
  if (raw.includes(",")) {
    normalized = raw.replace(/\./g, "").replace(",", ".")
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "")
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const balanceLimit = computed(() => {
  const parsed = parseLocalizedAmount(balanceLimitInput.value)
  return parsed !== null && parsed >= 0 ? parsed : null
})

const parseBalance = (u: UserReport): number | null => {
  if (typeof u.totalBalance === "number" && Number.isFinite(u.totalBalance)) {
    return u.totalBalance
  }

  return parseLocalizedAmount(u.totalBalanceStr)
}

const getLastOrderMonthKey = (u: UserReport): string | null => {
  const isoMatch = u.lastOrderDate?.match(/^(\d{4})-(\d{2})/)
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}`
  }

  if (u.lastOrderDate) {
    const parsedDate = new Date(u.lastOrderDate)
    if (!Number.isNaN(parsedDate.getTime())) {
      return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`
    }
  }

  const monthMatch = u.lastOrderMonth?.trim().match(/^(.+)\s+(\d{4})$/)
  if (!monthMatch) return null

  const monthIndex = TURKISH_MONTHS.findIndex(
    (month) =>
      month.toLocaleLowerCase("tr-TR")
      === monthMatch[1].trim().toLocaleLowerCase("tr-TR"),
  )

  if (monthIndex === -1) return null
  return `${monthMatch[2]}-${String(monthIndex + 1).padStart(2, "0")}`
}

const inactiveBalanceUsers = computed(() =>
  users.value
    .filter((u) => {
      const userBalance = parseBalance(u)
      const lastOrderMonthKey = getLastOrderMonthKey(u)
      return (
        balanceLimit.value !== null
        && userBalance !== null
        && userBalance <= balanceLimit.value
        && lastOrderMonthKey !== null
        && lastOrderMonthKey <= selectedCutoffMonth.value
      )
    })
    .sort((a, b) => {
      const monthCompare = (getLastOrderMonthKey(b) ?? "").localeCompare(
        getLastOrderMonthKey(a) ?? "",
      )
      if (monthCompare !== 0) return monthCompare

      const dateCompare = (b.lastOrderDate ?? "").localeCompare(a.lastOrderDate ?? "")
      if (dateCompare !== 0) return dateCompare

      return (b.memberId ?? 0) - (a.memberId ?? 0)
    }),
)

const totalPages = computed(() =>
  filteredUsers.value.length === 0 ? 1 : Math.ceil(filteredUsers.value.length / pageSize.value),
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

// filtre değişince başa dön
watch(filterMissingPhone, () => {
  currentPage.value = 1
})

// users veya filtreli uzunluk değişirse currentPage clamp'le
watch(
  () => filteredUsers.value.length,
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
    }
  },
)

// search değiştikçe başa dön
watch(searchQuery, () => {
  currentPage.value = 1
})

// yeni filtre/sort değişince başa dön
watch([statusFilter, lastDaysFilter, sortKey, sortDir], () => {
  currentPage.value = 1
})

const hasAnyFilter = computed(() => {
  return (
    filterMissingPhone.value
    || !!searchQuery.value.trim()
    || statusFilter.value !== "all"
    || lastDaysFilter.value !== "all"
    || sortKey.value !== "memberId"
    || sortDir.value !== "desc"
  )
})

function resetFilters() {
  searchQuery.value = ""
  filterMissingPhone.value = false
  statusFilter.value = "all"
  lastDaysFilter.value = "all"
  sortKey.value = "memberId"
  sortDir.value = "desc"
  currentPage.value = 1
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "-"
  const day = d.getDate().toString().padStart(2, "0")
  const month = (d.getMonth() + 1).toString().padStart(2, "0")
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

const exportHeaders = [
  "Üye ID",
  "Telefon",
  "Aktif",
  "Toplam Ciro",
  "Son İşlem Ayı",
  "Son Kupon Tarihi",
  "Son Yükleme Tarihi",
  "Son Yükleme Tutarı",
  "Bakiye",
  "Oynanan Ay",
  "Haftalık Ort.",
  "Son 30 Gün",
  "Son 60 Gün",
] as const

const getExportRow = (u: UserReport) => [
  u.memberId ?? "",
  u.phoneNumber ?? "",
  u.isActive ? "Aktif" : "Pasif",
  u.totalAmountValueStr ?? String(u.totalAmountValue ?? ""),
  u.lastOrderMonth || "",
  formatDate(u.lastOrderDate ?? null),
  formatDate(u.lastDepositeDate ?? null),
  u.lastDepositeAmountStr ?? "",
  u.totalBalanceStr ?? String(u.totalBalance ?? ""),
  u.playedMonths ?? "",
  u.weeklyAverageStr ?? "",
  u.last30DaysAmount ? "Evet" : "Hayır",
  u.last60DaysAmount ? "Evet" : "Hayır",
]

const downloadUsersExcel = async (rows: UserReport[], filename: string) => {
  if (!rows.length) return

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Üyeler")

  const headerRow = sheet.addRow([...exportHeaders])
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

  rows.forEach((u) => {
    sheet.addRow(getExportRow(u))
  })

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

const getTodayStamp = () => new Date().toISOString().split("T")[0]

const downloadZeroTurnoverExcel = async () => {
  const filename = `sifir-ciro-uyeler-${getTodayStamp()}.xlsx`
  await downloadUsersExcel(zeroTurnoverUsers.value, filename)
}

const downloadZeroBalanceTurnoverExcel = async () => {
  const filename = `ciro-var-bakiye-sifir-${getTodayStamp()}.xlsx`
  await downloadUsersExcel(zeroBalanceTurnoverUsers.value, filename)
}

const downloadHighTurnoverExcel = async () => {
  const filename = `ciro-1m-ustu-${getTodayStamp()}.xlsx`
  await downloadUsersExcel(highTurnoverUsers.value, filename)
}

const downloadInactiveBalanceExcel = async () => {
  const selectedMonth = cutoffMonthOptions.find(
    (month) => month.value === selectedCutoffMonth.value,
  )
  if (
    !selectedMonth
    || balanceLimit.value === null
    || !inactiveBalanceUsers.value.length
  ) {
    return
  }

  isInactiveExporting.value = true

  try {
    const balanceSlug = Number.isInteger(balanceLimit.value)
      ? String(balanceLimit.value)
      : balanceLimit.value.toFixed(2).replace(".", "-")
    const filename =
      `bakiye-${balanceSlug}-ve-alti-son-oynama`
      + `-${selectedMonth.filenameSlug}-${REPORT_YEAR}-ve-oncesi`
      + `-${getTodayStamp()}.xlsx`
    await downloadUsersExcel(inactiveBalanceUsers.value, filename)
  } finally {
    isInactiveExporting.value = false
  }
}

function onRowClick(user: UserReport) {
  emit("select-user", user)
}
</script>

<style scoped>
.user-table-wrapper {
  padding: 1.5rem;
  background: #0f172a;
  border-radius: 16px;
  border: 1px solid #1f2937;
  color: #e5e7eb;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
  gap: 0.75rem;
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

/* Filter button */
.filter-btn {
  background: #1e293b;
  border: 1px solid #475569;
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  font-size: 0.75rem;
  cursor: pointer;
  color: #cbd5e1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.1s ease;
}

.filter-btn:hover {
  background: #334155;
}

.filter-btn.active {
  background: #4f46e5;
  border-color: #6366f1;
  color: #f9fafb;
  transform: translateY(-1px);
}

.filter-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.filter-btn.danger {
  border-color: rgba(248, 113, 113, 0.6);
  background: rgba(248, 113, 113, 0.1);
}

.filter-btn.danger:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.18);
}

/* Advanced controls */
.advanced-controls {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.export-controls {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.inactive-export-card {
  flex: 1 1 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.75rem;
  border: 1px solid rgba(99, 102, 241, 0.45);
  border-radius: 12px;
  background: linear-gradient(
    135deg,
    rgba(79, 70, 229, 0.16),
    rgba(14, 165, 233, 0.08)
  );
}

.inactive-export-copy {
  min-width: 260px;
  margin-right: auto;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.inactive-export-copy strong {
  color: #f8fafc;
  font-size: 0.82rem;
}

.inactive-export-copy span {
  color: #94a3b8;
  font-size: 0.72rem;
}

.cutoff-picker {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #cbd5e1;
  font-size: 0.75rem;
}

.cutoff-picker select {
  min-width: 250px;
  background: #020617;
  color: #e5e7eb;
  border-radius: 999px;
  border: 1px solid #475569;
  padding: 0.38rem 0.75rem;
  font-size: 0.76rem;
}

.balance-limit-picker {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #cbd5e1;
  font-size: 0.75rem;
}

.balance-limit-input {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border: 1px solid rgba(34, 197, 94, 0.55);
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.1);
  transition: border-color 0.2s ease, background 0.2s ease;
}

.balance-limit-input input {
  width: 105px;
  padding: 0.38rem 0.25rem 0.38rem 0.7rem;
  border: 0;
  outline: 0;
  background: transparent;
  color: #f0fdf4;
  font-size: 0.76rem;
}

.balance-limit-input input::placeholder {
  color: #64748b;
}

.balance-limit-input span {
  padding: 0.38rem 0.7rem 0.38rem 0.25rem;
  color: #bbf7d0;
  white-space: nowrap;
}

.balance-limit-picker.invalid .balance-limit-input {
  border-color: rgba(248, 113, 113, 0.75);
  background: rgba(248, 113, 113, 0.1);
}

.filter-btn.inactive-export-btn {
  border-color: rgba(129, 140, 248, 0.8);
  background: linear-gradient(135deg, #4f46e5, #2563eb);
  color: #fff;
  font-weight: 600;
  padding: 0.42rem 0.9rem;
}

.filter-btn.inactive-export-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #6366f1, #3b82f6);
}

.filter-btn.export-btn {
  background: rgba(14, 165, 233, 0.18);
  border-color: rgba(56, 189, 248, 0.6);
  color: #e0f2fe;
}

.filter-btn.export-btn.secondary {
  background: rgba(34, 197, 94, 0.18);
  border-color: rgba(34, 197, 94, 0.6);
  color: #dcfce7;
}

.filter-btn.export-btn.high {
  background: rgba(234, 179, 8, 0.18);
  border-color: rgba(234, 179, 8, 0.6);
  color: #fef9c3;
}

.filter-btn.export-btn:hover:not(:disabled) {
  background: rgba(14, 165, 233, 0.28);
}

.filter-btn.export-btn.secondary:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.28);
}

.filter-btn.export-btn.high:hover:not(:disabled) {
  background: rgba(234, 179, 8, 0.28);
}

.chip-select {
  background: #020617;
  color: #e5e7eb;
  border-radius: 999px;
  border: 1px solid #374151;
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
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

th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color 0.15s ease;
}

th.sortable:hover {
  color: #e5e7eb;
}

th.sortable.active {
  color: #a5b4fc;
}

.arrow {
  margin-left: 6px;
  font-size: 0.7rem;
  opacity: 0.85;
}

.row-clickable {
  cursor: pointer;
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
