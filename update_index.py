import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace Header
text = text.replace(
    '<h1>The ultimate renting intelligence.<br>Built for the modern tenant.</h1>\n      <p class="hero-sub">Track inspections, verify condition reports, and securely analyze your lease with AI. Everything you need to secure your bond and rent confidently — right in your pocket.</p>',
    '<h1>Rent smarter.<br>Protect your bond.</h1>\n      <p class="hero-sub">Your complete renting companion. Track inspections, understand your lease, and secure your bond with AI — all from your pocket.</p>'
)

# Replace phone-wrap
phone_wrap_replacement = """<div class="carousel-container" style="display: flex; align-items: center; gap: 16px; margin: 0 auto; z-index: 2;">
      <button class="carousel-btn" id="c-prev" aria-label="Previous screen" style="background: var(--glass-surface-3); border: 1px solid var(--border); border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text); font-size: 18px; box-shadow: var(--shadow-float); backdrop-filter: blur(8px); transition: all 0.2s;">❮</button>
      
      <div class="phone-wrap" style="margin: 0;">
        <div class="float-badge float-badge-top" id="hero-badge-top">
          <div class="fb-icon">👋</div>
          <div><div class="fb-text">Home Dashboard</div><div class="fb-sub">Everything in order</div></div>
        </div>
        <div class="phone">
          
          <!-- SCREEN 1: HOME -->
          <div class="phone-screen" id="screen-home" style="display:flex; flex:1; flex-direction:column; background:var(--glass-surface-3);">
            <div class="phone-header" style="background:var(--blue-dk);">
              <div class="ph-brand" style="color:var(--blue-lt);">RENTERIQ</div>
              <div class="ph-loc">Welcome Back</div>
              <div class="ph-count" style="color:var(--teal);">Your rental health is excellent</div>
            </div>
            <div style="padding:16px;">
              <div style="background:rgba(0,200,150,0.1); border:1px solid rgba(0,200,150,0.3); border-radius:12px; padding:16px; margin-bottom:12px;">
                <div style="font-family:'Sora', sans-serif; font-size:14px; font-weight:800; color:var(--teal-dk); margin-bottom:4px;">Next Rent Due</div>
                <div style="font-size:14px; color:var(--text); font-weight:700;">$520 · in 3 days</div>
              </div>
              <div style="background:rgba(27,80,200,0.05); border:1px solid rgba(27,80,200,0.1); border-radius:12px; padding:16px;">
                <div style="font-family:'Sora', sans-serif; font-size:14px; font-weight:800; color:var(--blue); margin-bottom:4px;">Active Lease</div>
                <div style="font-size:13px; color:var(--muted); margin-bottom:12px;">14 Church St, Richmond</div>
                <div style="font-size:11px; font-weight:700; color:#fff; background:var(--blue); display:inline-block; padding:4px 10px; border-radius:100px;">11 Months Left</div>
              </div>
            </div>
          </div>

          <!-- SCREEN 2: SEARCH -->
          <div class="phone-screen" id="screen-search" style="display:none; flex:1; flex-direction:column; background:var(--glass-surface-3);">
            <div class="phone-header">
              <div class="ph-brand">RENTERIQ</div>
              <div class="ph-loc">Melbourne VIC</div>
              <div class="ph-count">Available Rentals · 42 found</div>
              <div class="ph-search" style="margin-bottom:0;">Search suburb or address…</div>
            </div>
            <div class="phone-cards" style="padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; flex: 1; background: transparent;">
              <div class="phone-card">
                <div class="pc-price">$520/wk</div>
                <div class="pc-addr">14 Church St, Richmond VIC 3121</div>
                <div class="pc-tags"><span class="pc-tag">2 Bed</span><span class="pc-tag">1 Bath</span><span class="pc-tag teal">Open Sat</span></div>
              </div>
              <div class="phone-card">
                <div class="pc-price">$680/wk</div>
                <div class="pc-addr">7/88 Flinders Ln, Melbourne VIC 3000</div>
                <div class="pc-tags"><span class="pc-tag">2 Bed</span><span class="pc-tag">2 Bath</span><span class="pc-tag teal">Inspect</span></div>
              </div>
            </div>
          </div>

          <!-- SCREEN 3: INSPECT -->
          <div class="phone-screen" id="screen-inspect" style="display:none; flex:1; flex-direction:column; background:var(--glass-surface-3);">
            <div class="phone-header" style="background:#0A2460;">
              <div class="ph-brand" style="color:var(--teal);">ROUTINE</div>
              <div class="ph-loc">Condition Report</div>
              <div class="ph-count">Living Room</div>
            </div>
            <div style="padding:16px;">
              <div style="height:110px; background:var(--blue-lt); border-radius:12px; margin-bottom:12px; display:flex; align-items:center; justify-content:center; font-size:24px; border:2px dashed var(--blue);">📷</div>
              <div style="font-family:'Sora', sans-serif; font-size:13px; font-weight:700; margin-bottom:6px; color:var(--text);">Add note on carpet stain</div>
              <div style="width:100%; height:46px; background:rgba(0,0,0,0.05); border-radius:8px; padding:8px; font-size:12px; color:var(--muted); border:1px solid var(--border);">Pre-existing stain near window...</div>
              <div style="width:100%; margin-top:12px; background:linear-gradient(135deg, var(--blue), var(--teal)); color:#fff; font-weight:700; font-size: 13px; padding:10px; border-radius:100px; text-align:center;">Save to Vault</div>
            </div>
          </div>

          <!-- SCREEN 4: VAULT -->
          <div class="phone-screen" id="screen-vault" style="display:none; flex:1; flex-direction:column; background:var(--glass-surface-3);">
            <div class="phone-header" style="background:linear-gradient(135deg, var(--blue), var(--teal));">
              <div class="ph-brand" style="color:var(--blue-dk);">SECURE</div>
              <div class="ph-loc">My Vault</div>
              <div class="ph-count" style="color:rgba(255,255,255,0.8);">3 Documents stored</div>
            </div>
            <div style="padding:16px; display:flex; flex-direction:column; gap:10px;">
              <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border); padding:12px; border-radius:12px; display:flex; gap:12px; align-items:center;">
                <span style="font-size:20px;">📄</span><div><div style="font-weight:700; font-size:13px; color:var(--text);">Lease Agreement</div><div style="font-size:11px; color:var(--muted);">Signed Mar 12</div></div>
              </div>
               <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border); padding:12px; border-radius:12px; display:flex; gap:12px; align-items:center;">
                <span style="font-size:20px;">📸</span><div><div style="font-weight:700; font-size:13px; color:var(--text);">Move-in Audit</div><div style="font-size:11px; color:var(--muted);">42 Photos</div></div>
              </div>
            </div>
          </div>

          <div class="phone-tabs">
            <div class="phone-tab active" id="tab-home"><div class="tab-icon">🏠</div>Home</div>
            <div class="phone-tab" id="tab-search"><div class="tab-icon">🔍</div>Search</div>
            <div class="phone-tab" id="tab-inspect"><div class="tab-icon">📋</div>Inspect</div>
            <div class="phone-tab" id="tab-vault"><div class="tab-icon">🔒</div>Vault</div>
          </div>
        </div>
        <div class="float-badge float-badge-bottom" id="hero-badge-bottom">
          <div class="fb-icon" style="background:var(--blue-lt);color:var(--blue);">📅</div>
          <div><div class="fb-text">Lease Active</div><div class="fb-sub">Rent due in 3 days</div></div>
        </div>
      </div>
      
      <button class="carousel-btn" id="c-next" aria-label="Next screen" style="background: var(--glass-surface-3); border: 1px solid var(--border); border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text); font-size: 18px; box-shadow: var(--shadow-float); backdrop-filter: blur(8px); transition: all 0.2s;">❯</button>
    </div>"""

