<template>
  <div class="tracking-page">
    <SpecialPlayerDetail
      v-if="selectedPlayer"
      :player="selectedPlayer"
      :imports="imports"
      @close="selectedPlayerId = null"
    />

    <template v-else>
      <header class="tracking-hero">
        <div>
          <p class="module-mark">Ayrı analiz alanı · {{ memberSnapshotLabel }}</p>
          <h1>Özel Oyuncu Takibi</h1>
          <p>
            Haftalık raporları üye listesiyle eşleştir; yüksek cirolu oyuncuları,
            aktif dönemleri ve davranış değişimlerini tek zaman çizgisinde izle.
          </p>
        </div>
        <div class="hero-ledger" aria-label="Modül özeti">
          <div>
            <span>{{ hasActiveFilters ? "Gösterilen / toplam" : "Oyuncu" }}</span>
            <strong>
              {{ hasActiveFilters
                ? `${filteredPlayers.length.toLocaleString("tr-TR")} / ${players.length.toLocaleString("tr-TR")}`
                : players.length.toLocaleString("tr-TR") }}
            </strong>
          </div>
          <div><span>Rapor dönemi</span><strong>{{ completedImports.length }}</strong></div>
          <div><span>Toplam ciro</span><strong>{{ compactMoney(allPlayersStake) }}</strong></div>
        </div>
      </header>

      <nav class="module-tabs" aria-label="Özel oyuncu takibi bölümleri">
        <button :class="{ active: innerTab === 'players' }" type="button" @click="innerTab = 'players'">
          Oyuncu listesi
        </button>
        <button :class="{ active: innerTab === 'imports' }" type="button" @click="innerTab = 'imports'">
          Haftalık Excel yükle
        </button>
        <button :class="{ active: innerTab === 'history' }" type="button" @click="innerTab = 'history'">
          Yükleme geçmişi
        </button>
      </nav>

      <section v-if="innerTab === 'players'" class="players-section">
        <div class="filter-rail">
          <label class="search-field">
            <span>Oyuncu ara</span>
            <input v-model="searchQuery" type="search" placeholder="Telefon veya üye ID" />
          </label>
          <label>
            <span>Minimum toplam ciro</span>
            <input v-model="minimumStakeInput" inputmode="decimal" placeholder="0" />
          </label>
          <label>
            <span>Eşleşme</span>
            <select v-model="matchFilter">
              <option value="all">Tümü</option>
              <option value="matched">Üyeyle eşleşen</option>
              <option value="unmatched">Üye listesinde olmayan</option>
              <option value="ambiguous">Belirsiz</option>
            </select>
          </label>
          <label>
            <span>Sıralama</span>
            <select v-model="sortKey">
              <option value="stake">Toplam ciro</option>
              <option value="recent">Son 4 dönem</option>
              <option value="lastSeen">Son görülme</option>
              <option value="periods">Aktif dönem</option>
            </select>
          </label>
          <button
            class="quick-filter"
            :class="{ active: isTwoMillionFilterActive }"
            type="button"
            :aria-pressed="isTwoMillionFilterActive"
            @click="applyTwoMillionFilter"
          >
            {{ isTwoMillionFilterActive ? "✓ 2M+ aktif" : "2M+ oyuncular" }}
          </button>
          <button class="clear-filter" type="button" @click="resetFilters">Temizle</button>
        </div>

        <div v-if="hasActiveFilters" class="active-filter-summary" role="status">
          <strong>{{ filteredPlayers.length.toLocaleString("tr-TR") }}</strong>
          <span>/ {{ players.length.toLocaleString("tr-TR") }} oyuncu gösteriliyor</span>
          <span v-if="minimumStake > 0">· En az {{ money(minimumStake) }} ciro</span>
          <span v-if="matchFilter !== 'all'">· {{ matchLabel(matchFilter) }}</span>
          <span v-if="searchQuery.trim()">· Arama: “{{ searchQuery.trim() }}”</span>
        </div>

        <div v-if="playersLoading" class="state-card">Oyuncu takip koleksiyonu yükleniyor…</div>
        <div v-else-if="playersError" class="state-card error">{{ playersError }}</div>
        <div v-else-if="completedImports.length === 0" class="empty-panel">
          <div class="empty-signal">∿</div>
          <h2>İlk haftalık raporu bekliyor</h2>
          <p>Altyapı hazır. Excel’lerin tamamlandığında “Haftalık Excel yükle” bölümünden önce önizleme alacağız.</p>
          <button type="button" @click="innerTab = 'imports'">Yükleme alanını aç</button>
        </div>
          <div v-else-if="filteredPlayers.length === 0" class="empty-panel compact">
            <h2>Bu filtrelere uyan oyuncu bulunamadı</h2>
            <p>Filtreleri temizleyerek tüm oyuncu listesini yeniden gösterebilirsin.</p>
            <button type="button" @click="resetFilters">Filtreleri temizle</button>
          </div>
          <div v-else class="player-table-card">
          <div class="table-summary">
            <p><strong>{{ filteredPlayers.length }}</strong> oyuncu gösteriliyor</p>
            <p>Aktivite şeridi son {{ activityImports.length }} yüklü dönemi gösterir.</p>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Oyuncu</th>
                  <th>Toplam ciro</th>
                  <th>Kupon</th>
                  <th>Aktif dönem</th>
                  <th>Son görülme</th>
                  <th>Son dönemler</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="player in paginatedPlayers" :key="player.id" tabindex="0" @click="openPlayer(player)" @keydown.enter="openPlayer(player)">
                  <td>
                    <strong>{{ player.maskedPhone }}</strong>
                    <span :class="['member-status', player.matchStatus]">
                      {{ player.memberId ? `Üye ${player.memberId}` : matchLabel(player.matchStatus) }}
                    </span>
                  </td>
                  <td class="money-cell">
                    <strong>{{ money(player.summary.totalStake) }}</strong>
                    <span v-if="player.summary.trendPercent !== null" :class="player.summary.trendPercent >= 0 ? 'up' : 'down'">
                      {{ player.summary.trendPercent >= 0 ? "↑" : "↓" }} %{{ Math.abs(player.summary.trendPercent).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) }}
                    </span>
                  </td>
                  <td>{{ nullableCount(player.summary.totalCouponCount) }}</td>
                  <td>{{ player.summary.activePeriods }}</td>
                  <td>{{ formatIsoDate(player.summary.lastSeen) }}</td>
                  <td>
                    <div class="activity-strip" :aria-label="`${player.summary.activePeriods} aktif dönem`">
                      <i
                        v-for="period in activityImports"
                        :key="period.id"
                        :class="{ active: hasPeriod(player, period.id) }"
                        :title="`${period.label}: ${hasPeriod(player, period.id) ? 'göründü' : 'görünmedi'}`"
                      />
                    </div>
                  </td>
                  <td><button class="row-arrow" type="button" aria-label="Oyuncu detayını aç">→</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="totalPages > 1" class="pagination">
            <button type="button" :disabled="currentPage === 1" @click="currentPage--">← Önceki</button>
            <span>{{ currentPage }} / {{ totalPages }}</span>
            <button type="button" :disabled="currentPage === totalPages" @click="currentPage++">Sonraki →</button>
          </div>
        </div>
      </section>

      <section v-else-if="innerTab === 'imports'" class="import-section">
        <div class="import-intro">
          <div>
            <p class="eyebrow">Kontrollü veri alımı</p>
            <h2>Haftalık raporu önce doğrula</h2>
            <p>
              Dosya seçildiğinde hiçbir kayıt Firebase’e yazılmaz. Sayfalar, tarihler,
              ciro, kupon adedi ve üye eşleşmeleri önizlenir; kayıt ancak sen onayladığında başlar.
            </p>
          </div>
          <div class="contract-list">
            <span>GSM Bazlı EP İşlemler</span>
            <span>Kupon ID Bazında EP Raporu</span>
            <span>Maskeli GSM: 05XX***XXXX</span>
          </div>
        </div>

        <div class="drop-card">
          <label class="drop-zone" :class="{ disabled: isParsing || isSaving }">
            <input type="file" accept=".xlsx,.xls" :disabled="isParsing || isSaving" @change="onSelectFile" />
            <span class="drop-icon">↥</span>
            <strong>{{ selectedFile?.name ?? "Haftalık Excel seç" }}</strong>
            <small>{{ isParsing ? "Rapor okunuyor ve üyeler eşleştiriliyor…" : "Dosya seçmek önizleme oluşturur; veri yüklemez." }}</small>
          </label>

          <div v-if="parseError" class="message error">{{ parseError }}</div>
          <div v-if="saveMessage" :class="['message', saveStatus]">{{ saveMessage }}</div>

          <div v-if="preview" class="preview-panel">
            <div class="preview-heading">
              <div>
                <p class="eyebrow">Önizleme hazır</p>
                <h3>{{ preview.label }}</h3>
                <span>{{ preview.fileName }}</span>
              </div>
              <span :class="['detail-coverage', preview.hasCouponDetail ? 'full' : 'limited']">
                {{ preview.hasCouponDetail ? "Tam kupon detayı" : "Sınırlı analiz" }}
              </span>
            </div>

            <div class="preview-metrics">
              <div><span>Oyuncu</span><strong>{{ preview.playerCount.toLocaleString("tr-TR") }}</strong></div>
              <div><span>Üyeyle eşleşen</span><strong>{{ preview.matchedPlayerCount.toLocaleString("tr-TR") }}</strong></div>
              <div><span>Toplam ciro</span><strong>{{ money(preview.totalStake) }}</strong></div>
              <div><span>Kupon</span><strong>{{ nullableCount(preview.totalCouponCount) }}</strong></div>
            </div>

            <div v-if="preview.warnings.length" class="warning-list">
              <p v-for="warning in preview.warnings" :key="warning">⚠ {{ warning }}</p>
            </div>
            <div v-if="previewConflict" class="message error">{{ previewConflict }}</div>

            <div class="quality-row">
              <span>{{ preview.turnoverRowCount.toLocaleString("tr-TR") }} ciro satırı</span>
              <span>{{ preview.couponRowCount.toLocaleString("tr-TR") }} kupon satırı</span>
              <span>{{ preview.unmatchedPlayerCount }} eşleşmeyen</span>
              <span>{{ preview.ambiguousPlayerCount }} belirsiz</span>
            </div>

            <div class="confirm-area">
              <label>
                <input v-model="confirmationChecked" type="checkbox" />
                Tarih aralığını, toplamları ve üye eşleşmelerini kontrol ettim.
              </label>
              <button type="button" :disabled="!confirmationChecked || isSaving || Boolean(previewConflict)" @click="savePreview">
                {{ isSaving ? "Firebase’e işleniyor…" : "Onayla ve yeni koleksiyona işle" }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section v-else class="history-section">
        <div class="history-heading">
          <div>
            <p class="eyebrow">İzlenebilir kaynaklar</p>
            <h2>Yükleme geçmişi</h2>
          </div>
          <span>{{ imports.length }} kayıt</span>
        </div>
        <div v-if="importsLoading" class="state-card">Geçmiş yükleniyor…</div>
        <div v-else-if="importsError" class="state-card error">{{ importsError }}</div>
        <div v-else-if="!imports.length" class="empty-panel compact">
          <h2>Henüz işlenmiş Excel yok</h2>
          <p>Dosyalar tamamlandığında her yükleme burada tarih aralığı ve kalite bilgisiyle görünecek.</p>
        </div>
        <div v-else class="history-list">
          <article v-for="item in [...imports].reverse()" :key="item.id">
            <div class="history-date"><strong>{{ item.label }}</strong><span>{{ item.fileName }}</span></div>
            <div><span>Oyuncu</span><strong>{{ item.playerCount }}</strong></div>
            <div><span>Ciro</span><strong>{{ money(item.totalStake) }}</strong></div>
            <div><span>Kupon</span><strong>{{ nullableCount(item.totalCouponCount) }}</strong></div>
            <span :class="['import-status', item.status]">{{ importStatusLabel(item.status) }}</span>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import type { UserReport } from "./Members.vue"
import SpecialPlayerDetail from "../tracking/SpecialPlayerDetail.vue"
import {
  formatIsoDate,
  parseTrackingWorkbook,
  saveTrackingImport,
  subscribeTrackingImports,
  subscribeTrackingPlayers,
  type PlayerMatchStatus,
  type TrackingImportPreview,
  type TrackingImportRecord,
  type TrackingPlayer,
} from "../../features/specialPlayerTracking"

const props = defineProps<{
  users: UserReport[]
  memberSnapshotDay: string
}>()

type InnerTab = "players" | "imports" | "history"
type SortKey = "stake" | "recent" | "lastSeen" | "periods"

const innerTab = ref<InnerTab>("players")
const players = ref<TrackingPlayer[]>([])
const imports = ref<TrackingImportRecord[]>([])
const playersLoading = ref(true)
const importsLoading = ref(true)
const playersError = ref("")
const importsError = ref("")
const selectedPlayerId = ref<string | null>(null)

const searchQuery = ref("")
const minimumStakeInput = ref("0")
const matchFilter = ref<"all" | PlayerMatchStatus>("all")
const sortKey = ref<SortKey>("stake")
const currentPage = ref(1)
const pageSize = 40

const selectedFile = ref<File | null>(null)
const preview = ref<TrackingImportPreview | null>(null)
const isParsing = ref(false)
const isSaving = ref(false)
const parseError = ref("")
const saveMessage = ref("")
const saveStatus = ref<"success" | "error">("success")
const confirmationChecked = ref(false)

let unsubscribePlayers: (() => void) | null = null
let unsubscribeImports: (() => void) | null = null

const memberSnapshotLabel = computed(() =>
  props.memberSnapshotDay ? `${props.memberSnapshotDay} üye listesi` : "Üye listesi bekleniyor",
)

const completedImports = computed(() => imports.value.filter((item) => item.status === "completed"))
const activityImports = computed(() => completedImports.value.slice(-12))
const allPlayersStake = computed(() => players.value.reduce((sum, player) => sum + player.summary.totalStake, 0))
const selectedPlayer = computed(() => players.value.find((player) => player.id === selectedPlayerId.value) ?? null)
const previewConflict = computed(() => {
  if (!preview.value) return ""
  const exact = completedImports.value.find((item) => item.id === preview.value?.importId)
  if (exact) return `Bu dosyanın aynısı daha önce işlendi: ${exact.fileName}.`

  const overlapping = completedImports.value.find(
    (item) => preview.value && preview.value.startDate <= item.endDate && item.startDate <= preview.value.endDate,
  )
  return overlapping
    ? `Bu tarih aralığı ${overlapping.fileName} ile çakışıyor (${overlapping.label}).`
    : ""
})

const parseFilterNumber = (value: string): number => {
  const cleaned = value.trim().replace(/\s/g, "")
  if (!cleaned) return 0
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned
  const number = Number(normalized)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

const minimumStake = computed(() => parseFilterNumber(minimumStakeInput.value))
const isTwoMillionFilterActive = computed(() => minimumStake.value === 2_000_000)
const hasActiveFilters = computed(() =>
  minimumStake.value > 0 || matchFilter.value !== "all" || Boolean(searchQuery.value.trim()),
)

const filteredPlayers = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase("tr-TR")
  const minimumStakeValue = minimumStake.value
  const rows = players.value.filter((player) => {
    if (player.summary.totalStake < minimumStakeValue) return false
    if (matchFilter.value !== "all" && player.matchStatus !== matchFilter.value) return false
    if (!query) return true
    return (
      player.maskedPhone.toLocaleLowerCase("tr-TR").includes(query) ||
      String(player.memberId ?? "").includes(query)
    )
  })

  return rows.sort((a, b) => {
    if (sortKey.value === "recent") return b.summary.lastFourPeriodsStake - a.summary.lastFourPeriodsStake
    if (sortKey.value === "lastSeen") return (b.summary.lastSeen ?? "").localeCompare(a.summary.lastSeen ?? "")
    if (sortKey.value === "periods") return b.summary.activePeriods - a.summary.activePeriods
    return b.summary.totalStake - a.summary.totalStake
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredPlayers.value.length / pageSize)))
const paginatedPlayers = computed(() =>
  filteredPlayers.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize),
)

