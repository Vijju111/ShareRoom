const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Mounted volume path
const DATA_DIR = '/var/render/data';
const DB_PATH = path.join(DATA_DIR, 'messages.db');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// ✅ Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  console.error('❌ /var/render/data not mounted! Check render.yaml');
} else {
  console.log('📁 /var/render/data mounted');
  
  if (!fs.existsSync(UPLOAD_DIR)) {
    try {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      console.log('✅ Created /var/render/data/uploads');
    } catch (err) {
      console.error('❌ Failed to create uploads dir:', err.message);
    }
  }

  // Ensure DB file exists
  if (!fs.existsSync(DB_PATH)) {
    try {
      fs.closeSync(fs.openSync(DB_PATH, 'w'));
      console.log('✅ Created empty DB file');
    } catch (err) {
      console.error('❌ Failed to create DB file:', err.message);
    }
  }
}

console.log('🔧 Opening DB at:', DB_PATH);

// Open database
let db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Failed to open database:', err.message);
    return;
  }
  console.log('✅ Database opened successfully');
});

// Create table
db.serialize(() => {
  const sql = `
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      room TEXT DEFAULT 'general',
      type TEXT,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME DEFAULT (datetime(CURRENT_TIMESTAMP, '+7 days'))
    )
  `;
  db.run(sql, (err) => {
    if (err) {
      console.error('❌ Table creation failed:', err.message);
    } else {
      console.log('📋 Table "messages" is ready');
    }
  });

  db.run(`CREATE INDEX IF NOT EXISTS idx_room_expires ON messages(room, expiresAt)`);
});

// Cleanup every hour
setInterval(() => {
  db.run(`DELETE FROM messages WHERE expiresAt < CURRENT_TIMESTAMP`, function (err) {
    if (err) console.error('🧹 Cleanup failed:', err);
    else if (this.changes > 0) console.log(`✅ Deleted ${this.changes} expired messages`);
  });
}, 60 * 60 * 1000);

module.exports = db;