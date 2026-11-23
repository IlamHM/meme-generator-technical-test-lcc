# FIX REPORT — Meme Portal (Take-Home Assignment)

> **Tanggal**: 2026-11-23
> **Repo**: Raja-Derek/meme-generator
> **Sumber analisis awal**: [docs/ANALYSIS.md](docs/ANALYSIS.md)
> **Status**: Seluruh tiket production issue **selesai & terverifikasi live**

---

## Ringkasan Eksekutif

Sembilan tiket production issue plus satu prasyarat infrastruktur (CORS) berhasil diperbaiki. Tiga isu bersifat **keamanan** (akses data orang lain, penyalahgunaan storage, kebocoran cache), dua isu **enforcement bisnis** (kuota & masa aktif langganan), sisanya menyangkut **pembayaran, autentikasi, dan pengalaman pengguna**. Setiap fix diverifikasi dengan reproduksi ulang sebelum → sesudah.

| Tiket | Masalah (bahasa awam) | Severity | Commit | Status |
|---|---|---|---|---|
| — | Browser memblokir checkout karena header `Idempotency-Key` tidak diizinkan CORS | Prasyarat | `aab33d4` | ✅ |
| TKT-107 | User B bisa melihat & menghapus meme milik user A (IDOR) | P0 Blocker | `d58ea0a` | ✅ |
| TKT-108 | File GTA V 90GB, .exe, .html masuk bucket S3 | P0 Blocker | `b3488fa` | ✅ |
| TKT-109 | Kuota 20 meme bisa ditembus jadi 25 via tab paralel | P0 Kritis | `4e316d7` | ✅ |
| TKT-101 | Paket kedaluwarsa tetap bisa upload/render | P0 Kritis | `1446af5` | ✅ |
| TKT-102 | Proxy kantor menampilkan data user A ke user B | P0 Kritis | `9501713` | ✅ |
| TKT-103 | Logout tidak berfungsi + redirect loop login ↔ home | P1 Tinggi | `27dcc67`, `f145f78` | ✅ |
| TKT-105 | Klik 2x → 2 checkout pending untuk paket sama | P1 Tinggi | `00f01c2`, `ce0c120` | ✅ |
| TKT-106 | Klik "Bayar Sekarang" tanpa feedback apa pun | P1 Tinggi | `805224d` | ✅ |
| TKT-104 | Status/kuota UI tidak update sampai hard refresh | P2 Sedang | `6b45b86` | ✅ |

---

## Catatan Environment (untuk reproduksi)

- Infrastruktur lokal via docker compose: **postgres (port 5432)**, redis, garage S3.
- Jalankan dengan `make setup` lalu `make dev` → API di `:8080`, web di `:3000`.
- Migrasi database via golang-migrate (`make migrate-up`); fix TKT-105 backend memerlukan migrasi `000006`.
- Payment gateway masih **mock** (auto-confirm) — semua skenario pembayaran diuji terhadap mock ini.

---

## Detail Perbaikan

### 0. CORS — `Idempotency-Key` diblokir browser (prasyarat)

**Root cause**: Middleware CORS tidak memasukkan `Idempotency-Key` ke `Access-Control-Allow-Headers`, sehingga browser membatalkan request checkout sebelum sampai ke server. `api/internal/middleware/cors.go`

**Perubahan**:
- `api/internal/middleware/cors.go` — tambahkan `Idempotency-Key` ke allowed headers.

**Proof of completion**:

| Langkah | Sebelum | Sesudah |
|---|---|---|
| Preflight `OPTIONS` ke endpoint checkout | Header `idempotency-key` tidak ada di respons | Preflight mengembalikan `idempotency-key` di `Access-Control-Allow-Headers`; checkout lolos |

---

### TKT-107 — IDOR: user bisa lihat & hapus meme orang lain

**Root cause**: Query by-id (`GetByID`, `SetResultURL`, `Delete`) hanya memfilter `id`, **tanpa `user_id`** — siapa pun yang menebak UUID bisa mengakses/menghapus objek orang lain. `api/internal/modules/meme/repository.go`

**Perubahan**:
- `api/internal/modules/meme/repository.go` — semua query by-id kini `WHERE id = $1 AND user_id = $2`; no-rows dan invalid uuid di-map ke **404** (agar tidak membocorkan keberadaan objek).

**Proof of completion** (dua akun: A = pemilik, B = penyerang):

