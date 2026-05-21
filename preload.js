const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Exam controls
  startExam: (code) => ipcRenderer.send("start-exam", code),
  exitExam: () => ipcRenderer.send("exit-exam"),
  refreshExam: () => ipcRenderer.send("refresh-exam"),
  hideView: () => ipcRenderer.send("hide-view"),
  showView: () => ipcRenderer.send("show-view"),
  resumeExam: () => ipcRenderer.send("resume-exam"),

  // For tab/blur warning return
  returnToExam: () => ipcRenderer.send("return-to-exam"),

  // Retry load (recoverable errors)
  retryLoad: () => ipcRenderer.send("retry-load"),

  // Emergency exit
  forceQuit: () => ipcRenderer.send("force-quit"),

  // UI events from main process
  onExamStarted: (callback) => ipcRenderer.on("exam-started", callback),
  onShowWarning: (callback) => ipcRenderer.on("show-warning", callback),
  onHideWarning: (callback) => ipcRenderer.on("hide-warning", callback),
  onShowError: (callback) => ipcRenderer.on("show-error", callback),
  onShowRetry: (callback) => ipcRenderer.on("show-retry", callback),
  onShowFatal: (callback) => ipcRenderer.on("show-fatal", callback),
  onShowTerminated: (callback) => ipcRenderer.on("show-terminated", callback),
  onShowLoader: (callback) => ipcRenderer.on("show-loader", callback),
  onHideLoader: (callback) => ipcRenderer.on("hide-loader", callback),

  // Google login (if used)
  openGoogleLogin: () => ipcRenderer.send("open-google-login"),
  confirmGoogleLogin: () => ipcRenderer.invoke("confirm-google-login"),
  onGoogleLoginSuccess: (callback) => ipcRenderer.on("google-login-success", callback),
});