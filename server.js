require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const { createServer } = require('http');
const { Server } = require('socket.io');
const AirtableService = require('./services/AirtableService');
const MeetingService = require('./services/MeetingService');
const { sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail } = require('./services/EmailService');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Initialize Airtable with error handling
let airtable = null;
let airtableConnected = false;

try {
  airtable = new AirtableService();
  airtableConnected = true;
  console.log('✅ Airtable service initialized');
} catch (error) {
  console.log('⚠️  Airtable not configured, using in-memory storage');
  console.log('💡 Add AIRTABLE_API_KEY and AIRTABLE_BASE_ID to .env file for persistent storage');
  
  // Create a simple in-memory fallback
  airtable = {
    // In-memory storage
    meetings: new Map(),
    users: new Map(),
    
    // Mock methods for meeting functionality
    async createMeeting(meetingData) {
      const meeting = {
        id: Date.now().toString(),
        ...meetingData,
        created_at: new Date().toISOString(),
        status: 'active',
        participants: [],
        chat_history: '[]',
        last_activity: new Date().toISOString()
      };
      this.meetings.set(meeting.meeting_code, meeting);
      return meeting;
    },
    
    async findMeetingByCode(code) {
      return this.meetings.get(code) || null;
    },
    
    async joinMeeting(meetingCode, participantData) {
      const meeting = this.meetings.get(meetingCode);
      if (!meeting) throw new Error('Meeting not found');
      
      const participants = JSON.parse(meeting.participants || '[]');
      participants.push(participantData);
      meeting.participants = JSON.stringify(participants);
      meeting.last_activity = new Date().toISOString();
      
      return meeting;
    },
    
    async updateMeetingParticipants(meetingCode, participantsData) {
      const meeting = this.meetings.get(meetingCode);
      if (meeting) {
        meeting.participants = JSON.stringify(participantsData);
        meeting.last_activity = new Date().toISOString();
      }
      return true;
    },
    
    async getActiveMeetings() {
      const meetings = Array.from(this.meetings.values()).filter(m => m.status === 'active');
      return meetings.map(meeting => ({
        id: meeting.id,
        meeting_code: meeting.meeting_code,
        title: meeting.title,
        created_at: meeting.created_at,
        participant_count: JSON.parse(meeting.participants || '[]').length,
        last_activity: meeting.last_activity
      }));
    },
    
    async getMeetingAnalytics(meetingCode) {
      const meeting = this.meetings.get(meetingCode);
      if (!meeting) return null;
      
      const participants = JSON.parse(meeting.participants || '[]');
      const chatHistory = JSON.parse(meeting.chat_history || '[]');
      
      return {
        meetingCode: meeting.meeting_code,
        title: meeting.title,
        createdAt: meeting.created_at,
        duration: meeting.ended_at ? 
          new Date(meeting.ended_at).getTime() - new Date(meeting.created_at).getTime() : 
          Date.now() - new Date(meeting.created_at).getTime(),
        totalParticipants: participants.length,
        totalMessages: chatHistory.length,
        isActive: meeting.status === 'active',
        lastActivity: meeting.last_activity
      };
    },
    
    async endMeeting(meetingCode, userId) {
      const meeting = this.meetings.get(meetingCode);
      if (meeting) {
        meeting.status = 'ended';
        meeting.ended_at = new Date().toISOString();
        this.meetings.delete(meetingCode);
      }
      return meeting;
    }
  };
}

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
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization for session management
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    if (airtableConnected) {
      const user = await airtable.findUserById(id);
      done(null, user);
    } else {
      done(null, { id: id, username: 'guest', full_name: 'Guest User' });
    }
  } catch (error) {
    done(error, null);
  }
});

// Auth routes (must be after session and passport initialization)
app.use('/auth', require('./routes/auth'));

