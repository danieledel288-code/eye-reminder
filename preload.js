const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('eyeApi', {
  getStatus:    ()        => ipcRenderer.invoke('get-status'),
  reset:        ()        => ipcRenderer.invoke('reset'),
  testOverlay:  ()        => ipcRenderer.invoke('test-overlay'),
  setStartup:   (enabled) => ipcRenderer.invoke('set-startup', enabled),
  hideWindow:   ()        => ipcRenderer.invoke('hide-window'),
  closeOverlay: ()        => ipcRenderer.invoke('close-overlay'),
})
