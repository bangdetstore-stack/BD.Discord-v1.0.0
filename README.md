# 🤖 Discord Bot Store & Payment Integration

> **Deskripsi Singkat:** Bot Discord All-in-One untuk auto-store (toko otomatis), terintegrasi dengan Payment Gateway (Pakasir), dilengkapi sistem saldo (currency), garansi, renewal langganan, dan Dashboard Web admin. 

> **Developed by: BANGDET.MD** 👨‍💻
> Bot Discord multifungsi yang dirancang khusus untuk manajemen toko otomatis (Auto-Store), memfasilitasi transaksi secara otomatis menggunakan integrasi **Pakasir SDK**, serta dilengkapi dengan dashboard, sistem mata uang (currency), langganan (renewal), dan manajemen garansi (warranty).

---

## ✨ Fitur Utama

- 🛒 **Auto-Store (Shops)**: Sistem toko otomatis di dalam Discord yang siap memproses pesanan 24/7.
- 💳 **Integrasi Pembayaran (Payment)**: Terintegrasi dengan **Pakasir** untuk pembuatan tagihan dan konfirmasi otomatis (QRIS, E-Wallet, dll).
- 👤 **Manajemen Akun (Accounts)**: Mengelola data pengguna, inventaris, dan riwayat transaksi.
- 💰 **Sistem Saldo (Currencies)**: Sistem mata uang virtual/saldo internal untuk transaksi tanpa payment gateway.
- 🔄 **Langganan (Renewal)**: Mengelola pembelian produk berlangganan secara berkala.
- 🛡️ **Garansi (Warranty)**: Mengatur klaim garansi untuk produk-produk digital.
- 🎭 **Manajemen Role (Roles)**: Pemberian role otomatis setelah transaksi sukses.
- 📌 **Pesan Lengket (Sticky)**: Pesan otomatis yang akan selalu berada di bagian bawah channel (misalnya untuk informasi toko atau terms).

---

## 🛠️ Prasyarat (Prerequisites)

