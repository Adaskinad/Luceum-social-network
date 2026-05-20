const express = require('express');
const db = require('../database');
const { verifyToken } = require('../auth');

const router = express.Router();

// Получить все чаты пользователя
router.get('/', verifyToken, (req, res) => {
  db.all(
    `SELECT cr.*, 
      (SELECT COUNT(*) FROM chat_members WHERE room_id = cr.id) as member_count
    FROM chat_rooms cr
    JOIN chat_members cm ON cr.id = cm.room_id
    WHERE cm.user_id = ?
    ORDER BY cr.created_at DESC`,
    [req.user.id],
    (err, rooms) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json(rooms || []);
    }
  );
});

// Получить сообщения чата
router.get('/:roomId/messages', verifyToken, (req, res) => {
  db.all(
    `SELECT cm.*, u.name as user_name, u.avatar
    FROM chat_messages cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.room_id = ?
    ORDER BY cm.created_at ASC`,
    [req.params.roomId],
    (err, messages) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json(messages || []);
    }
  );
});

// Создать чат
router.post('/', verifyToken, (req, res) => {
  const { name, description, memberIds } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Название чата обязательно' });
  }
  
  db.run(
    'INSERT INTO chat_rooms (name, description, created_by) VALUES (?, ?, ?)',
    [name, description, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      
      const roomId = this.lastID;
      
      // Добавляем создателя
      db.run('INSERT INTO chat_members (room_id, user_id) VALUES (?, ?)', [roomId, req.user.id]);
      
      // Добавляем остальных участников
      const members = memberIds || [];
      members.forEach(userId => {
        db.run('INSERT INTO chat_members (room_id, user_id) VALUES (?, ?)', [roomId, userId]);
      });
      
      res.status(201).json({ id: roomId, message: 'Чат создан' });
    }
  );
});

// Добавить участника в чат
router.post('/:roomId/members', verifyToken, (req, res) => {
  const { userId } = req.body;
  db.run(
    'INSERT OR IGNORE INTO chat_members (room_id, user_id) VALUES (?, ?)',
    [req.params.roomId, userId],
    function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json({ message: 'Участник добавлен' });
    }
  );
});

// Получить участников чата
router.get('/:roomId/members', verifyToken, (req, res) => {
  db.all(
    `SELECT u.id, u.name, u.avatar, u.class
    FROM chat_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.room_id = ?`,
    [req.params.roomId],
    (err, members) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json(members);
    }
  );
});

// Получить всех пользователей (для приглашений)
router.get('/users/all', verifyToken, (req, res) => {
  db.all(
    'SELECT id, name, email, avatar, class FROM users WHERE id != ?',
    [req.user.id],
    (err, users) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json(users);
    }
  );
});

module.exports = router;