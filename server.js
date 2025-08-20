const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
app.use(express.static('public'));
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ limits: { fileSize: 40 * 1024 * 1024 }, storage });

app.get('/messages', (req, res) => {
  const room = req.query.room || 'general';
  db.all('SELECT * FROM messages WHERE room = ? AND expiresAt > CURRENT_TIMESTAMP ORDER BY timestamp ASC', [room], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

app.post('/upload', upload.single('file'), (req, res) => {
  const { username, room } = req.body;
  const file = req.file;
  if (!username || !file || !room) return res.status(400).json({ error: 'Missing fields' });

  let type = 'file';
  if (file.mimetype.startsWith('image/')) type = 'image';
  else if (file.mimetype.startsWith('audio/')) type = 'audio';

  const filePath = `/uploads/${file.filename}`;

  const stmt = db.prepare(`INSERT INTO messages (username, room, type, content) VALUES (?, ?, ?, ?)`);
  stmt.run(username, room, type, filePath, function (err) {
    if (err) return res.status(500).json({ error: 'Save failed' });
    const message = { id: this.lastID, username, room, type, content: filePath, timestamp: new Date().toISOString() };
    io.to(room).emit('new message', message);
    res.json(message);
  });
  stmt.finalize();
});

io.on('connection', (socket) => {
  let currentRoom = '';
  socket.on('join room', (data) => {
    const { username, room } = data;
    if (!username || !room) return;
    if (currentRoom) socket.leave(currentRoom);
    currentRoom = room;
    socket.join(room);
    db.all('SELECT * FROM messages WHERE room = ? AND expiresAt > CURRENT_TIMESTAMP ORDER BY timestamp ASC', [room], (err, rows) => {
      if (!err) socket.emit('init messages', { room, messages: rows });
    });
  });
  socket.on('send message', (data) => {
    const { username, room, content } = data;
    if (!username || !room || !content || !content.trim()) return;
    const stmt = db.prepare(`INSERT INTO messages (username, room, type, content) VALUES (?, ?, ?, ?)`);
    stmt.run(username, room, 'text', content, function (err) {
      if (err) socket.emit('error', 'Send failed');
      else {
        const message = { id: this.lastID, username, room, type: 'text', content, timestamp: new Date().toISOString() };
        io.to(room).emit('new message', message);
      }
    });
    stmt.finalize();
  });
  socket.on('disconnect', () => console.log('User disconnected'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});