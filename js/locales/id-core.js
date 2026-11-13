/* Indonesian copy for the app shell, shared components, login and router. */

export default {
  /* Language picker */
  Language: "Bahasa",
  Indonesian: "Indonesia",
  English: "Inggris",

  /* Navigation and chrome */
  Home: "Beranda",
  Library: "Pustaka",
  Scores: "Skor",
  Me: "Saya",
  Account: "Akun",
  Admin: "Admin",
  Platform: "Platform",
  "Signup QR": "QR Pendaftaran",
  Main: "Utama",
  Bottom: "Bawah",
  "Search the library": "Cari di pustaka",
  "Account for {name}": "Akun {name}",
  "Switch to dark mode": "Ganti ke mode gelap",
  "Switch to light mode": "Ganti ke mode terang",
  "Offline · cached shell only. Reconnect to load your library.":
    "Offline · hanya tampilan tersimpan. Sambungkan internet untuk memuat pustaka.",

  /* Boot + login */
  "Connecting to your library…": "Menghubungkan ke pustaka…",
  "Checking your session…": "Memeriksa sesi…",
  "The RomM server didn't answer. Try signing in again.":
    "Server RomM tidak merespons. Coba masuk lagi.",
  "Couldn't refresh the session. Cached data may be stale.":
    "Gagal memperbarui sesi. Data tersimpan mungkin sudah lama.",
  "Your session expired. Sign in again.": "Sesi kamu berakhir. Silakan masuk lagi.",
  "Signed out.": "Kamu sudah keluar.",
  "Self-hosted game library": "Pustaka gim pribadi",
  "Your RomM library, tuned for a phone. Stats, shelves, and saves — no clutter.":
    "Pustaka RomM kamu, dirapikan untuk layar ponsel. Statistik, rak gim, dan simpanan.",
  "RomM account": "Akun RomM",
  "Sign in": "Masuk",
  "Sign in with your RomM account. Your password never touches storage.":
    "Masuk dengan akun RomM kamu. Kata sandi tidak pernah disimpan.",
  "RomM username": "Nama pengguna RomM",
  Password: "Kata sandi",
  "Stay signed in on this device": "Tetap masuk di perangkat ini",
  "Best on your own phone or laptop.": "Cocok untuk ponsel atau laptop pribadi.",
  "Fill in both fields.": "Isi kedua kolom.",
  "Signing in…": "Sedang masuk…",
  "Can't reach the RomM server. Ask the server owner to allow this origin in ROMM_CORS_ALLOWED_ORIGINS, then try again.":
    "Tidak bisa menghubungi server RomM. Minta pemilik server mengizinkan origin ini di ROMM_CORS_ALLOWED_ORIGINS, lalu coba lagi.",
  "That username and password didn't match.": "Nama pengguna dan kata sandi tidak cocok.",
  "Couldn't sign in. Try again.": "Gagal masuk. Coba lagi.",
  "Have an invite? ": "Punya kode undangan? ",
  "Create account": "Buat akun",
  "Trouble signing in?": "Sulit masuk?",
  "This site has to be allowed on your RomM server. If signing in fails, ask the server admin to add it to ":
    "Situs ini harus diizinkan di server RomM kamu. Kalau gagal masuk, minta admin server menambahkannya ke ",
  "Open stock RomM": "Buka RomM asli",

  /* Router fallbacks */
  "Page not found": "Halaman tidak ditemukan",
  "Couldn't load page": "Gagal memuat halaman",
  "That page didn't load. Head back to Home and try again.":
    "Halaman itu gagal dimuat. Kembali ke Beranda lalu coba lagi.",
  "That page doesn't exist.": "Halaman itu tidak ada.",
  "Back to Home": "Kembali ke Beranda",

  /* Shared components */
  "Something went sideways.": "Ada yang tidak beres.",
  "Can't reach the RomM server. Check your connection and the CORS setting.":
    "Tidak bisa menghubungi server RomM. Periksa koneksi dan pengaturan CORS.",
  "Untitled cartridge": "Kartrid tanpa judul",
  "No cover for {name}": "Belum ada sampul untuk {name}",
  "this game": "gim ini",
  "Cover art for {name}": "Sampul {name}",
  game: "gim",
  Game: "Gim",
  Dialog: "Dialog",
  Close: "Tutup",
  Screenshot: "Tangkapan layar",
  "Something went wrong": "Terjadi kesalahan",
  Retry: "Coba lagi",
  "Loading…": "Memuat…",

  /* Relative time + sizes */
  never: "belum pernah",
  "just now": "baru saja",
  "{n} min ago": "{n} menit lalu",
  "{n}h ago": "{n} jam lalu",
  "{n}d ago": "{n} hari lalu",
  "0 min": "0 mnt",
  "< 1 min": "< 1 mnt",
  "{n} min": "{n} mnt",
  "{n}h": "{n} jam",
  "{n}h {m}m": "{n} jam {m} mnt",

  /* Footer */
  "Self-hosted RomM underneath. Binus Arcade on top.":
    "RomM pribadi di baliknya, Binus Arcade di depannya.",

  /* Cards, lists, states */
  Open: "Buka",
  games: "gim",
  "See all": "Lihat semua",
  "Nothing here yet": "Belum ada apa-apa di sini",
  "No matching items were found.": "Tidak ada yang cocok.",
  "That request was cancelled.": "Permintaan itu dibatalkan.",
  "Try again": "Coba lagi",
  "Couldn't load this section": "Bagian ini gagal dimuat",
  "Close dialog": "Tutup dialog",
  "Game screenshot": "Tangkapan layar gim",

  /* API + network errors */
  "Not signed in or token expired.": "Belum masuk atau sesi sudah berakhir.",
  "You don't have permission for that.": "Kamu tidak punya izin untuk itu.",
  "Not found on the RomM server.": "Tidak ditemukan di server RomM.",
  "RomM rejected the request.": "RomM menolak permintaan itu.",
  "The RomM server hit a snag. Try again in a moment.":
    "Server RomM bermasalah. Coba lagi sebentar lagi.",
  "Request failed ({status}).": "Permintaan gagal ({status}).",
  "Can't reach the arcade server. Check the RomM CORS setting and your connection.":
    "Tidak bisa menghubungi server arkade. Periksa pengaturan CORS RomM dan koneksimu.",
  "The arcade server took too long to answer.": "Server arkade terlalu lama menjawab.",
  "Session expired.": "Sesi berakhir.",
  "Sign in to open the arcade.": "Masuk untuk membuka arkade.",
  "Signup relay is not configured.": "Relay pendaftaran belum diatur.",
  "Signup relay timed out.": "Relay pendaftaran kehabisan waktu.",
  "Couldn't reach the signup relay.": "Tidak bisa menghubungi relay pendaftaran.",
  "Couldn't start the game download from {host}. The browser blocked the file request (CORS) or the connection dropped.":
    "Gagal memulai unduhan gim dari {host}. Peramban memblokir permintaan berkas (CORS) atau koneksi terputus.",
  Player: "Pemain",
};
