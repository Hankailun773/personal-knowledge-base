const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getData: () => ipcRenderer.invoke('get-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  exportMarkdown: (title, markdown) => ipcRenderer.invoke('export-markdown', { title, markdown }),
  exportPDF: (title) => ipcRenderer.invoke('export-pdf', { title }),
})
