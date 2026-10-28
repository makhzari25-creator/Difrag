const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { getDataDir, initDb, getDb, backupDb, BUILD_ID, uuidv4 } = require('./db');
const pino = require('pino');

const isDev = !app.isPackaged;
let mainWindow = null;
let logger;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.error('یک نسخه دیگر از برنامه باز است');
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  try {
    dialog.showMessageBoxSync({ type: 'info', title: 'دیفرگ', message: 'یک نسخه دیگر از برنامه باز است', buttons: ['باشه'] });
  } catch (_) {}
});

function createLogger() {
  const dataDir = getDataDir();
  const logPath = path.join(dataDir, 'logs', `difrag-${new Date().toISOString().slice(0, 10)}.log`);
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size === 0) {
      fs.writeFileSync(logPath, `[Difrag Build ${BUILD_ID}]\n`, 'utf8');
    }
  } catch (_) {}
  const log = pino(
    { level: 'info', timestamp: pino.stdTimeFunctions.isoTime, base: null },
    pino.destination({ dest: logPath, sync: false, append: true })
  );
  log.info({ buildId: BUILD_ID }, 'App starting');
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
  getDataDir();
  logger = createLogger();
  initDb();
  backupDb();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => {
  try { getDb().prepare("UPDATE sessions SET status = 'paused' WHERE status = 'active'").run(); } catch (_) {}
  if (logger) logger.info('App closing');
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('get-data-dir', () => getDataDir());
ipcMain.handle('get-build-id', () => BUILD_ID);
ipcMain.handle('log', (_e, level, msg, meta) => {
  if (logger) logger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](meta || {}, msg);
});

