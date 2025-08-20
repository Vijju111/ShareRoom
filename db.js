const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Define paths
const DATA_DIR = '/var/data';
const DB_PATH = path.join(DATA_DIR, 'messages.db');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// ✅ Do NOT try to create /var/data — Render does it for you
// ✅ But ensure /var/data/uploads exists (Render doesn't auto-create subdirs)

if (!fs.existsSync(UPLOAD_DIR)) {
  console.log('📁 Creating /var/data/uploads...');
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    console.error('❌ Failed to create /var/data/uploads:', err.message);
    // If it fails, uploads will fail — but don't crash
  }
} else {
  console.log('📁 /var/data/uploads already exists');
}

// Log paths for debugging
console.log('🔧 Database path:', DB_PATH);
console.log('📄 DB file exists:', fs.existsSync(DB_PATH));

// Open database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Failed to open database:', err.message);
    return;
  }
  console.log('✅ Database connected successfully');
});

// Create table
db.serialize(() => {
  const createTableSQL = `
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

  db.run(createTableSQL, function (err) {
    if (err) {
      console.error('❌ Table creation failed:', err.message);
    } else {
      console.log('📋 Table "messages" is ready');
    }
  });

  db.run(`CREATE INDEX IF NOT EXISTS idx_room_expires ON messages(room, expiresAt)`);
});

// Auto-cleanup (every hour)
setInterval(() => {
  db.run(`DELETE FROM messages WHERE expiresAt < CURRENT_TIMESTAMP`, function (err) {
    if (err) {
      console.error('🧹 Cleanup failed:', err);
    } else if (this.changes > 0) {
      console.log(`✅ Deleted ${this.changes} expired messages`);
    }
  });

  db.all(`SELECT content FROM messages WHERE expiresAt < CURRENT_TIMESTAMP AND type IN ('image','audio','file')`, (err, rows) => {
    if (err) return console.error('🔍 Query failed:', err);
    rows.forEach(row => {
      const filePath = path.join(__dirname, row.content);
      fs.unlink(filePath, err => {
        if (err) {
          console.error('❌ Failed to delete file:', filePath, err.message);
        } else {
          console.log('🗑️ Deleted expired file:', filePath);
        }
      });
    });
  });
}, 60 * 60 * 1000);

module.exports = db;