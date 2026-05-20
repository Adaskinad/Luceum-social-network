const express = require('express');
const db = require('../database');
const { verifyToken } = require('../auth');

const router = express.Router();

router.get('/', verifyToken, (req, res) => {
  const search = req.query.search || '';
  const query = search ? 'SELECT * FROM groups WHERE name LIKE ?' : 'SELECT * FROM groups';
  const params = search ? [`%${search}%`] : [];
  
  db.all(query, params, (err, groups) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    
    db.all('SELECT group_id FROM group_members WHERE user_id = ?', [req.user.id], (err, userGroups) => {
      const userGroupIds = userGroups.map(g => g.group_id);
      const groupsWithMembership = groups.map(group => ({
        ...group,
        isMember: userGroupIds.includes(group.id)
      }));
      res.json(groupsWithMembership);
    });
  });
});

router.post('/', verifyToken, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Название группы обязательно' });
  
  db.run(
    'INSERT INTO groups (name, description, creator_id) VALUES (?, ?, ?)',
    [name, description, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      db.run('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', [this.lastID, req.user.id]);
      res.status(201).json({ id: this.lastID, message: 'Группа создана' });
    }
  );
});

router.post('/:id/join', verifyToken, (req, res) => {
  db.run(
    'INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)',
    [req.params.id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json({ message: 'Вы вступили в группу' });
    }
  );
});

router.get('/:id/posts', verifyToken, (req, res) => {
  db.all(
    `SELECT p.*, u.name as author_name 
     FROM posts p
     JOIN users u ON p.author_id = u.id
     WHERE p.group_id = ?
     ORDER BY p.created_at DESC`,
    [req.params.id],
    (err, posts) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      res.json(posts);
    }
  );
});

module.exports = router;