ipcMain.handle('upsert-user', (_e, profile) => {
  const db = getDb();
  const now = new Date().toISOString();
  let user = db.prepare('SELECT * FROM users WHERE full_name = ? AND device_id = ?').get(profile.fullName, profile.deviceId);
  if (user) {
    db.prepare('UPDATE users SET is_manager = ?, last_seen_at = ? WHERE id = ?').run(profile.isManager ? 1 : 0, now, user.id);
    user.is_manager = profile.isManager ? 1 : 0;
  } else {
    const info = db.prepare('INSERT INTO users (full_name, is_manager, first_seen_at, last_seen_at, device_id) VALUES (?,?,?,?,?)')
      .run(profile.fullName, profile.isManager ? 1 : 0, now, now, profile.deviceId);
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
  const warnings = [];
  if (!raw || raw === '_' || String(raw).trim() === '') {
    return { locations: [], warnings, effectiveQty: totalQty };
  }
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length > 2) warnings.push({ type: 'too_many_parts', message: `بیش از دو قطعه مکان: ${raw}` });
  const parsed = [];
  for (const part of parts) {
    const m = part.match(/^(\d{8})\s*(?:\((\d+)\))?$/);
    if (!m) { warnings.push({ type: 'bad_location', message: `فرمت مکان نامعتبر: ${part}` }); continue; }
    parsed.push({ code: m[1], qty: m[2] != null ? parseInt(m[2], 10) : null });
  }
  if (!parsed.length) return { locations: [], warnings, effectiveQty: totalQty };
  const use = parsed.slice(0, 2);
  const locations = [];
  const withQty = use.filter(p => p.qty != null);
  if (use.length === 1) {
    locations.push({ code: use[0].code, expectedQty: withQty.length ? withQty[0].qty : totalQty });
    return { locations, warnings, effectiveQty: totalQty };
  }
  if (withQty.length === 0) {
    locations.push({ code: use[0].code, expectedQty: totalQty });
    locations.push({ code: use[1].code, expectedQty: 0 });
    warnings.push({ type: 'no_split', message: 'ردیف بدون تفکیک در ستون مکان' });
    return { locations, warnings, effectiveQty: totalQty };
  }
  if (withQty.length === 1) {
    const known = withQty[0];
    const other = use.find(p => p.code !== known.code);
    locations.push({ code: known.code, expectedQty: known.qty });
    locations.push({ code: other.code, expectedQty: Math.max(0, totalQty - known.qty) });
    return { locations, warnings, effectiveQty: totalQty };
  }
  let sum = 0;
  for (const p of use) {
    const q = p.qty != null ? p.qty : 0;
    locations.push({ code: p.code, expectedQty: q });
    sum += q;
  }
  if (sum !== totalQty) {
    warnings.push({ type: 'sum_mismatch', message: 'جمع تفکیک‌ها با موجودی کل برابر نیست' });
    return { locations, warnings, effectiveQty: sum };
  }
  return { locations, warnings, effectiveQty: totalQty };
}

function parseExcelFile(filePath) {
  const warnings = [];
  const workbook = XLSX.readFile(filePath, { cellDates: false, raw: false });
  const sheetName = workbook.SheetNames.includes('SheetFilter') ? 'SheetFilter' : workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
  if (!rows.length) return { success: false, errors: ['فایل خالی است'], products: [], summary: null };
  let startIdx = 0;
  const first = rows[0] || [];
  const b0 = String(first[1] || '').trim().toLowerCase();
  if (b0.includes('barcode') || b0.includes('بارکد') || (b0 === '' && String(first[5] || '').toLowerCase().includes('name'))) startIdx = 1;
  const dataRows = rows.slice(startIdx);
  if (!dataRows.length) return { success: false, errors: ['فایل فاقد ردیف داده است'], products: [], summary: null };
  const maxCols = Math.max(...dataRows.map(r => (r && r.length) || 0));
  if (maxCols < 18) {
    return { success: false, errors: ['ساختار فایل ناقص است. ستون‌های B,C,D,F,L,Q,R,U لازم‌اند.'], products: [], summary: null };
  }
  const col = { barcode: 1, size: 2, warehouseQty: 3, fullName: 5, color: 11, gender: 16, isActive: 17, locations: 20 };
  const products = [];
  const barcodeMap = new Map();
  const duplicateBarcodes = [];
  let emptyBarcodeCount = 0, multiLocationRows = 0, inactiveCount = 0, activeCount = 0;
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i] || [];
    const barcode = String(r[col.barcode] ?? '').trim();
    if (!barcode) { emptyBarcodeCount++; continue; }
    if (barcodeMap.has(barcode)) { if (!duplicateBarcodes.includes(barcode)) duplicateBarcodes.push(barcode); continue; }
    barcodeMap.set(barcode, i);
    const isActiveRaw = String(r[col.isActive] ?? '').trim();
    const isActive = isActiveRaw === 'True' || isActiveRaw === 'true' || isActiveRaw === '1';
    let qty = parseInt(String(r[col.warehouseQty] ?? '').trim(), 10);
    if (Number.isNaN(qty)) {
      qty = 0;
      warnings.push({ type: 'non_int', message: `مقدار غیرصحیح در ستون D برای بارکد ${barcode} به صفر تبدیل شد`, barcode });
    }
    const rawLoc = String(r[col.locations] ?? '').trim();
    const { locations, warnings: locWarns, effectiveQty } = parseLocationCell(rawLoc, qty);
    for (const w of locWarns) warnings.push({ ...w, barcode });
    if (locations.length > 1) multiLocationRows++;
    if (isActive) activeCount++; else inactiveCount++;
    products.push({
      barcode, size: String(r[col.size] ?? '').trim(), fullName: String(r[col.fullName] ?? '').trim(),
      color: String(r[col.color] ?? '').trim(), gender: String(r[col.gender] ?? '').trim(),
      isActive, excelReferenceQty: qty, effectiveReferenceQty: effectiveQty,
      locationCount: locations.length, rawLocations: rawLoc, locations
    });
  }
  if (emptyBarcodeCount) warnings.push({ type: 'empty_barcode', message: `${emptyBarcodeCount} ردیف بدون بارکد نادیده گرفته شد` });
  if (duplicateBarcodes.length) {
    return {
      success: false,
      errors: [`بارکد تکراری یافت شد: ${duplicateBarcodes.slice(0, 20).join(', ')}`],
      products: [],
      summary: { totalRows: dataRows.length, activeRows: 0, inactiveRows: 0, uniqueSkus: 0, locationCount: 0, multiLocationRows: 0, warnings, errors: [`بارکدهای تکراری: ${duplicateBarcodes.join(', ')}`], duplicateBarcodes }
    };
  }
  const locationSet = new Set();
  for (const p of products) { if (p.isActive) for (const loc of p.locations) locationSet.add(loc.code); }
  return {
    success: true, products, errors: [],
    summary: { totalRows: dataRows.length, activeRows: activeCount, inactiveRows: inactiveCount, uniqueSkus: products.length, locationCount: locationSet.size, multiLocationRows, warnings, errors: [], sheetName }
  };
}

ipcMain.handle('validate-excel', async (_e, { filePath }) => {
  try {
    const result = parseExcelFile(filePath);
    return { success: result.success, summary: result.summary, errors: result.errors || [] };
  } catch (err) {
    if (logger) logger.error(err, 'validate-excel failed');
    return { success: false, errors: [String(err.message || err)], summary: null };
  }
});

