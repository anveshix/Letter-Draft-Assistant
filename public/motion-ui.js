/* Letter Draft Assistant v3.0 — Institutional Motion Graphics & Command Palette Engine
   Powered by Anime.js v4.5 (juliangarnier/anime) + FormKit AutoAnimate (@formkit/auto-animate)
   + Curated Lucide Vector Iconography (lucide-icons/lucide).
   Strictly GPU-composited (transform, opacity, SVG stroke-dashoffset) with full
   prefers-reduced-motion accessibility compliance. */
(function (root) {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function reducedMotion() {
    try {
      return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {
      return false;
    }
  }

  function hasAnime() {
    return typeof root.anime === 'object' && root.anime && typeof root.anime.animate === 'function';
  }

  function ico(name, size = 16, cls = '') {
    if (typeof root.iconSvg === 'function') return root.iconSvg(name, { size, cls });
    return '';
  }

  // ==================== 1. THEME ENGINE (SOVEREIGN LIGHT / EXECUTIVE DARK) ====================
  function getTheme() {
    try {
      return localStorage.getItem('lda_theme') === 'dark' ? 'dark' : 'light';
    } catch (_) {
      return 'light';
    }
  }

  function applyTheme(theme, animateIcon = false) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('lda_theme', t); } catch (_) {}
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      btn.innerHTML = ico(t === 'dark' ? 'Sun' : 'Moon', 16);
      btn.title = t === 'dark' ? 'Switch to Sovereign Light Theme' : 'Switch to Executive Dark Theme';
      btn.setAttribute('aria-label', btn.title);
      if (animateIcon && hasAnime() && !reducedMotion()) {
        const svg = btn.querySelector('svg');
        if (svg) {
          root.anime.animate(svg, {
            rotate: [-75, 0],
            scale: [0.65, 1],
            opacity: [0.3, 1],
            duration: 340,
            ease: 'outBack(1.6)',
          });
        }
      }
    }
  }

  function initTheme() {
    applyTheme(getTheme(), false);
  }

  function toggleTheme() {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
    return next;
  }

  // ==================== 2. AUTH GATE SOVEREIGN SEAL SVG CHOREOGRAPHY ====================
  let orbitAnim = null;
  function animateAuthGate() {
    if (typeof root.hydrateIcons === 'function') root.hydrateIcons(document.getElementById('authGate'));
    if (!hasAnime() || reducedMotion()) return;
    const A = root.anime;

    try {
      const drawables = document.querySelectorAll('#authCrestSvg .draw-stroke');
      if (drawables.length && A.svg && typeof A.svg.createDrawable === 'function') {
        A.animate(A.svg.createDrawable(drawables), {
          draw: ['0 0', '0 1'],
          duration: 960,
          delay: A.stagger(65),
          ease: 'outQuart',
        });
      }
    } catch (_) {}

    const pills = document.querySelectorAll('.auth-cap-pill');
    if (pills.length) {
      A.animate(pills, {
        translateY: [12, 0],
        opacity: [0, 1],
        duration: 420,
        delay: A.stagger(55, { start: 180 }),
        ease: 'outQuint',
      });
    }

    const card = document.querySelector('.auth-card');
    if (card) {
      A.animate(card, {
        translateY: [14, 0],
        opacity: [0, 1],
        duration: 420,
        ease: 'outQuint',
      });
    }

    const orbit = document.getElementById('authOrbitRing');
    if (orbit && !orbitAnim) {
      orbitAnim = A.animate(orbit, {
        rotate: [0, 360],
        duration: 54000,
        loop: true,
        ease: 'linear',
      });
    }
  }

  // ==================== 3. SPRING-PHYSICS SLIDING SIDEBAR INDICATOR ====================
  function moveNavIndicator(activeBtn, immediate = false) {
    const ind = document.getElementById('navIndicator');
    const nav = document.getElementById('nav');
    if (!ind || !nav || !activeBtn || activeBtn.hidden) {
      if (ind) ind.style.opacity = '0';
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const top = Math.max(0, btnRect.top - navRect.top + nav.scrollTop);
    const height = Math.max(32, btnRect.height);

    if (!hasAnime() || reducedMotion() || immediate) {
      ind.style.transform = `translate3d(0, ${top}px, 0)`;
      ind.style.height = `${height}px`;
      ind.style.opacity = '1';
      return;
    }

    const A = root.anime;
    const ease = typeof A.createSpring === 'function'
      ? A.createSpring({ stiffness: 410, damping: 32, mass: 0.85 })
      : 'outQuint';

    A.animate(ind, {
      translateY: top,
      height,
      opacity: 1,
      duration: 360,
      ease,
    });
  }

  // ==================== 4. NUMERIC KPI ROLL-UP, RADIAL RINGS & BAR STAGGERS ====================
  function animateCounters(container) {
    const host = container || document;
    const countEls = host.querySelectorAll('[data-count]');
    const ringEls = host.querySelectorAll('[data-ring-pct]');
    const barFills = host.querySelectorAll('.bar-fill');

    if (!hasAnime() || reducedMotion()) {
      countEls.forEach(el => {
        const suffix = el.getAttribute('data-suffix') || '';
        el.textContent = String(el.getAttribute('data-count') || '0') + suffix;
      });
      ringEls.forEach(circle => {
        const pct = Math.max(0, Math.min(100, parseFloat(circle.getAttribute('data-ring-pct') || '0')));
        const circ = parseFloat(circle.getAttribute('data-circ') || '163.36');
        circle.style.strokeDashoffset = String(circ * (1 - pct / 100));
      });
      return;
    }

    const A = root.anime;

    countEls.forEach((el, idx) => {
      const target = parseFloat(el.getAttribute('data-count') || '0');
      const suffix = el.getAttribute('data-suffix') || '';
      if (!Number.isFinite(target)) return;
      const state = { val: 0 };
      A.animate(state, {
        val: target,
        duration: 580,
        delay: idx * 35,
        ease: 'outExpo',
        onUpdate: () => {
          el.textContent = Math.round(state.val).toLocaleString('en-IN') + suffix;
        },
      });
    });

    ringEls.forEach((circle, idx) => {
      const pct = Math.max(0, Math.min(100, parseFloat(circle.getAttribute('data-ring-pct') || '0')));
      const circ = parseFloat(circle.getAttribute('data-circ') || '163.36');
      const targetOffset = circ * (1 - pct / 100);
      circle.style.strokeDasharray = String(circ);
      A.animate(circle, {
        strokeDashoffset: [circ, targetOffset],
        duration: 760,
        delay: 90 + idx * 70,
        ease: 'outQuart',
      });
    });

    if (barFills.length) {
      barFills.forEach(bf => { bf.style.transformOrigin = 'left center'; });
      A.animate(barFills, {
        scaleX: [0, 1],
        opacity: [0.45, 1],
        duration: 520,
        delay: A.stagger(34, { start: 80 }),
        ease: 'outQuart',
      });
    }
  }

  // ==================== 5. VIEW TRANSITION CHOREOGRAPHY + AUTO-ANIMATE ====================
  function attachAutoAnimate(container) {
    if (typeof root.autoAnimate !== 'function' || reducedMotion()) return;
    const targets = (container || document).querySelectorAll('.auto-anim, #sigList');
    targets.forEach(el => {
      if (!el.__ldaAutoAnim) {
        try {
          root.autoAnimate(el, { duration: 190, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
          el.__ldaAutoAnim = true;
        } catch (_) {}
      }
    });
  }

  function animateViewEnter(viewEl) {
    const el = viewEl || document.getElementById('view');
    if (!el) return;
    if (typeof root.hydrateIcons === 'function') root.hydrateIcons(el);
    attachAutoAnimate(el);
    animateCounters(el);

    if (!hasAnime() || reducedMotion()) return;
    const A = root.anime;

    const banners = el.querySelectorAll(':scope > .alert-banner');
    if (banners.length) {
      A.animate(banners, {
        translateY: [-8, 0],
        opacity: [0, 1],
        duration: 260,
        delay: A.stagger(40),
        ease: 'outQuart',
      });
    }

    const headBar = el.querySelector(':scope > .bar, :scope > .page-hero');
    if (headBar) {
      A.animate(headBar, {
        translateY: [6, 0],
        opacity: [0, 1],
        duration: 210,
        ease: 'outQuad',
      });
    }

    const stats = el.querySelectorAll('.stats > .stat, .tpl-grid > .card');
    if (stats.length) {
      A.animate(stats, {
        translateY: [10, 0],
        opacity: [0, 1],
        duration: 330,
        delay: A.stagger(26, { start: 20 }),
        ease: 'outQuint',
      });
    }

    const cards = el.querySelectorAll(':scope > .card, .ed-pane > .card');
    if (cards.length) {
      A.animate(cards, {
        translateY: [9, 0],
        opacity: [0, 1],
        duration: 300,
        delay: A.stagger(34, { start: 35 }),
        ease: 'outQuart',
      });
    }
  }

  // ==================== 6. MODAL, TOAST & OFFICIAL INK-SEAL STAMP MOTION ====================
  function animateModalOpen(modalEl) {
    if (!modalEl) return;
    if (typeof root.hydrateIcons === 'function') root.hydrateIcons(modalEl);
    if (!hasAnime() || reducedMotion()) return;
    const box = modalEl.querySelector('.box');
    if (box) {
      root.anime.animate(box, {
        scale: [0.96, 1],
        translateY: [10, 0],
        opacity: [0, 1],
        duration: 220,
        ease: 'outQuint',
      });
    }
  }

  function animateToast(toastEl) {
    if (!toastEl || !hasAnime() || reducedMotion()) return;
    root.anime.animate(toastEl, {
      translateY: [16, 0],
      scale: [0.97, 1],
      opacity: [0, 1],
      duration: 230,
      ease: 'outBack(1.35)',
    });
  }

  function playSealIssuedEffect(refNo) {
    const paper = document.getElementById('paper');
    if (!paper || reducedMotion()) return;

    const badge = document.createElement('div');
    badge.className = 'seal-issued-overlay noprint';
    badge.innerHTML = `
      <div class="seal-ring">
        ${ico('ShieldCheck', 26)}
        <div>
          <strong>OFFICIAL SEAL APPLIED</strong>
          <span>Ref. No. ${esc(refNo || 'ISSUED')}</span>
        </div>
      </div>
    `;
    paper.appendChild(badge);

    if (hasAnime()) {
      const A = root.anime;
      A.animate(badge, {
        scale: [1.38, 1],
        rotate: [-8, -4],
        opacity: [0, 1],
        duration: 360,
        ease: 'outBack(1.7)',
      });
      const sigEls = paper.querySelectorAll('.sig, .qr-box');
      if (sigEls.length) {
        A.animate(sigEls, {
          scale: [1.07, 1],
          opacity: [0.35, 1],
          duration: 420,
          ease: 'outQuint',
        });
      }
      setTimeout(() => {
        A.animate(badge, {
          opacity: [1, 0],
          translateY: [0, -8],
          duration: 320,
          ease: 'inQuad',
          onComplete: () => badge.remove(),
        });
      }, 1500);
    } else {
      setTimeout(() => badge.remove(), 1600);
    }
  }

  // ==================== 7. CRYPTOGRAPHIC VERIFICATION SHIELD SVG MOTION (/verify) ====================
  function buildVerifyShieldSvg(status) {
    if (status === 'verified') {
      return `
        <svg class="verify-shield-svg ok" width="54" height="54" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle class="v-stroke" cx="32" cy="32" r="29" stroke="#16a34a" stroke-width="2" stroke-dasharray="4 3" opacity="0.45"/>
          <path class="v-stroke" d="M32 8L50 15V30C50 43 41.8 51.4 32 56C22.2 51.4 14 43 14 30V15L32 8Z" fill="rgba(22,163,74,0.10)" stroke="#15803d" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path class="v-stroke" d="M23.5 32.5L29.5 38.5L41 26.5" stroke="#15803d" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
    }
    return `
      <svg class="verify-shield-svg bad" width="54" height="54" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path class="v-stroke" d="M32 8L50 15V30C50 43 41.8 51.4 32 56C22.2 51.4 14 43 14 30V15L32 8Z" fill="rgba(220,38,38,0.09)" stroke="#dc2626" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path class="v-stroke" d="M25 25L39 39M39 25L25 39" stroke="#dc2626" stroke-width="3" stroke-linecap="round"/>
      </svg>`;
  }

  function animateVerifyOutcome(containerEl) {
    if (!containerEl || !hasAnime() || reducedMotion()) return;
    const A = root.anime;
    const card = containerEl.firstElementChild;
    if (card) {
      A.animate(card, {
        translateY: [10, 0],
        scale: [0.98, 1],
        opacity: [0, 1],
        duration: 320,
        ease: 'outQuint',
      });
    }
    try {
      const strokes = containerEl.querySelectorAll('.v-stroke');
      if (strokes.length && A.svg && typeof A.svg.createDrawable === 'function') {
        A.animate(A.svg.createDrawable(strokes), {
          draw: ['0 0', '0 1'],
          duration: 680,
          delay: A.stagger(90),
          ease: 'outQuart',
        });
      }
    } catch (_) {}
    const rows = containerEl.querySelectorAll('.v-grid > *');
    if (rows.length) {
      A.animate(rows, {
        translateY: [6, 0],
        opacity: [0, 1],
        duration: 260,
        delay: A.stagger(18, { start: 140 }),
        ease: 'outQuad',
      });
    }
  }

  // ==================== 8. EXECUTIVE COMMAND PALETTE (Ctrl+K / ⌘K) ====================
  let cmdOpen = false;
  let cmdProvider = null;

  function registerCommandPalette(getProviderFn) {
    cmdProvider = getProviderFn;
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        const gate = document.getElementById('authGate');
        if (gate && !gate.hidden) return;
        e.preventDefault();
        if (cmdOpen) closeCommandPalette();
        else openCommandPalette();
      } else if (e.key === 'Escape' && cmdOpen) {
        e.preventDefault();
        closeCommandPalette();
      }
    });
  }

  function closeCommandPalette() {
    const host = document.getElementById('cmdPalette');
    if (host) host.hidden = true;
    cmdOpen = false;
  }

  function openCommandPalette() {
    if (!cmdProvider) return;
    const ctx = cmdProvider();
    if (!ctx || !ctx.db) return;

    let host = document.getElementById('cmdPalette');
    if (!host) {
      host = document.createElement('div');
      host.id = 'cmdPalette';
      host.className = 'cmd-backdrop noprint';
      document.body.appendChild(host);
    }

    const items = [];
    const navItems = [
      { v: 'dash', label: 'Go to School Office Command Center (Dashboard)', group: 'Navigation', icon: 'LayoutDashboard', kw: 'home stats overview' },
      { v: 'edit', label: 'Open Bilingual Letter & Certificate Drafting Studio', group: 'Navigation', icon: 'FilePenLine', kw: 'write compose draft' },
      { v: 'approve', label: 'Open Principal Approval Queue (अनुमोदन कतार)', group: 'Navigation', icon: 'CheckCircle2', kw: 'sign pending clerk' },
      { v: 'batch', label: 'Open Bulk Mail-Merge & Batch Certificate Engine', group: 'Navigation', icon: 'Layers', kw: 'zip combined pdf mass' },
      { v: 'dir', label: 'Open Student & Staff Master Directory', group: 'Navigation', icon: 'GraduationCap', kw: 'admission employee teacher' },
      { v: 'sheet', label: 'Open Searchable Register & Sheet Sync (Fuse.js)', group: 'Navigation', icon: 'Table2', kw: 'excel search filter' },
      { v: 'out', label: 'Open Outward Dispatch Register (जावक पंजी)', group: 'Navigation', icon: 'Send', kw: 'peon post reminder' },
      { v: 'inw', label: 'Open Inward Register + Offline OCR + SLA Tracker', group: 'Navigation', icon: 'Inbox', kw: 'scan tesseract rti due' },
      { v: 'analytics', label: 'Open Analytics, SLA & Inspection Audit Report', group: 'Navigation', icon: 'BarChart3', kw: 'chart deo cbse summary' },
      { v: 'tpl', label: 'Browse All 20+ Official Bilingual Templates', group: 'Navigation', icon: 'LayoutTemplate', kw: 'formats gallery' },
      { v: 'set', label: 'Open Institution, Signatory & Counter Settings', group: 'Navigation', icon: 'Settings', kw: 'udise font backup' },
    ];
    if (ctx.auth && ctx.auth.user && ctx.auth.user.role === 'admin') {
      navItems.push({ v: 'users', label: 'Manage Office Users & Security Audit Log', group: 'Navigation', icon: 'Users', kw: 'password role staff' });
    }
    navItems.forEach(n => items.push({
      title: n.label,
      sub: n.group,
      icon: n.icon,
      kw: n.kw,
      run: () => ctx.go(n.v),
    }));

    // Quick Actions
    items.push(
      {
        title: `Toggle Workspace Theme (${getTheme() === 'dark' ? 'Switch to Light' : 'Switch to Dark'})`,
        sub: 'Quick Action',
        icon: getTheme() === 'dark' ? 'Sun' : 'Moon',
        kw: 'dark mode light theme appearance',
        run: () => { toggleTheme(); },
      },
      {
        title: 'Scan Incoming Paper Letter via Offline OCR',
        sub: 'Quick Action',
        icon: 'ScanLine',
        kw: 'camera photo tesseract inward hindi',
        run: () => { ctx.scanInwardNow(); },
      },
      {
        title: 'Download 4-Sheet Master Register (.xlsx)',
        sub: 'Quick Action',
        icon: 'FileSpreadsheet',
        kw: 'export excel download backup',
        run: () => { ctx.exportMasterXlsx(); },
      }
    );

    // Templates (English + Hindi)
    (ctx.allTemplates() || []).forEach(t => {
      items.push({
        title: `Draft "${t.name}" (English)`,
        sub: `Template · ${t.majorHead || 'ADM'}`,
        icon: 'FileText',
        kw: `template english ${t.id} ${t.majorHead || ''}`,
        run: () => ctx.startTemplate(t.id, 'en'),
      });
      items.push({
        title: `Draft "${t.name}" (हिंदी / Devanagari)`,
        sub: `Template · ${t.majorHead || 'ADM'}`,
        icon: 'Languages',
        kw: `template hindi हिंदी ${t.id} ${t.majorHead || ''}`,
        run: () => ctx.startTemplate(t.id, 'hi'),
      });
    });

    // Issued / Saved Letters
    (ctx.db.letters || []).slice().reverse().slice(0, 40).forEach(l => {
      const party = ((l.to || '').split('\n')[0]) || (l.fields && l.fields.name) || '';
      items.push({
        title: `${l.ref ? `[${l.ref}] ` : '[DRAFT] '}${l.subject || l.heading || 'Untitled Document'}`,
        sub: `Document · ${party || l.majorHead || 'ADM'}`,
        icon: l.ref ? 'ShieldCheck' : 'FilePenLine',
        kw: `${l.ref || ''} ${party} ${l.majorHead || ''}`,
        run: () => ctx.openLetter(l.id),
      });
    });

    let activeIdx = 0;
    let filtered = items.slice(0, 14);

    host.innerHTML = `
      <div class="cmd-dialog" role="dialog" aria-modal="true" aria-label="Quick Command Palette">
        <div class="cmd-search-row">
          ${ico('Search', 18, 'cmd-s-ico')}
          <input id="cmdInput" placeholder="Jump to any view, template (EN/हिंदी), Ref. No., or action…" autocomplete="off">
          <kbd class="kbd-tag">ESC</kbd>
        </div>
        <div id="cmdResults" class="cmd-results"></div>
        <div class="cmd-foot">
          <span><kbd class="kbd-tag">↑</kbd> <kbd class="kbd-tag">↓</kbd> Navigate</span>
          <span><kbd class="kbd-tag">↵</kbd> Execute</span>
          <span>Powered by Fuse.js Fuzzy Search</span>
        </div>
      </div>
    `;
    host.hidden = false;
    cmdOpen = true;

    if (hasAnime() && !reducedMotion()) {
      const dlg = host.querySelector('.cmd-dialog');
      if (dlg) {
        root.anime.animate(dlg, {
          scale: [0.96, 1],
          translateY: [-10, 0],
          opacity: [0, 1],
          duration: 200,
          ease: 'outQuint',
        });
      }
    }

    const resBox = document.getElementById('cmdResults');
    const input = document.getElementById('cmdInput');

    const paintResults = () => {
      if (!filtered.length) {
        resBox.innerHTML = `<div class="cmd-empty">No matching commands, templates, or letters found.</div>`;
        return;
      }
      if (activeIdx >= filtered.length) activeIdx = 0;
      if (activeIdx < 0) activeIdx = filtered.length - 1;
      resBox.innerHTML = filtered.map((it, i) => `
        <div class="cmd-item ${i === activeIdx ? 'active' : ''}" data-cidx="${i}">
          <span class="cmd-item-ico">${ico(it.icon, 16)}</span>
          <div class="cmd-item-txt">
            <div class="cmd-item-title">${esc(it.title)}</div>
            <div class="cmd-item-sub">${esc(it.sub)}</div>
          </div>
          ${ico('ChevronRight', 14, 'cmd-arr')}
        </div>
      `).join('');

      resBox.querySelectorAll('[data-cidx]').forEach(row => {
        row.onmouseenter = () => {
          activeIdx = +row.dataset.cidx;
          resBox.querySelectorAll('.cmd-item').forEach((el, j) => el.classList.toggle('active', j === activeIdx));
        };
        row.onclick = () => {
          const picked = filtered[+row.dataset.cidx];
          closeCommandPalette();
          if (picked) picked.run();
        };
      });

      const actEl = resBox.querySelector('.cmd-item.active');
      if (actEl && actEl.scrollIntoView) actEl.scrollIntoView({ block: 'nearest' });
    };

    input.oninput = () => {
      const q = input.value.trim();
      activeIdx = 0;
      if (!q) {
        filtered = items.slice(0, 14);
      } else if (root.Fuse) {
        const fuse = new root.Fuse(items, { keys: ['title', 'sub', 'kw'], threshold: 0.36, ignoreLocation: true });
        filtered = fuse.search(q).slice(0, 16).map(r => r.item);
      } else {
        const ql = q.toLowerCase();
        filtered = items.filter(x => (x.title + ' ' + x.sub + ' ' + x.kw).toLowerCase().includes(ql)).slice(0, 16);
      }
      paintResults();
    };

    input.onkeydown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = (activeIdx + 1) % Math.max(1, filtered.length);
        paintResults();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = (activeIdx - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length);
        paintResults();
      } else if (e.key === 'Enter' && filtered[activeIdx]) {
        e.preventDefault();
        const picked = filtered[activeIdx];
        closeCommandPalette();
        picked.run();
      }
    };

    host.onclick = (e) => { if (e.target === host) closeCommandPalette(); };
    paintResults();
    setTimeout(() => input.focus(), 20);
  }

  root.MotionUI = {
    ico,
    initTheme,
    getTheme,
    toggleTheme,
    animateAuthGate,
    moveNavIndicator,
    animateCounters,
    animateViewEnter,
    animateModalOpen,
    animateToast,
    playSealIssuedEffect,
    buildVerifyShieldSvg,
    animateVerifyOutcome,
    registerCommandPalette,
    openCommandPalette,
    closeCommandPalette,
  };
})(typeof self !== 'undefined' ? self : this);
