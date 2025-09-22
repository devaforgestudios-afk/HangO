# HangO Airtable Setup Guide

## Overview

HangO now uses Airtable as its database backend. This provides a simple, cloud-based solution without the need to manage MySQL or other databases.

## Quick Setup

### 1. Create Airtable Account
- Go to [airtable.com](https://airtable.com) and create a free account
- Create a new base (workspace) for HangO

### 2. Setup Users Table
Create a table called "Users" with these fields:

| Field Name | Field Type | Description |
|------------|------------|-------------|
| username | Single line text | User's unique username |
| email | Email | User's email address |
| phone | Phone number | User's phone number |
| full_name | Single line text | User's full name |
| password_hash | Long text | Encrypted password |
| avatar | Single line text | Avatar filename/URL (optional) |
| is_verified | Checkbox | Email verification status (optional) |
| verification_token | Single line text | Email verification token (optional) |
| created_at | Date and time | Account creation timestamp (optional) |

### 3. Get API Credentials

**Get Personal Access Token:**
1. Go to [airtable.com/create/tokens](https://airtable.com/create/tokens)
2. Click "Create new token"
3. Give it a name like "HangO App"
4. Add these scopes:
   - `data.records:read`
   - `data.records:write`
5. Add access to your HangO base
6. Copy the generated Personal Access Token (starts with "pat...")

**Get Base ID:**
1. Go to [airtable.com/api](https://airtable.com/api)
2. Select your HangO base
3. The Base ID is shown in the URL and documentation (starts with "app...")

### 4. Update Environment Variables

Edit your `.env` file:

```env
# Airtable Configuration
AIRTABLE_API_KEY=your_personal_access_token_here
AIRTABLE_BASE_ID=your_actual_base_id_here

# Server Configuration
PORT=3000
```

### 5. Test the Setup

Run the server:
```bash
npm start
```

Check the health endpoint:
```
GET http://localhost:3000/health
```

Should return:
```json
{
  "ok": true,
  "mode": "airtable",
  "airtable": "connected",
  "timestamp": "2025-09-21T..."
}
```

## Manual Server.js Fix

The server.js file may need to be manually recreated. Here's the correct content:

```javascript
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const AirtableService = require('./services/AirtableService');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Airtable service
const airtable = new AirtableService();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// User registration endpoint
app.post('/api/user/register', async (req, res) => {
  try {
    const userData = req.body || {};
    const newUser = await airtable.createUser(userData);
    
    res.json({
      success: true,
      userId: newUser.id,
      user: newUser
    });
    
  } catch (error) {
    console.error('Registration error:', error.message);
    
    if (error.message.includes('Username already exists')) {
      return res.status(409).json({ success: false, error: 'Username already taken' });
    }
    
    if (error.message.includes('Email already registered')) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }
    
    if (error.message.includes('Username must be') ||
        error.message.includes('Valid email is required') ||
        error.message.includes('Full name is required') ||
        error.message.includes('Password must be') ||
        error.message.includes('Invalid phone number')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
});

// User login endpoint
app.post('/api/user/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }
    
    const user = await airtable.findUserByUsername(username);
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
    
    const isValidPassword = await airtable.verifyPassword(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
    
    const { password_hash, ...userWithoutPassword } = user;
    res.json({
      success: true,
      user: userWithoutPassword
    });
    
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const airtableConnected = await airtable.testConnection();
  res.json({
    ok: true,
    mode: 'airtable',
    airtable: airtableConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const startServer = async () => {
  try {
    console.log('🚀 Starting HangO server with Airtable...');
    
    const airtableConnected = await airtable.testConnection();
    if (!airtableConnected) {
      console.log('⚠️  Airtable not connected. Please check your API key and Base ID.');
    }
    
    app.listen(PORT, () => {
      console.log(`🌐 Server running at http://localhost:${PORT}`);
      console.log(`💾 Database: ${airtableConnected ? 'Airtable Connected' : 'Airtable Disconnected'}`);
      console.log('✨ HangO is ready for meetings!');
      
      if (!airtableConnected) {
        console.log('');
        console.log('📝 To connect Airtable:');
        console.log('1. Add AIRTABLE_API_KEY to your .env file');
        console.log('2. Add AIRTABLE_BASE_ID to your .env file');
        console.log('3. Create a "Users" table in your Airtable base');
      }
    });
    
  } catch (error) {
    console.error('❌ Server startup failed:', error.message);
    process.exit(1);
  }
};

startServer();
```

## Benefits of Airtable Backend

✅ **No Database Management** - No MySQL setup or maintenance
✅ **Visual Interface** - View and edit users through Airtable's web interface
✅ **Automatic Backups** - Airtable handles data backup and recovery
✅ **Real-time Collaboration** - Multiple team members can manage data
✅ **Built-in API** - REST API automatically generated
✅ **Scalability** - Handles growth without server management

## API Endpoints

All existing API endpoints work the same:

- `POST /api/user/register` - Create new user
- `POST /api/user/login` - Authenticate user
- `GET /health` - Check system status

## Troubleshooting

**Connection Issues:**
1. Verify API key is correct
2. Check Base ID is correct
3. Ensure "Users" table exists with proper field names
4. Check Airtable permissions

**Rate Limits:**
- Free plan: 5 requests per second
- Paid plans: Higher limits available

## Next Steps

1. Set up your Airtable base and get credentials
2. Update the .env file with your credentials
3. Fix the server.js file if needed (copy from above)
4. Test the connection with `npm start`
5. Your HangO app will now use Airtable as the backend!