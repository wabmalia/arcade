(() => {
  'use strict';

  // The cabinet is laid out at a fixed size; the "camera" frames a part of it
  // by scaling and translating the stage. Each shot fits an element into a
  // share of the viewport.
  const SHOTS = {
    cabinet: { el: 'cabinet', w: 0.92, h: 0.92, fit: 'contain' },
    // Mostly screen, with a bit of marquee, bezel and control panel around it.
    screen: { el: 'screen', w: 0.9, h: 0.56, fit: 'contain' },
    // Only the screen, filling the viewport.
    full: { el: 'screen', w: 1, h: 1, fit: 'cover' },
  };

  const TIMING = {
    introDelay: 350,  // ms looking at the whole cabinet before moving in
    intro: 1600,      // ms to ease into the screen
    focus: 800,       // ms for the chosen tile to move to the middle (and blink) before zooming
    zoom: 900,        // ms to zoom the rest of the way after picking a game
    load: 1200,       // ms the loading bar takes to fill
  };

  const stage = document.getElementById('stage');
  const screen = document.getElementById('screen');
  const loading = document.getElementById('loading');
  const loadingName = document.getElementById('loading-name');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let shot = 'cabinet';
  let launching = false;
  let camScale = 1; // current stage scale, to turn pointer movement into cabinet px

  // Position in stage coordinates, unaffected by the current transform.
  function layoutRect(el) {
    let x = 0, y = 0;
    for (let n = el; n && n !== stage; n = n.offsetParent) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }

  function frame(name, ms = 0) {
    shot = name;
    const s = SHOTS[name];
    const r = layoutRect(document.getElementById(s.el));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pick = s.fit === 'cover' ? Math.max : Math.min;
    const scale = pick((vw * s.w) / r.w, (vh * s.h) / r.h);
    const tx = vw / 2 - (r.x + r.w / 2) * scale;
    const ty = vh / 2 - (r.y + r.h / 2) * scale;
    camScale = scale;
    stage.classList.toggle('moving', ms > 0);
    stage.style.setProperty('--move-ms', `${ms}ms`);
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function powerOn() {
    screen.classList.add('powered');
  }

  function intro() {
    if (reduced) {
      frame('screen');
      powerOn();
      return;
    }
    frame('cabinet');
    setTimeout(() => {
      frame('screen', TIMING.intro);
      setTimeout(powerOn, TIMING.intro * 0.55);
    }, TIMING.introDelay);
  }

  // Offset that puts the tile's centre on the centre of the screen picture.
  function centreOffset(tile) {
    const crt = tile.offsetParent;
    const scrolled = tile.parentElement.scrollTop;
    return {
      dx: crt.offsetWidth / 2 - (tile.offsetLeft + tile.offsetWidth / 2),
      dy: crt.offsetHeight / 2 - (tile.offsetTop - scrolled + tile.offsetHeight / 2),
    };
  }

  function launch(tile) {
    if (launching) return;
    launching = true;
    const { dx, dy } = centreOffset(tile);
    tile.style.setProperty('--dx', `${dx}px`);
    tile.style.setProperty('--dy', `${dy}px`);
    tile.classList.add('chosen');
    screen.classList.add('picking');
    loadingName.textContent = tile.dataset.name || '';
    loading.style.setProperty('--load-ms', `${TIMING.load}ms`);
    const focus = reduced ? 0 : TIMING.focus;
    const zoom = reduced ? 0 : TIMING.zoom;
    setTimeout(() => frame('full', zoom), focus);
    setTimeout(() => {
      loading.hidden = false;
      setTimeout(() => window.location.assign(tile.href), reduced ? 300 : TIMING.load + 150);
    }, focus + zoom);
  }

  document.querySelectorAll('.tile').forEach(tile => {
    tile.addEventListener('click', e => {
      // Let modified clicks open a new tab as usual.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      launch(tile);
    });
  });

  // --- Controls: they move when used, but don't do anything (yet) ----------

  const STICK = {
    throw: 28,     // cabinet px of pointer travel for a full tilt
    maxTilt: 28,   // degrees left/right at full tilt
    lean: 0.18,    // how much the lever shortens/lengthens leaning away/toward you
  };

  function setupStick() {
    const stick = document.getElementById('stick');
    const lever = document.getElementById('lever');
    let grab = null;

    stick.addEventListener('pointerdown', e => {
      grab = { x: e.clientX, y: e.clientY, id: e.pointerId };
      stick.setPointerCapture(e.pointerId);
      stick.classList.add('held');
      stick.classList.remove('spring');
      e.preventDefault();
    });
    stick.addEventListener('pointermove', e => {
      if (!grab || e.pointerId !== grab.id) return;
      let dx = (e.clientX - grab.x) / camScale;
      let dy = (e.clientY - grab.y) / camScale;
      const d = Math.hypot(dx, dy);
      if (d > STICK.throw) {
        dx *= STICK.throw / d;
        dy *= STICK.throw / d;
      }
      lever.style.setProperty('--tilt', `${(dx / STICK.throw) * STICK.maxTilt}deg`);
      lever.style.setProperty('--reach', String(1 + (dy / STICK.throw) * STICK.lean));
    });
    const release = () => {
      if (!grab) return;
      grab = null;
      stick.classList.remove('held');
      stick.classList.add('spring');
      lever.style.setProperty('--tilt', '0deg');
      lever.style.setProperty('--reach', '1');
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
    stick.addEventListener('lostpointercapture', release);
  }

  function setupButtons() {
    document.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('pointerdown', e => {
        btn.setPointerCapture(e.pointerId);
        btn.classList.add('pressed');
        e.preventDefault();
      });
      const up = () => btn.classList.remove('pressed');
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
    });
  }

  setupStick();
  setupButtons();

  window.addEventListener('resize', () => frame(shot));

  // Coming back with the browser's back button can restore the page as we
  // left it (zoomed in, loading). Put it back on the game select.
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    launching = false;
    loading.hidden = true;
    screen.classList.remove('picking');
    document.querySelectorAll('.tile.chosen').forEach(t => {
      t.classList.remove('chosen');
      t.style.removeProperty('--dx');
      t.style.removeProperty('--dy');
    });
    frame('screen');
  });

  // Fonts change text widths, so wait for them before measuring.
  const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(intro, intro);
})();
