const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { generateToken } = require('../auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { name, email, password, class: userClass } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }
  if (password.length < 3) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 3 символов' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Некорректный email' });
  }
  
  const hashedPassword = bcrypt.hashSync(password, 10);
  
  db.run(
    'INSERT INTO users (name, email, password, class) VALUES (?, ?, ?, ?)',
    [name, email, hashedPassword, userClass || ''],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }
        return res.status(500).json({ error: 'Ошибка сервера' });
      }
      res.status(201).json({ message: 'Регистрация успешна' });
    }
  );
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }
  
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });
    
    const isValidPassword = bcrypt.compareSync(password, user.password);
    if (!isValidPassword) return res.status(401).json({ error: 'Неверный email или пароль' });
    
    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        class: user.class
      }
    });
  });
});

module.exports = router;