ipcMain.handle('import-excel', async (_e, { filePath, uploadedBy, confirm }) => {
  const db = getDb();
  const dataDir = getDataDir();
  try {
    const parsed = parseExcelFile(filePath);
    if (!parsed.success) return { success: false, errors: parsed.errors, summary: parsed.summary };
    if (!confirm) return { success: true, needsConfirm: true, summary: parsed.summary, errors: [] };
    const products = parsed.products;
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(products.map(p => p.barcode + '|' + p.excelReferenceQty + '|' + p.effectiveReferenceQty + '|' + p.isActive)))
      .digest('hex').slice(0, 16);
    const filename = path.basename(filePath);
    const now = new Date().toISOString();
    const versionId = db.transaction(() => {
      const versionInfo = db.prepare('INSERT INTO excel_versions (file_path, uploaded_by, uploaded_at, row_count, sheet_hash, filename) VALUES (?,?,?,?,?,?)')
        .run('', uploadedBy || '', now, products.length, hash, filename);
      const vid = versionInfo.lastInsertRowid;
      const destPath = path.join(dataDir, 'excel', `v${vid}-${hash}.xlsx`);
      fs.copyFileSync(filePath, destPath);
      db.prepare('UPDATE excel_versions SET file_path = ? WHERE id = ?').run(destPath, vid);
      const insertProduct = db.prepare(`INSERT INTO products (
        excel_version_id, barcode, size, full_name, color, gender, is_active,
        excel_reference_qty, effective_reference_qty, location_count, raw_locations
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      const insertLoc = db.prepare('INSERT INTO product_locations (product_id, location_code, expected_qty) VALUES (?,?,?)');
      for (const p of products) {
        const info = insertProduct.run(vid, p.barcode, p.size, p.fullName, p.color, p.gender, p.isActive ? 1 : 0,
          p.excelReferenceQty, p.effectiveReferenceQty, p.locationCount, p.rawLocations);
        for (const loc of p.locations) insertLoc.run(info.lastInsertRowid, loc.code, loc.expectedQty);
      }
      return vid;
    })();
    if (logger) logger.info({ versionId, count: products.length }, 'Excel imported');
    backupDb();
    return { success: true, versionId, summary: parsed.summary, errors: [] };
  } catch (err) {
    if (logger) logger.error(err, 'Import failed');
    return { success: false, errors: [String(err.message || err)] };
  }
});

ipcMain.handle('get-active-excel', () => getDb().prepare('SELECT * FROM excel_versions ORDER BY id DESC LIMIT 1').get() || null);
ipcMain.handle('get-locations', (_e, versionId) => getDb().prepare(
  `SELECT pl.location_code, COUNT(DISTINCT p.id) as product_count, SUM(pl.expected_qty) as expected_units
   FROM product_locations pl JOIN products p ON p.id = pl.product_id
   WHERE p.excel_version_id = ? AND p.is_active = 1 GROUP BY pl.location_code ORDER BY pl.location_code`
).all(versionId));

ipcMain.handle('get-product-by-barcode', (_e, { barcode, versionId }) => {
  const p = getDb().prepare('SELECT * FROM products WHERE barcode = ? AND excel_version_id = ?').get(barcode, versionId);
  if (!p) return null;
  const locations = getDb().prepare('SELECT * FROM product_locations WHERE product_id = ?').all(p.id);
  return {
    id: p.id, excelVersionId: p.excel_version_id, barcode: p.barcode, size: p.size, fullName: p.full_name,
    color: p.color, gender: p.gender, isActive: !!p.is_active, excelReferenceQty: p.excel_reference_qty,
    effectiveReferenceQty: p.effective_reference_qty != null ? p.effective_reference_qty : p.excel_reference_qty,
    locationCount: p.location_count, rawLocations: p.raw_locations,
    locations: locations.map(l => ({ id: l.id, productId: l.product_id, locationCode: l.location_code, expectedQty: l.expected_qty }))
  };
});

ipcMain.handle('create-session', (_e, data) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  getDb().prepare('INSERT INTO sessions (id, location_code, started_by_user_id, started_by_name, started_by_role, started_at, ended_at, status, excel_version_id) VALUES (?,?,?,?,?,?,NULL,?,?)')
    .run(id, data.locationCode, data.userId, data.userName, data.userRole, now, 'active', data.excelVersionId);
  return { id, startedAt: now };
});
ipcMain.handle('update-session', (_e, { id, status, endedAt }) => {
  getDb().prepare('UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?').run(status, endedAt || null, id);
});
ipcMain.handle('get-sessions', (_e, filters) => {
  let sql = 'SELECT * FROM sessions WHERE 1=1'; const params = [];
  if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters?.userId) { sql += ' AND started_by_user_id = ?'; params.push(filters.userId); }
  sql += ' ORDER BY started_at DESC LIMIT 200';
  return getDb().prepare(sql).all(...params);
});
ipcMain.handle('get-active-session-for-user', (_e, userId) =>
  getDb().prepare("SELECT * FROM sessions WHERE started_by_user_id = ? AND status IN ('active','paused') ORDER BY started_at DESC LIMIT 1").get(userId));
ipcMain.handle('get-sessions-for-location', (_e, locationCode) =>
  getDb().prepare("SELECT * FROM sessions WHERE location_code = ? AND status IN ('active','paused') ORDER BY started_at DESC").all(locationCode));

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
  getDb().prepare('UPDATE item_results SET status=?, reviewed_by_name=?, reviewed_by_role=?, reviewed_at=?, manager_note=? WHERE id=?')
    .run(status, reviewedByName, reviewedByRole, reviewedAt, managerNote, id);
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
