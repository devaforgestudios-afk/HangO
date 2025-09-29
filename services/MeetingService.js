// Real-time Meeting Service for HangO
class MeetingService {
  constructor(io, airtableService) {
    this.io = io;
    this.airtable = airtableService;
    this.activeMeetings = new Map(); // meetingCode -> meeting data
    this.participants = new Map(); // socketId -> participant data
    this.userSessions = new Map(); // userId -> socketId
    
    this.setupEventHandlers();
    this.startCleanupInterval();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);
      
      socket.on('join-admin', () => this.handleJoinAdmin(socket));
      socket.on('join-meeting', (data) => this.handleJoinMeeting(socket, data));
      socket.on('leave-meeting', () => this.handleLeaveMeeting(socket));
      socket.on('chat-message', (data) => this.handleChatMessage(socket, data));
      socket.on('media-toggle', (data) => this.handleMediaToggle(socket, data));
      socket.on('screen-share', (data) => this.handleScreenShare(socket, data));
      socket.on('webrtc-signal', (data) => this.handleWebRTCSignal(socket, data));
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  async handleJoinMeeting(socket, data) {
    try {
      const { meetingCode, userInfo } = data;
      console.log(`👋 User joining meeting: ${meetingCode}`, userInfo);

      // Validate meeting exists
      const meeting = await this.airtable.findMeetingByCode(meetingCode);
      if (!meeting || meeting.status !== 'active') {
        socket.emit('meeting-error', { message: 'Meeting not found or inactive' });
        return;
      }

      // Remove from previous meeting if any
      this.handleLeaveMeeting(socket);

      // Join new meeting
      socket.join(meetingCode);
      
      // Store participant data
      const participantData = {
        socketId: socket.id,
        meetingCode,
        userInfo: {
          id: userInfo.id || socket.id,
          name: userInfo.name || 'Anonymous User',
          avatar: userInfo.avatar || userInfo.name?.charAt(0)?.toUpperCase() || 'A',
          isHost: userInfo.isHost || false,
          isAnonymous: userInfo.isAnonymous !== false,
          joinedAt: new Date().toISOString()
        },
        mediaState: {
          audio: true,
          video: true,
          screen: false
        }
      };

      this.participants.set(socket.id, participantData);
      
      // Update meeting participants
      if (!this.activeMeetings.has(meetingCode)) {
        this.activeMeetings.set(meetingCode, {
          meetingCode: meetingCode,
          title: meeting.title || 'Untitled Meeting',
          meetingData: meeting,
          participants: new Set(),
          chatHistory: [],
          createdAt: meeting.created_at || new Date().toISOString(),
          lastActivity: new Date().toISOString()
        });
      }
      
      const meetingRoom = this.activeMeetings.get(meetingCode);
      meetingRoom.participants.add(socket.id);
      meetingRoom.lastActivity = new Date().toISOString();

      // Update database
      await this.updateMeetingParticipants(meetingCode);

      // Notify user of successful join
      socket.emit('meeting-joined', {
        meeting: meeting,
        participantCount: meetingRoom.participants.size,
        chatHistory: meetingRoom.chatHistory.slice(-50) // Last 50 messages
      });

      // Broadcast to other participants
      socket.to(meetingCode).emit('participant-joined', {
        participant: participantData.userInfo,
        participantCount: meetingRoom.participants.size
      });

      // Send current participants list
      const participantsList = this.getParticipantsList(meetingCode);
      socket.emit('participants-update', { participants: participantsList });

      // Broadcast to admin dashboard
      this.broadcastAdminEvent('participant-joined', {
        meetingCode,
        participant: participantData.userInfo,
        participantCount: meetingRoom.participants.size
      });

      console.log(`✅ User ${userInfo.name} joined meeting ${meetingCode} (${meetingRoom.participants.size} total)`);

    } catch (error) {
      console.error('❌ Error joining meeting:', error);
      socket.emit('meeting-error', { message: 'Failed to join meeting' });
    }
  }

