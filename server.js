require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const AirtableService = require('./services/AirtableService');
const { sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail } = require('./services/EmailService');

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

// Forgot password endpoint
app.post('/api/user/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ 
        error: 'Email is required' 
      });
    }

    // Generate reset token
    const resetData = await airtable.generatePasswordResetToken(email.trim().toLowerCase());
    
    // Create reset URL (adjust domain in production)
    const resetUrl = `http://localhost:3000/reset-password?token=${resetData.token}`;
    
    // Send password reset email
    await sendPasswordResetEmail(resetData.user.email, resetData.user.username, resetUrl);
    
    console.log('✅ Password reset email sent to:', email);
    
    res.json({ 
      success: true, 
      message: 'Password reset instructions have been sent to your email address.' 
    });
    
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    
    // Check if it's a "user not found" error
    if (error.message && error.message.includes('No account found with this email address')) {
      return res.status(404).json({ 
        error: error.message
      });
    }
    
    // Check if it's a database setup error
    if (error.message && error.message.includes('Password reset requires database setup')) {
      return res.status(503).json({ 
        error: error.message
      });
    }
    
    // For other errors, return generic message
    res.status(500).json({ 
      error: 'An error occurred while processing your request. Please try again later.' 
    });
  }
});

// Verify reset token endpoint
app.get('/api/user/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const user = await airtable.verifyPasswordResetToken(token);
    
    res.json({ 
      success: true, 
      user: {
        email: user.email,
        username: user.username
      }
    });
    
  } catch (error) {
    console.error('❌ Token verification error:', error);
    res.status(400).json({ 
      error: error.message || 'Invalid or expired reset token' 
    });
  }
});

// Reset password endpoint
app.post('/api/user/reset-password', async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ 
        error: 'All fields are required' 
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ 
        error: 'Passwords do not match' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters long' 
      });
    }

    // Reset the password
    const user = await airtable.resetPasswordWithToken(token, password);
    
    console.log('✅ Password reset completed for:', user.email);
    
    res.json({ 
      success: true, 
      message: 'Password has been reset successfully. You can now login with your new password.',
      user: {
        email: user.email,
        username: user.username
      }
    });
    
  } catch (error) {
    console.error('❌ Password reset error:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to reset password' 
    });
  }
});

// MEETING API ENDPOINTS

// Create a new meeting
app.post('/api/meeting/create', async (req, res) => {
  console.log('🎯 Meeting creation request:', req.body);
  
  try {
    const { meeting_code, title, settings, anonymous_name } = req.body;
    
    // Generate unique meeting code if not provided
    const finalMeetingCode = meeting_code || Math.random().toString(36).slice(2, 8).toUpperCase();
    
    // Check if user is authenticated
    const userId = req.user?.id || '';
    const userName = req.user?.username || anonymous_name || 'Anonymous';
    const isAnonymous = !req.user;
    
    const meetingData = {
      meeting_code: finalMeetingCode,
      title: title || 'HangO Meeting',
      created_by_user_id: userId,
      created_by_name: userName,
      is_anonymous: isAnonymous,
      settings: settings || {}
    };
    
    const meeting = await airtable.createMeeting(meetingData);
    console.log('✅ Meeting created:', meeting.meeting_code);
    
    res.json({
      success: true,
      meeting: meeting,
      message: 'Meeting created successfully'
    });
    
  } catch (error) {
    console.error('❌ Meeting creation error:', error);
    res.status(400).json({
      error: error.message || 'Failed to create meeting'
    });
  }
});

// Join a meeting
app.post('/api/meeting/join', async (req, res) => {
  console.log('🚪 Meeting join request:', req.body);
  
  try {
    const { meeting_code, anonymous_name } = req.body;
    
    if (!meeting_code) {
      return res.status(400).json({ error: 'Meeting code is required' });
    }
    
    // Check if user is authenticated
    const userId = req.user?.id || '';
    const userName = req.user?.username || anonymous_name || 'Anonymous User';
    const isAnonymous = !req.user;
    
    const participantData = {
      user_id: userId,
      name: userName,
      is_anonymous: isAnonymous,
      session_id: req.body.session_id || Math.random().toString(36).substr(2, 9)
    };
    
    const meeting = await airtable.joinMeeting(meeting_code, participantData);
    console.log('✅ User joined meeting:', meeting.meeting_code);
    
    res.json({
      success: true,
      meeting: meeting,
      message: 'Joined meeting successfully'
    });
    
  } catch (error) {
    console.error('❌ Meeting join error:', error);
    res.status(400).json({
      error: error.message || 'Failed to join meeting'
    });
  }
});