Sebelum memasang bot ini, pastikan Anda telah menginstal:
- **Node.js** v18.0.0 atau lebih baru.
- **npm** (Node Package Manager).
- Sebuah **Discord Bot Token** dari [Discord Developer Portal](https://discord.com/developers/applications).
- Akun dan kredensial API dari **Pakasir** untuk sistem pembayaran.

---

## 🚀 Tutorial Pemasangan (Instalasi)

Ikuti langkah-langkah di bawah ini untuk mengatur dan menjalankan bot di server (atau lokal) Anda.

### 1. Ekstrak atau Clone Repository
Pastikan semua file proyek berada dalam satu direktori yang rapi.

### 2. Instalasi Dependensi (Dependencies)
Buka terminal / command prompt, arahkan ke direktori root proyek ini, lalu jalankan perintah:

```bash
npm install
```

### 3. Konfigurasi Environment Variables (`.env`)
Buka file `.env` yang berada di direktori root. Masukkan kredensial dari layanan Pakasir dan Discord Bot Anda:

```env
PAKASIR_PROJECT=masukkan_nama_project_pakasir_anda
PAKASIR_API_KEY=masukkan_api_key_pakasir_anda
DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN_HERE
DISCORD_CLIENT_ID=YOUR_DISCORD_BOT_CLIENT_ID_HERE
DISCORD_GUILD_ID=YOUR_DISCORD_SERVER_ID_HERE
```
*Catatan:*
- `DISCORD_TOKEN`: Token rahasia bot Anda. **Jangan pernah membagikan ini ke publik!**
- `DISCORD_CLIENT_ID`: Application ID bot Anda.
- `DISCORD_GUILD_ID`: ID Server Discord tempat bot ini akan melakukan pengujian/deployment command spesifik.

---

## ⚙️ Menjalankan & Mendaftarkan Command

Bot ini menggunakan Slash Commands (/) bawaan Discord. Sebelum bisa digunakan, command harus didaftarkan ke server (deploy).

### 1. Mendaftarkan Slash Commands (Deploy)
Jalankan perintah berikut di terminal:

```bash
npm run deploy
```
*Perintah ini akan membaca folder command yang ada di source code dan mendaftarkannya ke server Discord (berdasarkan `guildId` di config).*

### 2. Menjalankan Bot (Development/Production)
Untuk menjalankan bot secara langsung (menggunakan `tsx` loader untuk TypeScript), jalankan:

```bash
npm run start
```
Bot akan online dan menampilkan log di console. Jika bot mendeteksi mode development, ia akan memunculkan peringatan pada console.

---

## 📦 Build Project (Opsional)

Jika Anda ingin menjalankan bot dengan meng-compile ke JavaScript mentah untuk kebutuhan server production murni:

```bash
npm run build
```
File hasil kompilasi (JavaScript) akan tersimpan di dalam folder `dist/`.

---

## ☁️ Tutorial Hosting di Pterodactyl Panel

Jika kamu ingin menjalankan bot ini 24/7 di VPS/Hosting menggunakan **Pterodactyl Panel** dengan *Node.js Egg* standar, ikuti langkah berikut:

### 1. Persiapan File
Upload file/folder berikut ke File Manager Pterodactyl:
- 📁 `src/` (Wajib, berisi logika bot)
- 📁 `data/` (Wajib, database bot)
- 📄 `package.json` & `package-lock.json`
- 📄 `tsconfig.json`
- 📄 `.env` (Pastikan token Discord & API Pakasir sudah diisi)

*(Folder `node_modules` tidak perlu diupload karena panel biasanya akan menginstalnya otomatis).*

### 2. Pengaturan Startup (Standard Node.js)
Secara bawaan (*default*), panel Pterodactyl Node.js menggunakan **Startup Command:**
```bash
npm start
```
Kamu **tidak perlu merubahnya**. Biarkan saja `npm start`! 
Perintah ini akan menjalankan script `tsx src/index.ts` yang mampu mengeksekusi file TypeScript secara langsung (*on-the-fly*) tanpa perlu proses *build* manual ke `dist/`. Sangat praktis!

### 3. Jalankan Bot
Buka menu **Console**, lalu klik tombol **Start**. Bot akan langsung menyala!

---

## 📂 Struktur Direktori Penting

- `src/features/` - Kumpulan logika dan fitur bot (seperti accounts, currencies, payment, shops, dll).
- `src/app/` - Inti bot, inisialisasi Client, dan pendaftaran perintah (deploy-commands).
- `data/` - Direktori penyimpanan file database JSON persisten.
- `.env` - File penyimpan rahasia / secret keys (Discord Token & Payment Gateway).

---

## 📞 Bantuan & Dukungan

Jika terdapat error seperti *"Unhandled Rejection"* atau *"API Key Not Valid"*, pastikan:
1. Kredensial `.env` dari Pakasir dan Discord sudah benar.
2. Bot memiliki *Privileged Intents* yang diaktifkan (seperti *Message Content Intent*) di Discord Developer Portal jika dibutuhkan.

---

## 📝 Changelog

### v4.5.0 - Arsitektur Database Async & Sentralisasi Config
- **Refactoring:** Migrasi besar-besaran I/O sinkron (`fs.readFileSync`) menjadi asinkron (`fs/promises`) untuk semua modul.
- **Keamanan:** Menerapkan `Mutex` global pada `Database.save()` untuk mencegah *data corruption* akibat tingginya request bersamaan (Race Conditions).
- **Idempotency:** Menambahkan *Idempotency Guard* pada `deliverItem` via `delivered-orders.json` untuk mencegah pengiriman item dobel saat terjadi spam webhook.
- **Sentralisasi Settings:** Memindahkan semua hardcoded Role ID (Role Join, Role VIP, Role Shop seperti Netflix/Spotify) ke dalam `settings.json` sehingga dapat dikonfigurasi via perintah `/settings` di Discord.
- **Perbaikan Bug:** 
  - *Ticket Counter* komplain otomatis bertambah (Auto-increment) dan disimpan ke `data/ticket-counter.json`.
  - Timer *Pending Screenshots* garansi tidak lagi hilang saat bot direstart karena disimpan ke database.
  - Fix loop infinite pada *Sticky Message* jika isi pesan bot sama dengan teks sticky.
- **Clean-up:** Konsolidasi seluruh rahasia API dan token Discord dari `config.json` menjadi satu pintu di `.env`. Penghapusan fungsi *legacy* panel setup.

---

## 🤝 Thanks To / Credits

Terima kasih sebesar-besarnya kepada pihak-pihak yang telah berkontribusi dan membuat proyek ini menjadi nyata:
- **[Pakasir](https://pakasir.com)** - Dukungan Payment Gateway API / SDK untuk transaksi otomatis.
- **Discord.js Community** - Untuk library inti yang luar biasa solid.
- **BANGDET.MD** - Lead Developer & Creator.
- Dan tentunya seluruh penguji (beta testers) serta pengguna awal Bangdet Bot. Tanpa kalian bot ini tidak akan se-sempurna sekarang! ❤️
