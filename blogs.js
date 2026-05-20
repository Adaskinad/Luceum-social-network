const express = require('express');
const db = require('../database');
const { verifyToken } = require('../auth');

const router = express.Router();

// Получить все блоги
router.get('/', verifyToken, (req, res) => {
  db.all(
    `SELECT b.*, u.name as owner_name, u.avatar,
      (SELECT COUNT(*) FROM blog_subscribers WHERE blog_id = b.id) as subscribers_count,
      (SELECT COUNT(*) FROM blog_subscribers WHERE blog_id = b.id AND user_id = ?) as is_subscribed
    FROM blogs b
    JOIN users u ON b.owner_id = u.id
    ORDER BY b.created_at DESC`,
    [req.user.id],
    (err, blogs) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json(blogs || []);
    }
  );
});

// Получить блог пользователя
router.get('/user/:userId', verifyToken, (req, res) => {
  db.get(
    `SELECT b.*, u.name as owner_name, u.avatar,
      (SELECT COUNT(*) FROM blog_subscribers WHERE blog_id = b.id) as subscribers_count,
      (SELECT COUNT(*) FROM blog_subscribers WHERE blog_id = b.id AND user_id = ?) as is_subscribed
    FROM blogs b
    JOIN users u ON b.owner_id = u.id
    WHERE b.owner_id = ?`,
    [req.user.id, req.params.userId],
    (err, blog) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json(blog);
    }
  );
});

// Создать блог
router.post('/', verifyToken, (req, res) => {
  const { title, description } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Название блога обязательно' });
  }
  
  // Проверяем, нет ли уже блога у пользователя
  db.get('SELECT id FROM blogs WHERE owner_id = ?', [req.user.id], (err, existing) => {
    if (existing) {
      return res.status(400).json({ error: 'У вас уже есть блог' });
    }
    
    db.run(
      'INSERT INTO blogs (title, description, owner_id) VALUES (?, ?, ?)',
      [title, description, req.user.id],
      function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        res.status(201).json({ id: this.lastID, message: 'Блог создан' });
      }
    );
  });
});

// Подписаться на блог
router.post('/:blogId/subscribe', verifyToken, (req, res) => {
  db.run(
    'INSERT OR IGNORE INTO blog_subscribers (blog_id, user_id) VALUES (?, ?)',
    [req.params.blogId, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json({ message: 'Вы подписались на блог' });
    }
  );
});

// Отписаться от блога
router.delete('/:blogId/subscribe', verifyToken, (req, res) => {
  db.run(
    'DELETE FROM blog_subscribers WHERE blog_id = ? AND user_id = ?',
    [req.params.blogId, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json({ message: 'Вы отписались от блога' });
    }
  );
});

// Получить посты блога
router.get('/:blogId/posts', verifyToken, (req, res) => {
  db.all(
    `SELECT bp.*, 
      (SELECT COUNT(*) FROM blog_post_likes WHERE post_id = bp.id) as likes_count,
      (SELECT COUNT(*) FROM blog_post_likes WHERE post_id = bp.id AND user_id = ?) as user_liked
    FROM blog_posts bp
    WHERE bp.blog_id = ?
    ORDER BY bp.created_at DESC`,
    [req.user.id, req.params.blogId],
    (err, posts) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json(posts || []);
    }
  );
});

// Создать пост в блоге (только владелец)
router.post('/:blogId/posts', verifyToken, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Заголовок и содержание обязательны' });
  }
  
  // Проверяем, владелец ли блога
  db.get('SELECT owner_id FROM blogs WHERE id = ?', [req.params.blogId], (err, blog) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (!blog) return res.status(404).json({ error: 'Блог не найден' });
    if (blog.owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Только владелец блога может писать посты' });
    }
    
    db.run(
      'INSERT INTO blog_posts (blog_id, title, content) VALUES (?, ?, ?)',
      [req.params.blogId, title, content],
      function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        res.status(201).json({ id: this.lastID, message: 'Пост создан' });
      }
    );
  });
});

// Лайкнуть пост блога
router.post('/posts/:postId/like', verifyToken, (req, res) => {
  const postId = req.params.postId;
  
  db.get(
    'SELECT * FROM blog_post_likes WHERE post_id = ? AND user_id = ?',
    [postId, req.user.id],
    (err, existing) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      
      if (existing) {
        db.run(
          'DELETE FROM blog_post_likes WHERE post_id = ? AND user_id = ?',
          [postId, req.user.id],
          (err) => {
            if (err) return res.status(500).json({ error: 'Ошибка сервера' });
            res.json({ message: 'Лайк удалён' });
          }
        );
      } else {
        db.run(
          'INSERT INTO blog_post_likes (post_id, user_id) VALUES (?, ?)',
          [postId, req.user.id],
          (err) => {
            if (err) return res.status(500).json({ error: 'Ошибка сервера' });
            res.json({ message: 'Лайк добавлен' });
          }
        );
      }
    }
  );
});

// Получить комментарии к посту блога
router.get('/posts/:postId/comments', verifyToken, (req, res) => {
  db.all(
    `SELECT bc.*, u.name as user_name, u.avatar
    FROM blog_comments bc
    JOIN users u ON bc.user_id = u.id
    WHERE bc.post_id = ?
    ORDER BY bc.created_at ASC`,
    [req.params.postId],
    (err, comments) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json(comments || []);
    }
  );
});

// Добавить комментарий к посту блога
router.post('/posts/:postId/comments', verifyToken, (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Текст комментария обязателен' });
  }
  
  db.run(
    'INSERT INTO blog_comments (post_id, user_id, text) VALUES (?, ?, ?)',
    [req.params.postId, req.user.id, text],
    function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.status(201).json({ id: this.lastID, message: 'Комментарий добавлен' });
    }
  );
});

// Удалить комментарий
router.delete('/comments/:commentId', verifyToken, (req, res) => {
  db.get('SELECT user_id FROM blog_comments WHERE id = ?', [req.params.commentId], (err, comment) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (!comment) return res.status(404).json({ error: 'Комментарий не найден' });
    
    if (comment.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет прав для удаления' });
    }
    
    db.run('DELETE FROM blog_comments WHERE id = ?', [req.params.commentId], (err) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json({ message: 'Комментарий удалён' });
    });
  });
});

module.exports = router;