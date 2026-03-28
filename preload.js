const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    startExam: (code) => ipcRenderer.send("start-exam", code),
    exitExam: () => ipcRenderer.send("exit-exam"),
    refreshExam: () => ipcRenderer.send("refresh-exam"),

    hideView: () => ipcRenderer.send("hide-view"),
    showView: () => ipcRenderer.send("show-view"),
    resumeExam: () => ipcRenderer.send("resume-exam"),

    forceQuit: () => ipcRenderer.send("force-quit"),

    onExamStarted: (callback) => ipcRenderer.on("exam-started", callback),
    onShowWarning: (callback) => ipcRenderer.on("show-warning", callback),
    onShowPostWarning: (callback) =>
        ipcRenderer.on("show-post-warning", callback),
    onHideWarning: (callback) => ipcRenderer.on("hide-warning", callback),
    onShowError: (callback) => ipcRenderer.on("show-error", callback),

    onShowTerminated: (callback) => ipcRenderer.on("show-terminated", callback),

    // 🟢 Loader event bindings
    onShowLoader: (callback) => ipcRenderer.on("show-loader", callback),
    onHideLoader: (callback) => ipcRenderer.on("hide-loader", callback),
});
