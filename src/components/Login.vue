<template>
  <div class="login-page">
    <div class="login-card">
      <!-- LOTTIE -->
      <div class="lottie-wrapper">
        <div ref="lottieEl" class="lottie" />
      </div>

      <!-- CONTENT -->
      <div class="content">
        <span class="badge">YETKİLİ GİRİŞ</span>

        <h1>İddia Bayi Paneli</h1>
        <p class="subtitle">
          Günlük oyuncu hareketleri, analizler ve raporlar için
          <strong>yetkili giriş</strong>.
        </p>

        <form @submit.prevent="handleLogin" class="form">
          <label class="field">
            <span>Email</span>
            <input
              v-model.trim="email"
              type="email"
              placeholder="ornek@bayi.com"
              autocomplete="username"
            />
          </label>

          <label class="field">
            <span>Şifre</span>
            <input
              v-model="password"
              type="password"
              placeholder="••••••••"
              autocomplete="current-password"
            />
          </label>

          <button class="btn" type="submit" :disabled="loading">
            {{ loading ? "Giriş yapılıyor..." : "Giriş Yap" }}
          </button>

          <div v-if="error" class="error">{{ error }}</div>
        </form>

        <div class="footer-note">
          Bu panel izinsiz erişimlere karşı korunmaktadır.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue"
import { signInWithEmailAndPassword } from "firebase/auth"
import { auth } from "../firebase"
import lottie from "lottie-web"
import soccerFans from "../assets/animation/soccer-fans.json"

const email = ref("")
const password = ref("")
const loading = ref(false)
const error = ref<string | null>(null)

const lottieEl = ref<HTMLDivElement | null>(null)
let anim: any = null

onMounted(() => {
  if (!lottieEl.value) return

  anim = lottie.loadAnimation({
    container: lottieEl.value,
    renderer: "svg",
    loop: true,
    autoplay: true,
    animationData: soccerFans,
  })
})

onBeforeUnmount(() => {
  anim?.destroy?.()
})

async function handleLogin() {
  error.value = null
  loading.value = true
  try {
    await signInWithEmailAndPassword(auth, email.value, password.value)
  } catch {
    error.value = "Giriş bilgileri hatalı."
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* PAGE */
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at top left, #1e293b, #020617 70%);
  padding: 24px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #e5e7eb;
}

/* CARD */
.login-card {
  width: 100%;
  max-width: 440px;
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(30, 41, 59, 0.95), rgba(2, 6, 23, 0.95));
  border: 1px solid rgba(148, 163, 184, 0.25);
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
}

/* LOTTIE */
.lottie-wrapper {
  padding: 28px 24px 12px;
  display: flex;
  justify-content: center;
}

.lottie {
  width: 100%;
  max-width: 220px;
}

/* CONTENT */
.content {
  padding: 0 24px 24px;
  text-align: center;
}

.badge {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}

h1 {
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 6px;
}

.subtitle {
  font-size: 0.85rem;
  opacity: 0.8;
  margin-bottom: 20px;
}

/* FORM */
.form {
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 6px;
  text-align: left;
}

.field span {
  font-size: 0.8rem;
  opacity: 0.85;
}

.field input {
  background: #020617;
  border: 1px solid #374151;
  border-radius: 14px;
  padding: 11px 14px;
  color: #e5e7eb;
  font-size: 0.9rem;
}

.field input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.5);
}

/* BUTTON */
.btn {
  margin-top: 6px;
  border: none;
  border-radius: 14px;
  padding: 12px;
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: white;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 30px rgba(99, 102, 241, 0.4);
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

/* ERROR */
.error {
  margin-top: 6px;
  font-size: 0.8rem;
  color: #fca5a5;
}

/* FOOTER */
.footer-note {
  margin-top: 16px;
  font-size: 0.7rem;
  opacity: 0.6;
}
</style>