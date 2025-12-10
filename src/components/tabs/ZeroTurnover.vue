<template>
  <div class="zero-wrapper">
    <div class="card">
      <div class="card-header">
        <div>
          <h2>0 Ciro (totalAmount = 0) Üyeler & Ciro Raporu</h2>
          <p class="subtitle">
            • 0 ciro üyeleri ayrı Excel (CSV) olarak indirebilirsin.<br />
            • Tüm üyeler için <strong>ciroya göre sıralı</strong>, satırları
            <strong>renkli</strong> bir Excel alabilirsin.
          </p>
        </div>

        <div class="stats">
          <span>Toplam Üye: <strong>{{ users.length }}</strong></span>
          <span>0 Ciro Üye: <strong>{{ zeroUsers.length }}</strong></span>
        </div>
      </div>

      <div class="button-row">
        <!-- Eski 0 ciro CSV -->
        <button
          class="download-btn"
          :disabled="!zeroUsers.length"
          @click="downloadZeroCsv"
        >
          {{ zeroUsers.length ? "0 Ciro Üyeleri CSV İndir" : "0 ciro üye yok" }}
        </button>

        <!-- Yeni: renkli Excel -->
        <button
          class="download-btn secondary"
          :disabled="!users.length"
          @click="downloadTurnoverSegmentExcel"
        >
          Ciro Raporu (Renkli Excel) İndir
        </button>
      </div>

      <div v-if="zeroUsers.length" class="preview">
        <h3>0 Ciro Üyelerden Örnek İlk 10 Kayıt</h3>
        <table>
          <thead>
            <tr>
              <th>Üye ID</th>
              <th>Telefon</th>
              <th>Toplam Tutar</th>
              <th>Son İşlem Ayı</th>
              <th>Son Yükleme Tarihi</th>
              <th>Bakiye</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in zeroUsers.slice(0, 10)" :key="u.memberId">
              <td>{{ u.memberId }}</td>
              <td>{{ u.phoneNumber }}</td>
              <td>{{ u.totalAmountValueStr ?? "0,00" }}</td>
              <td>{{ u.lastOrderMonth || "-" }}</td>
              <td>{{ formatDate(u.lastDepositeDate) }}</td>
              <td>{{ u.totalBalanceStr ?? "" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { UserReport } from "./Members.vue"
import ExcelJS from "exceljs"

const props = defineProps<{
  users: UserReport[]
}>()

// totalAmountValue = 0 olanlar
const zeroUsers = computed(() =>
  props.users.filter(u => !u.totalAmountValue || u.totalAmountValue === 0),
)

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

const toCsvValue = (val: unknown) => {
  if (val === null || val === undefined) return ""
  const str = String(val)
  if (/[;"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 *  Ciro renk:
 *  - 1.000.000+  -> Yeşil
 *  - 100.000 - 999.999 -> Sarı
 *  - 50.000 - 99.999 -> Turuncu
 *  - 50.000 altı -> Kırmızı
 *
 *  ExcelJS için ARGB renk kodları dönüyor.
 */
const getTurnoverColorCode = (totalAmountValue?: number | null): string => {
  const value = totalAmountValue ?? 0

  if (value >= 1_000_000) {
    // yeşil
    return "FF22C55E"
  }

  if (value >= 100_000) {
    // sarı
    return "FFFACC15"
  }

  if (value >= 50_000) {
    // turuncu
    return "FFF97316"
  }

  // kırmızı
  return "FFEF4444"
}

/** 0 ciro raporu – CSV (eski) */
const downloadZeroCsv = () => {
  const headers = [
    { key: "memberId", label: "Üye ID" },
    { key: "phoneNumber", label: "Telefon" },
    { key: "isActive", label: "Aktif mi" },
    { key: "totalAmountValueStr", label: "Toplam Ciro" },
    { key: "lastOrderMonth", label: "Son İşlem Ayı" },
    { key: "lastOrderDate", label: "Son Kupon Tarihi" },
    { key: "lastDepositeDate", label: "Son Yükleme Tarihi" },
    { key: "lastDepositeAmountStr", label: "Son Yükleme Tutarı" },
    { key: "totalBalanceStr", label: "Bakiye" },
    { key: "playedMonths", label: "Kaç Ay Oynamış" },
    { key: "weeklyAverageStr", label: "Haftalık Ort." },
  ] as const

  type HeaderKey = (typeof headers)[number]["key"]

  const rows: string[] = []
  rows.push(headers.map(h => toCsvValue(h.label)).join(";"))

  zeroUsers.value.forEach((u) => {
    const row = headers.map((h) => {
      const key = h.key as HeaderKey
      const value =
        key === "lastOrderDate" || key === "lastDepositeDate"
          ? formatDate((u as any)[key])
          : (u as any)[key]

      if (typeof value === "boolean") {
        return toCsvValue(value ? "Evet" : "Hayır")
      }
      return toCsvValue(value ?? "")
    })

    rows.push(row.join(";"))
  })

  const csvContent = rows.join("\r\n")
  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  const today = new Date().toISOString().split("T")[0]

  link.href = url
  link.download = `sifir-ciro-uyeler-${today}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Yeni: ciroya göre sıralı, satırları renkli Excel */
const downloadTurnoverSegmentExcel = async () => {
  // 1) Ciroya göre sıralı liste (büyükten küçüğe)
  const sorted = [...props.users].sort(
    (a, b) => (b.totalAmountValue ?? 0) - (a.totalAmountValue ?? 0),
  )

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Ciro Raporu")

  // 2) Header'lar
  const headerRow = sheet.addRow([
    "Üye ID",
    "Telefon",
    "Toplam Ciro",
    "Son İşlem Ayı",
    "Son Kupon Tarihi",
    "Son Yükleme Tarihi",
    "Son Yükleme Tutarı",
    "Bakiye",
    "Aktif mi",
    "Kaç Ay Oynamış",
    "Haftalık Ort.",
  ])

  // Header'ı biraz kalın yap
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF111827" }, // koyu arka plan
    }
    cell.font = {
      bold: true,
      color: { argb: "FFE5E7EB" },
    }
  })

  // 3) Data satırları
  sorted.forEach((u) => {
    const colorCode = getTurnoverColorCode(u.totalAmountValue)

    const row = sheet.addRow([
      u.memberId,
      u.phoneNumber,
      u.totalAmountValueStr ?? "0,00",
      u.lastOrderMonth || "",
      formatDate(u.lastOrderDate),
      formatDate(u.lastDepositeDate),
      u.lastDepositeAmountStr ?? "",
      u.totalBalanceStr ?? "",
      typeof u.isActive === "boolean" ? (u.isActive ? "Evet" : "Hayır") : "",
      u.playedMonths ?? "",
      u.weeklyAverageStr ?? "",
    ])

    // Satırın tamamını boyuyoruz
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colorCode },
      }
    })
  })

  // Kolon genişliklerini biraz ayarla (göz kararı)
  sheet.columns.forEach((col) => {
    if (!col) return
    col.width = 18
  })

  // 4) Excel olarak indir
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  const today = new Date().toISOString().split("T")[0]

  link.href = url
  link.download = `ciro-raporu-renkli-${today}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.zero-wrapper {
  animation: fadeIn 0.2s ease-out;
}

.card {
  padding: 16px;
  border-radius: 16px;
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.4);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.7);
  color: #e5e7eb;
}

.card-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.card-header h2 {
  margin: 0;
  font-size: 1.2rem;
}

.subtitle {
  margin: 4px 0 0;
  font-size: 0.9rem;
  color: #9ca3af;
}

.stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.download-btn {
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

.download-btn.secondary {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
}

.download-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  background: #4b5563;
}

.download-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(34, 197, 94, 0.4);
}

.download-btn.secondary:not(:disabled):hover {
  box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
}

.preview {
  margin-top: 8px;
}

.preview h3 {
  font-size: 0.95rem;
  margin-bottom: 8px;
  color: #cbd5e1;
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
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0px); }
}
</style>