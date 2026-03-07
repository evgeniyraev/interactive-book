const { contextBridge, ipcRenderer } = require('electron');

function createListener(channel) {
  return (handler) => {
    const wrapped = (_, payload) => handler(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  };
}

contextBridge.exposeInMainWorld('bookApi', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (partialConfig) => ipcRenderer.invoke('config:set', partialConfig),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  pickAsset: (kind) => ipcRenderer.invoke('asset:pick', kind),
  importAssetsFromPaths: (filePaths) => ipcRenderer.invoke('asset:import-paths', filePaths),
  importAssetsFromFiles: (files) => ipcRenderer.invoke('asset:import-files', files),
  resolveAssetUrl: (relativePath) => ipcRenderer.invoke('asset:resolve', relativePath),
  exportPackage: () => ipcRenderer.invoke('package:export'),
  importPackage: () => ipcRenderer.invoke('package:import'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onContentUpdated: createListener('content-updated'),
  onUpdateDownloaded: createListener('update-downloaded')
});
