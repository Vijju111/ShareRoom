const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DATA_DIR = '/var/render/data';
const DB_PATH = path.join(DATA_DIR, 'messages.db');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

console.log('🔧 Using DB path:', DB_PATH);
console.log('📁 Uploads path:', UPLOAD_DIR);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Failed to open database:', err.message);
    return;
  }
  console.log('✅ Database connected successfully');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      room TEXT DEFAULT 'general',
      type TEXT,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME DEFAULT (datetime(CURRENT_TIMESTAMP, '+7 days'))
    )
  `, (err) => {
    if (err) {
      console.error('❌ Table creation failed:', err.message);
    } else {
      console.log('📋 Table "messages" is ready');
    }
  });

  db.run(`CREATE INDEX IF NOT EXISTS idx_room_expires ON messages(room, expiresAt)`);
});

// Auto-cleanup every hour
setInterval(() => {
  db.run(`DELETE FROM messages WHERE expiresAt < CURRENT_TIMESTAMP`, function (err) {
    if (err) console.error('🧹 Cleanup failed:', err);
    else if (this.changes > 0) console.log(`✅ Deleted ${this.changes} expired messages`);
  });

  db.all(`SELECT content FROM messages WHERE expiresAt < CURRENT_TIMESTAMP AND type IN ('image','audio','file')`, (err, rows) => {
    if (err) return console.error('🔍 Query failed:', err);
    rows.forEach(row => {
      const filePath = path.join(__dirname, row.content);
      fs.unlink(filePath, err => {
        if (err) console.error('❌ Failed to delete file:', filePath);
        else console.log('🗑️ Deleted expired file:', filePath);
      });
    });
  });
}, 60 * 60 * 1000);

module.exports = db;