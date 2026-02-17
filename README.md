# VidSpliter

Aplikasi desktop sederhana untuk memotong video `.mp4`/`.mkv` menjadi beberapa bagian berdurasi tetap menggunakan FFmpeg (mode copy, tanpa re-encode).

## Fitur
- Pilih banyak file video sekaligus.
- Drag & drop file video ke area input.
- Atur durasi potongan per bagian (default 5 menit).
- Pilih folder output.
- Opsi simpan per-file dalam subfolder atau langsung ke satu folder.
- Cek ketersediaan FFmpeg/FFprobe dari binary bawaan aplikasi.
- Progress bar dan log proses real-time.

## Platform
- Windows

## Tech Stack
- Electron
- FFmpeg / FFprobe (bundled di folder `binaries/`) | (download) https://www.gyan.dev/ffmpeg/builds/

## Prasyarat
- Node.js 20+ (disarankan LTS)
- npm

## Menjalankan Project (Development)
1. Install dependency:

```bash
npm install
```

2. Jalankan aplikasi:

```bash
npm run dev
```

## Build Installer Windows
Jalankan:

```bash
npm run dist
```

Hasil build akan tersedia di folder `dist/` (NSIS installer dan folder `win-unpacked`).

## Struktur Penting
- `index.js`: proses utama Electron + logic split video via FFmpeg.
- `preload.js`: bridge API aman dari renderer ke main process.
- `renderer.js`: interaksi UI (input file, drag-drop, progress, log).
- `index.html`: tampilan aplikasi.
- `styles.css`: styling UI.
- `binaries/`: `ffmpeg.exe`, `ffprobe.exe`, `ffplay.exe`.

## Cara Pakai Singkat
1. Klik **Pilih Video...** atau drag-drop file `.mp4`/`.mkv`.
2. Pilih **Output folder**.
3. Atur **Durasi per part** (menit).
4. (Opsional) Aktifkan mode simpan tanpa subfolder.
5. Klik **Cek FFmpeg Bundled**.
6. Klik **Proses Split Video**.

## Catatan
- Proses menggunakan `-c copy` sehingga lebih cepat karena tidak re-encode.
- Karena mode copy, batas durasi part bisa bergeser sedikit mengikuti keyframe.
- Nama output mengikuti pola:
  - `<nama_video>_part_001.ext`
  - `<nama_video>_part_002.ext`
  - dst.

## Version
Versi saat ini: `1.2.0`
