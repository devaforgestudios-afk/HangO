// Simple client-side meeting code demo
(function(){
  const msg = document.getElementById('heroMsg');
  const start = document.getElementById('startMeet');
  const join = document.getElementById('joinMeet');
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
    start.onclick = () => {
      showModal();
    };
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
    createMeeting.onclick = () => {
      const code = meetingCodeInput?.value || randomCode();
      const title = meetingTitleInput?.value?.trim();
      const enableVideo = document.getElementById('enableVideo')?.checked;
      const enableAudio = document.getElementById('enableAudio')?.checked;
      const allowScreenShare = document.getElementById('allowScreenShare')?.checked;
      
      // Store meeting preferences in localStorage for the meeting page
      const meetingSettings = {
        title: title || 'HangO Meeting',
        enableVideo,
        enableAudio,
        allowScreenShare
      };
      localStorage.setItem('meetingSettings', JSON.stringify(meetingSettings));
      
      toast(title ? `Creating "${title}"` : 'New meeting created');
      confetti();
      hideModal();
      
      setTimeout(() => {
        window.location.href = `/meet.html?code=${encodeURIComponent(code)}`;
      }, 500);
    };
  }

  // Quick join functionality
  if (quickJoin) {
    quickJoin.onclick = () => {
      // Generate a random code and join immediately
      const code = randomCode();
      toast(`Quick joining ${code}`);
      window.location.href = `/meet.html?code=${encodeURIComponent(code)}`;
    };
  }

  // Schedule meeting (placeholder for future functionality)
  if (scheduleMeet) {
    scheduleMeet.onclick = () => {
      toast('Schedule feature coming soon!');
    };
  }

  if (join){
    join.onclick = () => {
      const code = (input?.value || '').trim().toUpperCase();
      if (!code) { 
        if (msg) msg.textContent = 'Enter a code first';
        toast('Please enter a meeting code');
        input?.focus();
        return; 
      }
      
      // Validate code format (6-8 characters, alphanumeric)
      if (!/^[A-Z0-9]{3,8}$/.test(code)) {
        toast('Invalid code format. Use 3-8 letters/numbers.');
        input?.focus();
        return;
      }
      
      // Show joining feedback
      const originalText = join.textContent;
      join.textContent = 'Joining...';
      join.disabled = true;
      
      toast(`Joining meeting ${code}`);
      
      // Simulate validation delay (in real app, this would be an API call)
      setTimeout(() => {
        window.location.href = `/meet.html?code=${encodeURIComponent(code)}`;
      }, 800);
    };
  }

  // Enhanced input handling
  if (input) {
    input.addEventListener('input', (e) => {
      // Auto-format and validate as user types
      let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (value.length > 8) value = value.slice(0, 8);
      e.target.value = value;
      
      // Enable/disable join button based on valid input
      if (join) {
        join.disabled = value.length < 3;
      }
    });

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && join && !join.disabled) {
        join.click();
      }
    });

    // Auto-focus and select all on page load
    if (input.value) {
      input.select();
    }
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
})();
