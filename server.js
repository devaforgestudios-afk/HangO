require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory auth (DB-free demo)
const users = new Map(); // username -> { password, avatar }

app.post('/api/user/register', (req, res) => {
  const { username, password, avatar } = req.body || {};
  if (!username || username.length < 3) return res.status(400).json({ success: false, error: 'Username must be at least 3 characters' });
  if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  if (users.has(username)) return res.status(409).json({ success: false, error: 'Username already taken' });
  users.set(username, { password, avatar: avatar || null });
  res.json({ success: true, userId: username });
});

app.post('/api/user/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, error: 'Missing credentials' });
  const user = users.get(username);
  if (!user || user.password !== password) return res.status(401).json({ success: false, error: 'Invalid username or password' });
  res.json({ success: true, user: { id: username, username, avatar: user.avatar } });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ ok: true, mode: 'no-db' });
});

// Start server (no database)
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
