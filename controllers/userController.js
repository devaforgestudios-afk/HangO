const bcrypt = require('bcryptjs');
const { pool } = require('../db');

function validateCredentials(username, password) {
  if (!username || username.length < 3) return 'Username must be at least 3 characters';
  if (!password || password.length < 6) return 'Password must be at least 6 characters';
  return null;
}

exports.register = async (req, res) => {
  try {
    const { username, password, avatar } = req.body || {};
    const validationError = validateCredentials(username, password);
    if (validationError) return res.status(400).json({ success: false, error: validationError });

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) return res.status(409).json({ success: false, error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, password_hash, avatar) VALUES (?, ?, ?)',
      [username, hash, avatar || null]
    );

    return res.json({ success: true, userId: result.insertId });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, error: 'Missing credentials' });

    const [rows] = await pool.query('SELECT id, password_hash, avatar FROM users WHERE username = ?', [username]);
    if (!rows.length) return res.status(401).json({ success: false, error: 'Invalid username or password' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid username or password' });

    return res.json({ success: true, user: { id: user.id, username, avatar: user.avatar } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
