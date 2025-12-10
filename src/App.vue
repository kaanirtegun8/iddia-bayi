<template>
  <div class="tabs-container">
    <div class="tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'members' }"
        @click="activeTab = 'members'"
      >
        Üyelerim
      </button>

      <button
        class="tab-btn"
        :class="{ active: activeTab === 'upload' }"
        @click="activeTab = 'upload'"
      >
        Dosya Ekleme
      </button>

      <button
        class="tab-btn"
        :class="{ active: activeTab === 'analysis' }"
        @click="activeTab = 'analysis'"
      >
        Analiz
      </button>

      <!-- YENİ TAB: Firebase -->
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'sync' }"
        @click="activeTab = 'sync'"
      >
        Firebase Yükleme
      </button>
    </div>
  </div>

  <div class="page-wrapper">
    <Members v-if="activeTab === 'members'" :users="users" />
    <Upload v-if="activeTab === 'upload'" />
    <Analysis v-if="activeTab === 'analysis'" :users="users" />

    <!-- Firebase Yükleme TAB İÇERİĞİ -->
    <SyncUpload v-if="activeTab === 'sync'" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"

import Members, { UserReport } from "./components/tabs/Members.vue";
import Upload from "./components/tabs/Upload.vue";
import Analysis from "./components/tabs/Analysis.vue";
import SyncUpload from "./components/tabs/SyncUpload.vue";

import rawUsers from "./10.12.2025.json"

const users = rawUsers as UserReport[]

const activeTab = ref<"members" | "upload" | "analysis" | "sync">("members")
</script>

<style scoped>
.page-wrapper {
  width: 100%;
  min-width: 100%;
  padding: 16px 0;
  box-sizing: border-box;
}

/* TAB BAR: EKRANA SABİT, İÇERİKTEN TAMAMEN BAĞIMSIZ */
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

.page-wrapper {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 100px 16px 16px;
  box-sizing: border-box;
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

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0px); }
}
</style>