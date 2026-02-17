const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");

let mainWindow = null;

function createAppMenu(getWin) {
  const template = [
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About",
          click: async () => {
            const win = getWin?.();
            await dialog.showMessageBox(win, {
              type: "info",
              title: "About Video Split | Adsa",
              detail:
                `Version: ${app.getVersion()}\n` +
                `Platform: ${process.platform} ${process.arch}\n` +
                `Split MP4/MKV per 5 menit (default) menggunakan FFmpeg (bundled).`,
              buttons: ["OK"],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // const menu = Menu.buildFromTemplate([
  //   {
  //     label: "File",
  //     submenu: [{ role: "quit" }],
  //   },
  //   {
  //     label: "View",
  //     submenu: [
  //       { role: "reload" },
  //       { role: "forceReload" },
  //       { role: "toggleDevTools" },
  //       { type: "separator" },
  //       { role: "resetZoom" },
  //       { role: "zoomIn" },
  //       { role: "zoomOut" },
  //       { type: "separator" },
  //       { role: "togglefullscreen" },
  //     ],
  //   },
  //   {
  //     label: "Help",
  //     submenu: [
  //       {
  //         label: "About",
  //         click: async () => {
  //           const win = getWin?.();
  //           await dialog.showMessageBox(win, {
  //             type: "info",
  //             title: "About VidSlicer",
  //             message: "VidSlicer",
  //             detail:
  //               `Version: ${app.getVersion()}\n` +
  //               `Platform: ${process.platform} ${process.arch}\n\n` +
  //               `Split MP4/MKV per 5 menit (default) menggunakan FFmpeg (bundled).`,
  //             buttons: ["OK"],
  //           });
  //         },
  //       },
  //     ],
  //   },
  // ]);
  // win.setMenu(menu);
  mainWindow.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();

  createAppMenu(() => mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createAppMenu(() => mainWindow);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ------------------- Helpers -------------------
function spawnCollect(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(`${cmd} exit ${code}\n${err || out}`));
    });
  });
}

async function existsAndRunnable(filePath, versionArgs = ["-version"]) {
  try {
    if (!fs.existsSync(filePath)) return false;
    await spawnCollect(filePath, versionArgs);
    return true;
  } catch {
    return false;
  }
}

function getBundledBinary(name) {
  // dev: <project>/binaries/ffmpeg.exe
  // packaged: <install>/resources/binaries/ffmpeg.exe
  if (app.isPackaged) return path.join(process.resourcesPath, "binaries", name);
  return path.join(__dirname, "binaries", name);
}

async function getFfmpegPaths() {
  // Prioritas: bundled binaries
  const bundledFfmpeg = getBundledBinary("ffmpeg.exe");
  const bundledFfprobe = getBundledBinary("ffprobe.exe");

  const okBundledFfmpeg = await existsAndRunnable(bundledFfmpeg);
  const okBundledFfprobe = await existsAndRunnable(bundledFfprobe);

  if (okBundledFfmpeg && okBundledFfprobe) {
    return {
      ffmpegPath: bundledFfmpeg,
      ffprobePath: bundledFfprobe,
      source: "bundled",
    };
  }

  // Fallback: coba dari PATH (kalau user memang install)
  // Ini optional: kalau kamu mau 100% wajib bundled, hapus fallback ini.
  const okPathFfmpeg = await tryRunFromPath("ffmpeg");
  const okPathFfprobe = await tryRunFromPath("ffprobe");
  if (okPathFfmpeg && okPathFfprobe) {
    return { ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", source: "system" };
  }

  return {
    ffmpegPath: bundledFfmpeg,
    ffprobePath: bundledFfprobe,
    source: "missing",
  };
}

async function tryRunFromPath(bin) {
  try {
    await spawnCollect(bin, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

async function ffprobeDurationSeconds(ffprobePath, inputPath) {
  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ];
  const { out } = await spawnCollect(ffprobePath, args);
  const dur = Number(String(out).trim());
  if (!Number.isFinite(dur) || dur <= 0)
    throw new Error("Gagal baca durasi (ffprobe).");
  return dur;
}

function safeBaseName(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "video";
}

function isSupported(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".mp4" || ext === ".mkv";
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function listCreatedParts(targetDir, base, ext) {
  const items = await fsp.readdir(targetDir);
  const prefix = `${base}_part_`;
  return items
    .filter((name) => name.startsWith(prefix) && name.endsWith(ext))
    .map((name) => path.join(targetDir, name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// progress pipe parser
function parseFfmpegProgressLine(line) {
  const idx = line.indexOf("=");
  if (idx === -1) return null;
  return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
}
function hmsToSeconds(hms) {
  const m = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(hms);
  if (!m) return null;
  const hh = Number(m[1]),
    mm = Number(m[2]),
    ss = Number(m[3]);
  if (![hh, mm, ss].every(Number.isFinite)) return null;
  return hh * 3600 + mm * 60 + ss;
}

// ------------------- IPC -------------------
ipcMain.handle("pick:files", async () => {
  const res = await dialog.showOpenDialog({
    title: "Pilih video",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Video", extensions: ["mp4", "mkv"] }],
  });
  if (res.canceled) return [];
  return res.filePaths;
});

ipcMain.handle("pick:folder", async () => {
  const res = await dialog.showOpenDialog({
    title: "Pilih folder output",
    properties: ["openDirectory"],
  });
  if (res.canceled) return null;
  return res.filePaths[0];
});

// Cek ffmpeg (bundled)
ipcMain.handle("check:ffmpeg", async () => {
  const paths = await getFfmpegPaths();
  const ok =
    (await existsAndRunnable(paths.ffmpegPath)) &&
    (await existsAndRunnable(paths.ffprobePath));
  return { ok, ...paths };
});

// Split start
ipcMain.handle("split:start", async (evt, payload) => {
  const { files, outDir, minutes, perFileSubfolder = true } = payload;

  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, error: "Tidak ada file yang diproses." };
  }
  if (!outDir) return { ok: false, error: "Output folder belum dipilih." };

  const segmentSeconds = Math.max(1, Math.round(Number(minutes || 5) * 60));
  await ensureDir(outDir);

  const send = (type, data) => evt.sender.send("split:event", { type, data });

  // get ffmpeg paths (bundled first)
  const { ffmpegPath, ffprobePath, source } = await getFfmpegPaths();
  const okBin =
    (await existsAndRunnable(ffmpegPath)) &&
    (await existsAndRunnable(ffprobePath));
  if (!okBin) {
    return {
      ok: false,
      error:
        `FFmpeg tidak ditemukan.\n` +
        `Coba pastikan folder "binaries" ikut ter-bundle.\n` +
        `ffmpeg: ${ffmpegPath}\nffprobe: ${ffprobePath}\nsource=${source}`,
    };
  }

  send("log", {
    level: "info",
    message: `FFmpeg source: ${source}\nffmpeg: ${ffmpegPath}\nffprobe: ${ffprobePath}`,
  });

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const inputFile = files[i];
    send("overall", { index: i + 1, total: files.length, current: inputFile });

    try {
      if (!fs.existsSync(inputFile)) {
        skipped++;
        send("log", {
          level: "warn",
          message: `Skip (not found): ${inputFile}`,
        });
        continue;
      }
      if (!isSupported(inputFile)) {
        skipped++;
        send("log", {
          level: "warn",
          message: `Skip (unsupported): ${inputFile}`,
        });
        continue;
      }

      const ext = path.extname(inputFile).toLowerCase();
      const base = safeBaseName(inputFile);

      const duration = await ffprobeDurationSeconds(ffprobePath, inputFile);
      const estimatedParts = Math.ceil(duration / segmentSeconds);

      const targetDir = perFileSubfolder ? path.join(outDir, base) : outDir;
      await ensureDir(targetDir);

      const outPattern = path.join(targetDir, `${base}_part_%03d${ext}`);

      send("file", {
        file: inputFile,
        duration,
        segmentSeconds,
        estimatedParts,
        targetDir,
        outPattern,
      });

      const baseArgs = [
        "-hide_banner",
        "-y",
        "-i",
        inputFile,
        "-map",
        "0",
        "-c",
        "copy",
        "-f",
        "segment",
        "-segment_time",
        String(segmentSeconds),
        "-reset_timestamps",
        "1",
        outPattern,
      ];

      // progress pipe
      await new Promise((resolve, reject) => {
        const args = [
          "-hide_banner",
          "-y",
          "-nostats",
          ...baseArgs.slice(2), // drop first "-hide_banner","-y" from baseArgs
          "-progress",
          "pipe:1",
        ];

        const p = spawn(ffmpegPath, args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let buf = "";
        let lastEmitAt = 0;

        p.stdout.on("data", (d) => {
          buf += d.toString();
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() || "";

          for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;

            const kv = parseFfmpegProgressLine(line);
            if (!kv) continue;

            let outSeconds = null;

            if (kv.key === "out_time_ms") {
              const v = Number(kv.value);
              if (Number.isFinite(v)) outSeconds = v / 1_000_000; // microseconds -> seconds
            } else if (kv.key === "out_time") {
              const sec = hmsToSeconds(kv.value);
              if (sec != null) outSeconds = sec;
            }

            if (outSeconds != null) {
              const now = Date.now();
              if (now - lastEmitAt > 250) {
                lastEmitAt = now;
                const percent = Math.min(
                  100,
                  Math.max(0, (outSeconds / duration) * 100),
                );
                const partIndex = Math.floor(outSeconds / segmentSeconds);
                const totalPartsEst = Math.max(
                  1,
                  Math.ceil(duration / segmentSeconds),
                );

                send("progress", {
                  inputFile,
                  outSeconds,
                  duration,
                  percent,
                  partIndex,
                  totalPartsEst,
                });
              }
            }

            if (kv.key === "progress" && kv.value === "end") {
              send("progress", {
                inputFile,
                outSeconds: duration,
                duration,
                percent: 100,
                partIndex: Math.max(
                  0,
                  Math.ceil(duration / segmentSeconds) - 1,
                ),
                totalPartsEst: Math.max(
                  1,
                  Math.ceil(duration / segmentSeconds),
                ),
                done: true,
              });
            }
          }
        });

        let errText = "";
        p.stderr.on("data", (d) => {
          errText += d.toString();
          if (errText.length > 2000) errText = errText.slice(-2000);
        });

        p.on("error", reject);
        p.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg gagal (code ${code})\n${errText}`));
        });
      });

      // list created parts (akurat)
      const createdParts = await listCreatedParts(targetDir, base, ext);

      send("parts", {
        inputFile,
        targetDir,
        createdCount: createdParts.length,
        parts: createdParts,
      });

      send("log", {
        level: "info",
        message: `✅ OK: ${path.basename(inputFile)} -> ${targetDir} | part=${createdParts.length}`,
      });

      success++;
    } catch (e) {
      failed++;
      send("log", {
        level: "error",
        message: `❌ FAIL: ${inputFile}\n${e.message}`,
      });
    }
  }

  return { ok: true, summary: { success, failed, skipped } };
});
