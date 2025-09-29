/**
 * WebRTC Client Implementation for HangO
 * Handles peer-to-peer video and audio connections
 */

class HangOWebRTC {
  constructor(socket, localVideoElement, remoteVideoContainer) {
    this.socket = socket;
    this.localVideoElement = localVideoElement;
    this.remoteVideoContainer = remoteVideoContainer;
    this.localStream = null;
    this.remoteStreams = new Map();
    this.peerConnections = new Map();
    this.isInitialized = false;
    
    // WebRTC Configuration with STUN servers
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    };
    
    // Add TURN servers if available (can be configured via environment)
    if (window.TURN_CONFIG) {
      this.rtcConfig.iceServers.push(window.TURN_CONFIG);
    }
    
    this.setupSocketListeners();
  }

  setupSocketListeners() {
    // Handle incoming WebRTC signaling
    this.socket.on('webrtc-offer', async (data) => {
      console.log('📨 Received WebRTC offer from:', data.sender);
      await this.handleOffer(data.offer, data.sender);
    });

    this.socket.on('webrtc-answer', async (data) => {
      console.log('📨 Received WebRTC answer from:', data.sender);
      await this.handleAnswer(data.answer, data.sender);
    });

    this.socket.on('webrtc-ice-candidate', async (data) => {
      console.log('🧊 Received ICE candidate from:', data.sender);
      await this.handleIceCandidate(data.candidate, data.sender);
    });

    this.socket.on('participant-joined', (data) => {
      console.log('👋 New participant joined, initiating connection:', data.participant.name);
      if (this.localStream) {
        // Initiate connection to new participant
        setTimeout(() => {
          this.createPeerConnection(data.socketId, true);
        }, 1000);
      }
    });

    this.socket.on('participant-left', (data) => {
      console.log('👋 Participant left, cleaning up connection');
      this.cleanupPeerConnection(data.socketId);
    });
  }

  async initializeMedia(constraints = { video: true, audio: true }) {
    try {
      console.log('🎥 Initializing media with constraints:', constraints);
      
      // Get user media
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('✅ Local media stream obtained');
      
      // Display local video
      if (this.localVideoElement && constraints.video) {
        this.localVideoElement.srcObject = this.localStream;
        this.localVideoElement.style.display = 'block';
        
        // Hide placeholder
        const placeholder = document.getElementById('videoPlaceholder');
        if (placeholder) placeholder.style.display = 'none';
      }
      
      this.isInitialized = true;
      return this.localStream;
      
    } catch (error) {
      console.error('❌ Error accessing media devices:', error);
      
      // Show user-friendly error messages
      let errorMessage = 'Unable to access camera/microphone. ';
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Please allow camera and microphone permissions and try again.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera or microphone found.';
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Camera or microphone is already in use by another application.';
      } else {
        errorMessage += error.message;
      }
      
      // Show notification to user
      if (window.showNotification) {
        window.showNotification('Media Error', errorMessage);
      } else {
        alert(errorMessage);
      }
      
      throw error;
    }
  }

  async createPeerConnection(participantId, isInitiator = false) {
    console.log(`🔗 Creating peer connection with ${participantId}, initiator: ${isInitiator}`);
    
    try {
      // Create new RTCPeerConnection
      const pc = new RTCPeerConnection(this.rtcConfig);
      this.peerConnections.set(participantId, pc);
      
      // Add local stream tracks to peer connection
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          console.log(`➕ Adding ${track.kind} track to peer connection`);
          pc.addTrack(track, this.localStream);
        });
      }
      
      // Handle incoming remote stream
      pc.ontrack = (event) => {
        console.log(`📺 Received remote ${event.track.kind} track from ${participantId}`);
        this.handleRemoteStream(event.streams[0], participantId);
      };
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate to', participantId);
          this.socket.emit('webrtc-ice-candidate', {
            target: participantId,
            candidate: event.candidate
          });
        }
      };
      
      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log(`🔗 Connection state with ${participantId}:`, pc.connectionState);
        if (pc.connectionState === 'connected') {
          console.log(`✅ Successfully connected to ${participantId}`);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          console.log(`❌ Connection failed with ${participantId}`);
          this.cleanupPeerConnection(participantId);
        }
      };
      
      // If we're the initiator, create and send offer
      if (isInitiator) {
        await this.createAndSendOffer(participantId);
      }
      
    } catch (error) {
      console.error('❌ Error creating peer connection:', error);
      this.cleanupPeerConnection(participantId);
    }
  }

  async createAndSendOffer(participantId) {
    try {
      const pc = this.peerConnections.get(participantId);
      if (!pc) return;
      
      console.log('📤 Creating offer for', participantId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      this.socket.emit('webrtc-offer', {
        target: participantId,
        offer: offer
      });
      
    } catch (error) {
      console.error('❌ Error creating offer:', error);
    }
  }

  async handleOffer(offer, senderId) {
    try {
      // Create peer connection if it doesn't exist
      if (!this.peerConnections.has(senderId)) {
        await this.createPeerConnection(senderId, false);
      }
      
      const pc = this.peerConnections.get(senderId);
      if (!pc) return;
      
      console.log('📥 Setting remote description from offer');
      await pc.setRemoteDescription(offer);
      
      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      console.log('📤 Sending answer to', senderId);
      this.socket.emit('webrtc-answer', {
        target: senderId,
        answer: answer
      });
      
    } catch (error) {
      console.error('❌ Error handling offer:', error);
    }
  }

  async handleAnswer(answer, senderId) {
    try {
      const pc = this.peerConnections.get(senderId);
      if (!pc) return;
      
      console.log('📥 Setting remote description from answer');
      await pc.setRemoteDescription(answer);
      
    } catch (error) {
      console.error('❌ Error handling answer:', error);
    }
  }

  async handleIceCandidate(candidate, senderId) {
    try {
      const pc = this.peerConnections.get(senderId);
      if (!pc) return;
      
      console.log('🧊 Adding ICE candidate');
      await pc.addIceCandidate(candidate);
      
    } catch (error) {
      console.error('❌ Error handling ICE candidate:', error);
    }
  }

  handleRemoteStream(stream, participantId) {
    console.log(`📺 Handling remote stream from ${participantId}`);
    
    // Store remote stream
    this.remoteStreams.set(participantId, stream);
    
    // Create video element for remote stream
    let remoteVideo = document.getElementById(`remoteVideo-${participantId}`);
    if (!remoteVideo) {
      remoteVideo = document.createElement('video');
      remoteVideo.id = `remoteVideo-${participantId}`;
      remoteVideo.className = 'remote-video';
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.style.cssText = `
        width: 300px;
        height: 200px;
        object-fit: cover;
        border-radius: 12px;
        margin: 10px;
        border: 2px solid rgba(34, 211, 238, 0.3);
        background: #1e293b;
      `;
      
      // Add to remote video container
      if (this.remoteVideoContainer) {
        this.remoteVideoContainer.appendChild(remoteVideo);
      }
    }
    
    remoteVideo.srcObject = stream;
    
    // Add participant info overlay
    this.addParticipantInfo(remoteVideo, participantId);
  }

  addParticipantInfo(videoElement, participantId) {
    // Create participant info overlay
    const overlay = document.createElement('div');
    overlay.className = 'participant-overlay';
    overlay.style.cssText = `
      position: absolute;
      bottom: 8px;
      left: 8px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
    `;
    
    // Add audio level indicator
    const audioIndicator = document.createElement('div');
    audioIndicator.className = 'audio-level';
    audioIndicator.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      opacity: 0.7;
    `;
    
    overlay.appendChild(audioIndicator);
    overlay.appendChild(document.createTextNode(`Participant ${participantId.substring(0, 8)}`));
    
    // Make video container relative and add overlay
    const container = document.createElement('div');
    container.style.cssText = `
      position: relative;
      display: inline-block;
      margin: 10px;
    `;
    
    videoElement.parentNode.insertBefore(container, videoElement);
    container.appendChild(videoElement);
    container.appendChild(overlay);
    
    // Set up audio level monitoring for remote stream
    const stream = this.remoteStreams.get(participantId);
    if (stream && stream.getAudioTracks().length > 0) {
      this.setupAudioLevelMonitoring(stream, audioIndicator);
    }
  }

  setupAudioLevelMonitoring(stream, indicator) {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      microphone.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateAudioLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const normalizedLevel = Math.min(average / 50, 1);
        
        if (indicator) {
          indicator.style.opacity = Math.max(0.3, normalizedLevel);
          indicator.style.transform = `scale(${0.8 + normalizedLevel * 0.4})`;
        }
        
        requestAnimationFrame(updateAudioLevel);
      };
      
      updateAudioLevel();
      
    } catch (error) {
      console.warn('⚠️ Could not set up audio level monitoring:', error);
    }
  }

  cleanupPeerConnection(participantId) {
    console.log('🧹 Cleaning up peer connection for', participantId);
    
    // Close peer connection
    const pc = this.peerConnections.get(participantId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(participantId);
    }
    
    // Remove remote stream
    this.remoteStreams.delete(participantId);
    
    // Remove remote video element
    const remoteVideo = document.getElementById(`remoteVideo-${participantId}`);
    if (remoteVideo) {
      const container = remoteVideo.parentNode;
      if (container && container.className === 'participant-container') {
        container.remove();
      } else {
        remoteVideo.remove();
      }
    }
  }

  // Media control methods
  toggleAudio() {
    if (!this.localStream) return false;
    
    const audioTracks = this.localStream.getAudioTracks();
    const newState = !audioTracks[0]?.enabled;
    
    audioTracks.forEach(track => {
      track.enabled = newState;
    });
    
    console.log(`🎤 Audio ${newState ? 'enabled' : 'disabled'}`);
    return newState;
  }

  toggleVideo() {
    if (!this.localStream) return false;
    
    const videoTracks = this.localStream.getVideoTracks();
    const newState = !videoTracks[0]?.enabled;
    
    videoTracks.forEach(track => {
      track.enabled = newState;
    });
    
    // Update local video display
    if (this.localVideoElement) {
      this.localVideoElement.style.display = newState ? 'block' : 'none';
    }
    
    const placeholder = document.getElementById('videoPlaceholder');
    if (placeholder) {
      placeholder.style.display = newState ? 'none' : 'flex';
    }
    
    console.log(`📹 Video ${newState ? 'enabled' : 'disabled'}`);
    return newState;
  }

  async startScreenShare() {
    try {
      console.log('🖥️ Starting screen share');
      
      // Get screen share stream
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      
      // Replace video track in all peer connections
      const videoTrack = screenStream.getVideoTracks()[0];
      
      for (const [participantId, pc] of this.peerConnections) {
        const sender = pc.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        
        if (sender) {
          await sender.replaceTrack(videoTrack);
          console.log(`🖥️ Screen share started for ${participantId}`);
        }
      }
      
      // Update local video to show screen share
      if (this.localVideoElement) {
        this.localVideoElement.srcObject = screenStream;
      }
      
      // Handle screen share end
      videoTrack.onended = () => {
        console.log('🖥️ Screen share ended');
        this.stopScreenShare();
      };
      
      return true;
      
    } catch (error) {
      console.error('❌ Error starting screen share:', error);
      return false;
    }
  }

  async stopScreenShare() {
    try {
      console.log('🖥️ Stopping screen share');
      
      if (!this.localStream) return;
      
      // Replace screen share track with camera track
      const videoTrack = this.localStream.getVideoTracks()[0];
      
      for (const [participantId, pc] of this.peerConnections) {
        const sender = pc.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        
        if (sender && videoTrack) {
          await sender.replaceTrack(videoTrack);
          console.log(`📹 Camera restored for ${participantId}`);
        }
      }
      
      // Restore local video
      if (this.localVideoElement) {
        this.localVideoElement.srcObject = this.localStream;
      }
      
    } catch (error) {
      console.error('❌ Error stopping screen share:', error);
    }
  }

  // Cleanup method
  cleanup() {
    console.log('🧹 Cleaning up WebRTC connections');
    
    // Close all peer connections
    for (const [participantId, pc] of this.peerConnections) {
      pc.close();
    }
    this.peerConnections.clear();
    
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    // Clear remote streams
    this.remoteStreams.clear();
    
    // Remove remote video elements
    if (this.remoteVideoContainer) {
      this.remoteVideoContainer.innerHTML = '';
    }
  }
}

// Export for use in other files
window.HangOWebRTC = HangOWebRTC;