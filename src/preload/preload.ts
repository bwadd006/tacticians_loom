import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type ReferenceApi } from '../shared/api';

const api: ReferenceApi = {
  overview: () => ipcRenderer.invoke(CHANNELS.overview),
  characters: route => ipcRenderer.invoke(CHANNELS.characters, route),
  character: id => ipcRenderer.invoke(CHANNELS.character, id),
  characterClass: id => ipcRenderer.invoke(CHANNELS.characterClass, id),
  conflicts: () => ipcRenderer.invoke(CHANNELS.conflicts),
  saveSetup: (route, setup) => ipcRenderer.invoke(CHANNELS.saveSetup, { route, setup }),
  loadSetup: route => ipcRenderer.invoke(CHANNELS.loadSetup, route),
};
contextBridge.exposeInMainWorld('loom', api);