watch([searchQuery, minimumStakeInput, matchFilter, sortKey], () => {
  currentPage.value = 1
})

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

const money = (value: number): string =>
  value.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })

const compactMoney = (value: number): string =>
  new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(value) + " ₺"

const nullableCount = (value: number | null): string =>
  value === null ? "Veri yok" : value.toLocaleString("tr-TR")

const matchLabel = (status: PlayerMatchStatus): string => {
  if (status === "matched") return "Üyeyle eşleşti"
  if (status === "ambiguous") return "Belirsiz eşleşme"
  return "Üye listesinde yok"
}

const importStatusLabel = (status: TrackingImportRecord["status"]): string => {
  if (status === "completed") return "Tamamlandı"
  if (status === "failed") return "Başarısız"
  return "İşleniyor"
}

const hasPeriod = (player: TrackingPlayer, importId: string): boolean =>
  player.sourceImportIds.includes(importId)

const resetFilters = () => {
  searchQuery.value = ""
  minimumStakeInput.value = "0"
  matchFilter.value = "all"
  sortKey.value = "stake"
}

const applyTwoMillionFilter = () => {
  minimumStakeInput.value = isTwoMillionFilterActive.value ? "0" : "2000000"
  sortKey.value = "stake"
  currentPage.value = 1
}

