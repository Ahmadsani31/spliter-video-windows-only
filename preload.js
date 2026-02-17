const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("api", {
  pickFiles: () => ipcRenderer.invoke("pick:files"),
  pickFolder: () => ipcRenderer.invoke("pick:folder"),
  checkFfmpeg: () => ipcRenderer.invoke("check:ffmpeg"),
  startSplit: (payload) => ipcRenderer.invoke("split:start", payload),
  onSplitEvent: (cb) => ipcRenderer.on("split:event", (_evt, data) => cb(data)),

  // ✅ ini yang penting untuk drag-drop
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },
});