  handleLeaveMeeting(socket) {
    const participant = this.participants.get(socket.id);
    if (!participant) return;

    const { meetingCode } = participant;
    socket.leave(meetingCode);

    // Remove from meeting room
    if (this.activeMeetings.has(meetingCode)) {
      const meetingRoom = this.activeMeetings.get(meetingCode);
      meetingRoom.participants.delete(socket.id);

      // Notify other participants
      socket.to(meetingCode).emit('participant-left', {
        participant: participant.userInfo,
        participantCount: meetingRoom.participants.size
      });

      // Broadcast to admin dashboard
      this.broadcastAdminEvent('participant-left', {
        meetingCode,
        participant: participant.userInfo,
        participantCount: meetingRoom.participants.size
      });

      // Clean up empty meetings
      if (meetingRoom.participants.size === 0) {
        this.activeMeetings.delete(meetingCode);
        console.log(`🧹 Cleaned up empty meeting: ${meetingCode}`);
      } else {
        // Update database
        this.updateMeetingParticipants(meetingCode);
      }
    }

    // Remove participant
    this.participants.delete(socket.id);
    console.log(`👋 User ${participant.userInfo.name} left meeting ${meetingCode}`);
  }

  handleChatMessage(socket, data) {
    const participant = this.participants.get(socket.id);
    if (!participant) return;

    const { message } = data;
    const { meetingCode } = participant;
    
    if (!message || !message.trim()) return;

    const chatMessage = {
      id: Date.now().toString(),
      message: message.trim(),
      sender: participant.userInfo.name,
      senderId: participant.userInfo.id,
      timestamp: new Date().toISOString(),
      isAnonymous: participant.userInfo.isAnonymous
    };

    // Store in meeting history
    if (this.activeMeetings.has(meetingCode)) {
      const meetingRoom = this.activeMeetings.get(meetingCode);
      meetingRoom.chatHistory.push(chatMessage);
      meetingRoom.lastActivity = new Date().toISOString();
      
      // Keep only last 100 messages
      if (meetingRoom.chatHistory.length > 100) {
        meetingRoom.chatHistory = meetingRoom.chatHistory.slice(-100);
      }
    }

    // Broadcast to all participants in the meeting
    this.io.to(meetingCode).emit('chat-message', chatMessage);
    console.log(`💬 Chat in ${meetingCode}: ${participant.userInfo.name}: ${message}`);
  }

  handleMediaToggle(socket, data) {
    const participant = this.participants.get(socket.id);
    if (!participant) return;

    const { type, enabled } = data; // type: 'audio', 'video', 'screen'
    participant.mediaState[type] = enabled;

    // Broadcast to other participants
    socket.to(participant.meetingCode).emit('participant-media-update', {
      participantId: socket.id,
      participantName: participant.userInfo.name,
      mediaType: type,
      enabled: enabled,
      mediaState: participant.mediaState
    });

    console.log(`🎥 Media update from ${participant.userInfo.name}: ${type}=${enabled}`);
  }

  handleScreenShare(socket, data) {
    const participant = this.participants.get(socket.id);
    if (!participant) return;

    const { action } = data; // 'start' or 'stop'
    participant.mediaState.screen = action === 'start';

    // Broadcast screen share status
    socket.to(participant.meetingCode).emit('screen-share-update', {
      participantId: socket.id,
      participantName: participant.userInfo.name,
      sharing: action === 'start'
    });

    console.log(`📺 Screen share ${action} by ${participant.userInfo.name}`);
  }

  handleWebRTCSignal(socket, data) {
    const participant = this.participants.get(socket.id);
    if (!participant) return;

    const { type, target, signal } = data;
    
    // Relay WebRTC signaling to specific participant
    socket.to(target).emit('webrtc-signal', {
      type,
      from: socket.id,
      signal
    });
  }

