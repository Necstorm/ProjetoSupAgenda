const { contextBridge, ipcRenderer: r } = require('electron');
const inv = c => (...a) => r.invoke(c, ...a);
contextBridge.exposeInMainWorld('api', {
  load: inv('load'), save: inv('save'), check: inv('check'), seen: inv('seen'), fav: inv('fav'), snooze: inv('snooze'),
  imgSearch: inv('img'), imgSave: inv('imgsave'), imgFile: inv('imgfile'), open: inv('open'), openBackups: inv('openbackups'),
  exportar: inv('export'), importar: inv('import'), ics: inv('ics'), ollama: inv('ollama'), net: inv('net'), newpin: inv('newpin'),
  onDb: f => r.on('db', (_, d) => f(d)), onGoto: f => r.on('goto', (_, t) => f(t)),
  onAlarm: f => r.on('alarm', (_, a) => f(a)), onOpen: f => r.on('open-item', (_, a) => f(a))
});
