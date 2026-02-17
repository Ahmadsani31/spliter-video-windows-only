const $ = (id) => document.getElementById(id);
let files = [];

function addLog(level, message) {
  const log = $("log");
  const div = document.createElement("div");
  div.className = level;
  div.textContent = message;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function renderFiles() {
  const ul = $("fileList");
  ul.innerHTML = "";
  $("countFiles").textContent = `${files.length} file`;

  for (const f of files) {
    const li = document.createElement("li");
    const left = document.createElement("div");
    left.className = "name";
    left.textContent = f;

    const right = document.createElement("div");
    right.className = "ext";
    right.textContent = (f.split(".").pop() || "").toLowerCase();

    li.appendChild(left);
    li.appendChild(right);
    ul.appendChild(li);
  }
}

function setProgress(pct, text, countText = "") {
  $("barFill").style.width = `${Math.min(100, Math.max(0, pct))}%`;
  $("progressText").textContent = text || "Idle";
  $("progressCount").textContent = countText;
}

function dedupePush(list, newPaths) {
  const set = new Set(list);
  for (const p of newPaths) set.add(p);
  return Array.from(set);
}

$("btnPickFiles").addEventListener("click", async () => {
  const picked = await window.api.pickFiles();
  if (picked?.length) {
    files = dedupePush(files, picked);
    renderFiles();
    addLog("info", `+ ${picked.length} file ditambahkan`);
  }
});

$("btnClear").addEventListener("click", () => {
  files = [];
  renderFiles();
  $("log").innerHTML = "";
  setProgress(0, "Idle", "");
});

$("btnPickOut").addEventListener("click", async () => {
  const dir = await window.api.pickFolder();
  if (dir) $("outDir").value = dir;
});

// $("btnCheck").addEventListener("click", async () => {
//   const res = await window.api.checkFfmpeg();
//   if (res.ok) {
//     $("ffStatus").textContent = `✅ OK (${res.source})`;
//     addLog("ok", `FFmpeg OK (${res.source})\nffmpeg: ${res.ffmpegPath}\nffprobe: ${res.ffprobePath}`);
//   } else {
//     $("ffStatus").textContent = `❌ NOT FOUND`;
//     addLog("error", `FFmpeg NOT FOUND\nffmpeg: ${res.ffmpegPath}\nffprobe: ${res.ffprobePath}\nsource=${res.source}`);
//   }
// });

$("btnCheck").addEventListener("click", async () => {
  const btn = $("btnCheck");
  const btnStart = $("btnStart");
  const spinner = $("checkSpinner");
  const text = $("checkText");
  const status = $("ffStatus");

  // start loading
  btn.disabled = true;
  btnStart.disabled = true;
  spinner.classList.remove("hidden");
  text.textContent = "Checking...";
  status.textContent = "Sedang mengecek ffmpeg & ffprobe...";

  try {
    const res = await window.api.checkFfmpeg();

    if (res.ok) {
      status.textContent = `✅ OK (${res.source})`;
      addLog(
        "ok",
        `FFmpeg OK (${res.source})\nffmpeg: ${res.ffmpegPath}\nffprobe: ${res.ffprobePath}`,
      );
    } else {
      status.textContent = `❌ NOT FOUND`;
      addLog(
        "error",
        `FFmpeg NOT FOUND\nffmpeg: ${res.ffmpegPath}\nffprobe: ${res.ffprobePath}\nsource=${res.source}`,
      );
    }
  } catch (e) {
    status.textContent = "❌ ERROR";
    addLog("error", `Check error: ${e.message || e}`);
  } finally {
    // stop loading
    spinner.classList.add("hidden");
    text.textContent = "Cek FFmpeg Bundled";
    btn.disabled = false;
    btnStart.disabled = false;
  }
});

$("btnStart").addEventListener("click", async () => {
  if (!files.length)
    return addLog("warn", "Tidak ada file. Tambahkan video dulu.");
  const outDir = $("outDir").value.trim();
  if (!outDir) return addLog("warn", "Pilih output folder dulu.");

  const minutes = Number($("minutes").value || 5);
  if (!Number.isFinite(minutes) || minutes <= 0)
    return addLog("warn", "Durasi harus > 0.");

  const flat = $("chkFlat").checked;

  addLog("info", "Mulai proses split...");
  setProgress(0, "Starting...", `0/${files.length}`);

  const btn = $("btnStart");
  btn.disabled = true;

  const res = await window.api.startSplit({
    files,
    outDir,
    minutes,
    perFileSubfolder: !flat,
  });

  if (!res.ok) {
    addLog("error", `Gagal: ${res.error}`);
  } else {
    const { success, failed, skipped } = res.summary;
    addLog(
      "ok",
      `Selesai ✅ | Success=${success}, Failed=${failed}, Skipped=${skipped}`,
    );
    setProgress(100, "Done", `${files.length}/${files.length}`);
  }

  btn.disabled = false;
});

// ========= Drag & Drop (FIX) =========

// 1) Jangan stopPropagation global. Cukup preventDefault di WINDOW (capture)
//    supaya Electron tidak mencoba "membuka" file saat di-drop.
window.addEventListener(
  "dragover",
  (e) => {
    e.preventDefault();
  },
  true,
);

window.addEventListener(
  "drop",
  (e) => {
    e.preventDefault();
  },
  true,
);

// 2) Pastikan dropzone ada
const dz = document.getElementById("dropzone");
if (!dz) {
  addLog(
    "error",
    "DROPZONE tidak ditemukan. Pastikan id='dropzone' ada di index.html",
  );
} else {
  // helper ambil path dari file drop
  const getDroppedPaths = (e) => {
    const dt = e.dataTransfer;
    const result = [];

    if (dt?.files?.length) {
      for (const f of dt.files) {
        const p = window.api.getPathForFile(f); // ✅ FIX
        if (p && typeof p === "string") result.push(p);
      }
    }

    return result;
  };

  dz.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dz.classList.add("dragover");
  });

  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    // penting: set dropEffect agar Windows tahu ini "copy"
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    dz.classList.add("dragover");
  });

  dz.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dz.classList.remove("dragover");
  });

  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("dragover");

    addLog("info", "DROP event masuk ✅");

    const dropped = getDroppedPaths(e);
    addLog("muted", `dropped count: ${dropped.length}`);

    if (!dropped.length) {
      addLog(
        "warn",
        "Tidak ada path file terbaca. Coba drop file langsung dari Explorer (bukan shortcut/zip).",
      );
      return;
    }

    const filtered = dropped.filter((p) => {
      const lower = p.toLowerCase();
      return lower.endsWith(".mp4") || lower.endsWith(".mkv");
    });

    if (!filtered.length) {
      addLog("warn", "File yang di-drop bukan mp4/mkv.");
      return;
    }

    files = dedupePush(files, filtered);
    renderFiles();
    addLog("info", `+ ${filtered.length} file ditambahkan via drag-drop`);
  });
}

