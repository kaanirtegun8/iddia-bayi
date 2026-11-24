<template>
  <!-- AUTH LOADING -->
  <div v-if="authLoading" class="info-banner" style="margin:16px">
    Oturum kontrol ediliyor...
  </div>

  <!-- LOGIN -->
  <Login v-else-if="!firebaseUser" />

  <!-- APP -->
  <template v-else>
    <div class="tabs-container" :class="{ 'menu-open': menuOpen }">
      <!-- Telefonda: aktif tabın adı + menü butonu -->
      <button
        class="mobile-bar"
        type="button"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <span class="mobile-bar-title">{{ activeTabLabel }}</span>
        <span class="mobile-bar-icon" aria-hidden="true">{{ menuOpen ? "✕" : "☰" }}</span>
      </button>

      <div class="tabs">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          class="tab-btn"
          :class="[{ active: activeTab === tab.key }, tab.className]"
          @click="selectTab(tab.key)"
        >
          {{ tab.label }}
        </button>

        <!-- Çıkış -->
        <button class="tab-btn logout" @click="handleLogout">
          Çıkış
        </button>
      </div>
    </div>
    <div v-if="menuOpen" class="menu-backdrop" @click="menuOpen = false" />

    <div class="page-wrapper">
      <div v-if="activeTab === 'members'">
        <div v-if="isLoadingDays" class="info-banner">
          Tarihler yükleniyor...
        </div>

        <div class="members-toolbar">
          <label class="day-picker">
            <span>Tarih</span>
            <select
              v-model="selectedDay"
              :disabled="isLoadingDays || !availableDays.length"
              @change="handleSelectedDayChange"
            >
              <option value="" disabled>Seç...</option>
              <option v-for="day in availableDays" :key="day" :value="day">
                {{ day }}
              </option>
            </select>
          </label>
        </div>

        <div v-if="isLoadingUsers" class="info-banner">
          Kullanıcılar yükleniyor...
        </div>

        <div v-else-if="usersError" class="error-banner">
          {{ usersError }}
        </div>

        <div v-else class="members-layout">
          <Members :users="users" @select-user="handleSelectUser" />
          <div ref="memberDetailEl" class="member-detail-anchor">
            <MemberDetail :user="selectedUser" />
          </div>
        </div>
      </div>

      <Upload v-if="activeTab === 'upload'" />
      <Analysis v-if="activeTab === 'analysis'" :users="users" />
      <SpecialPlayerTracking
        v-if="activeTab === 'specialTracking'"
        :users="users"
        :member-snapshot-day="selectedDay"
      />
      <SyncUpload v-if="activeTab === 'sync'" />
      <WhatsappCompare v-if="activeTab === 'whatsapp'" />
      <FirstTimeJoiners v-if="activeTab === 'firstTime'" />
      <OnurDemirReferrals v-if="activeTab === 'onurDemir'" />
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { auth } from "./firebase"

import {
  collection,
  getDocs,
  orderBy,
  query,
  doc,
} from "firebase/firestore"

import Members, { UserReport } from "./components/tabs/Members.vue"
import Upload from "./components/tabs/Upload.vue"
import Analysis from "./components/tabs/Analysis.vue"
import SpecialPlayerTracking from "./components/tabs/SpecialPlayerTracking.vue"
import SyncUpload from "./components/tabs/SyncUpload.vue"
import WhatsappCompare from "./components/tabs/WhatsappCompare.vue"
import FirstTimeJoiners from "./components/tabs/FirstTimeJoiners.vue"
import OnurDemirReferrals from "./components/tabs/OnurDemirReferrals.vue"
import MemberDetail from "./components/tabs/MemberDetail.vue"
import Login from "./components/Login.vue"
import { db } from "./firebase"

const firebaseUser = ref<User | null>(null)
const authLoading = ref(true)

const users = ref<UserReport[]>([])
const isLoadingUsers = ref(true)
const usersError = ref<string | null>(null)
const selectedUser = ref<UserReport | null>(null)
type TabKey =
  | "members"
  | "upload"
  | "analysis"
  | "specialTracking"
  | "sync"
  | "whatsapp"
  | "firstTime"
  | "onurDemir"

const TABS: { key: TabKey; label: string; className?: string }[] = [
  { key: "members", label: "Üyelerim" },
  { key: "upload", label: "Dosya Ekleme" },
  { key: "analysis", label: "Analiz" },
  { key: "specialTracking", label: "Özel Oyuncu Takibi", className: "special-tracking-tab" },
  { key: "sync", label: "Firebase Yükleme" },
  { key: "whatsapp", label: "WhatsApp Karşılaştırma" },
  { key: "firstTime", label: "İlk Kez Gelenler" },
  { key: "onurDemir", label: "Onur Demir'den Gelenler" },
]

const activeTab = ref<TabKey>("members")
const menuOpen = ref(false)
const activeTabLabel = computed(() => TABS.find((t) => t.key === activeTab.value)?.label ?? "")

const selectTab = (key: TabKey) => {
  activeTab.value = key
  menuOpen.value = false
  window.scrollTo({ top: 0 })
}

