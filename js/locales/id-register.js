/* Indonesian copy for Create account and the Signup QR panel
 * (js/views/register.js + js/views/signup.js). */

export default {
  /* Create account — form */
  "Back to sign in": "Kembali ke halaman login",
  "Paste your invite token": "Tempel token undanganmu",
  Username: "Username",
  Email: "Email",
  "Confirm password": "Konfirmasi password",
  "Invite token": "Token undangan",
  "Single-use invite claimed from QR. Complete your account details below.":
    "Undangan sekali pakai sudah diambil dari QR. Lengkapi detail akunmu di bawah.",
  "Filled from your invite link. Edit it if you paste a different token.":
    "Terisi dari link undanganmu. Ubah kalau kamu menempel token lain.",
  "Registration is invite-only. Ask the RomM admin for an invite code or enable the signup QR.":
    "Pendaftaran cuma lewat undangan. Minta kode undangan dari admin RomM atau aktifkan QR pendaftaran.",
  "Fill in every field, including the invite token.":
    "Isi semua kolom, termasuk token undangan.",
  "Enter a valid email address.": "Masukkan alamat email yang valid.",
  "Passwords don't match.": "Password tidak cocok.",
  "Creating account…": "Membuat akun…",
  "RomM rejected those details. Check every field and try again.":
    "RomM menolak data itu. Periksa semua kolom lalu coba lagi.",
  "Can't reach the RomM server. Check your connection and try again.":
    "Tidak bisa menghubungi server RomM. Periksa koneksimu lalu coba lagi.",
  "Couldn't create the account. Try again.": "Gagal membuat akun. Coba lagi.",
  "Account created, but the server couldn't be reached to sign in. Try signing in from the login screen.":
    "Akun dibuat, tapi server tidak bisa dihubungi untuk login. Coba login dari halaman login.",
  "Account created, but sign-in failed.": "Akun dibuat, tapi gagal login.",

  /* Create account — waiting for activation */
  "Account created · Binus Arcade": "Akun dibuat · Binus Arcade",
  "Account created": "Akun dibuat",
  "Waiting for activation": "Menunggu aktivasi",
  "Your RomM account exists, but it doesn't have access yet. Ask the RomM admin to grant it in the server's user settings, then sign in.":
    "Akun RomM kamu sudah ada, tapi belum punya akses. Minta admin RomM memberi akses di pengaturan pengguna server, lalu login.",
  "New accounts start with no permissions until the admin promotes them.":
    "Akun baru belum punya izin sampai admin memberinya.",

  /* Create account — poster and card */
  "Join the arcade": "Gabung ke arcade",
  "Registration is invite-only. Open the invite link from the RomM admin to fill in your token automatically, or paste a token here.":
    "Pendaftaran cuma lewat undangan. Buka link undangan dari admin RomM agar tokenmu terisi otomatis, atau tempel token di sini.",
  "New player": "Pemain baru",
  "Create your account": "Buat akunmu",
  "Account details": "Detail akun",
  "Uses the same RomM account you'll sign in with. The password never touches storage.":
    "Memakai akun RomM yang sama untuk login. Password tidak pernah disimpan.",

  /* Create account — disabled and claim states */
  "Invite required": "Butuh undangan",
  "Ask the admin for a signup code": "Minta kode pendaftaran ke admin",
  "The signup QR panel is currently turned off. Ask the RomM admin to enable it or send you an invite code.":
    "Panel QR pendaftaran sedang dimatikan. Minta admin RomM mengaktifkannya atau mengirim kode undangan.",
  "Check again": "Cek lagi",
  "I have a signup code": "Saya punya kode pendaftaran",
  "Invite QR": "QR undangan",
  "Checking invite QR…": "Memeriksa QR undangan…",
  "Claiming your single-use invite token.": "Mengambil token undangan sekali pakai.",
  "No invite token was returned. Ask the admin for a signup code.":
    "Tidak ada token undangan yang dikembalikan. Minta kode pendaftaran ke admin.",
  "The signup QR panel is turned off. Ask the admin for a signup code.":
    "Panel QR pendaftaran dimatikan. Minta kode pendaftaran ke admin.",
  "This invite QR was already used or expired.":
    "QR undangan ini sudah dipakai atau kedaluwarsa.",
  "Invite unavailable": "Undangan tidak tersedia",
  "QR code already used": "Kode QR sudah dipakai",
  "Get fresh QR": "Minta QR baru",
  "Couldn't reach the signup relay. Ask the admin for a signup code or try again.":
    "Tidak bisa menghubungi relay pendaftaran. Minta kode pendaftaran ke admin atau coba lagi.",
  "Signup relay is not configured on this build. Ask the admin for a direct invite link.":
    "Relay pendaftaran belum dikonfigurasi di build ini. Minta link undangan langsung ke admin.",

  /* Create account — public QR */
  "Scan with another phone's camera or tap Use this invite. Updates automatically after each scan.":
    "Scan pakai kamera ponsel lain atau ketuk Pakai undangan ini. Update otomatis setelah tiap scan.",
  "Use this invite": "Pakai undangan ini",
  "Previous QR was scanned — updated to a fresh QR.":
    "QR sebelumnya sudah di-scan — diganti ke QR baru.",
  "Scan invite QR": "Scan QR undangan",
  "Expires in": "Kedaluwarsa dalam",
  "Checking signup QR…": "Memeriksa QR pendaftaran…",
  "Asking the server if self-serve signup is open.":
    "Mengecek ke server apakah pendaftaran mandiri dibuka.",

  /* Signup QR panel */
  "Single-use player invite QR code": "Kode QR undangan pemain sekali pakai",
  "Invite signup QR panel": "Panel QR pendaftaran undangan",
  "Enabling shared signup QR…": "Mengaktifkan QR pendaftaran bersama…",
  "Minting a single-use player invite…": "Membuat undangan pemain sekali pakai…",
  "Single-use invite link": "Link undangan sekali pakai",
  "Invite link copied.": "Link undangan disalin.",
  "Select and copy the invite link above.": "Pilih lalu salin link undangan di atas.",
  "Copy link": "Salin link",
  "Fresh single-use invite ready.": "Undangan sekali pakai baru siap.",
  "New invite": "Undangan baru",
  "Full screen": "Fullscreen",
  "Single-use player invite (role: user). While enabled, anyone who taps Create account sees this QR. Every scan or claim rotates immediately to a new unused QR.":
    "Undangan pemain sekali pakai (role: user). Selama aktif, siapa pun yang ketuk Buat akun melihat QR ini. Setiap scan atau klaim langsung berganti ke QR baru yang belum dipakai.",
  "Single-use player invite (role: user). Anyone who scans this QR or opens the link can create a player account. Refreshes automatically when a new user registers or when the 60:00 timer runs out.":
    "Undangan pemain sekali pakai (role: user). Siapa pun yang scan QR ini atau membuka link-nya bisa membuat akun pemain. Refresh otomatis saat pengguna baru mendaftar atau saat timer 60:00 habis.",
  "Admin invite": "Undangan admin",
  "Friend signup QR": "QR pendaftaran teman",
  "Invite expired — minted a fresh invite.":
    "Undangan kedaluwarsa — undangan baru sudah dibuat.",
  "Shared on Create account. Rotates automatically after every scan.":
    "Dibagikan di Buat akun. Berganti otomatis setelah setiap scan.",
  "Invite scanned — updated QR.": "Undangan di-scan — QR diperbarui.",
  "Invite scanned — updated to a fresh QR.":
    "Undangan di-scan — diganti ke QR baru.",
  "Couldn't check relay status — keeping current QR and retrying soon.":
    "Gagal memeriksa status relay — QR saat ini tetap dipakai dan dicoba lagi nanti.",
  "Invite ready, but this session lacks users.read scope for automatic refresh. Use New invite manually.":
    "Undangan siap, tapi sesi ini tidak punya scope users.read untuk refresh otomatis. Pakai tombol Undangan baru secara manual.",
  "New account registered — refreshed invite QR.":
    "Akun baru terdaftar — QR undangan diperbarui.",
  "Auto-refresh paused because users.read scope is missing. Current QR still works.":
    "Refresh otomatis di-pause karena scope users.read tidak ada. QR saat ini masih berfungsi.",
  "Couldn't check for new signups — keeping the current QR and retrying soon.":
    "Gagal memeriksa pendaftar baru — QR saat ini tetap dipakai dan dicoba lagi nanti.",
  "Minting…": "Membuat undangan…",
  "Signup relay returned no active invite.":
    "Relay pendaftaran tidak mengembalikan undangan aktif.",
  "RomM returned an empty invite token.": "RomM mengembalikan token undangan kosong.",
  "Ready to scan. Listening for new signups every 10s.":
    "Siap di-scan. Memantau pendaftar baru setiap 10 detik.",
  "Invite creation blocked.": "Pembuatan undangan diblokir.",
  "Your session is missing the users.write scope required to mint invite links. Sign out and sign back in as an admin, or check your RomM role.":
    "Sesimu tidak punya scope users.write yang dibutuhkan untuk membuat link undangan. Logout lalu login lagi sebagai admin, atau periksa peran RomM-mu.",
  "Couldn't mint a new invite.": "Gagal membuat undangan baru.",
  "Couldn't reach RomM to create an invite link.":
    "Tidak bisa menghubungi RomM untuk membuat link undangan.",
  "Invite expired while away — minted a fresh invite.":
    "Undangan kedaluwarsa saat kamu pergi — undangan baru sudah dibuat.",

  /* Signup view */
  "Admin access required": "Butuh akses admin",
  "Only RomM admins can open the signup QR panel.":
    "Hanya admin RomM yang bisa membuka panel QR pendaftaran.",
};
