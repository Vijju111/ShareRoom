const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'messages.db');
const db = new sqlite3.Database(dbPath);

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
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_room_expires ON messages(room, expiresAt)`);
});

setInterval(() => {
  db.run(`DELETE FROM messages WHERE expiresAt < CURRENT_TIMESTAMP`, function (err) {
    if (err) console.error('Cleanup failed:', err);
    else if (this.changes > 0) console.log(`🧹 Cleaned up ${this.changes} expired messages`);
  });

  const fs = require('fs');
  const uploadDir = path.join(__dirname, 'uploads');
  db.all(`SELECT content FROM messages WHERE expiresAt < CURRENT_TIMESTAMP AND type IN ('image','audio','file')`, [], (err, rows) => {
    if (err) return;
    rows.forEach(row => {
      const filePath = path.join(__dirname, row.content);
      fs.unlink(filePath, err => {
        if (err) console.error('Failed to delete file:', filePath);
        else console.log('🗑️ Deleted expired file:', filePath);
      });
    });
  });
}, 60 * 60 * 1000);

module.exports = db;