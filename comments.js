const express = require('express');
const db = require('../database');
const { verifyToken } = require('../auth');

const router = express.Router();

// Добавить комментарий (с поддержкой ответов)
router.post('/', verifyToken, (req, res) => {
  const { text, postId, parentCommentId } = req.body;
  if (!text || !postId) {
    return res.status(400).json({ error: 'Текст и ID поста обязательны' });
  }
  
  db.run(
    'INSERT INTO comments (text, post_id, user_id, parent_comment_id) VALUES (?, ?, ?, ?)',
    [text, postId, req.user.id, parentCommentId || null],
    function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.status(201).json({ id: this.lastID, message: 'Комментарий добавлен' });
    }
  );
});

// Получить комментарии поста (с вложенной структурой)
router.get('/post/:postId', verifyToken, (req, res) => {
  db.all(
    `SELECT c.*, u.name as user_name, u.avatar,
      (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as likes_count,
      (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?) as user_liked
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC`,
    [req.user.id, req.params.postId],
    (err, comments) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      
      // Построение дерева комментариев
      const commentMap = {};
      const roots = [];
      
      comments.forEach(comment => {
        comment.replies = [];
        commentMap[comment.id] = comment;
      });
      
      comments.forEach(comment => {
        if (comment.parent_comment_id && commentMap[comment.parent_comment_id]) {
          commentMap[comment.parent_comment_id].replies.push(comment);
        } else {
          roots.push(comment);
        }
      });
      
      res.json(roots);
    }
  );
});

// Лайкнуть комментарий
router.post('/:id/like', verifyToken, (req, res) => {
  const commentId = req.params.id;
  
  db.get(
    'SELECT * FROM comment_likes WHERE comment_id = ? AND user_id = ?',
    [commentId, req.user.id],
    (err, existing) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      
      if (existing) {
        db.run(
          'DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?',
          [commentId, req.user.id],
          (err) => {
            if (err) return res.status(500).json({ error: 'Ошибка сервера' });
            res.json({ message: 'Лайк удалён' });
          }
        );
      } else {
        db.run(
          'INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)',
          [commentId, req.user.id],
          (err) => {
            if (err) return res.status(500).json({ error: 'Ошибка сервера' });
            res.json({ message: 'Лайк добавлен' });
          }
        );
      }
    }
  );
});

// Удалить комментарий
router.delete('/:id', verifyToken, (req, res) => {
  db.get('SELECT user_id FROM comments WHERE id = ?', [req.params.id], (err, comment) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (!comment) return res.status(404).json({ error: 'Комментарий не найден' });
    
    if (comment.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет прав для удаления' });
    }
    
    db.run('DELETE FROM comments WHERE id = ?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json({ message: 'Комментарий удалён' });
    });
  });
});

module.exports = router;