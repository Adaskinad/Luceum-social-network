const express = require('express');
const db = require('../database');
const { verifyToken } = require('../auth');

const router = express.Router();

router.get('/search', verifyToken, (req, res) => {
  const query = req.query.q || '';
  db.all(
    `SELECT id, name, email, class, avatar 
     FROM users 
     WHERE (name LIKE ? OR class LIKE ?) AND id != ?`,
    [`%${query}%`, `%${query}%`, req.user.id],
    (err, users) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json(users);
    }
  );
});

router.get('/profile', verifyToken, (req, res) => {
  db.get(
    'SELECT id, name, email, role, avatar, class FROM users WHERE id = ?',
    [req.user.id],
    (err, user) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
      res.json(user);
    }
  );
});

router.get('/:id', verifyToken, (req, res) => {
  db.get(
    'SELECT id, name, email, role, avatar, class FROM users WHERE id = ?',
    [req.params.id],
    (err, user) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
      res.json(user);
    }
  );
});

router.put('/profile', verifyToken, (req, res) => {
  const { name, class: userClass, avatar } = req.body;
  db.run(
    'UPDATE users SET name = ?, class = ?, avatar = ? WHERE id = ?',
    [name, userClass, avatar, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json({ message: 'Профиль обновлён' });
    }
  );
});

module.exports = router;

// Обновить тему пользователя
router.put('/theme', verifyToken, (req, res) => {
  const { theme } = req.body;
  db.run(
    'UPDATE users SET theme = ? WHERE id = ?',
    [theme, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json({ message: 'Тема обновлена' });
    }
  );
});