// Telefonda detay kartı uzun listenin altında kalıyor; seçince oraya kaydır.
const memberDetailEl = ref<HTMLElement | null>(null)
const handleSelectUser = async (user: UserReport) => {
  selectedUser.value = user
  if (window.matchMedia("(max-width: 1024px)").matches) {
    await nextTick()
    memberDetailEl.value?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
}
const availableDays = ref<string[]>([])
const selectedDay = ref("")
const isLoadingDays = ref(false)

const loadUsersByDay = async (day: string) => {
  if (!day) return
  isLoadingUsers.value = true
  usersError.value = null
  users.value = []
  selectedUser.value = null

  try {
    const parentRef = doc(db, "dailyUsers", day)
    const usersCol = collection(parentRef, "users")
    const usersSnap = await getDocs(usersCol)

    const result: UserReport[] = []
    usersSnap.forEach((docSnap) => {
      result.push(docSnap.data() as UserReport)
    })

    users.value = result
    if (result.length > 0) selectedUser.value = result[0]
  } catch (err: any) {
    console.error(err)
    usersError.value =
      "Kullanıcı listesi alınırken hata oluştu: " + (err?.message ?? String(err))
  } finally {
    isLoadingUsers.value = false
  }
}

const loadAvailableDays = async () => {
  isLoadingDays.value = true
  usersError.value = null

  try {
    const q = query(collection(db, "dailyUsers"), orderBy("date", "desc"))
    const snap = await getDocs(q)
    const days: string[] = []
    snap.forEach((docSnap) => {
      days.push(docSnap.id)
    })

    availableDays.value = days

    if (!days.length) {
      selectedDay.value = ""
      users.value = []
      selectedUser.value = null
      usersError.value = "Firebase'de hiç günlük kullanıcı datası bulunamadı."
      isLoadingUsers.value = false
      return
    }

    if (!selectedDay.value || !days.includes(selectedDay.value)) {
      selectedDay.value = days[0]
    }

    await loadUsersByDay(selectedDay.value)
  } catch (err: any) {
    console.error(err)
    usersError.value =
      "Tarih listesi alınırken hata oluştu: " + (err?.message ?? String(err))
    isLoadingUsers.value = false
  } finally {
    isLoadingDays.value = false
  }
}

const handleSelectedDayChange = async () => {
  if (!selectedDay.value) return
  await loadUsersByDay(selectedDay.value)
}

async function handleLogout() {
  await signOut(auth)
  // state zaten onAuthStateChanged ile düşecek
}

let unsubAuth: (() => void) | null = null

onMounted(() => {
  unsubAuth = onAuthStateChanged(auth, async (u) => {
    firebaseUser.value = u
    authLoading.value = false

    if (u) {
      // giriş yaptıysa datayı çek
      await loadAvailableDays()
    } else {
      // çıkış yaptıysa temizle
      users.value = []
      selectedUser.value = null
      usersError.value = null
      isLoadingUsers.value = false
      availableDays.value = []
      selectedDay.value = ""
    }
  })
})

onUnmounted(() => {
  unsubAuth?.()
})
</script>

<style scoped>
/* TAB BAR: EKRANA SABİT */
.tabs-container {
  position: fixed;
  top: 16px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 100;
  pointer-events: none;
}

.tab-btn.logout {
  flex: 0.8;
  opacity: 0.9;
}

.tabs {
  pointer-events: auto;
  width: min(1120px, 100% - 32px);
  display: flex;
  gap: 8px;
  padding: 6px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 999px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  height: 52px;
  align-items: center;
  box-sizing: border-box;
}

.tab-btn.special-tracking-tab {
  color: #fde68a;
}

.tab-btn.special-tracking-tab.active {
  color: #0f172a;
  background: linear-gradient(135deg, #fbbf24, #67e8f9);
}

/* SAYFA İÇERİĞİ */
.page-wrapper {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 100px 16px 16px;
  box-sizing: border-box;
}

/* Members + Detay yan yana layout */
.members-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1.3fr);
  gap: 16px;
}

.members-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #0f172a;
  border: 1px solid #1f2937;
  color: #e5e7eb;
}

.day-picker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.day-picker select {
  background: #020617;
  color: #e5e7eb;
  border-radius: 999px;
  border: 1px solid #374151;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
}

@media (max-width: 1024px) {
  .members-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

.tab-btn {
  flex: 1;
  padding: 10px 14px;
  border-radius: 999px;
  background: transparent;
  border: none;
  color: #cbd5e1;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s ease;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.tab-btn.active {
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: white;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  font-weight: 600;
}

/* Info / error banner */
.info-banner,
.error-banner {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 0.85rem;
}

.info-banner {
  background: rgba(37, 99, 235, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #bfdbfe;
}

.error-banner {
  background: rgba(220, 38, 38, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.5);
  color: #fecaca;
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

.member-detail-anchor {
  min-width: 0;
  scroll-margin-top: 80px;
}

/* Masaüstünde gizli; telefonda tab bar yerine geçer */
.mobile-bar,
.menu-backdrop {
  display: none;
}

/* TELEFON / DAR EKRAN: tek satır üst bar + açılır menü */
@media (max-width: 900px) {
  .tabs-container {
    top: 0;
    padding: 8px 12px;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .mobile-bar {
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    height: 48px;
    padding: 0 16px;
    background: rgba(15, 23, 42, 0.97);
    border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 14px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: #f8fafc;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }

  .mobile-bar-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-bar-icon {
    font-size: 1.25rem;
    line-height: 1;
    color: #c7d2fe;
  }

  .tabs {
    display: none;
    width: 100%;
    height: auto;
    max-height: calc(100dvh - 80px);
    overflow-y: auto;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    padding: 6px;
    border-radius: 14px;
  }

  .menu-open .tabs {
    display: flex;
  }

  .tab-btn {
    flex: none;
    text-align: left;
    padding: 13px 14px;
    border-radius: 10px;
    font-size: 1rem;
  }

  .tab-btn.logout {
    flex: none;
    margin-top: 4px;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 0 0 10px 10px;
    color: #fca5a5;
  }

  .menu-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 90;
    background: rgba(2, 6, 23, 0.6);
  }

  .page-wrapper {
    padding: 72px 12px 16px;
  }

  .members-toolbar {
    padding: 8px 10px;
  }
}
</style>