import re
text = re.sub(r'<div class="phone-wrap">.*?</div>\s*</div>\s*</section>', phone_wrap_replacement + '\n  </div>\n</section>', text, flags=re.DOTALL)

script_to_add = """
<!-- Carousel Script -->
<script>
  document.addEventListener('DOMContentLoaded', () => {
    const screens = ['home', 'search', 'inspect', 'vault'];
    const badges = [
      {
        top: '<div class="fb-icon">👋</div><div><div class="fb-text">Home Dashboard</div><div class="fb-sub">Everything in order</div></div>',
        bottom: '<div class="fb-icon" style="background:var(--blue-lt);color:var(--blue);">📅</div><div><div class="fb-text">Lease Active</div><div class="fb-sub">Rent due in 3 days</div></div>'
      },
      {
        top: '<div class="fb-icon" style="background:var(--blue-lt);color:var(--blue);">⚡</div><div><div class="fb-text">Live Search</div><div class="fb-sub">New listing found</div></div>',
        bottom: '<div class="fb-icon">🏠</div><div><div class="fb-text">Inspection Booked</div><div class="fb-sub">Saturday 10:00 AM</div></div>'
      },
      {
        top: '<div class="fb-icon">📄</div><div><div class="fb-text">AI Report Ready</div><div class="fb-sub">Items flagged securely</div></div>',
        bottom: '<div class="fb-icon" style="background:var(--blue-lt);color:var(--blue);">📸</div><div><div class="fb-text">Timestamped</div><div class="fb-sub">Metadata saved ✓</div></div>'
      },
      {
        top: '<div class="fb-icon">🔒</div><div><div class="fb-text">Bond Protected</div><div class="fb-sub">Evidence stacked ✓</div></div>',
        bottom: '<div class="fb-icon" style="background:var(--blue-lt);color:var(--blue);">⚖️</div><div><div class="fb-text">AI Lease Review</div><div class="fb-sub">Clauses highlighted</div></div>'
      }
    ];

    let currentIndex = 0;
    
    function showScreen(index) {
      screens.forEach((id, i) => {
        const screenEl = document.getElementById(`screen-${id}`);
        const tabEl = document.getElementById(`tab-${id}`);
        if(screenEl) screenEl.style.display = (i === index) ? 'flex' : 'none';
        if(tabEl) {
          if(i === index) tabEl.classList.add('active');
          else tabEl.classList.remove('active');
        }
      });
      
      const topBadge = document.getElementById('hero-badge-top');
      const bottomBadge = document.getElementById('hero-badge-bottom');
      if(topBadge && badges[index]) topBadge.innerHTML = badges[index].top;
      if(bottomBadge && badges[index]) bottomBadge.innerHTML = badges[index].bottom;
    }
    
    const btnPrev = document.getElementById('c-prev');
    const btnNext = document.getElementById('c-next');
    
    if(btnPrev) {
      btnPrev.addEventListener('click', () => {
        currentIndex = (currentIndex - 1 + screens.length) % screens.length;
        showScreen(currentIndex);
      });
      btnPrev.addEventListener('mouseover', () => { btnPrev.style.background = 'var(--blue)'; btnPrev.style.color = '#fff'; });
      btnPrev.addEventListener('mouseout', () => { btnPrev.style.background = 'var(--glass-surface-3)'; btnPrev.style.color = 'var(--text)'; });
    }
    
    if(btnNext) {
      btnNext.addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % screens.length;
        showScreen(currentIndex);
      });
      btnNext.addEventListener('mouseover', () => { btnNext.style.background = 'var(--blue)'; btnNext.style.color = '#fff'; });
      btnNext.addEventListener('mouseout', () => { btnNext.style.background = 'var(--glass-surface-3)'; btnNext.style.color = 'var(--text)'; });
    }
    
    // Add click listeners to phone tabs
    screens.forEach((id, i) => {
      const tabEl = document.getElementById(`tab-${id}`);
      if(tabEl) {
        tabEl.addEventListener('click', () => {
          currentIndex = i;
          showScreen(currentIndex);
        });
        tabEl.style.cursor = 'pointer';
      }
    });
  });
</script>
</body>"""

text = text.replace('</body>', script_to_add)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(text)

        
