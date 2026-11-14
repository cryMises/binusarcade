/* Indonesian copy for the app shell, shared components, login and router. */

export default {
  /* Language picker */
  Language: "Bahasa",
  Indonesian: "Indonesia",
  English: "Inggris",

  /* Navigation and chrome */
  Home: "Beranda",
  Library: "Library",
  Shelf: "Rak",
  Scores: "Skor",
  Me: "Saya",
  Account: "Akun",
  Admin: "Admin",
  Platform: "Platform",
  "Signup QR": "QR Pendaftaran",
  Main: "Utama",
  Bottom: "Bawah",
  "Search the library": "Cari di library",
  "Account for {name}": "Akun {name}",
  "Switch to dark mode": "Ganti ke mode gelap",
  "Switch to light mode": "Ganti ke mode terang",
  "Offline · cached shell only. Reconnect to load your library.":
    "Offline · cuma tampilan tersimpan. Sambungkan internet buat muat library.",

  /* Boot + login */
  "Connecting to your library…": "Menghubungkan ke library…",
  "Checking your session…": "Memeriksa sesi…",
  "The RomM server didn't answer. Try signing in again.":
    "Server RomM tidak merespons. Coba masuk lagi.",
  "Couldn't refresh the session. Cached data may be stale.":
    "Gagal memperbarui sesi. Data tersimpan mungkin sudah lama.",
  "Your session expired. Sign in again.": "Sesi kamu berakhir. Silakan masuk lagi.",
  "Signed out.": "Kamu sudah keluar.",
  "Self-hosted game library": "Library game pribadi",
  "Your RomM library, tuned for a phone. Stats, shelves, and saves — no clutter.":
    "Library RomM kamu, dirapikan buat layar ponsel. Statistik, rak game, dan save.",
  "RomM account": "Akun RomM",
  "Sign in": "Masuk",
  "Sign in with your RomM account. Your password never touches storage.":
    "Masuk dengan akun RomM kamu. Password tidak pernah disimpan.",
  "RomM username": "Nama pengguna RomM",
  Password: "Password",
  "Stay signed in on this device": "Tetap masuk di perangkat ini",
  "Best on your own phone or laptop.": "Cocok buat ponsel atau laptop pribadi.",
  "Fill in both fields.": "Isi kedua kolom.",
  "Signing in…": "Sedang masuk…",
  "Can't reach the RomM server. Ask the server owner to allow this origin in ROMM_CORS_ALLOWED_ORIGINS, then try again.":
    "Tidak bisa menghubungi server RomM. Minta admin server mengizinkan origin ini di ROMM_CORS_ALLOWED_ORIGINS, lalu coba lagi.",
  "That username and password didn't match.": "Nama pengguna dan password tidak cocok.",
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
  "No cover for {name}": "Belum ada cover untuk {name}",
  "this game": "game ini",
  "Cover art for {name}": "Cover {name}",
  game: "game",
  Game: "Game",
  Dialog: "Dialog",
  Close: "Tutup",
  Screenshot: "Screenshot",
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
  games: "game",
  "See all": "Lihat semua",
  "Nothing here yet": "Belum ada apa-apa di sini",
  "No matching items were found.": "Tidak ada yang cocok.",
  "That request was cancelled.": "Permintaan itu dibatalkan.",
  "Try again": "Coba lagi",
  "Couldn't load this section": "Bagian ini gagal dimuat",
  "Close dialog": "Tutup dialog",
  "Game screenshot": "Screenshot game",

  /* API + network errors */
  "Not signed in or token expired.": "Belum masuk atau sesi sudah berakhir.",
  "You don't have permission for that.": "Kamu tidak punya izin untuk itu.",
  "Not found on the RomM server.": "Tidak ditemukan di server RomM.",
  "RomM rejected the request.": "RomM menolak permintaan itu.",
  "The RomM server hit a snag. Try again in a moment.":
    "Server RomM bermasalah. Coba lagi sebentar lagi.",
  "Request failed ({status}).": "Permintaan gagal ({status}).",
  "Can't reach the arcade server. Check the RomM CORS setting and your connection.":
    "Tidak bisa menghubungi server arcade. Periksa pengaturan CORS RomM dan koneksimu.",
  "The arcade server took too long to answer.": "Server arcade terlalu lama menjawab.",
  "Session expired.": "Sesi berakhir.",
  "Sign in to open the arcade.": "Masuk untuk membuka arcade.",
  "Signup relay is not configured.": "Relay pendaftaran belum diatur.",
  "Signup relay timed out.": "Relay pendaftaran kehabisan waktu.",
  "Couldn't reach the signup relay.": "Tidak bisa menghubungi relay pendaftaran.",
  "Couldn't start the game download from {host}. The browser blocked the file request (CORS) or the connection dropped.":
    "Gagal memulai unduhan game dari {host}. Browser memblokir permintaan file (CORS) atau koneksi terputus.",
  Player: "Pemain",

  /* Trial / guest play */
  "Try one game": "Coba satu game",
  "No login needed": "Tanpa perlu masuk",
  "No login needed. Progress won't be saved.": "Tanpa perlu masuk. Progres tidak akan disimpan.",
  "Sign in for the full library": "Masuk untuk library lengkap",
  "Loading the trial game…": "Memuat game percobaan…",
  "Registration is currently closed. Ask the admin for access.":
    "Pendaftaran sedang ditutup. Minta akses ke admin.",
  "Press START to load the trial game in your browser.":
    "Tekan START untuk memuat game percobaan di browser kamu.",
  "Runs in your browser. Nothing is installed on your phone.":
    "Berjalan di browser kamu. Tidak ada yang dipasang di ponselmu.",
  "START GAME": "MULAI MAIN",
  "Preparing the emulator…": "Menyiapkan emulator…",
  "Fetching the game…": "Mengambil game…",
  "Fetching…": "Mengambil…",
  "Downloaded. Tap start inside the player if it asks.":
    "Terunduh. Ketuk mulai di dalam pemutar jika diminta.",
  "Engine ready. Start the game.": "Mesin siap. Mulai game-nya.",
  "Playing. Trial mode — progress won't be saved.":
    "Sedang main. Mode percobaan — progres tidak akan disimpan.",
  "Trial mode — progress won't be saved.": "Mode percobaan — progres tidak akan disimpan.",
  "Download cancelled.": "Unduhan dibatalkan.",
  "Couldn't download that game.": "Gagal mengunduh game itu.",
  "BIOS wasn't available. Some games may not boot without one.":
    "BIOS tidak tersedia. Beberapa game mungkin tidak bisa jalan tanpanya.",
  "The emulator hit a snag.": "Emulator mengalami masalah.",
  "Emulator update.": "Pembaruan emulator.",
  "Waiting to start…": "Menunggu untuk mulai…",
  "Nintendo DS touch screen works best with a mouse or stylus.":
    "Layar sentuh Nintendo DS paling nyaman dengan mouse atau stylus.",
  "Game download": "Unduhan game",
  "{received} downloaded": "{received} terunduh",
  "{received} of {total} ({pct}%)": "{received} dari {total} ({pct}%)",
  "{name} emulator": "Emulator {name}",
  "/platforms": "/platforms",
};
