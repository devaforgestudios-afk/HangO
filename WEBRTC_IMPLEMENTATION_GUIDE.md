# WebRTC Implementation Guide

HangO now has full WebRTC video and audio sharing capabilities. This document explains how the implementation works and how to use it.

## Features Implemented

✅ **Video Calling**: Real-time peer-to-peer video communication  
✅ **Audio Calling**: High-quality audio communication  
✅ **Screen Sharing**: Share your screen with other participants  
✅ **Media Controls**: Toggle camera, microphone, and screen share  
✅ **Multiple Participants**: Support for multiple users in the same meeting  
✅ **Audio Level Indicators**: Visual feedback for active speakers  
✅ **Connection Status**: Real-time connection status updates  

## How It Works

### 1. WebRTC Architecture

The implementation uses a **mesh topology** where each participant connects directly to every other participant:

```
Participant A ←→ Participant B
     ↑               ↓
     ↓               ↑  
Participant C ←→ Participant D
```

### 2. Signaling Server

The Node.js server acts as a signaling server using Socket.IO to facilitate:
- WebRTC offer/answer exchange
- ICE candidate exchange  
- Meeting room management
- Media state broadcasting

### 3. Frontend Components

**webrtc-client.js**: Core WebRTC client handling:
- Media device access (camera/microphone)
- Peer connection establishment
- Stream management
- Screen sharing

**meet.html**: Meeting interface with:
- Local video display
- Remote video grid
- Media control buttons
- Chat functionality

## Domain Configuration

### For Development
```env
DOMAIN=http://localhost:3000
```

### For Production
```env
DOMAIN=https://yourdomain.com
```

Update your `.env` file with the correct domain to ensure:
- Email verification links work correctly
- Password reset links point to the right domain
- Dashboard links in emails are accurate

## Media Controls

### Camera Control
- **Enable**: Requests camera permission and starts video stream
- **Disable**: Stops video but keeps audio active
- **Auto-enable**: Video enabled by default for better UX

### Microphone Control  
- **Mute/Unmute**: Toggle audio on/off
- **Visual feedback**: Icons update to show current state
- **Broadcast**: State changes are sent to other participants

### Screen Sharing
- **Start**: Replaces camera feed with screen capture
- **Stop**: Returns to camera feed
- **Auto-stop**: Handles browser's native screen share stop button
- **Audio included**: Captures system audio if available

## Technical Details

### WebRTC Configuration
```javascript
rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // ... additional STUN servers
  ]
}
```

### Media Constraints
```javascript
constraints = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true
  }
}
```

## Connection Flow

1. **Join Meeting**: User enters meeting room
2. **Initialize Media**: Request camera/microphone access
3. **Socket Connection**: Connect to signaling server
4. **Peer Discovery**: Get list of existing participants  
5. **WebRTC Setup**: Create peer connections for each participant
6. **Media Exchange**: Share video/audio streams
7. **Ongoing Signaling**: Handle new participants and departures

## Error Handling

### Common Issues and Solutions

**Media Access Denied**
- Clear browser permissions and refresh
- Check if camera/mic is used by another app
- Enable permissions in browser settings

**Connection Failed**
- Check network connectivity
- Firewall may be blocking WebRTC traffic
- Consider adding TURN server for NAT traversal

**No Audio/Video**
- Verify media devices are connected
- Check browser compatibility
- Ensure HTTPS in production (required for getUserMedia)

## Browser Compatibility

✅ **Chrome 60+**: Full support  
✅ **Firefox 55+**: Full support  
✅ **Safari 11+**: Full support (requires HTTPS)  
✅ **Edge 15+**: Full support  
❌ **IE**: Not supported (WebRTC not available)

## Production Deployment

### HTTPS Requirement
WebRTC requires HTTPS in production for security:
```
https://yourdomain.com
```

### TURN Server (Optional)
For better connectivity behind NATs/firewalls:
```env
TURN_SERVER_URL=turn:your-turn-server.com:3478
TURN_USERNAME=username
TURN_CREDENTIAL=password
```

### Performance Optimization
- Use CDN for static assets
- Enable gzip compression
- Configure proper CORS headers
- Use HTTP/2 for better multiplexing

## Socket.IO Events

### Client to Server
- `join-meeting`: Join a meeting room
- `webrtc-offer`: Send WebRTC offer
- `webrtc-answer`: Send WebRTC answer  
- `webrtc-ice-candidate`: Send ICE candidate
- `media-toggle`: Toggle audio/video state
- `screen-share`: Start/stop screen sharing
- `chat-message`: Send chat message

### Server to Client  
- `participant-joined`: New participant notification
- `participant-left`: Participant departure notification
- `webrtc-offer`: Receive WebRTC offer
- `webrtc-answer`: Receive WebRTC answer
- `webrtc-ice-candidate`: Receive ICE candidate
- `participant-media-state`: Media state updates
- `participant-screen-share`: Screen share notifications
- `chat-message`: Receive chat messages

## Security Considerations

### Data Protection
- All WebRTC traffic is encrypted (DTLS/SRTP)
- Peer-to-peer connections bypass server
- No media data stored on server

### Access Control
- Meeting codes for room access
- Socket.IO session management
- Media permission validation

## Monitoring and Analytics

The server logs important WebRTC events:
- Connection establishments
- Media state changes  
- Screen sharing events
- Participant join/leave events
- Error conditions

## Troubleshooting

### Debug Mode
Enable verbose WebRTC logging:
```javascript
// Add to browser console
localStorage.debug = 'socket.io-client:socket';
```

### Network Analysis
Check WebRTC stats:
```javascript
// In browser console during call
pc.getStats().then(stats => console.log(stats));
```

### Common Error Messages
- "NotAllowedError": Permission denied
- "NotFoundError": No camera/microphone  
- "NotReadableError": Device in use
- "OverconstrainedError": Constraints not supported

---

## Next Steps

For advanced features, consider adding:
- **Recording**: Save meetings to cloud storage  
- **TURN Server**: Better NAT traversal
- **Simulcast**: Multiple quality streams
- **Virtual Backgrounds**: AI-powered background replacement
- **Breakout Rooms**: Split large meetings into smaller groups
- **Live Streaming**: Broadcast to external platforms