const express = require('express');
const db = require('../database');
const { verifyToken } = require('../auth');

const router = express.Router();

router.get('/', verifyToken, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  db.all(
    `SELECT p.*, u.name as author_name, g.name as group_name 
     FROM posts p
     JOIN users u ON p.author_id = u.id
     JOIN groups g ON p.group_id = g.id
     JOIN group_members gm ON g.id = gm.group_id
     WHERE gm.user_id = ?
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, limit, offset],
    (err, posts) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      
      db.get(
        `SELECT COUNT(*) as total FROM posts p
         JOIN group_members gm ON p.group_id = gm.group_id
         WHERE gm.user_id = ?`,
        [req.user.id],
        (err, count) => {
          res.json({
            posts,
            pagination: {
              page,
              limit,
              total: count?.total || 0,
              pages: Math.ceil((count?.total || 0) / limit)
            }
          });
        }
      );
    }
  );
});

router.post('/', verifyToken, (req, res) => {
  const { content, groupId } = req.body;
  if (!content || !groupId) {
    return res.status(400).json({ error: 'Содержание и группа обязательны' });
  }
  
  db.get(
    'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, req.user.id],
    (err, member) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      if (!member) return res.status(403).json({ error: 'Вы не являетесь участником этой группы' });
      
      db.run(
        'INSERT INTO posts (content, author_id, group_id) VALUES (?, ?, ?)',
        [content, req.user.id, groupId],
        function(err) {
          if (err) return res.status(500).json({ error: 'Ошибка сервера' });
          res.status(201).json({ id: this.lastID, message: 'Пост создан' });
        }
      );
    }
  );
});

router.delete('/:id', verifyToken, (req, res) => {
  const postId = req.params.id;
  
  db.get('SELECT author_id FROM posts WHERE id = ?', [postId], (err, post) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (!post) return res.status(404).json({ error: 'Пост не найден' });
    
    if (post.author_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет прав для удаления' });
    }
    
    db.run('DELETE FROM posts WHERE id = ?', [postId], (err) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json({ message: 'Пост удалён' });
    });
  });
});

router.post('/:id/like', verifyToken, (req, res) => {
  db.run('UPDATE posts SET likes = likes + 1 WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    res.json({ message: 'Лайк добавлен' });
  });
});

module.exports = router;