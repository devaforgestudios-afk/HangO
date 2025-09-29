// Simple server test to verify admin dashboard functionality
const express = require('express');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = 3000;

// Simple in-memory storage for testing
const meetings = new Map();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Test meeting data
const sampleMeetings = [
  {
    id: '1',
    meeting_code: 'TEST123',
    title: 'Sample Meeting 1',
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    participant_count: 3,
    last_activity: new Date().toISOString()
  },
  {
    id: '2',
    meeting_code: 'DEMO456',
    title: 'Demo Meeting',
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 min ago
    participant_count: 1,
    last_activity: new Date().toISOString()
  }
];

// Populate test data
sampleMeetings.forEach(meeting => {
  meetings.set(meeting.meeting_code, meeting);
});

// API Routes
app.post('/api/meeting/create', (req, res) => {
  const { meeting_code, title } = req.body;
  const meeting = {
    id: Date.now().toString(),
    meeting_code: meeting_code || `MEET${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
    title: title || 'New Meeting',
    created_at: new Date().toISOString(),
    participant_count: 1,
    last_activity: new Date().toISOString(),
    status: 'active'
  };
  
  meetings.set(meeting.meeting_code, meeting);
  console.log(`✅ Meeting created: ${meeting.meeting_code}`);
  
  res.json({
    success: true,
    meeting: meeting
  });
});

app.get('/api/meetings/active', (req, res) => {
  const activeMeetings = Array.from(meetings.values());
  console.log(`📊 Returning ${activeMeetings.length} active meetings`);
  
  res.json({
    success: true,
    meetings: activeMeetings,
    count: activeMeetings.length
  });
});

app.get('/api/meeting/:code', (req, res) => {
  const meeting = meetings.get(req.params.code);
  if (!meeting) {
    return res.status(404).json({ success: false, error: 'Meeting not found' });
  }
  
  res.json({
    success: true,
    meeting: meeting
  });
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  socket.on('join-meeting', (data) => {
    const { meetingCode } = data;
    const meeting = meetings.get(meetingCode);
    
    if (meeting) {
      meeting.participant_count = (meeting.participant_count || 0) + 1;
      meeting.last_activity = new Date().toISOString();
      console.log(`👋 User joined meeting ${meetingCode} (${meeting.participant_count} total)`);
      
      socket.emit('meeting-joined', {
        meeting: meeting,
        participantCount: meeting.participant_count
      });
      
      // Broadcast to admin dashboard
      io.emit('meeting-updated', meeting);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('🎯 HangO Test Server Running');
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin.html`);
  console.log(`🎥 Meeting: http://localhost:${PORT}/meet.html?code=TEST123`);
  console.log('');
  console.log('✅ Test server ready with sample meetings!');
  console.log('');
  
  // Add a new meeting every 30 seconds for testing
  setInterval(() => {
    const codes = ['ABC123', 'XYZ789', 'DEF456', 'GHI789'];
    const titles = ['Marketing Sync', 'Dev Standup', 'Client Call', 'Team Review'];
    
    const randomCode = codes[Math.floor(Math.random() * codes.length)];
    const randomTitle = titles[Math.floor(Math.random() * titles.length)];
    
    if (!meetings.has(randomCode)) {
      const meeting = {
        id: Date.now().toString(),
        meeting_code: randomCode,
        title: randomTitle,
        created_at: new Date().toISOString(),
        participant_count: Math.floor(Math.random() * 5) + 1,
        last_activity: new Date().toISOString(),
        status: 'active'
      };
      
      meetings.set(meeting.meeting_code, meeting);
      console.log(`🆕 Auto-created meeting: ${meeting.meeting_code}`);
      
      // Broadcast to admin dashboard
      io.emit('meeting-created', meeting);
    }
  }, 30000);
});