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
    "Server RomM tidak merespons. Coba login lagi.",
  "Couldn't refresh the session. Cached data may be stale.":
    "Gagal memperbarui sesi. Data tersimpan mungkin sudah lama.",
  "Your session expired. Sign in again.": "Sesi kamu berakhir. Login lagi.",
  "Signed out.": "Kamu sudah logout.",
  "Self-hosted game library": "Library game pribadi",
  "Your RomM library, tuned for a phone. Stats, shelves, and saves without the clutter.":
    "Library RomM kamu, dirapikan buat layar ponsel. Statistik, rak game, dan save game.",
  "RomM account": "Akun RomM",
  "Sign in": "Login",
  "Sign in with your RomM account. Your password never touches storage.":
    "Login dengan akun RomM kamu. Password tidak pernah disimpan.",
  "RomM username": "Username RomM",
  Password: "Password",
  "Show password": "Tampilkan password",
  "Hide password": "Sembunyikan password",
  "Stay signed in on this device": "Tetap login di perangkat ini",
  "Best on your own phone or laptop.": "Cocok buat ponsel atau laptop pribadi.",
  "Fill in both fields.": "Isi kedua kolom.",
  "Signing in…": "Sedang login…",
  "Can't reach the RomM server. Ask the server owner to allow this origin in ROMM_CORS_ALLOWED_ORIGINS, then try again.":
    "Tidak bisa menghubungi server RomM. Minta admin server mengizinkan origin ini di ROMM_CORS_ALLOWED_ORIGINS, lalu coba lagi.",
  "That username and password didn't match.": "Username dan password tidak cocok.",
  "Couldn't sign in. Try again.": "Gagal login. Coba lagi.",
  "Have an invite? ": "Punya kode undangan? ",
  "Create account": "Buat akun",
  "Trouble signing in?": "Sulit login?",
  "This site has to be allowed on your RomM server. If signing in fails, ask the server admin to add it to ":
    "Situs ini harus diizinkan di server RomM kamu. Kalau gagal login, minta admin server menambahkannya ke ",
  "Open stock RomM": "Buka RomM asli",

  /* Router fallbacks */
  "Page not found": "Halaman tidak ditemukan",
  "Couldn't load page": "Gagal memuat halaman",
  "Not on this shelf": "Tidak ada di rak ini",
  "Something broke": "Ada yang rusak",
  "That page didn't load. Head back to Home and try again.":
    "Halaman itu gagal dimuat. Kembali ke Beranda lalu coba lagi.",
  "That page doesn't exist. The link may be old, or the game may have left the library.":
    "Halaman itu tidak ada. Linknya mungkin sudah lama, atau game-nya sudah keluar dari library.",
  "That page doesn't exist.": "Halaman itu tidak ada.",
  "Back to Home": "Kembali ke Beranda",
  "Open the library": "Buka pustaka",

  /* Privacy page */
  "About this site": "Tentang situs ini",
  "Privacy and data": "Privasi dan data",
  "What this site keeps, where it goes, and how to remove it.":
    "Apa yang disimpan situs ini, ke mana datanya pergi, dan cara menghapusnya.",
  "Saved in this browser": "Disimpan di browser ini",
  "These keys sit in localStorage or sessionStorage on your device. None of them are cookies.":
    "Key ini tersimpan di localStorage atau sessionStorage perangkatmu. Tidak ada yang berupa cookie.",
  "Your RomM access token. localStorage when stay signed in is on, sessionStorage otherwise.":
    "Token akses RomM kamu. Masuk ke localStorage kalau tetap login aktif, kalau tidak ke sessionStorage.",
  "Whether stay signed in is on.": "Penanda apakah tetap login aktif.",
  "Light or dark mode.": "Mode terang atau gelap.",
  "The language you picked.": "Bahasa yang kamu pilih.",
  "A device label used when listing your saves.":
    "Label perangkat yang dipakai saat menampilkan save kamu.",
  "Ticket ids you already opened, so the reply badge clears.":
    "ID tiket yang sudah kamu buka, supaya badge balasan hilang.",
  "Your RomM password is never stored. Signing out deletes the token.":
    "Password RomM kamu tidak pernah disimpan. Logout menghapus tokennya.",
  "Sent to your RomM server": "Dikirim ke server RomM kamu",
  "Signing in, browsing, and reading saves talk to the RomM server that hosts this library. Your player name and your saves stay on that server.":
    "Login, menjelajah, dan membaca save berkomunikasi dengan server RomM yang menyimpan library ini. Nama pemain dan save kamu tetap di server itu.",
  "Sent to the relay": "Dikirim ke relay",
  "Broken-game reports, game requests, votes, and admin notes are stored on the self-hosted relay Worker so the admin can read them. Your RomM player name is attached so the admin can follow up.":
    "Laporan game rusak, permintaan game, vote, dan catatan admin disimpan di relay Worker milik sendiri supaya admin bisa membacanya. Nama pemain RomM kamu ikut terlampir agar admin bisa menindaklanjuti.",
  "Tickets and requests are plain database rows with no retention timer. Ask the admin to delete anything you want gone.":
    "Tiket dan permintaan hanyalah baris database tanpa batas waktu simpan. Minta admin menghapus apa pun yang ingin kamu hilangkan.",
  "Not collected": "Tidak dikumpulkan",
  "No analytics, ads, or third-party trackers.":
    "Tanpa analytics, iklan, atau pelacak pihak ketiga.",
  "No tracking cookies. The site sets no cookies at all.":
    "Tanpa cookie pelacak. Situs ini sama sekali tidak memasang cookie.",
  "Game files never pass through this site. The player fetches them from your RomM server.":
    "File game tidak pernah lewat situs ini. Player mengambilnya langsung dari server RomM kamu.",
  "Removing your data": "Menghapus data kamu",
  "Sign out from your account page to delete the stored token.":
    "Logout dari halaman akun untuk menghapus token yang tersimpan.",
  "Delete your own tickets from your account page, one at a time.":
    "Hapus tiket milikmu dari halaman akun, satu per satu.",
  "Clear site data in your browser settings to drop the theme, language, and device keys.":
    "Hapus data situs di pengaturan browser untuk membuang key tema, bahasa, dan perangkat.",
  "Ask the RomM admin to remove reports, requests, or notes from the relay.":
    "Minta admin RomM menghapus laporan, permintaan, atau catatan dari relay.",

  /* Home extras and nav badges */
  "Pick a random game": "Pilih game acak",
  "No games in the library yet.": "Belum ada game di library.",
  "Couldn't pick a game. Try again.": "Gagal memilih game. Coba lagi.",
  "{n} open reports": "{n} laporan terbuka",
  "{n} replies on your reports": "{n} balasan di laporanmu",

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
  "Not signed in or token expired.": "Belum login atau sesi sudah berakhir.",
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
  "Sign in to open the arcade.": "Login untuk membuka arcade.",
  "Signup relay is not configured.": "Relay pendaftaran belum diatur.",
  "Signup relay timed out.": "Relay pendaftaran timeout.",
  "Couldn't reach the signup relay.": "Tidak bisa menghubungi relay pendaftaran.",
  "Couldn't start the game download from {host}. The browser blocked the file request (CORS) or the connection dropped.":
    "Gagal memulai download game dari {host}. Browser memblokir permintaan file (CORS) atau koneksi terputus.",
  Player: "Pemain",

  /* Trial / guest play */
  "Try one game": "Coba satu game",
  "No login needed": "Tanpa perlu login",
  "No login needed. Progress won't be saved.": "Tanpa perlu login. Progres tidak akan disimpan.",
  "Sign in for the full library": "Login untuk library lengkap",
  "Loading the trial game…": "Memuat game trial…",
  "The trial game isn't available right now. Sign in for the full library.":
    "Game trial sedang tidak tersedia. Login untuk library lengkap.",
  "No emulator core is mapped for this system.":
    "Belum ada core emulator untuk sistem ini.",
  "Registration is currently closed. Ask the admin for access.":
    "Pendaftaran sedang ditutup. Minta akses ke admin.",
  "Press START to load the trial game in your browser.":
    "Tekan START untuk memuat game trial di browser kamu.",
  "Runs in your browser. Nothing is installed on your phone.":
    "Berjalan di browser kamu. Tidak ada yang dipasang di ponselmu.",
  "START GAME": "START GAME",
  "Preparing the emulator…": "Menyiapkan emulator…",
  "Fetching the game…": "Mengambil game…",
  "Fetching…": "Mengambil…",
  "Downloaded. Tap start inside the player if it asks.":
    "Sudah download. Ketuk start di dalam player kalau diminta.",
  "Engine ready. Start the game.": "Engine siap. Mulai game-nya.",
  "Playing. Trial mode: progress won't be saved.":
    "Sedang main. Mode trial: progres tidak akan disimpan.",
  "Trial mode: progress won't be saved.": "Mode trial, progres tidak akan disimpan.",
  "Download cancelled.": "Download dibatalkan.",
  "Couldn't download that game.": "Gagal download game itu.",
  "Couldn't send the request.": "Gagal mengirim permintaan.",
  "Trial game file is unavailable.": "File game trial tidak tersedia.",
  "BIOS wasn't available. Some games may not boot without one.":
    "BIOS tidak tersedia. Beberapa game mungkin tidak bisa jalan tanpanya.",
  "The emulator hit a snag.": "Emulator mengalami masalah.",
  "Emulator update.": "Update emulator.",
  "Waiting to start…": "Menunggu start…",
  "Nintendo DS touch screen works best with a mouse or stylus.":
    "Layar sentuh Nintendo DS paling nyaman dengan mouse atau stylus.",
  "Game download": "Download game",
  "{received} downloaded": "Sudah download {received}",
  "{received} of {total} ({pct}%)": "{received} dari {total} ({pct}%)",
  "{name} emulator": "Emulator {name}",
  "Full screen": "Fullscreen",
  "Exit full screen": "Exit fullscreen",
  "/platforms": "/platforms",
};
