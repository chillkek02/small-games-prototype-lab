const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('factoryDesktop', Object.freeze({
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke('factory:desktop-info'),
  enablePhoneRemote: () => ipcRenderer.invoke('factory:enable-phone-remote'),
  openTailscaleDownload: () => ipcRenderer.invoke('factory:open-tailscale-download'),
  chooseRepo: () => ipcRenderer.invoke('factory:choose-repo')
}));
