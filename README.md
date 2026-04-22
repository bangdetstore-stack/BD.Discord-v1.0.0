# 🤖 Discord Bot Store & Payment Integration

> **Deskripsi Singkat:** Bot Discord All-in-One untuk auto-store (toko otomatis), terintegrasi dengan Payment Gateway (Pakasir), dilengkapi sistem saldo (currency), garansi, renewal langganan, dan Dashboard Web admin. 

> **Developed by: BANGDET.MD** 👨‍💻
> Bot Discord multifungsi yang dirancang khusus untuk manajemen toko otomatis (Auto-Store), memfasilitasi transaksi secara otomatis menggunakan integrasi **Pakasir SDK**, serta dilengkapi dengan dashboard, sistem mata uang (currency), langganan (renewal), dan manajemen garansi (warranty).

---

## ✨ Fitur Utama (Detailed Features)

### 1. 🛍️ Auto-Store & Panel System (Toko Otomatis)
- **Panel Interaktif**: Toko ditampilkan menggunakan Dropdown (Select Menu) dan Button dari Discord UI, sehingga user-friendly.
- **Kategorisasi**: Mendukung banyak sub-toko dan produk dalam satu bot. Setiap toko bisa memiliki custom emoji dan deskripsi.
- **Stok Otomatis (Stock Handler)**: Menggunakan `stock-database.json` untuk manajemen stok. Bot akan mengambil 1 stok teratas (*Shift*) secara otomatis ketika pembayaran berhasil dan mengirimkannya ke DM pembeli.

### 2. 💳 Payment Gateway Integration (Pakasir)
- **QRIS Otomatis**: Generate QR code pembayaran secara real-time via **Pakasir SDK**.
- **Webhook Listener**: Bot ini dilengkapi HTTP Server mandiri untuk menerima notifikasi (*callback/webhook*) dari Pakasir saat pembayaran berhasil (Lunas).
- **Idempotency Guard**: Keamanan ekstra untuk memastikan tidak ada pengiriman barang ganda (*double delivery*) meskipun webhook terpanggil berulang kali.
- **Auto-Expired**: Tagihan yang tidak dibayar dalam 15 menit akan otomatis kedaluwarsa dan membatalkan pesanan.

### 3. 🛡️ Sistem Garansi & Komplain (Warranty & Claim Ticket)
- **Form Garansi Dinamis**: Pembeli diberi batas waktu tertentu (misal: 24 jam) untuk mengisi form garansi via Discord Modal.
- **Verifikasi Screenshot**: Bot dapat meminta user mengunggah bukti screenshot login melalui DM bot untuk memvalidasi garansi.
- **Private Thread Ticket (Komplain)**: Jika garansi aktif, pembeli dapat menggunakan `/komplain` atau tombol **Ajukan Komplain**. Bot akan membuat *Private Thread* khusus antara pembeli dan Role Admin Komplain (sehingga chat aman dan rapi).
- **Kompensasi Waktu**: Jika komplain memakan waktu lebih dari 24 jam, masa garansi user otomatis diperpanjang sesuai durasi penyelesaian komplain.

### 4. 🔄 Sistem Perpanjangan Otomatis (Renewal System)
- **Background Checker**: Bot memiliki *checker* (setiap 30 menit) yang mengecek garansi yang akan habis (H-4).
- **Admin Approval**: Bot mengirim notifikasi ke channel admin untuk menyetujui atau menolak perpanjangan.
- **Durasi Dinamis (30/60/90 Hari)**: Jika admin setuju, bot akan mengirim DM ke user dengan penawaran harga dinamis sesuai durasi yang dipilih. User bisa langsung bayar pakai QRIS!

### 5. 👥 Manajemen Role & Loyalitas Otomatis
- **Role Buyer & Produk**: Otomatis memberikan role "Buyer" dan role khusus produk (Misal: Role Netflix / Role Spotify) saat transaksi berhasil.
- **Role VIP**: Sistem otomatis mendeteksi pengguna setia. Jika user melakukan transaksi melebihi ambang batas (misal: 10x dalam 30 hari), ia otomatis mendapatkan Role VIP.
- **Role Join**: Memberikan role default otomatis saat member baru masuk ke server.

### 6. 👤 Sistem Akun, Inventaris, & Ekonomi (Currencies)
- **Database Profil**: Setiap user memiliki database inventaris produk yang mereka beli dan riwayat transaksi (*Purchase History*).
- **Virtual Currency**: Mendukung pembuatan mata uang virtual untuk transaksi alternatif selain uang asli (Rupiah).

### 7. ⚙️ Dashboard Web & API Server
- Bot berjalan bersamaan dengan mini-server HTTP untuk melayani endpoint API statis dashboard admin.
- Seluruh konfigurasi (seperti ID Channel Log, Role Admin, Bahasa Bot) disimpan secara tersentralisasi pada `settings.json` yang dapat diubah kapan saja.

### 8. 🌐 Multi-Language (i18n) & Sticky Messages
- Mendukung *Localization* (Inggris, Spanyol, Prancis) pada nama dan deskripsi slash command.
- **Sticky Messages**: Pesan lengket otomatis (Terms & Conditions, panduan order) yang terus mengikuti chat paling bawah di channel toko.

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

## 📝 Changelog & Riwayat Versi

Mulai dari versi v4.5.1, seluruh catatan perubahan (*Changelog*), histori fitur, dan *bug fixes* dari versi **v1.0.0 hingga versi terbaru** didokumentasikan secara lengkap dan terpisah.
    
👉 **[Lihat CHANGELOG.md selengkapnya di sini](./docs/CHANGELOG.md)**  

---

## 🤝 Thanks To / Credits

Terima kasih sebesar-besarnya kepada pihak-pihak yang telah berkontribusi dan membuat proyek ini menjadi nyata:
- **[Pakasir](https://pakasir.com)** - Dukungan Payment Gateway API / SDK untuk transaksi otomatis.
- **Discord.js Community** - Untuk library inti yang luar biasa solid.
- **BANGDET.MD** - Lead Developer & Creator.
- Dan tentunya seluruh penguji (beta testers) serta pengguna awal Bangdet Bot. Tanpa kalian bot ini tidak akan se-sempurna sekarang! ❤️
