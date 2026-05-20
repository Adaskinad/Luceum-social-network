const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const db = require('./database');
const { verifyToken } = require('./auth');

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const groupRoutes = require('./routes/groups');
const userRoutes = require('./routes/users');
const commentRoutes = require('./routes/comments');
const chatRoutes = require('./routes/chat');
const blogRoutes = require('./routes/blogs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/users', userRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/blogs', blogRoutes);

// WebSocket для чатов
const roomUsers = {}; // { roomId: [userId] }

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log('Пользователь подключился:', socket.userId);
  
  socket.on('join_chat', (roomId) => {
    socket.join(`chat_${roomId}`);
    if (!roomUsers[roomId]) roomUsers[roomId] = [];
    if (!roomUsers[roomId].includes(socket.userId)) {
      roomUsers[roomId].push(socket.userId);
    }
    io.to(`chat_${roomId}`).emit('online_count', roomUsers[roomId].length);
  });
  
  socket.on('leave_chat', (roomId) => {
    socket.leave(`chat_${roomId}`);
    if (roomUsers[roomId]) {
      roomUsers[roomId] = roomUsers[roomId].filter(id => id !== socket.userId);
      io.to(`chat_${roomId}`).emit('online_count', roomUsers[roomId].length);
    }
  });
  
  socket.on('chat_message', async (data) => {
    const { roomId, text } = data;
    
    db.run(
      'INSERT INTO chat_messages (room_id, user_id, text) VALUES (?, ?, ?)',
      [roomId, socket.userId, text],
      function(err) {
        if (!err) {
          db.get('SELECT name FROM users WHERE id = ?', [socket.userId], (err, user) => {
            const messageData = {
              id: this.lastID,
              roomId,
              userId: socket.userId,
              userName: user?.name || 'Unknown',
              text,
              createdAt: new Date()
            };
            io.to(`chat_${roomId}`).emit('chat_message', messageData);
          });
        }
      }
    );
  });
  
  socket.on('disconnect', () => {
    console.log('Пользователь отключился:', socket.userId);
    for (const roomId in roomUsers) {
      roomUsers[roomId] = roomUsers[roomId].filter(id => id !== socket.userId);
      io.to(`chat_${roomId}`).emit('online_count', roomUsers[roomId].length);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});