| Skenario | Sebelum | Sesudah |
|---|---|---|
| B `GET` meme milik A | 200 + data A | **404** |
| B `DELETE` meme milik A | 200 (objek A terhapus!) | **404**, objek A utuh (tanpa side effect) |
| A `GET` meme sendiri | 200 | 200 ✅ |
| A `DELETE` 2x berurutan | — | 200 → 404 (idempoten, tidak 500) |

---

### TKT-108 — Penyalahgunaan S3 (GTA V 90GB, .exe, .html)

**Root cause**: Upload tidak divalidasi sama sekali di server — server memercayai ekstensi/Content-Type dari klien, tanpa batas ukuran.

**Perubahan** (modul meme):
- `consts.go` — allowlist ekstensi gambar + batas ukuran 10MB.
- `errors.go` — error baru untuk file ditolak.
- `handler.go`, `service.go` — validasi server-side: allowlist ekstensi, **content sniffing magic bytes via HeadObject**, batas 10MB.

**Proof of completion**:

| Skenario | Sebelum | Sesudah |
|---|---|---|
| Upload `.exe` / `.zip` / `.html` / ekstensi ganda | Masuk bucket | **400 Bad Request** |
| Upload > 10MB | Masuk (terbukti: 90GB) | **413 Payload Too Large** |
| MIME mismatch di presigned URL | Lolos | **403 Forbidden** |
| PNG/JPG valid end-to-end | ✅ | ✅ tetap 200 (tidak ada regresi) |

---

### TKT-109 — Race condition kuota (20 → 25 meme)

**Root cause**: Gate `CanCreate` membaca `MemesUsed` **non-transaksional dan terpisah dari insert** — pola check-then-act klasik. Enam tab paralel semuanya membaca "masih ada sisa" sebelum satu pun insert selesai. `api/internal/modules/meme/repository.go`

**Perubahan**:
- `meme/repository.go` — `Create` kini melakukan `SELECT ... FOR UPDATE` pada baris subscription **dalam satu transaksi** bersama insert; kuota habis → `ErrQuotaExceeded` (error code **30004**).

**Proof of completion**:

| Skenario | Sebelum | Sesudah |
|---|---|---|
| Sisa kuota 1, tembak 12 request paralel | 25 meme tercipta (limit 20) | Tepat **1 sukses (201), 11 gagal (403)** |
| Paket unlimited | ✅ | ✅ tetap berjalan tanpa hambatan |

---

### TKT-101 — Paket kedaluwarsa tetap bisa dipakai

**Root cause**: Query `ActiveByUser` hanya memfilter `status = 'active'` **tanpa `ends_at > now()`** — langganan yang masa berlakunya habis tetap dianggap aktif. `api/internal/modules/subscription/repository.go:172`

**Perubahan**:
- `subscription/repository.go` — tambahkan `AND ends_at > now()`; error expired dibedakan dengan code **20006** agar UI bisa menampilkan pesan spesifik.

**Proof of completion**:

| Skenario | Sebelum | Sesudah |
|---|---|---|
| User dengan paket expired mencoba upload | 201 (lolos) | **403** — "langganan sudah kedaluwarsa" |
| User dengan paket aktif | 201 | 201 ✅ |

---

### TKT-102 — Kebocoran data via cache proxy

**Root cause**: Endpoint `/subscription/status` memasang header `Cache-Control: public, max-age=86400` **tanpa `Vary: Authorization`** — proxy kantor menyimpan respons user A dan menyajikannya ke user B. `api/internal/modules/subscription/mount.go:22`

**Perubahan**:
- Middleware **NoCache global**: `Cache-Control: no-store` + `Vary: Authorization` untuk seluruh respons terautentikasi; header `public` dihapus.

**Proof of completion**:

| Skenario | Sebelum | Sesudah |
|---|---|---|
| Inspeksi header respons endpoint auth | `public, max-age=86400` | `no-store` + `Vary: Authorization` |
| User B di jaringan sama tanpa login | Melihat status & kuota user A | Tidak ada data user lain yang disajikan |

---

### TKT-103 — Logout rusak + redirect loop

**Root cause (berlapis)**:
1. Backend `clearAuthCookies` memakai `Path=/api/v1/auth`, padahal cookie asli dibuat dengan `Path=/` → cookie **tidak pernah terhapus**.
2. Guard halaman login mengecek cookie basi, guard home mengecek `/auth/me` → dua sumber kebenaran berbeda → **redirect loop**.

