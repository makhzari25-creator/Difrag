const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { getDataDir, initDb, getDb, backupDb, BUILD_ID, uuidv4 } = require('./db');
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
}

app.whenReady().then(() => {
  const dataDir = getDataDir();
  lockFilePath = path.join(dataDir, 'difrag.lock');
  fs.writeFileSync(lockFilePath, String(process.pid), 'utf8');
  logger = createLogger();
  initDb();
  backupDb();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => {
  if (logger) logger.info('App closing');
  try { if (lockFilePath && fs.existsSync(lockFilePath)) fs.unlinkSync(lockFilePath); } catch (_) {}
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('get-data-dir', () => getDataDir());
ipcMain.handle('get-build-id', () => BUILD_ID);
ipcMain.handle('log', (_e, level, msg, meta) => { if (logger) logger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](meta || {}, msg); });

ipcMain.handle('upsert-user', (_e, profile) => {
  const db = getDb();
  const now = new Date().toISOString();
  let user = db.prepare('SELECT * FROM users WHERE full_name = ? AND device_id = ?').get(profile.fullName, profile.deviceId);
  if (user) {
    db.prepare('UPDATE users SET is_manager = ?, last_seen_at = ? WHERE id = ?').run(profile.isManager ? 1 : 0, now, user.id);
    user.is_manager = profile.isManager ? 1 : 0;
  } else {
    const info = db.prepare('INSERT INTO users (full_name, is_manager, first_seen_at, last_seen_at, device_id) VALUES (?,?,?,?,?)').run(profile.fullName, profile.isManager ? 1 : 0, now, now, profile.deviceId);
    user = { id: info.lastInsertRowid, full_name: profile.fullName, is_manager: profile.isManager ? 1 : 0, device_id: profile.deviceId };
  }
  return user;
});

ipcMain.handle('log-auth-event', (_e, event) => {
  const id = uuidv4();
  getDb().prepare('INSERT INTO auth_events (id, user_id, full_name, is_manager, type, timestamp, device_id, detail) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, event.userId, event.fullName, event.isManager ? 1 : 0, event.type, event.timestamp || new Date().toISOString(), event.deviceId, event.detail || null);
  return id;
});

function parseLocationCell(raw, totalQty) {
  if (!raw || raw === '_' || String(raw).trim() === '') return { locations: [], warnings: [] };
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  const warnings = [];
  const parsed = parts.map(part => {
    const m = part.match(/^(\d{8})\s*(?:\((\d+)\))?$/);
    if (!m) { warnings.push({ type: 'bad_location', message: `فرمت مکان نامعتبر: ${part}` }); return null; }
    return { code: m[1], qty: m[2] != null ? parseInt(m[2], 10) : null };
  }).filter(Boolean);
  if (!parsed.length) return { locations: [], warnings };
  const locations = [];
  const withQty = parsed.filter(p => p.qty != null);
  if (withQty.length === 0) {
    locations.push({ code: parsed[0].code, expectedQty: totalQty });
    for (let i = 1; i < parsed.length; i++) locations.push({ code: parsed[i].code, expectedQty: 0 });
    warnings.push({ type: 'no_split', message: 'ردیف بدون تفکیک در ستون مکان' });
  } else if (withQty.length === 1 && parsed.length === 2) {
    const known = withQty[0];
    const other = parsed.find(p => p.code !== known.code);
    locations.push({ code: known.code, expectedQty: known.qty });
    locations.push({ code: other.code, expectedQty: Math.max(0, totalQty - known.qty) });
  } else {
    let sum = 0;
    for (const p of parsed) { const q = p.qty != null ? p.qty : 0; locations.push({ code: p.code, expectedQty: q }); sum += q; }
    if (sum !== totalQty) warnings.push({ type: 'sum_mismatch', message: 'جمع تفکیک‌ها با موجودی کل برابر نیست' });
  }
  return { locations, warnings };
}

ipcMain.handle('import-excel', async (_e, { filePath, uploadedBy }) => {
  const db = getDb();
  const dataDir = getDataDir();
  const warnings = [];
  const errors = [];
  try {
    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const sheetName = workbook.SheetNames.includes('SheetFilter') ? 'SheetFilter' : workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    if (rows.length < 2) return { success: false, errors: ['فایل خالی است'] };
    const col = { barcode: 1, size: 2, warehouseQty: 3, fullName: 5, color: 11, gender: 16, isActive: 17, locations: 20 };
    const dataRows = rows.slice(1);
    const barcodes = new Map();
    const activeProducts = [];
    let multiLocationRows = 0, emptyBarcodeCount = 0;
    for (const r of dataRows) {
      const barcode = String(r[col.barcode] || '').trim();
      if (!barcode) { emptyBarcodeCount++; continue; }
      if (barcodes.has(barcode)) { errors.push(`بارکد تکراری: ${barcode}`); continue; }
      barcodes.set(barcode, true);
      const isActiveRaw = String(r[col.isActive] || '').trim().toLowerCase();
      if (!(isActiveRaw === 'true' || isActiveRaw === '1')) continue;
      let qty = parseInt(r[col.warehouseQty], 10);
      if (Number.isNaN(qty)) { qty = 0; warnings.push({ type: 'non_int', message: `مقدار غیرعددی برای ${barcode}`, barcode }); }
      const rawLoc = String(r[col.locations] || '').trim();
      const { locations, warnings: locWarns } = parseLocationCell(rawLoc, qty);
      for (const w of locWarns) warnings.push({ ...w, barcode });
      if (locations.length > 1) multiLocationRows++;
      activeProducts.push({ barcode, size: String(r[col.size] || '').trim(), fullName: String(r[col.fullName] || '').trim(), color: String(r[col.color] || '').trim(), gender: String(r[col.gender] || '').trim(), isActive: true, excelReferenceQty: qty, locationCount: locations.length || 0, rawLocations: rawLoc, locations });
    }
    if (emptyBarcodeCount) warnings.push({ type: 'empty_barcode', message: `${emptyBarcodeCount} ردیف بدون بارکد نادیده گرفته شد` });
    if (errors.length) return { success: false, errors, summary: { totalRows: dataRows.length, activeRows: activeProducts.length, uniqueSkus: activeProducts.length, locationCount: 0, multiLocationRows, warnings, errors } };
    const hash = crypto.createHash('sha256').update(JSON.stringify(activeProducts.map(p => p.barcode + p.excelReferenceQty))).digest('hex').slice(0, 16);
    const filename = path.basename(filePath);
    const destPath = path.join(dataDir, 'excel', `v${Date.now()}-${hash}.xlsx`);
    fs.copyFileSync(filePath, destPath);
    const now = new Date().toISOString();
    const versionInfo = db.prepare('INSERT INTO excel_versions (file_path, uploaded_by, uploaded_at, row_count, sheet_hash, filename) VALUES (?,?,?,?,?,?)').run(destPath, uploadedBy, now, activeProducts.length, hash, filename);
    const versionId = versionInfo.lastInsertRowid;
    const insertProduct = db.prepare('INSERT INTO products (excel_version_id, barcode, size, full_name, color, gender, is_active, excel_reference_qty, location_count, raw_locations) VALUES (?,?,?,?,?,?,1,?,?,?)');
    const insertLoc = db.prepare('INSERT INTO product_locations (product_id, location_code, expected_qty) VALUES (?,?,?)');
    const insertMany = db.transaction((products) => {
      for (const p of products) {
        const info = insertProduct.run(versionId, p.barcode, p.size, p.fullName, p.color, p.gender, p.excelReferenceQty, p.locationCount, p.rawLocations);
        for (const loc of p.locations) insertLoc.run(info.lastInsertRowid, loc.code, loc.expectedQty);
      }
    });
    insertMany(activeProducts);
    const locCount = db.prepare('SELECT COUNT(DISTINCT location_code) as c FROM product_locations pl JOIN products p ON p.id = pl.product_id WHERE p.excel_version_id = ?').get(versionId).c;
    if (logger) logger.info({ versionId, count: activeProducts.length }, 'Excel imported');
    return { success: true, versionId, summary: { totalRows: dataRows.length, activeRows: activeProducts.length, uniqueSkus: activeProducts.length, locationCount: locCount, multiLocationRows, warnings, errors: [] } };
  } catch (err) {
    if (logger) logger.error(err, 'Import failed');
    return { success: false, errors: [String(err.message || err)] };
  }
});

ipcMain.handle('get-active-excel', () => getDb().prepare('SELECT * FROM excel_versions ORDER BY id DESC LIMIT 1').get() || null);
ipcMain.handle('get-locations', (_e, versionId) => getDb().prepare('SELECT pl.location_code, COUNT(DISTINCT p.id) as product_count, SUM(pl.expected_qty) as expected_units FROM product_locations pl JOIN products p ON p.id = pl.product_id WHERE p.excel_version_id = ? AND p.is_active = 1 GROUP BY pl.location_code ORDER BY pl.location_code').all(versionId));
ipcMain.handle('get-product-by-barcode', (_e, { barcode, versionId }) => {
  const p = getDb().prepare('SELECT * FROM products WHERE barcode = ? AND excel_version_id = ?').get(barcode, versionId);
  if (!p) return null;
  const locations = getDb().prepare('SELECT * FROM product_locations WHERE product_id = ?').all(p.id);
  return { id: p.id, excelVersionId: p.excel_version_id, barcode: p.barcode, size: p.size, fullName: p.full_name, color: p.color, gender: p.gender, isActive: !!p.is_active, excelReferenceQty: p.excel_reference_qty, locationCount: p.location_count, rawLocations: p.raw_locations, locations: locations.map(l => ({ id: l.id, productId: l.product_id, locationCode: l.location_code, expectedQty: l.expected_qty })) };
});

ipcMain.handle('create-session', (_e, data) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  getDb().prepare('INSERT INTO sessions (id, location_code, started_by_user_id, started_by_name, started_by_role, started_at, ended_at, status, excel_version_id) VALUES (?,?,?,?,?,?,NULL,?,?)').run(id, data.locationCode, data.userId, data.userName, data.userRole, now, 'active', data.excelVersionId);
  return { id, startedAt: now };
});
ipcMain.handle('update-session', (_e, { id, status, endedAt }) => { getDb().prepare('UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?').run(status, endedAt || null, id); });
ipcMain.handle('get-sessions', (_e, filters) => {
  let sql = 'SELECT * FROM sessions WHERE 1=1'; const params = [];
  if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters?.userId) { sql += ' AND started_by_user_id = ?'; params.push(filters.userId); }
  sql += ' ORDER BY started_at DESC LIMIT 200';
  return getDb().prepare(sql).all(...params);
});
ipcMain.handle('get-active-session-for-user', (_e, userId) => getDb().prepare("SELECT * FROM sessions WHERE started_by_user_id = ? AND status IN ('active','paused') ORDER BY started_at DESC LIMIT 1").get(userId));
ipcMain.handle('get-sessions-for-location', (_e, locationCode) => getDb().prepare("SELECT * FROM sessions WHERE location_code = ? AND status IN ('active','paused') ORDER BY started_at DESC").all(locationCode));

ipcMain.handle('add-scan-event', (_e, event) => {
  const id = event.id || uuidv4();
  getDb().prepare('INSERT INTO scan_events (id, session_id, barcode, product_id, action, qty_delta, user_id, user_full_name, user_role, timestamp, device_id, note, scan_method) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, event.sessionId, event.barcode, event.productId || null, event.action, event.qtyDelta, event.userId, event.userFullName, event.userRole, event.timestamp || new Date().toISOString(), event.deviceId, event.note || null, event.scanMethod || null);
  return id;
});
ipcMain.handle('get-scan-events', (_e, sessionId) => getDb().prepare('SELECT * FROM scan_events WHERE session_id = ? ORDER BY timestamp').all(sessionId));

ipcMain.handle('save-item-result', (_e, result) => {
  const id = result.id || uuidv4();
  getDb().prepare('INSERT INTO item_results (id, session_id, barcode, product_id, excel_reference_qty, physical_qty, diff, result_type, user_id, user_full_name, user_role, recorded_at, status, reviewed_by_name, reviewed_by_role, reviewed_at, manager_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, result.sessionId, result.barcode, result.productId || null, result.excelReferenceQty, result.physicalQty, result.diff, result.resultType, result.userId, result.userFullName, result.userRole, result.recordedAt || new Date().toISOString(), result.status, result.reviewedByName || null, result.reviewedByRole || null, result.reviewedAt || null, result.managerNote || null);
  return id;
});
ipcMain.handle('update-item-result', (_e, { id, status, reviewedByName, reviewedByRole, reviewedAt, managerNote }) => {
  getDb().prepare('UPDATE item_results SET status=?, reviewed_by_name=?, reviewed_by_role=?, reviewed_at=?, manager_note=? WHERE id=?').run(status, reviewedByName, reviewedByRole, reviewedAt, managerNote, id);
});
ipcMain.handle('get-item-results', (_e, filters) => {
  let sql = 'SELECT * FROM item_results WHERE 1=1'; const params = [];
  if (filters?.sessionId) { sql += ' AND session_id = ?'; params.push(filters.sessionId); }
  if (filters?.resultType) { sql += ' AND result_type = ?'; params.push(filters.resultType); }
  if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
  sql += ' ORDER BY recorded_at DESC LIMIT 500';
  return getDb().prepare(sql).all(...params);
});
ipcMain.handle('get-auth-events', (_e, limit = 200) => getDb().prepare('SELECT * FROM auth_events ORDER BY timestamp DESC LIMIT ?').all(limit));
ipcMain.handle('get-stats', () => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  return {
    sessionsToday: db.prepare("SELECT COUNT(*) as c FROM sessions WHERE started_at LIKE ?").get(`${today}%`).c,
    itemsToday: db.prepare("SELECT COUNT(*) as c FROM item_results WHERE recorded_at LIKE ?").get(`${today}%`).c,
    pending: db.prepare("SELECT COUNT(*) as c FROM item_results WHERE status = 'pending'").get().c,
    matchToday: db.prepare("SELECT COUNT(*) as c FROM item_results WHERE recorded_at LIKE ? AND result_type = 'match'").get(`${today}%`).c,
    systemToday: db.prepare("SELECT COUNT(*) as c FROM item_results WHERE recorded_at LIKE ? AND result_type = 'system_transfer'").get(`${today}%`).c,
    physicalToday: db.prepare("SELECT COUNT(*) as c FROM item_results WHERE recorded_at LIKE ? AND result_type = 'physical_transfer'").get(`${today}%`).c
  };
});
ipcMain.handle('export-xlsx', async (_e, { rows, sheetName, defaultPath }) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultPath || 'export.xlsx', filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
  if (result.canceled || !result.filePath) return { success: false };
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
  XLSX.writeFile(wb, result.filePath);
  return { success: true, path: result.filePath };
});
ipcMain.handle('select-excel-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }] });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});
ipcMain.handle('format-location', (_e, code) => {
  if (!code || code.length !== 8) return code || '';
  return `انبار ${code.slice(0, 2)} · اتاق ${code.slice(2, 4)} · رگال ${code.slice(4, 6)} · ردیف ${code.slice(6, 8)}`;
});
