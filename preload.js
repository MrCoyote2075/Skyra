const { contextBridge, ipcRenderer } = require('electron');

// contextBridge.exposeInMainWorld('electronAPI', {
//   startExam: (code) => ipcRenderer.send('start-exam', code),
//   exitExam: () => ipcRenderer.send('exit-exam')
// });

contextBridge.exposeInMainWorld('electronAPI', {
  startExam: (code) => ipcRenderer.send('start-exam', code),
  exitExam: () => ipcRenderer.send('exit-exam'),
  refreshExam: () => ipcRenderer.send('refresh-exam')
});