// Helpers for display
function mmss(s) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}

let currentIndex = 0;
let totalFiles = 0;

// Listen events from main
window.api.onSplitEvent((evt) => {
  if (evt.type === "overall") {
    const { index, total, current } = evt.data;
    currentIndex = index;
    totalFiles = total;
    addLog("info", `(${index}/${total}) ${current}`);
    setProgress(0, `Queued: ${current}`, `${index - 1}/${total}`);
  }

  if (evt.type === "file") {
    const { duration, segmentSeconds, estimatedParts, targetDir } = evt.data;
    addLog(
      "info",
      `Info: durasi=${duration.toFixed(2)}s | segment=${segmentSeconds}s | estimasi part=${estimatedParts}\nOutput: ${targetDir}`,
    );
  }

  if (evt.type === "progress") {
    const {
      inputFile,
      outSeconds,
      duration,
      percent,
      partIndex,
      totalPartsEst,
      done,
    } = evt.data;
    const pct = Number.isFinite(percent) ? percent : 0;

    const label = done
      ? `Done: ${inputFile}`
      : `Splitting: part ${partIndex + 1}/${totalPartsEst} | ${mmss(outSeconds)} / ${mmss(duration)}`;

    // Progress bar ini per-file
    setProgress(pct, label, `${Math.max(0, currentIndex - 1)}/${totalFiles}`);
  }

  if (evt.type === "parts") {
    const { inputFile, createdCount, targetDir, parts } = evt.data;

    addLog("ok", `✅ Part terbuat (${createdCount}): ${inputFile}`);
    addLog("muted", `Folder: ${targetDir}`);

    const maxShow = 50;
    addLog(
      "info",
      parts
        .slice(0, maxShow)
        .map((p) => `- ${p}`)
        .join("\n"),
    );
    if (parts.length > maxShow)
      addLog("muted", `... (+${parts.length - maxShow} lainnya)`);
  }

  if (evt.type === "log") {
    const { level, message } = evt.data;
    if (level === "info") addLog("info", message);
    else if (level === "warn") addLog("warn", message);
    else addLog("error", message);
  }

  if (evt.type === "ffmpeg") {
    addLog("muted", evt.data.line);
  }
});
