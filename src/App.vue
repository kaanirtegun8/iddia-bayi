<template>
  <!-- AUTH LOADING -->
  <div v-if="authLoading" class="info-banner" style="margin:16px">
    Oturum kontrol ediliyor...
  </div>

  <!-- LOGIN -->
  <Login v-else-if="!firebaseUser" />

  <!-- APP -->
  <template v-else>
    <div class="tabs-container">
      <div class="tabs">
        <button class="tab-btn" :class="{ active: activeTab === 'members' }" @click="activeTab = 'members'">
          Üyelerim
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'upload' }" @click="activeTab = 'upload'">
          Dosya Ekleme
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'analysis' }" @click="activeTab = 'analysis'">
          Analiz
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'sync' }" @click="activeTab = 'sync'">
          Firebase Yükleme
        </button>

        <!-- Çıkış -->
        <button class="tab-btn logout" @click="handleLogout">
          Çıkış
        </button>
      </div>
    </div>

    <div class="page-wrapper">
      <div v-if="activeTab === 'members'">
        <div v-if="isLoadingUsers" class="info-banner">
          Kullanıcılar yükleniyor...
        </div>

        <div v-else-if="usersError" class="error-banner">
          {{ usersError }}
        </div>

        <div v-else class="members-layout">
          <Members :users="users" @select-user="selectedUser = $event" />
          <MemberDetail :user="selectedUser" />
        </div>
      </div>

      <Upload v-if="activeTab === 'upload'" />
      <Analysis v-if="activeTab === 'analysis'" :users="users" />
      <SyncUpload v-if="activeTab === 'sync'" />
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { auth } from "./firebase"

import {
  collection,
  getDocs,
  orderBy,
  query,
  limit,
} from "firebase/firestore"

import Members, { UserReport } from "./components/tabs/Members.vue"
import Upload from "./components/tabs/Upload.vue"
import Analysis from "./components/tabs/Analysis.vue"
import SyncUpload from "./components/tabs/SyncUpload.vue"
import MemberDetail from "./components/tabs/MemberDetail.vue"
import Login from "./components/Login.vue"
import { db } from "./firebase"

const firebaseUser = ref<User | null>(null)
const authLoading = ref(true)

const users = ref<UserReport[]>([])
const isLoadingUsers = ref(true)
const usersError = ref<string | null>(null)
const selectedUser = ref<UserReport | null>(null)
const activeTab = ref<"members" | "upload" | "analysis" | "sync">("members")

const loadLatestUsers = async () => {
  isLoadingUsers.value = true
  usersError.value = null
  users.value = []
  selectedUser.value = null

  try {
    const daysCol = collection(db, "dailyUsers")
    const q = query(daysCol, orderBy("date", "desc"), limit(1))
    const snap = await getDocs(q)

    if (snap.empty) {
      usersError.value = "Firebase'de hiç günlük kullanıcı datası bulunamadı."
      return
    }

    const latestDoc = snap.docs[0]
    const usersCol = collection(latestDoc.ref, "users")
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
      await loadLatestUsers()
    } else {
      // çıkış yaptıysa temizle
      users.value = []
      selectedUser.value = null
      usersError.value = null
      isLoadingUsers.value = false
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
  width: min(900px, 100% - 32px);
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
</style>