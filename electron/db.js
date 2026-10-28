const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { v4: uuidv4 } = require('uuid');
const BUILD_ID = '4821';

function getDataDir() {
  const dir = path.join(app.getPath('appData'), 'Difrag');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const sub of ['logs', 'excel', 'backups']) {
    const p = path.join(dir, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
  const buildIdPath = path.join(dir, 'build.id');
  if (!fs.existsSync(buildIdPath)) fs.writeFileSync(buildIdPath, BUILD_ID, 'utf8');
  return dir;
}

let db;
function initDb() {
  const dataDir = getDataDir();
  db = new Database(path.join(dataDir, 'difrag.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS excel_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT, uploaded_by TEXT,
      uploaded_at TEXT, row_count INTEGER, sheet_hash TEXT, filename TEXT);
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT, excel_version_id INTEGER, barcode TEXT,
      size TEXT, full_name TEXT, color TEXT, gender TEXT, is_active INTEGER,
      excel_reference_qty INTEGER, effective_reference_qty INTEGER, location_count INTEGER, raw_locations TEXT);
    CREATE TABLE IF NOT EXISTS product_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, location_code TEXT,
      expected_qty INTEGER, UNIQUE(product_id, location_code));
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT, is_manager INTEGER,
      first_seen_at TEXT, last_seen_at TEXT, device_id TEXT);
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, location_code TEXT, started_by_user_id INTEGER,
      started_by_name TEXT, started_by_role TEXT, started_at TEXT, ended_at TEXT,
      status TEXT, excel_version_id INTEGER);
    CREATE TABLE IF NOT EXISTS scan_events (
      id TEXT PRIMARY KEY, session_id TEXT, barcode TEXT, product_id INTEGER,
      action TEXT, qty_delta INTEGER, user_id INTEGER, user_full_name TEXT,
      user_role TEXT, timestamp TEXT, device_id TEXT, note TEXT, scan_method TEXT);
    CREATE TABLE IF NOT EXISTS item_results (
      id TEXT PRIMARY KEY, session_id TEXT, barcode TEXT, product_id INTEGER,
      excel_reference_qty INTEGER, physical_qty INTEGER, diff INTEGER, result_type TEXT,
      user_id INTEGER, user_full_name TEXT, user_role TEXT, recorded_at TEXT,
      status TEXT, reviewed_by_name TEXT, reviewed_by_role TEXT, reviewed_at TEXT, manager_note TEXT);
    CREATE TABLE IF NOT EXISTS auth_events (
      id TEXT PRIMARY KEY, user_id INTEGER, full_name TEXT, is_manager INTEGER,
      type TEXT, timestamp TEXT, device_id TEXT, detail TEXT);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_pl_location ON product_locations(location_code);
    CREATE INDEX IF NOT EXISTS idx_scan_session ON scan_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_results_session ON item_results(session_id);
  `);
  // Compatible migration: add effective_reference_qty if missing on existing DBs
  try {
    const cols = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
    if (!cols.includes('effective_reference_qty')) {
      db.exec('ALTER TABLE products ADD COLUMN effective_reference_qty INTEGER');
      db.exec('UPDATE products SET effective_reference_qty = excel_reference_qty WHERE effective_reference_qty IS NULL');
    }
  } catch (_) {}
  return db;
}
function getDb() { if (!db) initDb(); return db; }
function backupDb() {
  try {
    const dataDir = getDataDir();
    const backupsDir = path.join(dataDir, 'backups');
    const date = new Date().toISOString().slice(0, 10);
    const dest = path.join(backupsDir, `difrag-${date}.db`);
    // Consistent snapshot even with WAL (a plain file copy can miss -wal data)
    if (!fs.existsSync(dest)) getDb().exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(backupsDir).filter(x => x.startsWith('difrag-') && x.endsWith('.db'))) {
      const p = path.join(backupsDir, f);
      if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
    }
  } catch (e) { console.error('Backup failed', e); }
}
module.exports = { getDataDir, initDb, getDb, backupDb, BUILD_ID, uuidv4 };
