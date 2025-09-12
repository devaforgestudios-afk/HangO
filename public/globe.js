// Lightweight interactive globe (no external libs). Not geo-accurate—just playful.
(function(){
  const canvas = document.getElementById('globeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let spinning = true;
  let rot = 0; // radians
  let scale = 1;

  const DPR = Math.min(2, window.devicePixelRatio||1);
  function resize(){
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * DPR;
    canvas.height = rect.height * DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  resize();
  window.addEventListener('resize', resize);

  // Simple trackball drag
  let dragging = false; let lastX = 0;
  canvas.addEventListener('pointerdown', (e)=>{ dragging=true; lastX=e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup',   (e)=>{ dragging=false; canvas.releasePointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e)=>{ if(dragging){ const dx = e.clientX-lastX; rot += dx*0.005; lastX=e.clientX; }});
  canvas.addEventListener('wheel', (e)=>{ e.preventDefault(); scale = Math.max(.8, Math.min(1.4, scale + (e.deltaY<0?0.05:-0.05))); }, { passive:false });

  // Land-ish arcs (procedural)
  const arcs = Array.from({length: 120}, (_,i)=>{
    const lat = (Math.random()*Math.PI) - Math.PI/2; // -pi/2..pi/2
    const lon = Math.random()*Math.PI*2;
    return { lat, lon, r: 0.6 + Math.random()*0.35 };
  });

  function project(lat, lon, R){
    // Simple sphere projection with rotation around vertical axis
    const x = Math.cos(lat)*Math.cos(lon+rot) * R;
    const y = Math.sin(lat) * R;
    const z = Math.cos(lat)*Math.sin(lon+rot) * R;
    return { x, y, z };
  }

  function draw(){
    const w = canvas.width / DPR, h = canvas.height / DPR;
    ctx.clearRect(0,0,w,h);
    ctx.save();
    ctx.translate(w/2, h/2);
    const R = Math.min(w,h)*0.36*scale;

    // Atmosphere glow
    const g = ctx.createRadialGradient(0,0,R*1.1, 0,0, R*1.6);
    g.addColorStop(0,'rgba(99,102,241,.15)');
    g.addColorStop(1,'rgba(99,102,241,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0,0,R*1.6,0,Math.PI*2); ctx.fill();

    // Sphere base
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.fill();

    // Longitudes/latitudes meridians
    ctx.strokeStyle = 'rgba(148,163,184,.25)'; ctx.lineWidth = 1;
    for(let i=0;i<12;i++){
      const a = i*Math.PI/6;
      ctx.beginPath();
      for(let t=-Math.PI/2;t<=Math.PI/2;t+=Math.PI/90){
        const p = project(t, a, R);
        if(p.z>0){ ctx.lineTo(p.x, p.y); } // front hemisphere only
      }
      ctx.stroke();
    }

    for(let j=-3;j<=3;j++){
      const lat = j*Math.PI/12;
      ctx.beginPath();
      for(let t=0;t<=Math.PI*2;t+=Math.PI/90){
        const p = project(lat, t, R);
        if(p.z>0){ ctx.lineTo(p.x, p.y); }
      }
      ctx.stroke();
    }

    // Land-ish arcs (front only)
    ctx.strokeStyle = 'rgba(56,189,248,.8)'; ctx.lineWidth = 1.5;
    arcs.forEach(a=>{
      ctx.beginPath();
      for(let t=0;t<Math.PI*2;t+=Math.PI/120){
        const p = project(a.lat + Math.sin(t)*0.03, a.lon + Math.cos(t)*0.03, R*a.r);
        if(p.z>0){ ctx.lineTo(p.x, p.y); }
      }
      ctx.stroke();
    });

    ctx.restore();
    if (spinning) rot += 0.0035; // slow spin
    requestAnimationFrame(draw);
  }
  draw();

  // No on-canvas controls; keep drag/zoom and auto-spin
})();