const openPlayer = (player: TrackingPlayer) => {
  selectedPlayerId.value = player.id
  window.scrollTo({ top: 0, behavior: "smooth" })
}

const onSelectFile = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  selectedFile.value = file
  preview.value = null
  parseError.value = ""
  saveMessage.value = ""
  confirmationChecked.value = false
  if (!file) return

  if (!props.users.length) {
    parseError.value = "Üye listesi yüklenmeden Excel eşleştirmesi yapılamaz. Önce günlük üye datasını kontrol et."
    return
  }

  isParsing.value = true
  try {
    preview.value = await parseTrackingWorkbook(await file.arrayBuffer(), file.name, props.users)
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isParsing.value = false
  }
}

const savePreview = async () => {
  if (!preview.value || !confirmationChecked.value) return
  isSaving.value = true
  saveMessage.value = ""
  try {
    await saveTrackingImport(preview.value, props.memberSnapshotDay || null)
    saveStatus.value = "success"
    saveMessage.value = `${preview.value.label} dönemi yeni takip koleksiyonuna işlendi.`
    preview.value = null
    selectedFile.value = null
    confirmationChecked.value = false
    innerTab.value = "history"
  } catch (error) {
    saveStatus.value = "error"
    saveMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  unsubscribePlayers = subscribeTrackingPlayers(
    (rows) => {
      players.value = rows
      playersLoading.value = false
      playersError.value = ""
    },
    (error) => {
      playersLoading.value = false
      playersError.value = `Oyuncu koleksiyonu okunamadı: ${error.message}`
    },
  )
  unsubscribeImports = subscribeTrackingImports(
    (rows) => {
      imports.value = rows
      importsLoading.value = false
      importsError.value = ""
    },
    (error) => {
      importsLoading.value = false
      importsError.value = `Yükleme geçmişi okunamadı: ${error.message}`
    },
  )
})

