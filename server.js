const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Use Render's assigned port
const PORT = process.env.PORT || 10000;

// Define upload directory (will be symlinked to /var/render/data/uploads)
const uploadDir = path.join(__dirname, 'uploads');

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static(uploadDir)); // Serves uploaded files

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Files saved to ./uploads (symlinked)
  },
  filename: (req, file, cb) => {
    // Create unique filename to avoid conflicts
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 40 * 1024 * 1024 }, // 40MB limit
  fileFilter: (req, file, cb) => {
    // Accept all file types
    cb(null, true);
  }
});

// API: Get all non-expired messages for a room
app.get('/messages', (req, res) => {
  const room = req.query.room || 'general';
  const sql = `
    SELECT * FROM messages 
    WHERE room = ? AND expiresAt > CURRENT_TIMESTAMP 
    ORDER BY timestamp ASC
  `;
  db.all(sql, [room], (err, rows) => {
    if (err) {
      console.error('DB Error (GET /messages):', err.message);
      return res.status(500).json({ error: 'Failed to load messages' });
    }
    res.json(rows);
  });
});

// API: Upload a file
app.post('/upload', upload.single('file'), (req, res) => {
  const { username, room } = req.body;
  const file = req.file;

  if (!username || !room || !file) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Determine file type for frontend rendering
  let type = 'file';
  if (file.mimetype.startsWith('image/')) type = 'image';
  else if (file.mimetype.startsWith('audio/')) type = 'audio';

  // Save relative path (served via /uploads)
  const filePath = `/uploads/${file.filename}`;

  // Insert into database
  const stmt = db.prepare(`
    INSERT INTO messages (username, room, type, content) VALUES (?, ?, ?, ?)
  `);
  stmt.run(username, room, type, filePath, function (err) {
    if (err) {
      console.error('DB Insert Error:', err.message);
      return res.status(500).json({ error: 'Failed to save file record' });
    }

    // Create message object
    const message = {
      id: this.lastID,
      username,
      room,
      type,
      content: filePath,
      timestamp: new Date().toISOString()
    };

    // Broadcast to all users in the room
    io.to(room).emit('new message', message);

    // Send success response
    res.json(message);
  });
  stmt.finalize();
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('✅ New user connected:', socket.id);

  // Handle joining a room
  socket.on('join room', (data) => {
    const { username, room } = data;
    if (!username || !room) return;

    // Leave previous room (if any)
    const prevRoom = socket.currentRoom;
    if (prevRoom) {
      socket.leave(prevRoom);
    }

    // Join new room
    socket.join(room);
    socket.currentRoom = room;

    // Send all non-expired messages in the room
    const sql = `
      SELECT * FROM messages 
      WHERE room = ? AND expiresAt > CURRENT_TIMESTAMP 
      ORDER BY timestamp ASC
    `;
    db.all(sql, [room], (err, rows) => {
      if (err) {
        console.error('DB Query Error (join room):', err.message);
        return;
      }
      socket.emit('init messages', { room, messages: rows });
    });

    console.log(`👤 ${username} joined room: ${room}`);
  });

  // Handle sending a text message
  socket.on('send message', (data) => {
    const { username, room, content } = data;
    if (!username || !room || !content || typeof content !== 'string' || content.trim().length === 0) {
      return socket.emit('error', 'Invalid message');
    }

    const trimmedContent = content.trim();

    const stmt = db.prepare(`
      INSERT INTO messages (username, room, type, content) VALUES (?, ?, ?, ?)
    `);
    stmt.run(username, room, 'text', trimmedContent, function (err) {
      if (err) {
        console.error('DB Insert Error (text message):', err.message);
        return socket.emit('error', 'Failed to send message');
      }

      const message = {
        id: this.lastID,
        username,
        room,
        type: 'text',
        content: trimmedContent,
        timestamp: new Date().toISOString()
      };

      // Emit to all users in the room
      io.to(room).emit('new message', message);
    });
    stmt.finalize();
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${uploadDir}`);
  console.log(`🔗 Connect at: http://localhost:${PORT}`);
});

// Export server (for testing or integration if needed)
module.exports = server;