// Simple client-side meeting code demo
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM fully loaded');
  
  // Check for auto-join parameter
  const urlParams = new URLSearchParams(window.location.search);
  const joinCode = urlParams.get('join');
  
  if (joinCode) {
    // Auto-join functionality
    console.log('Auto-joining meeting with code:', joinCode);
    autoJoinMeeting(joinCode);
    return;
  }
  
  const msg = document.getElementById('heroMsg');
  const start = document.getElementById('startMeet');
  const join = document.getElementById('joinMeet');
  
  console.log('Found start button:', !!start);
  console.log('Found join button:', !!join);
  
  if (start) {
    console.log('Start button element:', start);
  }
  const input = document.getElementById('joinCode');
  const quickJoin = document.getElementById('quickJoin');
  const scheduleMeet = document.getElementById('scheduleMeet');
  
  // Modal elements
  const modal = document.getElementById('meetingModal');
  const modalOverlay = document.getElementById('modalOverlay');
  const closeModal = document.getElementById('closeModal');
  const generateCode = document.getElementById('generateCode');
  const createMeeting = document.getElementById('createMeeting');
  const cancelMeeting = document.getElementById('cancelMeeting');
  const meetingCodeInput = document.getElementById('meetingCode');
  const meetingTitleInput = document.getElementById('meetingTitle');

  function randomCode(){ return Math.random().toString(36).slice(2, 8).toUpperCase(); }

  function toast(text){
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    document.body.appendChild(el);
    requestAnimationFrame(()=> el.classList.add('show'));
    setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=> el.remove(), 200); }, 1400);
  }

  function confetti(){ /* removed emoji confetti for a cleaner look */ }

  async function autoJoinMeeting(code) {
    // Show a nice joining message
    document.body.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        text-align: center;
        padding: 20px;
      ">
        <div style="
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          padding: 40px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          max-width: 500px;
        ">
          <div style="
            width: 60px;
            height: 60px;
            border: 4px solid rgba(59, 130, 246, 0.3);
            border-top: 4px solid #3b82f6;
            border-radius: 50%;
            margin: 0 auto 20px;
            animation: spin 1s linear infinite;
          "></div>
          
          <h1 style="margin: 0 0 10px; font-size: 24px;">Joining Meeting</h1>
          <p style="margin: 0 0 20px; opacity: 0.8; font-size: 16px;">Meeting Code: <strong>${code}</strong></p>
          <p style="margin: 0; opacity: 0.6; font-size: 14px;">Please wait while we connect you...</p>
        </div>
        
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </div>
    `;
    
    try {
      // First, try to join the meeting via API
      const response = await fetch('/api/meeting/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          meeting_code: code.toUpperCase(),
          anonymous_name: 'Anonymous User',
          session_id: Math.random().toString(36).substr(2, 9)
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Success! Redirect to pre-meeting setup
        setTimeout(() => {
          window.location.href = `/premeeting.html?code=${encodeURIComponent(code.toUpperCase())}&title=Meeting ${code.toUpperCase()}`;
        }, 1500);
      } else {
        throw new Error(result.error || 'Meeting not found');
      }
    } catch (error) {
      // Show error and provide manual join option
      document.body.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          text-align: center;
          padding: 20px;
        ">
          <div style="
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 40px;
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            max-width: 500px;
          ">
            <div style="
              width: 60px;
              height: 60px;
              background: linear-gradient(135deg, #ef4444, #dc2626);
              border-radius: 50%;
              margin: 0 auto 20px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 24px;
            ">⚠️</div>
            
            <h1 style="margin: 0 0 10px; font-size: 24px;">Meeting Not Found</h1>
            <p style="margin: 0 0 20px; opacity: 0.8; font-size: 16px;">
              Could not find meeting with code: <strong>${code}</strong>
            </p>
            <p style="margin: 0 0 30px; opacity: 0.6; font-size: 14px;">
              The meeting may have ended or the code may be incorrect.
            </p>
            
            <button onclick="window.location.href='/'" style="
              background: linear-gradient(135deg, #3b82f6, #8b5cf6);
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 12px;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
              transition: transform 0.2s ease;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              Go to Home Page
            </button>
          </div>
        </div>
      `;
    }
  }

  function showModal() {
    if (modal) {
      modal.style.display = 'flex';
      if (meetingCodeInput) meetingCodeInput.value = randomCode();
      document.body.style.overflow = 'hidden';
    }
  }

  function hideModal() {
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  if (start){
    console.log('Attaching click handler to start button');
    start.onclick = async (e) => {
      e.preventDefault();
      console.log('Start Meeting button clicked!');
      
      // Create an instant meeting via API
      const code = randomCode();
      console.log('Generated code:', code);
      
      const meetingData = {
        meeting_code: code,
        title: 'Instant Meeting',
        settings: {
          enableVideo: true,
          enableAudio: true,
          allowScreenShare: true
        },
        anonymous_name: 'Anonymous User'
      };
      
      console.log('Creating meeting with data:', meetingData);
      toast('Creating instant meeting...');
      
      try {
        const response = await fetch('/api/meeting/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(meetingData)
        });
        
        console.log('API response status:', response.status);
        const result = await response.json();
        console.log('API result:', result);
        
        if (result.success) {
          toast('Meeting created! Redirecting...');
          setTimeout(() => {
            console.log('Redirecting to pre-meeting page...');
            window.location.href = `/premeeting.html?code=${encodeURIComponent(result.meeting.meeting_code)}&title=Instant Meeting`;
          }, 1000);
        } else {
          toast(`Error: ${result.error}`);
          console.error('Meeting creation failed:', result.error);
        }
      } catch (error) {
        console.error('Network error creating meeting:', error);
        toast('Failed to create meeting. Please try again.');
      }
    };
  } else {
    console.error('Start button not found! Available buttons:');
    console.log('startMeet:', document.getElementById('startMeet'));
    console.log('All buttons:', document.querySelectorAll('button'));
  }

  if (closeModal) closeModal.onclick = hideModal;
  if (cancelMeeting) cancelMeeting.onclick = hideModal;
  if (modalOverlay) modalOverlay.onclick = hideModal;

  if (generateCode && meetingCodeInput) {
    generateCode.onclick = () => {
      meetingCodeInput.value = randomCode();
    };
  }

  if (createMeeting) {
    createMeeting.onclick = async () => {
      const code = meetingCodeInput?.value || randomCode();
      const title = meetingTitleInput?.value?.trim();
      const enableVideo = document.getElementById('enableVideo')?.checked;
      const enableAudio = document.getElementById('enableAudio')?.checked;
      const allowScreenShare = document.getElementById('allowScreenShare')?.checked;
      
      // Prepare meeting data
      const meetingData = {
        meeting_code: code,
        title: title || 'HangO Meeting',
        settings: {
          enableVideo,
          enableAudio,
          allowScreenShare
        },
        anonymous_name: 'Anonymous User' // For non-logged-in users
      };
      
      try {
        // Create meeting via API
        const response = await fetch('/api/meeting/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(meetingData)
        });
        
        const result = await response.json();
        
        if (result.success) {
          // Store meeting preferences in localStorage for the meeting page
          const meetingSettings = {
            title: result.meeting.title,
            enableVideo,
            enableAudio,
            allowScreenShare
          };
          localStorage.setItem('meetingSettings', JSON.stringify(meetingSettings));
          
          toast(title ? `Creating "${title}"` : 'New meeting created');
          confetti();
          hideModal();
          
          setTimeout(() => {
            const meetingTitle = title || 'HangO Meeting';
            window.location.href = `/premeeting.html?code=${encodeURIComponent(result.meeting.meeting_code)}&title=${encodeURIComponent(meetingTitle)}`;
          }, 500);
        } else {
          toast(`Error: ${result.error}`);
        }
      } catch (error) {
        console.error('Meeting creation error:', error);
        toast('Failed to create meeting. Please try again.');
      }
    };
  }

  // Quick join functionality
  if (quickJoin) {
    quickJoin.onclick = async () => {
      // Generate a random code and create meeting immediately
      const code = randomCode();
      
      try {
        // Create a quick meeting
        const response = await fetch('/api/meeting/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            meeting_code: code,
            title: 'Quick Meeting',
            settings: {
              enableVideo: true,
              enableAudio: true,
              allowScreenShare: true
            },
            anonymous_name: 'Anonymous User'
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          toast(`Quick joining ${result.meeting.meeting_code}`);
          window.location.href = `/premeeting.html?code=${encodeURIComponent(result.meeting.meeting_code)}&title=Quick Meeting`;
        } else {
          toast(`Error: ${result.error}`);
        }
      } catch (error) {
        console.error('Quick meeting creation error:', error);
        toast('Failed to create quick meeting. Please try again.');
      }
    };
  }

  // Schedule meeting (placeholder for future functionality)
  if (scheduleMeet) {
    scheduleMeet.onclick = () => {
      toast('Schedule feature coming soon!');
    };
  }

  if (join){
    join.onclick = async () => {
      const code = (input?.value || '').trim().toUpperCase();
      if (!code) { 
        if (msg) msg.textContent = 'Enter a code first';
        toast('Please enter a meeting code');
        input?.focus();
        input?.style.setProperty('border-color', '#ef4444', 'important');
        setTimeout(() => input?.style.removeProperty('border-color'), 2000);
        return; 
      }
      
      // Validate code format (3-8 characters, alphanumeric)
      if (!/^[A-Z0-9]{3,8}$/.test(code)) {
        toast('Invalid code format. Use 3-8 letters/numbers.');
        input?.focus();
        input?.style.setProperty('border-color', '#ef4444', 'important');
        setTimeout(() => input?.style.removeProperty('border-color'), 2000);
        return;
      }
      
      // Show joining feedback with animation
      const originalText = join.textContent;
      join.textContent = 'Joining...';
      join.disabled = true;
      join.style.opacity = '0.7';
      
      // Add loading animation to input
      input.style.borderColor = '#2563eb';
      input.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
      
      try {
        // First, check if meeting exists
        const checkResponse = await fetch(`/api/meeting/${code}`);
        const checkResult = await checkResponse.json();
        
        if (checkResult.success && checkResult.meeting) {
          // Meeting exists, join it
          const joinResponse = await fetch('/api/meeting/join', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              meeting_code: code,
              anonymous_name: 'Anonymous User',
              session_id: Math.random().toString(36).substr(2, 9)
            })
          });
          
          const joinResult = await joinResponse.json();
          
          if (joinResult.success) {
            // Success feedback
            join.textContent = 'Joining! ✓';
            join.style.backgroundColor = '#22c55e';
            join.style.color = 'white';
            input.style.borderColor = '#22c55e';
            input.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
            
            toast(`Joining meeting ${code}`);
            
            setTimeout(() => {
              window.location.href = `/premeeting.html?code=${encodeURIComponent(code)}&title=${encodeURIComponent(checkResult.meeting.title || `Meeting ${code}`)}`;
            }, 800);
          } else {
            throw new Error(joinResult.error || 'Failed to join meeting');
          }
        } else {
          // Meeting doesn't exist, create it first
          join.textContent = 'Creating...';
          toast(`Creating meeting ${code}...`);
          
          const createResponse = await fetch('/api/meeting/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              meeting_code: code,
              title: `Meeting ${code}`,
              settings: {
                enableVideo: true,
                enableAudio: true,
                allowScreenShare: true
              },
              anonymous_name: 'Anonymous User'
            })
          });
          
          const createResult = await createResponse.json();
          
          if (createResult.success) {
            // Meeting created, now join it
            join.textContent = 'Joining! ✓';
            join.style.backgroundColor = '#22c55e';
            join.style.color = 'white';
            input.style.borderColor = '#22c55e';
            input.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
            
            toast(`Meeting ${code} created! Joining...`);
            
            setTimeout(() => {
              window.location.href = `/premeeting.html?code=${encodeURIComponent(code)}&title=${encodeURIComponent(`Meeting ${code}`)}`;
            }, 800);
          } else {
            throw new Error(createResult.error || 'Failed to create meeting');
          }
        }
      } catch (error) {
        console.error('Meeting join/create error:', error);
        
        // Error feedback
        const errorMsg = error.message || 'Connection failed';
        toast(`Error: ${errorMsg}`);
        
        // Visual error feedback
        join.textContent = 'Failed ✗';
        join.style.backgroundColor = '#ef4444';
        join.style.color = 'white';
        input.style.borderColor = '#ef4444';
        input.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        
        // Reset after delay
        setTimeout(() => {
          join.textContent = originalText;
          join.disabled = code.length < 3;
          join.style.backgroundColor = '';
          join.style.color = '';
          join.style.opacity = '';
          input.style.borderColor = code.length >= 3 ? '#22c55e' : '';
          input.style.backgroundColor = code.length >= 3 ? 'rgba(34, 197, 94, 0.1)' : '';
        }, 2000);
      }
    };
  }

  // Enhanced input handling with better UX
  if (input) {
    const codeHint = document.getElementById('codeHint');
    
    // Initialize button state
    if (join) {
      join.disabled = true;
      join.textContent = 'Join';
    }
    
    input.addEventListener('input', (e) => {
      // Auto-format and validate as user types
      let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (value.length > 8) value = value.slice(0, 8);
      e.target.value = value;
      
      // Real-time validation and button state
      if (join) {
        const isValid = value.length >= 3 && /^[A-Z0-9]{3,8}$/.test(value);
        join.disabled = !isValid;
        
        // Visual feedback for input validity
        if (value.length === 0) {
          input.style.borderColor = '';
          input.style.backgroundColor = '';
        } else if (isValid) {
          input.style.borderColor = '#22c55e';
          input.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
        } else {
          input.style.borderColor = '#ef4444';
          input.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        }
      }
    });

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && join && !join.disabled) {
        join.click();
      }
    });
    
    // Focus handling with hints
    input.addEventListener('focus', () => {
      input.style.transform = 'scale(1.02)';
      input.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.2)';
      if (codeHint && input.value.length === 0) {
        codeHint.style.display = 'block';
      }
    });
    
    input.addEventListener('blur', () => {
      input.style.transform = '';
      input.style.boxShadow = '';
      if (codeHint) {
        setTimeout(() => codeHint.style.display = 'none', 200);
      }
    });

    // Auto-focus and select all on page load if there's existing value
    if (input.value) {
      input.select();
    }
    
    // Add paste handling for meeting codes
    input.addEventListener('paste', (e) => {
      setTimeout(() => {
        // Trigger input event after paste to format the code
        input.dispatchEvent(new Event('input'));
      }, 10);
    });
  }

  // Glow button removed

  // Theme palette
  const themeRoot = document.body;
  const themeDots = document.querySelectorAll('.dot[data-theme]');
  if (themeDots.length){
    themeDots.forEach(btn => {
      btn.addEventListener('click', ()=>{
        const theme = btn.getAttribute('data-theme');
        themeRoot.classList.remove('theme-sunset','theme-ocean','theme-candy','theme-forest');
        themeRoot.classList.add('theme-'+theme);
        toast(`Theme: ${theme}`);
      });
    });
  }

  // Mobile nav toggle (dock navbar)
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.getElementById('navMenu');
  if (navToggle && navMenu){
    navToggle.addEventListener('click', ()=>{
      const open = navMenu.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }

  // Parallax tilt for the demo screen card
  const tilt = document.getElementById('tiltCard');
  if (tilt){
    tilt.addEventListener('mousemove', (e)=>{
      const r = tilt.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width; // 0..1
      const y = (e.clientY - r.top) / r.height; // 0..1
      const rx = (0.5 - y) * 10; // tilt up/down
      const ry = (x - 0.5) * 10; // tilt left/right
      tilt.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
    tilt.addEventListener('mouseleave', ()=>{
      tilt.style.transform = 'rotateX(0deg) rotateY(0deg)';
    });
  }

  // Simple particle background
  const canvas = document.getElementById('bgParticles');
  if (canvas){
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    let w, h; let dots = [];
    function resize(){
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * DPR; canvas.height = h * DPR; ctx.setTransform(DPR,0,0,DPR,0,0);
    }
    function reset(){
      dots = Array.from({length: 110}, ()=>({
        x: Math.random()*w, y: Math.random()*h,
        vx: (Math.random()-.5)*0.7, vy: (Math.random()-.5)*0.7,
        r: 1 + Math.random()*2.2
      }));
    }
    function tick(){
      ctx.clearRect(0,0,w,h);
      // Soft gradient glow
      const g = ctx.createRadialGradient(w*0.7, h*0.3, 40, w*0.7, h*0.3, Math.max(w,h)*0.8);
      g.addColorStop(0,'rgba(99,102,241,.06)');
      g.addColorStop(1,'rgba(99,102,241,0)');
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
      // Dots
      ctx.fillStyle = 'rgba(148,163,184,.8)';
      for(const d of dots){
        d.x += d.vx; d.y += d.vy;
        if (d.x<0||d.x>w) d.vx*=-1; if (d.y<0||d.y>h) d.vy*=-1;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI*2); ctx.fill();
      }
      requestAnimationFrame(tick);
    }
    resize(); reset(); tick();
    window.addEventListener('resize', ()=>{ resize(); reset(); });
  }

  // Removed emoji bubbles for a cleaner visual aesthetic
  
  // World time rail updater
  const chips = document.querySelectorAll('.globe-rail .rail-chip');
  if (chips.length){
    const fmt = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' });
    const update = () => {
      chips.forEach(ch => {
        const tz = ch.getAttribute('data-tz');
        try{
          const time = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date());
          const el = ch.querySelector('[data-time]');
          if (el) el.textContent = time;
        }catch{}
      });
    };
    update();
    setInterval(update, 1000);
  }
});
