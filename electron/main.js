const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { getDataDir, initDb, backupDb, BUILD_ID } = require('./db');
const pino = require('pino');

const isDev = !app.isPackaged;
let mainWindow = null;
let lockFilePath = null;
let logger;

function createLogger() {
  const dataDir = getDataDir();
  const logPath = path.join(dataDir, 'logs', `difrag-${new Date().toISOString().slice(0, 10)}.log`);
  const log = pino({ level: 'info', timestamp: pino.stdTimeFunctions.isoTime }, pino.destination({ dest: logPath, sync: false }));
  log.info(`[Difrag Build ${BUILD_ID}] App starting`);
  return log;
}

function ensureSingleInstance() {
  const dataDir = getDataDir();
  lockFilePath = path.join(dataDir, 'difrag.lock');
  fs.writeFileSync(lockFilePath, String(process.pid), 'utf8');
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 700,
    title: 'دیفرگ', backgroundColor: '#FAFAF9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true
    },
    show: false
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  if (isDev) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
  global.__difragMainWindow = mainWindow;
}

app.whenReady().then(() => {
  if (!ensureSingleInstance()) {
    dialog.showErrorBox('دیفرگ', 'یک نسخه دیگر از برنامه باز است');
    app.quit(); return;
  }
  logger = createLogger();
  global.__difragLogger = logger;
  initDb();
  backupDb();
  createWindow();
  require('./handlers');
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => {
  if (logger) logger.info('App closing');
  try { if (lockFilePath && fs.existsSync(lockFilePath)) fs.unlinkSync(lockFilePath); } catch (_) {}
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
