const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Exam controls
  startExam: (code) => ipcRenderer.send("start-exam", code),
  exitExam: () => ipcRenderer.send("exit-exam"),
  refreshExam: () => ipcRenderer.send("refresh-exam"),

  hideView: () => ipcRenderer.send("hide-view"),
  showView: () => ipcRenderer.send("show-view"),
  resumeExam: () => ipcRenderer.send("resume-exam"),

  // ✅ new: user explicitly returns to exam (stops timer in main)
  returnToExam: () => ipcRenderer.send("return-to-exam"),

  // ✅ new: retry last load if a recoverable load error happened
  retryLoad: () => ipcRenderer.send("retry-load"),

  // Exit / kill
  forceQuit: () => ipcRenderer.send("force-quit"),

  // UI events
  onExamStarted: (callback) => ipcRenderer.on("exam-started", callback),

  // show-warning now sends an object: { count, seconds }
  onShowWarning: (callback) => ipcRenderer.on("show-warning", callback),

  onShowPostWarning: (callback) =>
    ipcRenderer.on("show-post-warning", callback),

  onHideWarning: (callback) => ipcRenderer.on("hide-warning", callback),

  onShowError: (callback) => ipcRenderer.on("show-error", callback),

  // ✅ recoverable load error (shows retry UI)
  onShowRetry: (callback) => ipcRenderer.on("show-retry", callback),

  // ✅ fatal error (in-app + details)
  onShowFatal: (callback) => ipcRenderer.on("show-fatal", callback),

  onShowTerminated: (callback) => ipcRenderer.on("show-terminated", callback),

  onShowLoader: (callback) => ipcRenderer.on("show-loader", callback),
  onHideLoader: (callback) => ipcRenderer.on("hide-loader", callback),

  // Google login
  openGoogleLogin: () => ipcRenderer.send("open-google-login"),
  confirmGoogleLogin: () => ipcRenderer.invoke("confirm-google-login"),
  onGoogleLoginSuccess: (callback) =>
    ipcRenderer.on("google-login-success", callback),
});