// WebSocket meeting functionality
function setupMeetingWebSocket(io, airtable) {
  
  const activeMeetings = new Map(); 
  const userSessions = new Map();

  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    // Join a meeting room
    socket.on('join-meeting', async (data) => {
      try {
        const { meetingCode, userInfo } = data;
        console.log('👋 User joining meeting:', meetingCode, userInfo?.name);

        // Validate meeting exists in database
        const meeting = await airtable.findMeetingByCode(meetingCode);
        if (!meeting) {
          socket.emit('error', { message: 'Meeting not found' });
          return;
        }

        // Leave previous meeting if any
        if (userSessions.has(socket.id)) {
          const prevSession = userSessions.get(socket.id);
          socket.leave(prevSession.meetingCode);
          
          // Remove from active meeting
          if (activeMeetings.has(prevSession.meetingCode)) {
            const meetingRoom = activeMeetings.get(prevSession.meetingCode);
            meetingRoom.participants.delete(socket.id);
          }
        }

        // Join the meeting room
        socket.join(meetingCode);
        
        // Add to active meetings tracking
        if (!activeMeetings.has(meetingCode)) {
          activeMeetings.set(meetingCode, {
            participants: new Set(),
            meetingData: meeting
          });
        }
        
        const meetingRoom = activeMeetings.get(meetingCode);
        meetingRoom.participants.add(socket.id);
        
        // Store user session
        userSessions.set(socket.id, {
          userId: userInfo?.userId || socket.id,
          meetingCode,
          userInfo: {
            name: userInfo?.name || 'Anonymous User',
            isAnonymous: userInfo?.isAnonymous !== false,
            joinedAt: new Date().toISOString(),
            socketId: socket.id
          }
        });

        // Notify user they joined successfully
        socket.emit('meeting-joined', {
          meetingCode,
          meetingTitle: meeting.title,
          participantCount: meetingRoom.participants.size
        });

        // Broadcast to other participants that someone joined
        socket.to(meetingCode).emit('participant-joined', {
          participant: userSessions.get(socket.id).userInfo,
          participantCount: meetingRoom.participants.size
        });

        // Send current participants list to the new user
        const participantsList = Array.from(meetingRoom.participants).map(socketId => {
          const session = userSessions.get(socketId);
          return session ? session.userInfo : null;
        }).filter(Boolean);

        socket.emit('participants-list', { participants: participantsList });

        console.log(`✅ User ${userInfo?.name} joined meeting ${meetingCode} (${meetingRoom.participants.size} total)`);

      } catch (error) {
        console.error('❌ Error joining meeting:', error);
        socket.emit('error', { message: 'Failed to join meeting' });
      }
    });

    // Handle chat messages
    socket.on('chat-message', (data) => {
      const session = userSessions.get(socket.id);
      if (!session) return;

      const chatMessage = {
        id: Date.now().toString(),
        message: data.message,
        sender: session.userInfo.name,
        timestamp: new Date().toISOString(),
        isAnonymous: session.userInfo.isAnonymous
      };

      // Broadcast to all participants in the meeting
      io.to(session.meetingCode).emit('chat-message', chatMessage);
      console.log(`💬 Chat in ${session.meetingCode}: ${session.userInfo.name}: ${data.message}`);
    });

    // Handle media state changes (mic/camera/screen share)
    socket.on('media-state', (data) => {
      const session = userSessions.get(socket.id);
      if (!session) return;

      // Broadcast media state to other participants
      socket.to(session.meetingCode).emit('participant-media-state', {
        participantId: socket.id,
        participantName: session.userInfo.name,
        mediaState: data
      });

      console.log(`🎥 Media state update from ${session.userInfo.name}: mic=${data.audio}, cam=${data.video}, screen=${data.screen}`);
    });

    // Handle WebRTC signaling
    socket.on('webrtc-offer', (data) => {
      socket.to(data.target).emit('webrtc-offer', {
        offer: data.offer,
        sender: socket.id
      });
    });

    socket.on('webrtc-answer', (data) => {
      socket.to(data.target).emit('webrtc-answer', {
        answer: data.answer,
        sender: socket.id
      });
    });

    socket.on('webrtc-ice-candidate', (data) => {
      socket.to(data.target).emit('webrtc-ice-candidate', {
        candidate: data.candidate,
        sender: socket.id
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
      
      const session = userSessions.get(socket.id);
      if (session) {
        // Remove from meeting room
        if (activeMeetings.has(session.meetingCode)) {
          const meetingRoom = activeMeetings.get(session.meetingCode);
          meetingRoom.participants.delete(socket.id);
          
          // Notify other participants
          socket.to(session.meetingCode).emit('participant-left', {
            participant: session.userInfo,
            participantCount: meetingRoom.participants.size
          });

          // Clean up empty meeting rooms
          if (meetingRoom.participants.size === 0) {
            activeMeetings.delete(session.meetingCode);
            console.log(`🧹 Cleaned up empty meeting room: ${session.meetingCode}`);
          }
        }

        // Remove user session
        userSessions.delete(socket.id);
        console.log(`👋 User ${session.userInfo.name} left meeting ${session.meetingCode}`);
      }
    });

    // Manually leave meeting
    socket.on('leave-meeting', () => {
      const session = userSessions.get(socket.id);
      if (session) {
        socket.leave(session.meetingCode);
        
        // Remove from active meeting
        if (activeMeetings.has(session.meetingCode)) {
          const meetingRoom = activeMeetings.get(session.meetingCode);
          meetingRoom.participants.delete(socket.id);
          
          // Notify others
          socket.to(session.meetingCode).emit('participant-left', {
            participant: session.userInfo,
            participantCount: meetingRoom.participants.size
          });
        }
        
        userSessions.delete(socket.id);
        socket.emit('meeting-left');
      }
    });
  });

  // Periodic cleanup of stale meetings
  setInterval(() => {
    const now = Date.now();
    for (const [meetingCode, meetingRoom] of activeMeetings.entries()) {
      if (meetingRoom.participants.size === 0) {
        activeMeetings.delete(meetingCode);
      }
    }
  }, 5 * 60 * 1000); // Clean up every 5 minutes
}

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
    
    // Try to find user by username or email
    let user = await airtable.findUserByUsername(username);
    if (!user) {
      try {
        user = await airtable.findUserByEmail(username);
      } catch (error) {
        // User not found by email either
      }
    }
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Account not found. Please create an account first.',
        redirectToSignup: true 
      });
    }
    
    const isValidPassword = await airtable.verifyPassword(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
    
    // Check if user is verified
    if (!user.is_verified) {
      return res.status(403).json({ 
        success: false, 
        error: 'Please verify your email before logging in. Check your inbox for a verification link.' 
      });
    }
    
    // Log the user in using Passport session
    req.login(user, (err) => {
      if (err) {
        console.error('Session login error:', err);
        return res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
      }
      
      const { password_hash, ...userWithoutPassword } = user;
      res.json({
        success: true,
        message: 'Login successful',
        user: userWithoutPassword
      });
    });
    
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

// Get current user session
app.get('/api/user/session', (req, res) => {
  if (req.isAuthenticated()) {
    const { password_hash, ...userWithoutPassword } = req.user;
    res.json({
      success: true,
      authenticated: true,
      user: userWithoutPassword
    });
  } else {
    res.json({
      success: true,
      authenticated: false,
      user: null
    });
  }
});

// Logout endpoint
app.post('/api/user/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ success: false, error: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Update user profile endpoint
app.post('/api/user/update-profile', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { full_name, username, email, phone, avatar_url } = req.body;
    const userId = req.user.id;

    // Validation
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Username validation
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be between 3-20 characters' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Phone validation (if provided)
    if (phone && phone.trim()) {
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$|^[\+]?[1-9][\d\s\(\)\-]{7,}$/;
      if (!phoneRegex.test(phone.replace(/[\s\(\)\-]/g, ''))) {
        return res.status(400).json({ error: 'Please enter a valid phone number' });
      }
    }

    console.log(`📝 Updating profile for user: ${req.user.username}`);

    // Check if username is already taken by another user
    if (username !== req.user.username) {
      try {
        const existingUser = await airtable.findUserByUsername(username);
        if (existingUser && existingUser.id !== userId) {
          return res.status(409).json({ error: 'This username is already taken' });
        }
      } catch (error) {
        // Username not found, which is good - we can use it
      }
    }

    // Check if email is already taken by another user
    if (email !== req.user.email) {
      try {
        const existingUser = await airtable.findUserByEmail(email);
        if (existingUser && existingUser.id !== userId) {
          return res.status(409).json({ error: 'This email is already registered to another account' });
        }
      } catch (error) {
        // Email not found, which is good - we can use it
      }
    }

    // Update user profile
    const updatedUser = await airtable.updateUserProfile(userId, {
      full_name: full_name.trim(),
      username: username.trim(),
      email: email.trim(),
      phone: phone ? phone.trim() : '',
      avatar_url: avatar_url ? avatar_url.trim() : ''
    });

    console.log(`✅ Profile updated successfully for: ${req.user.username}`);

    // Update session user data
    req.user.full_name = updatedUser.full_name;
    req.user.username = updatedUser.username;
    req.user.email = updatedUser.email;
    req.user.phone = updatedUser.phone;
    req.user.avatar_url = updatedUser.avatar_url;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        username: updatedUser.username,
        full_name: updatedUser.full_name,
        email: updatedUser.email,
        phone: updatedUser.phone || '',
        avatar_url: updatedUser.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${updatedUser.username}&size=150`
      }
    });

  } catch (error) {
    console.error('❌ Profile update error:', error.message);
    res.status(500).json({ error: 'Failed to update profile. Please try again.' });
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

// Check user authentication status
app.get('/api/user/status', (req, res) => {
  res.json({
    isAuthenticated: req.isAuthenticated(),
    user: req.isAuthenticated() ? {
      username: req.user.username,
      full_name: req.user.full_name,
      email: req.user.email,
      avatar: req.user.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${req.user.username}&size=150`
    } : null
  });
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
    
    // Broadcast to admin dashboard
    if (meetingService) {
      meetingService.broadcastAdminEvent('meeting-created', {
        meetingCode: meeting.meeting_code,
        title: meeting.title,
        createdBy: meeting.created_by_name,
        isAnonymous: meeting.is_anonymous,
        createdAt: meeting.created_at
      });
    }
    
    res.json({
      success: true,
      meeting: meeting,
      message: 'Meeting created successfully'
    });
    
  } catch (error) {
    console.error('❌ Meeting creation error:', error);
    res.status(400).json({
      success: false,
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
      success: false,
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
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }
    
    res.json({
      success: true,
      meeting: meeting
    });
    
  } catch (error) {
    console.error('❌ Get meeting error:', error);
    res.status(500).json({
      success: false,
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

// Get meeting analytics
app.get('/api/meeting/:code/analytics', async (req, res) => {
  try {
    const { code } = req.params;
    const analytics = await airtable.getMeetingAnalytics(code);
    
    if (!analytics) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }
    
    res.json({
      success: true,
      analytics: analytics
    });
  } catch (error) {
    console.error('❌ Get meeting analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get meeting analytics'
    });
  }
});

// Get all active meetings
app.get('/api/meetings/active', async (req, res) => {
  try {
    let meetings = [];
    
    if (meetingService && meetingService.activeMeetings) {
      // Get real-time data from MeetingService if available
      meetings = Array.from(meetingService.activeMeetings.values()).map(meeting => ({
        meeting_code: meeting.meetingCode || meeting.meetingData?.meeting_code,
        title: meeting.title || meeting.meetingData?.title || 'Untitled Meeting',
        participant_count: meeting.participants?.size || 0,
        created_at: meeting.createdAt || meeting.meetingData?.created_at,
        last_activity: meeting.lastActivity || meeting.createdAt || meeting.meetingData?.created_at,
        status: 'active',
        created_by_name: meeting.meetingData?.created_by_name || 'Unknown',
        chat_messages: meeting.chatHistory?.length || 0
      }));
    } else {
      // Fallback to Airtable data
      const airtableMeetings = await airtable.getActiveMeetings();
      meetings = airtableMeetings.map(meeting => ({
        ...meeting,
        participant_count: 0,
        last_activity: meeting.created_at,
        chat_messages: 0
      }));
    }
    
    res.json({
      success: true,
      meetings: meetings,
      count: meetings.length
    });
  } catch (error) {
    console.error('❌ Get active meetings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active meetings'
    });
  }
});

// Meeting health check endpoint
app.get('/api/meeting/:code/health', async (req, res) => {
  try {
    const { code } = req.params;
    const meeting = await airtable.findMeetingByCode(code);
    
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }
    
    const health = {
      status: meeting.status,
      isActive: meeting.status === 'active',
      participantCount: JSON.parse(meeting.participants || '[]').length,
      lastActivity: meeting.last_activity || meeting.created_at,
      uptime: Date.now() - new Date(meeting.created_at).getTime()
    };
    
    res.json({
      success: true,
      health: health
    });
  } catch (error) {
    console.error('❌ Meeting health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check meeting health'
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
    console.log('🚀 Starting HangO server...');
    
    let passwordResetReady = false;
    
    if (airtableConnected) {
      console.log('🔄 Testing Airtable connection...');
      try {
        const testResult = await airtable.testConnection();
        if (!testResult) {
          console.log('❌ Airtable connection failed');
          airtableConnected = false;
        } else {
          console.log('✅ Airtable connection successful');
          
          // Check if password reset fields are configured
          if (airtable.checkPasswordResetFields) {
            passwordResetReady = await airtable.checkPasswordResetFields();
            if (!passwordResetReady) {
              console.log('⚠️  Password reset feature requires additional setup');
            } else {
              console.log('✅ Password reset feature is ready');
            }
          }
        }
      } catch (error) {
        console.log('❌ Airtable connection error:', error.message);
        airtableConnected = false;
      }
    }
    
    // Initialize real-time meeting service
    const meetingService = new MeetingService(io, airtable);
    console.log('✅ Real-time meeting service initialized');
    
    server.listen(PORT, () => {
      console.log('');
      console.log('🌐 Server running at http://localhost:' + PORT);
      console.log('💾 Database: ' + (airtableConnected ? 'Airtable Connected ✅' : 'Airtable Disconnected ❌'));
      console.log('🔐 Password Reset: ' + (passwordResetReady ? 'Ready ✅' : 'Setup Required ⚠️'));
      console.log('🔌 WebSocket: Socket.IO Ready ✅');
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
