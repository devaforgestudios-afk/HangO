require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const AirtableService = require('./services/AirtableService');
const { sendVerificationEmail, sendWelcomeEmail } = require('./services/EmailService');

const app = express();
const PORT = process.env.PORT || 3000;

const airtable = new AirtableService();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware for OAuth
app.use(session({
  secret: process.env.SESSION_SECRET || 'hangout-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // Only use secure cookies in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Auth routes (must be after session and passport initialization)
app.use('/auth', require('./routes/auth'));

app.post('/api/user/register', async (req, res) => {
  console.log('📝 Registration request received:', req.body);
  try {
    const userData = req.body || {};
    console.log('🔍 Processing user data:', userData);
    const newUser = await airtable.createUser(userData);
    console.log('✅ User created successfully:', newUser.id);

    // Send verification email
    const verificationUrl = `${req.protocol}://${req.get('host')}/api/user/verify?token=${newUser.verification_token}`;
    await sendVerificationEmail(newUser.email, newUser.username, verificationUrl);
    console.log('✉️ Verification email sent to:', newUser.email);

    res.json({
      success: true,
      userId: newUser.id,
      user: newUser,
      message: 'Account created. Please check your email to verify your account.'
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
    
    // Check if user is verified
    if (!user.is_verified) {
      return res.status(403).json({ success: false, error: 'Please verify your email before logging in. Check your inbox for a verification link.' });
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

// Email verification endpoint
app.get('/api/user/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send('Invalid verification link.');
  }
  try {
    // Find user by verification token
    const records = await airtable.usersTable.select({
      filterByFormula: `{verification_token} = '${token}'`,
      maxRecords: 1
    }).firstPage();
    if (records.length === 0) {
      return res.status(400).send('Invalid or expired verification link.');
    }
    const userRecord = records[0];
    const userFields = userRecord.fields;
    
    // Update user to set is_verified true and clear token
    await airtable.usersTable.update(userRecord.id, {
      is_verified: true,
      verification_token: ''
    });
    
    // Send welcome email after successful verification
    try {
      await sendWelcomeEmail(userFields.email, userFields.username, 'email');
      console.log('📧 Welcome email sent to newly verified user:', userFields.email);
    } catch (emailError) {
      console.error('📧 Failed to send welcome email:', emailError.message);
      // Continue with verification even if email fails
    }
    
    res.send(`
      <div style="max-width: 500px; margin: 50px auto; padding: 40px; font-family: Arial, sans-serif; text-align: center; background: #f9fafb; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        <h1 style="color: #22d3ee; margin-bottom: 20px;">🎉 Email Verified!</h1>
        <p style="font-size: 18px; color: #1f2937; margin-bottom: 30px;">
          Welcome to HangO, <strong>${userFields.username}</strong>! Your account is now active.
        </p>
        <p style="color: #6b7280; margin-bottom: 30px;">
          A welcome email has been sent to your inbox with more details.
        </p>
        <a href="/auth.html" style="background: linear-gradient(135deg, #22d3ee, #a78bfa); color: white; text-decoration: none; padding: 15px 30px; border-radius: 25px; font-weight: bold; display: inline-block;">
          🚀 Go to Login
        </a>
      </div>
    `);
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).send('Verification failed. Please try again.');
  }
});

// Dashboard API endpoint for authenticated users
app.get('/api/user/dashboard', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const user = req.user;
  const { password_hash, verification_token, ...userWithoutSensitiveData } = user;
  
  res.json({
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    avatar: user.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.username}&size=150`,
    stats: {
      meetings: user.total_meetings || 0,
      connections: user.total_connections || 0,
      hours: user.total_hours || 0
    },
    recentMeetings: [], // TODO: Add your meeting logic here
    upcomingEvents: []  // TODO: Add your events logic here
  });
});

app.get('/health', async (req, res) => {
  const airtableConnected = await airtable.testConnection();
  res.json({
    ok: true,
    mode: 'airtable',
    airtable: airtableConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const startServer = async () => {
  try {
    console.log(' Starting HangO server with Airtable...');
    
    const airtableConnected = await airtable.testConnection();
    if (!airtableConnected) {
      console.log('  Airtable not connected. Please check your API key and Base ID.');
    }
    
    app.listen(PORT, () => {
      console.log(`🌐 Server running at http://localhost:${PORT}`);
      console.log(`💾 Database: ${airtableConnected ? 'Airtable Connected' : 'Airtable Disconnected'}`);
      console.log('✨ HangO is ready for meetings!');
      
      if (!airtableConnected) {
        console.log('');
        console.log(' To connect Airtable:');
        console.log('1. Add AIRTABLE_API_KEY to your .env file');
        console.log('2. Add AIRTABLE_BASE_ID to your .env file');
        console.log('3. Create a "Users" table in your Airtable base');
      }
    });
    
  } catch (error) {
    console.error(' Server startup failed:', error.message);
    process.exit(1);
  }
};

startServer();
