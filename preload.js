const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Sending actions to main
  startExam: (code) => ipcRenderer.send('start-exam', code),
  exitExam: () => ipcRenderer.send('exit-exam'),
  refreshExam: () => ipcRenderer.send('refresh-exam'),
  
  // Managing the BrowserView visibility
  hideView: () => ipcRenderer.send('hide-view'),
  showView: () => ipcRenderer.send('show-view'),
  resumeExam: () => ipcRenderer.send('resume-exam'),
  
  // Receiving commands from main
  onExamStarted: (callback) => ipcRenderer.on('exam-started', callback),
  onShowWarning: (callback) => ipcRenderer.on('show-warning', callback),
  onShowPostWarning: (callback) => ipcRenderer.on('show-post-warning', callback),
  onHideWarning: (callback) => ipcRenderer.on('hide-warning', callback),
  onShowError: (callback) => ipcRenderer.on('show-error', callback)
});