// Get meeting details
app.get('/api/meeting/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const meeting = await airtable.findMeetingByCode(code);
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    
    res.json({
      success: true,
      meeting: meeting
    });
    
  } catch (error) {
    console.error('❌ Get meeting error:', error);
    res.status(500).json({
      error: 'Failed to get meeting details'
    });
  }
});

// End a meeting
app.post('/api/meeting/end', async (req, res) => {
  console.log('🔚 Meeting end request:', req.body);
  
  try {
    const { meeting_code } = req.body;
    
    if (!meeting_code) {
      return res.status(400).json({ error: 'Meeting code is required' });
    }
    
    const userId = req.user?.id || '';
    const meeting = await airtable.endMeeting(meeting_code, userId);
    
    // Update user stats if authenticated user
    if (userId) {
      await airtable.updateUserMeetingStats(userId);
    }
    
    console.log('✅ Meeting ended and deleted:', meeting.meeting_code);
    
    res.json({
      success: true,
      meeting: meeting,
      message: 'Meeting ended and removed from database'
    });
    
  } catch (error) {
    console.error('❌ Meeting end error:', error);
    res.status(400).json({
      error: error.message || 'Failed to end meeting'
    });
  }
});

// Leave meeting (remove participant)
app.post('/api/meeting/leave', async (req, res) => {
  console.log('👋 Meeting leave request:', req.body);
  
  try {
    const { meeting_code, session_id } = req.body;
    
    if (!meeting_code) {
      return res.status(400).json({ error: 'Meeting code is required' });
    }
    
    const participantData = {
      user_id: req.user?.id || '',
      is_anonymous: !req.user,
      session_id: session_id,
      name: req.user?.username || 'Anonymous User'
    };
    
    const result = await airtable.leaveMeeting(meeting_code, participantData);
    
    console.log('✅ Participant left meeting:', meeting_code);
    
    res.json({
      success: true,
      meeting: result,
      message: result.ended ? 'Meeting ended (no participants left)' : 'Left meeting successfully'
    });
    
  } catch (error) {
    console.error('❌ Meeting leave error:', error);
    res.status(400).json({
      error: error.message || 'Failed to leave meeting'
    });
  }
});

// Get user's meetings (authenticated users only)
app.get('/api/user/meetings', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const meetings = await airtable.getUserMeetings(req.user.id);
    
    res.json({
      success: true,
      meetings: meetings
    });
    
  } catch (error) {
    console.error('❌ Get user meetings error:', error);
    res.status(500).json({
      error: 'Failed to get user meetings'
    });
  }
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

// Serve reset password page
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

const startServer = async () => {
  try {
    console.log('🚀 Starting HangO server with Airtable...');
    
    const airtableConnected = await airtable.testConnection();
    let passwordResetReady = false;
    
    if (!airtableConnected) {
      console.log('❌ Airtable not connected. Please check your API key and Base ID.');
    } else {
      console.log('✅ Airtable connection successful');
      
      // Check if password reset fields are configured
      passwordResetReady = await airtable.checkPasswordResetFields();
      if (!passwordResetReady) {
        console.log('⚠️  Password reset feature requires additional setup (see instructions above)');
      } else {
        console.log('✅ Password reset feature is ready');
      }
    }
    
    app.listen(PORT, () => {
      console.log('');
      console.log('🌐 Server running at http://localhost:' + PORT);
      console.log('💾 Database: ' + (airtableConnected ? 'Airtable Connected ✅' : 'Airtable Disconnected ❌'));
      console.log('🔐 Password Reset: ' + (passwordResetReady ? 'Ready ✅' : 'Setup Required ⚠️'));
      console.log('✨ HangO is ready for meetings!');
      console.log('');
      
      if (!airtableConnected) {
        console.log('📋 To connect Airtable:');
        console.log('1. Add AIRTABLE_API_KEY to your .env file');
        console.log('2. Add AIRTABLE_BASE_ID to your .env file');
        console.log('3. Create a "Users" table in your Airtable base');
      }

      // Setup automatic cleanup of abandoned meetings (only if Airtable is connected)
      if (airtableConnected) {
        setInterval(async () => {
          try {
            const cleanupCount = await airtable.cleanupAbandonedMeetings();
            const emptyCount = await airtable.cleanupEmptyMeetings();
            if (cleanupCount > 0 || emptyCount > 0) {
              console.log(`🧹 Auto-cleanup: ${cleanupCount} abandoned + ${emptyCount} empty meetings removed`);
            }
          } catch (error) {
            console.error('❌ Cleanup error:', error);
          }
        }, 60 * 60 * 1000); // Run every hour
        
        console.log('🧹 Auto-cleanup enabled: Runs every hour to remove abandoned meetings');
      }
    });
    
  } catch (error) {
    console.error(' Server startup failed:', error.message);
    process.exit(1);
  }
};

startServer();