onUnmounted(() => {
  unsubscribePlayers?.()
  unsubscribeImports?.()
})
</script>

<style scoped>
.tracking-page { --ink: #f8fafc; --muted: #94a3b8; --line: #1e293b; --gold: #fbbf24; --ice: #67e8f9; max-width: 1320px; margin: 0 auto; }
.tracking-hero { position: relative; overflow: hidden; min-height: 210px; display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr); gap: 28px; align-items: end; padding: 32px; background: linear-gradient(115deg, #07101e 0%, #0b1628 64%, #111827 100%); border: 1px solid #243044; border-radius: 18px 18px 0 0; }
.tracking-hero::after { content: ""; position: absolute; right: -90px; top: -145px; width: 340px; height: 340px; border: 1px solid rgba(103, 232, 249, 0.18); border-radius: 50%; box-shadow: 0 0 0 48px rgba(251, 191, 36, 0.025), 0 0 0 96px rgba(103, 232, 249, 0.018); pointer-events: none; }
.module-mark, .eyebrow { margin: 0 0 7px; color: var(--ice); font-size: 0.7rem; font-weight: 750; text-transform: uppercase; letter-spacing: 0.13em; }
.tracking-hero h1 { margin: 0; color: var(--ink); font-size: clamp(2rem, 4vw, 3.5rem); line-height: 0.98; letter-spacing: -0.05em; }
.tracking-hero > div:first-child > p:last-child { max-width: 720px; margin: 18px 0 0; color: #a8b4c6; font-size: 0.95rem; }
.hero-ledger { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid #334155; border-bottom: 1px solid #334155; }
.hero-ledger div { padding: 13px 10px; border-right: 1px solid #334155; }
.hero-ledger div:last-child { border-right: 0; }
.hero-ledger span { display: block; color: #64748b; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; }
.hero-ledger strong { display: block; margin-top: 5px; color: #e2e8f0; font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.module-tabs { display: flex; gap: 3px; padding: 7px; background: #050c17; border: 1px solid #243044; border-top: 0; border-radius: 0 0 14px 14px; }
.module-tabs button { padding: 10px 14px; border: 0; border-radius: 8px; background: transparent; color: #7f8da3; cursor: pointer; font-weight: 650; }
.module-tabs button:hover { color: #e2e8f0; background: #0f172a; }
.module-tabs button.active { color: #06101c; background: var(--ice); }
.module-tabs button:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--ice); outline-offset: 2px; }
.players-section, .import-section, .history-section { margin-top: 18px; }
.filter-rail { display: grid; grid-template-columns: minmax(210px, 1.5fr) repeat(3, minmax(155px, 0.8fr)) auto auto; gap: 10px; align-items: end; padding: 14px; background: #07101e; border: 1px solid var(--line); border-radius: 14px; }
.filter-rail label { display: flex; flex-direction: column; gap: 6px; }
.filter-rail label span { color: #718096; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; }
input, select { width: 100%; height: 39px; border: 1px solid #334155; border-radius: 8px; background: #0b1423; color: #e2e8f0; padding: 0 10px; }
.quick-filter, .clear-filter { height: 39px; padding: 0 12px; border-radius: 8px; cursor: pointer; white-space: nowrap; }
.quick-filter { border: 1px solid rgba(251, 191, 36, 0.45); background: rgba(251, 191, 36, 0.09); color: #fde68a; }
.quick-filter.active { border-color: #fbbf24; background: #fbbf24; color: #111827; box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.12); font-weight: 800; }
.clear-filter { border: 1px solid #334155; background: transparent; color: #94a3b8; }
.active-filter-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin-top: 10px; padding: 10px 14px; border: 1px solid rgba(103, 232, 249, 0.3); border-radius: 10px; background: rgba(103, 232, 249, 0.07); color: #a5f3fc; font-size: 0.78rem; }
.active-filter-summary strong { color: #f8fafc; font-size: 0.92rem; }
.state-card, .empty-panel { margin-top: 14px; padding: 42px; text-align: center; background: #07101e; border: 1px solid var(--line); border-radius: 14px; color: #94a3b8; }
.state-card.error, .message.error { color: #fecaca; border-color: rgba(251, 113, 133, 0.35); }
.empty-signal { display: grid; place-items: center; width: 58px; height: 58px; margin: 0 auto 12px; border: 1px solid #334155; border-radius: 50%; color: var(--gold); font-size: 2rem; }
.empty-panel h2 { margin: 0; color: #e2e8f0; }
.empty-panel p { max-width: 620px; margin: 8px auto 18px; }
.empty-panel button { border: 1px solid var(--ice); border-radius: 8px; background: rgba(103, 232, 249, 0.1); color: #cffafe; padding: 9px 13px; cursor: pointer; }
.empty-panel.compact { padding: 30px; }
.player-table-card { margin-top: 14px; background: #07101e; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.table-summary { display: flex; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--line); color: #64748b; font-size: 0.74rem; }
.table-summary p { margin: 0; }
.table-summary strong { color: #e2e8f0; }
.table-scroll { overflow-x: auto; }
table { width: 100%; min-width: 980px; border-collapse: collapse; }
th { padding: 10px 13px; background: #0a1322; color: #64748b; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; text-align: left; }
td { padding: 13px; border-top: 1px solid #172033; color: #cbd5e1; font-size: 0.8rem; font-variant-numeric: tabular-nums; }
tbody tr { cursor: pointer; transition: background 0.16s ease; }
tbody tr:hover, tbody tr:focus { background: rgba(103, 232, 249, 0.045); outline: none; }
td:first-child, .money-cell { display: table-cell; }
td:first-child > strong, td:first-child > span, .money-cell > strong, .money-cell > span { display: block; }
td:first-child > span, .money-cell > span { margin-top: 3px; }
td:first-child > strong { color: #f1f5f9; font-size: 0.88rem; }
.member-status { font-size: 0.69rem; }
.member-status.matched { color: #86efac; } .member-status.unmatched { color: #fda4af; } .member-status.ambiguous { color: #fde047; }
.money-cell > strong { color: #f8fafc; }
.money-cell span { font-size: 0.69rem; }
.money-cell .up { color: #86efac; } .money-cell .down { color: #fda4af; }
.activity-strip { display: grid; grid-template-columns: repeat(12, 8px); gap: 3px; }
.activity-strip i { width: 8px; height: 23px; border-radius: 2px; background: #172033; }
.activity-strip i.active { background: linear-gradient(180deg, var(--ice), #0e7490); box-shadow: 0 0 8px rgba(103, 232, 249, 0.17); }
.row-arrow { border: 0; background: transparent; color: var(--ice); font-size: 1.2rem; cursor: pointer; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 14px; padding: 13px; border-top: 1px solid var(--line); color: #64748b; font-size: 0.76rem; }
.pagination button { border: 1px solid #334155; border-radius: 7px; background: #0b1423; color: #cbd5e1; padding: 7px 10px; cursor: pointer; }
.pagination button:disabled { opacity: 0.35; cursor: default; }
.import-intro { display: grid; grid-template-columns: 1fr auto; gap: 28px; align-items: center; padding: 20px; background: #07101e; border: 1px solid var(--line); border-radius: 14px; }
.import-intro h2, .history-heading h2 { margin: 0; color: #f1f5f9; }
.import-intro p:last-child { max-width: 740px; margin: 8px 0 0; color: #94a3b8; }
.contract-list { display: flex; flex-direction: column; gap: 7px; color: #a5f3fc; font-size: 0.75rem; }
.contract-list span::before { content: "✓"; color: #22c55e; margin-right: 7px; }
.drop-card { margin-top: 14px; padding: 18px; background: #07101e; border: 1px solid var(--line); border-radius: 14px; }
.drop-zone { min-height: 170px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 7px; border: 1px dashed #3b4b62; border-radius: 12px; background: #091321; cursor: pointer; }
.drop-zone:hover { border-color: var(--ice); background: #0a1726; }
.drop-zone.disabled { opacity: 0.65; cursor: wait; }
.drop-zone input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.drop-icon { color: var(--gold); font-size: 2rem; }
.drop-zone strong { color: #e2e8f0; }
.drop-zone small { color: #64748b; }
.message { margin-top: 12px; padding: 10px 12px; border: 1px solid; border-radius: 8px; font-size: 0.8rem; }
.message.success { color: #bbf7d0; border-color: rgba(34, 197, 94, 0.35); background: rgba(34, 197, 94, 0.06); }
.preview-panel { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 16px; }
.preview-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.preview-heading h3 { margin: 0; color: #f8fafc; font-size: 1.35rem; }
.preview-heading > div > span { color: #64748b; font-size: 0.75rem; }
.detail-coverage { padding: 5px 9px; border-radius: 999px; font-size: 0.7rem; font-weight: 700; }
.detail-coverage.full { color: #86efac; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.25); }
.detail-coverage.limited { color: #fde047; background: rgba(250, 204, 21, 0.1); border: 1px solid rgba(250, 204, 21, 0.25); }
.preview-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; margin-top: 15px; }
.preview-metrics div { padding: 13px; background: #0a1423; border-left: 2px solid #334155; }
.preview-metrics span { display: block; color: #64748b; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; }
.preview-metrics strong { display: block; margin-top: 5px; color: #e2e8f0; }
.warning-list { margin-top: 12px; padding: 10px 12px; background: rgba(250, 204, 21, 0.06); border-left: 2px solid #facc15; color: #fde68a; font-size: 0.76rem; }
.warning-list p { margin: 4px 0; }
.quality-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 13px; }
.quality-row span { padding: 5px 8px; border-radius: 6px; background: #111b2b; color: #94a3b8; font-size: 0.71rem; }
.confirm-area { display: flex; justify-content: space-between; align-items: center; gap: 18px; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
.confirm-area label { display: flex; align-items: center; gap: 9px; color: #cbd5e1; font-size: 0.8rem; }
.confirm-area input { width: 16px; height: 16px; }
.confirm-area button { padding: 10px 14px; border: 1px solid rgba(103, 232, 249, 0.5); border-radius: 8px; background: var(--ice); color: #06101c; font-weight: 800; cursor: pointer; }
.confirm-area button:disabled { opacity: 0.35; cursor: default; }
.history-heading { display: flex; justify-content: space-between; align-items: center; padding: 4px 2px 12px; }
.history-heading > span { color: #64748b; }
.history-list { display: flex; flex-direction: column; gap: 8px; }
.history-list article { display: grid; grid-template-columns: minmax(230px, 1.4fr) repeat(3, minmax(100px, 0.6fr)) auto; align-items: center; gap: 12px; padding: 14px 16px; background: #07101e; border: 1px solid var(--line); border-radius: 11px; }
.history-list article > div { display: flex; flex-direction: column; }
.history-list span { color: #64748b; font-size: 0.7rem; }
.history-list strong { color: #e2e8f0; font-size: 0.84rem; }
.import-status { justify-self: end; padding: 5px 8px; border: 1px solid; border-radius: 999px; font-weight: 700; }
.import-status.completed { color: #86efac; border-color: rgba(34, 197, 94, 0.3); }
.import-status.failed { color: #fda4af; border-color: rgba(251, 113, 133, 0.3); }
.import-status.processing { color: #fde047; border-color: rgba(250, 204, 21, 0.3); }
@media (max-width: 1120px) { .filter-rail { grid-template-columns: repeat(2, 1fr); } .quick-filter, .clear-filter { width: 100%; } }
@media (max-width: 820px) { .tracking-hero { grid-template-columns: 1fr; padding: 24px; } .import-intro { grid-template-columns: 1fr; } .preview-metrics { grid-template-columns: repeat(2, 1fr); } .history-list article { grid-template-columns: 1fr 1fr; } .import-status { justify-self: start; } }
@media (max-width: 600px) { .module-tabs { overflow-x: auto; } .module-tabs button { white-space: nowrap; } .filter-rail { grid-template-columns: 1fr; } .hero-ledger { grid-template-columns: 1fr; } .hero-ledger div { border-right: 0; border-bottom: 1px solid #334155; } .preview-metrics { grid-template-columns: 1fr; } .confirm-area { align-items: stretch; flex-direction: column; } .history-list article { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { tbody tr { transition: none; } }
</style>
