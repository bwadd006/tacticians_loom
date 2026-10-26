import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type ReferenceApi } from '../shared/api';

const api: ReferenceApi = {
  overview: () => ipcRenderer.invoke(CHANNELS.overview),
  characters: route => ipcRenderer.invoke(CHANNELS.characters, route),
  character: id => ipcRenderer.invoke(CHANNELS.character, id),
  characterClass: id => ipcRenderer.invoke(CHANNELS.characterClass, id),
  classLibrary: () => ipcRenderer.invoke(CHANNELS.classLibrary),
  paralogueLibrary: () => ipcRenderer.invoke(CHANNELS.paralogueLibrary),
  conflicts: () => ipcRenderer.invoke(CHANNELS.conflicts),
  saveSetup: (route, setup) => ipcRenderer.invoke(CHANNELS.saveSetup, { route, setup }),
  loadSetup: route => ipcRenderer.invoke(CHANNELS.loadSetup, route),
  saveClassSetup: setup => ipcRenderer.invoke(CHANNELS.saveClassSetup, setup),
  loadClassSetup: () => ipcRenderer.invoke(CHANNELS.loadClassSetup),
  saveParalogueSetup: setup => ipcRenderer.invoke(CHANNELS.saveParalogueSetup, setup),
  loadParalogueSetup: () => ipcRenderer.invoke(CHANNELS.loadParalogueSetup),
  listCharacterPlanning: () => ipcRenderer.invoke(CHANNELS.listCharacterPlanning),
  setCharacterShortlisted: (characterId, shortlisted) => ipcRenderer.invoke(CHANNELS.setCharacterShortlisted, { characterId, shortlisted }),
  setCharacterNote: (characterId, note) => ipcRenderer.invoke(CHANNELS.setCharacterNote, { characterId, note }),
  clearCharacterNote: characterId => ipcRenderer.invoke(CHANNELS.clearCharacterNote, characterId),
};
contextBridge.exposeInMainWorld('loom', api);