**Perubahan**:
- Backend `handler.go` — clear cookie dengan `Path=/` yang benar + revoke refresh token di Redis (revoke sudah benar, dipertahankan).
- Frontend — logout membersihkan query cache + redirect ke `/login`; guard login memakai `useMe()` (satu sumber kebenaran).

**Proof of completion**:

| Skenario | Sebelum | Sesudah |
|---|---|---|
| Header `Set-Cookie` saat logout | Path salah, cookie tersisa | `Max-Age=0; Path=/` — cookie benar-benar hilang |
| Refresh token lama dipakai ulang | Masih valid | **401 Unauthorized** |
| Alur setelah logout | Loop login ↔ home | Mendarat stabil di `/login`, tanpa loop |

---

### TKT-105 — Checkout ganda

**Root cause (dua sisi)**:
1. Frontend mengirim `Idempotency-Key` **baru di setiap klik** (`queries.ts`) → mekanisme idempotency tidak pernah terpicu.
2. Backend tidak punya constraint yang mencegah 2 payment pending untuk `(user, plan)` yang sama.

**Perubahan**:
- Backend — **unique partial index** `subscriptions(user_id, plan_id) WHERE status='pending'` (migrasi `000006`) + **reuse pending checkout** dengan `SELECT ... FOR UPDATE`.
- Frontend — idempotency key **stabil per plan** + tombol disabled saat pending.

**Proof of completion**:

| Skenario | Sebelum | Sesudah |
|---|---|---|
| 2 checkout paralel dengan key berbeda | 2 payment pending | `paymentId` **identik**; database hanya 1 baris pending |
| Klik berulang saat proses | Duplikat | Tombol disabled — tidak bisa diklik ulang |

---

### TKT-106 — Klik "Bayar" tanpa feedback (silent failure)

**Root cause**: Handler `onPay` punya `catch {}` **kosong** dan tombol tidak disabled — error hilang tanpa jejak, user tidak tahu apa pun terjadi.

**Perubahan**:
- Tombol disabled + label **"Memproses…"** saat pending.
- Error ditampilkan inline via `describeError`; sukses tetap menampilkan "✅".

**Proof of completion**:

| Skenario | Sebelum | Sesudah |
|---|---|---|
| Klik "Bayar Sekarang" | Diam total, 5x klik tetap diam | Loading → **sukses terlihat / gagal dengan pesan jelas** (bisa retry) |

---

### TKT-104 — UI basi setelah pembayaran

**Root cause**: Hook `useSubscriptionStatus` memakai `staleTime: Infinity` → data status tidak pernah dianggap basi; setelah bayar, UI tetap menampilkan data lama sampai hard refresh.

**Perubahan**:
- `staleTime: 0` + invalidasi query dengan `refetchType: 'active'` setelah mutasi pembayaran.

**Proof of completion**:

| Skenario | Sebelum | Sesudah |
|---|---|---|
| Selesai bayar, lihat navbar/status | Masih "belum berlangganan" sampai `Ctrl+Shift+R` | Status langsung **active tanpa refresh** |

---

## Daftar Commit

| Hash | Pesan |
|---|---|
| `aab33d4` | fix(cors): allow Idempotency-Key header in preflight |
| `d58ea0a` | fix(meme): enforce ownership on read and delete (TKT-107) |
| `b3488fa` | fix(meme/storage): validate upload type and size (TKT-108) |
| `4e316d7` | fix(meme): enforce quota atomically to prevent race (TKT-109) |
| `1446af5` | fix(subscription): enforce active period server-side (TKT-101) |
| `9501713` | fix(api): prevent caching of authenticated responses (TKT-102) |
| `27dcc67` | fix(auth): fix logout flow and redirect loop (TKT-103 frontend) |
| `f145f78` | fix(auth): revoke refresh token and clear cookies on logout (TKT-103 backend) |
| `00f01c2` | fix(subscription): stabilize idempotency key and disable double submit (TKT-105 frontend) |
| `ce0c120` | fix(subscription): prevent duplicate pending checkout (TKT-105 backend) |
| `6b45b86` | fix(subscription): refresh status after payment without hard reload (TKT-104) |
| `805224d` | fix(payment): show loading and error feedback on pay (TKT-106) |