  handleDisconnect(socket) {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    this.handleLeaveMeeting(socket);
  }

  getParticipantsList(meetingCode) {
    if (!this.activeMeetings.has(meetingCode)) return [];
    
    const meetingRoom = this.activeMeetings.get(meetingCode);
    return Array.from(meetingRoom.participants).map(socketId => {
      const participant = this.participants.get(socketId);
      return participant ? {
        ...participant.userInfo,
        socketId,
        mediaState: participant.mediaState
      } : null;
    }).filter(Boolean);
  }

  async updateMeetingParticipants(meetingCode) {
    try {
      const participantsList = this.getParticipantsList(meetingCode);
      const participantsData = participantsList.map(p => ({
        user_id: p.id,
        name: p.name,
        is_anonymous: p.isAnonymous,
        joined_at: p.joinedAt,
        session_id: p.socketId
      }));

      await this.airtable.updateMeetingParticipants(meetingCode, participantsData);
    } catch (error) {
      console.error('❌ Error updating meeting participants:', error);
    }
  }

  // Get meeting statistics
  getMeetingStats() {
    const stats = {
      activeMeetings: this.activeMeetings.size,
      totalParticipants: this.participants.size,
      meetings: []
    };

    for (const [meetingCode, meetingRoom] of this.activeMeetings.entries()) {
      stats.meetings.push({
        code: meetingCode,
        title: meetingRoom.meetingData.title,
        participants: meetingRoom.participants.size,
        createdAt: meetingRoom.createdAt,
        chatMessages: meetingRoom.chatHistory.length
      });
    }

    return stats;
  }

  // Periodic cleanup
  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      for (const [meetingCode, meetingRoom] of this.activeMeetings.entries()) {
        const age = now - new Date(meetingRoom.createdAt).getTime();
        
        if (meetingRoom.participants.size === 0 && age > maxAge) {
          this.activeMeetings.delete(meetingCode);
          console.log(`🧹 Cleaned up old empty meeting: ${meetingCode}`);
        }
      }
    }, 60 * 60 * 1000); // Run every hour
  }

  // Broadcast system message to meeting
  broadcastSystemMessage(meetingCode, message) {
    const systemMessage = {
      id: Date.now().toString(),
      message,
      sender: 'System',
      senderId: 'system',
      timestamp: new Date().toISOString(),
      isSystem: true
    };

    this.io.to(meetingCode).emit('chat-message', systemMessage);
    
    if (this.activeMeetings.has(meetingCode)) {
      this.activeMeetings.get(meetingCode).chatHistory.push(systemMessage);
    }
  }

  // Handle admin joining for dashboard updates
  handleJoinAdmin(socket) {
    socket.join('admin-room');
    console.log('📊 Admin joined dashboard:', socket.id);
    
    // Send current stats immediately
    this.sendAdminUpdate();
  }

  // Send admin dashboard update
  sendAdminUpdate() {
    const meetings = Array.from(this.activeMeetings.values()).map(meeting => ({
      meeting_code: meeting.meetingCode,
      title: meeting.title || 'Untitled Meeting',
      participant_count: meeting.participants.length,
      created_at: meeting.createdAt,
      last_activity: meeting.lastActivity,
      status: 'active',
      chat_messages: meeting.chatHistory.length
    }));

    const stats = {
      activeMeetings: meetings.length,
      totalParticipants: meetings.reduce((sum, m) => sum + m.participant_count, 0),
      totalMessages: meetings.reduce((sum, m) => sum + m.chat_messages, 0),
      meetings
    };

    this.io.to('admin-room').emit('admin-stats-update', stats);
  }

  // Broadcast admin events
  broadcastAdminEvent(eventType, data) {
    this.io.to('admin-room').emit(eventType, data);
    this.sendAdminUpdate(); // Also send updated stats
  }
}

module.exports = MeetingService;