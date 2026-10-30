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
    back: 700,        // ms for the screen to power back on, coming back from a game
    glide: 550,       // ms for the art to glide between the preview and the middle (style.css)
  };

  const SELECT_MS = 5000;  // the selection goes away after this long without a push
  const ATTRACT_MS = 2500; // how long each game shows in the preview while nothing is selected
  const RETURN_KEY = 'arcade:launched';
  const RETURN_MS = 60 * 60 * 1000; // coming back later than this just plays the intro

  const stage = document.getElementById('stage');
  const screen = document.getElementById('screen');
  const loading = document.getElementById('loading');
  const loadingName = document.getElementById('loading-name');
  const preview = document.getElementById('preview');
  const previewArt = document.getElementById('preview-art');
  const tiles = [...document.querySelectorAll('.tile')];
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

  // --- Preview: the selected game big, or each game in turn ----------------

  let selected = null;
  let featured = null;
  let selectTimer = 0;
  let attractTimer = 0;

  function feature(tile) {
    if (featured) featured.classList.remove('featured');
    featured = tile;
    tile.classList.add('featured');
    previewArt.replaceChildren(tile.querySelector('.art').cloneNode(true));
    document.getElementById('preview-name').innerHTML = tile.querySelector('.tile-name').innerHTML;
    document.getElementById('preview-desc').textContent = tile.querySelector('.tile-desc').textContent;
  }

  // Nothing selected: cycle through the games, like an arcade's attract mode.
  function attract() {
    attractTimer = setTimeout(() => {
      feature(tiles[(tiles.indexOf(featured) + 1) % tiles.length]);
      attract();
    }, ATTRACT_MS);
  }

  function select(tile) {
    if (launching) return;
    clearTimeout(selectTimer);
    clearTimeout(attractTimer);
    if (selected) selected.classList.remove('selected');
    selected = tile;
    preview.classList.toggle('live', !!tile);
    if (!tile) {
      attract();
      return;
    }
    tile.classList.add('selected');
    feature(tile);
    keepInView(tile);
    selectTimer = setTimeout(() => select(null), SELECT_MS);
  }

  // Scroll the game list just enough to show the tile.
  function keepInView(tile) {
    const list = tile.parentElement;
    const top = tile.offsetTop - list.offsetTop;
    const bottom = top + tile.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }

  // Offset that puts the element's centre on the centre of the screen picture.
  function centreOffset(el) {
    const crt = el.offsetParent;
    return {
      dx: crt.offsetWidth / 2 - (el.offsetLeft + el.offsetWidth / 2),
      dy: crt.offsetHeight / 2 - (el.offsetTop + el.offsetHeight / 2),
    };
  }

  function launch(tile) {
    if (launching) return;
    launching = true;
    clearTimeout(selectTimer);
    clearTimeout(attractTimer);
    feature(tile);
    const { dx, dy } = centreOffset(previewArt);
    previewArt.style.setProperty('--dx', `${dx}px`);
    previewArt.style.setProperty('--dy', `${dy}px`);
    previewArt.classList.add('chosen');
    screen.classList.add('picking');
    loadingName.textContent = tile.dataset.name || '';
    loading.style.setProperty('--load-ms', `${TIMING.load}ms`);
    const focus = reduced ? 0 : TIMING.focus;
    const zoom = reduced ? 0 : TIMING.zoom;
    setTimeout(() => frame('full', zoom), focus);
    setTimeout(() => {
      loading.hidden = false;
      setTimeout(() => {
        try {
          sessionStorage.setItem(RETURN_KEY, JSON.stringify({ href: tile.href, at: Date.now() }));
        } catch (err) { /* no storage: coming back just plays the intro */ }
        window.location.assign(tile.href);
      }, reduced ? 300 : TIMING.load + 150);
    }, focus + zoom);
  }

  // --- Coming back from a game ---------------------------------------------

  // The game we're coming back from, if any: the one we launched, when the
  // browser's back button brought us here not long after, or a game that
  // linked back here. `restored` is for pages put back from the back/forward
  // cache, which don't get a new navigation entry.
  function returningFrom(restored) {
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(RETURN_KEY));
      sessionStorage.removeItem(RETURN_KEY);
    } catch (err) { /* no storage */ }
    const nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
    const back = restored || (nav && nav.type === 'back_forward');
    if (saved && back && Date.now() - saved.at < RETURN_MS) {
      return tiles.find(t => t.href === saved.href) || null;
    }
    if (restored || !document.referrer) return null;
    return tiles.find(t => document.referrer.startsWith(t.href)) || null;
  }

  // The launch in reverse: start zoomed in on the game's art, power the
  // screen back on, zoom out and glide the art back into the preview.
  function comeBack(tile) {
    clearTimeout(selectTimer);
    clearTimeout(attractTimer);
    loading.hidden = true;
    launching = false;
    if (reduced) {
      screen.classList.remove('picking');
      previewArt.classList.remove('chosen');
      frame('screen');
      powerOn();
      select(tile);
      return;
    }
    launching = true;
    // Set the zoomed-in picture up at once, without transitions.
    screen.classList.add('still', 'returning');
    screen.classList.remove('powered');
    feature(tile);
    const { dx, dy } = centreOffset(previewArt);
    previewArt.style.setProperty('--dx', `${dx}px`);
    previewArt.style.setProperty('--dy', `${dy}px`);
    previewArt.classList.add('chosen');
    screen.classList.add('picking');
    frame('full');
    void screen.offsetWidth;
    screen.classList.remove('still');
    powerOn();
    setTimeout(() => frame('screen', TIMING.zoom), TIMING.back);
    setTimeout(() => {
      screen.classList.remove('picking');
      previewArt.classList.remove('chosen');
    }, TIMING.back + TIMING.zoom);
    setTimeout(() => {
      screen.classList.remove('returning');
      launching = false;
      select(tile);
    }, TIMING.back + TIMING.zoom + TIMING.glide);
  }

  // Mouse: hovering selects and clicking starts. Touch: the first tap selects
  // (so the preview can be read) and a second tap starts.
  let touched = null;
  tiles.forEach(tile => {
    tile.addEventListener('pointerenter', e => {
      if (e.pointerType === 'mouse') select(tile);
    });
    tile.addEventListener('pointerdown', e => {
      touched = e.pointerType === 'mouse' ? null : tile;
    });
    tile.addEventListener('focus', () => {
      if (touched !== tile) select(tile);
    });
    tile.addEventListener('click', e => {
      const tapped = touched === tile;
      touched = null;
      // Let modified clicks open a new tab as usual.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (tapped && tile !== selected) select(tile);
      else launch(tile);
    });
  });

  // --- Controls: the joystick picks a game, any button starts it -----------

  const STICK = {
    throw: 28,     // cabinet px of pointer travel for a full tilt
    maxTilt: 28,   // degrees left/right at full tilt
    lean: 0.18,    // how much the lever lengthens/shortens when pushed up/down
    push: 0.6,     // share of a full tilt that counts as a push
    recentre: 0.3, // and how close to the middle it must come back before the next one
  };

  let stickArmed = true;

  // x and y are the stick's tilt, -1 to 1. One push moves the selection one
  // tile; the stick has to come back to the middle before the next.
  function steer(x, y) {
    const d = Math.hypot(x, y);
    if (d < STICK.recentre) stickArmed = true;
    if (!stickArmed || d < STICK.push || launching) return;
    stickArmed = false;
    // The first push picks whatever the preview is showing.
    if (!selected) {
      select(featured || tiles[0]);
      return;
    }
    const cols = tiles.filter(t => t.offsetTop === tiles[0].offsetTop).length;
    const step = Math.abs(x) > Math.abs(y) ? Math.sign(x) : Math.sign(y) * cols;
    select(tiles[tiles.indexOf(selected) + step] || selected);
  }

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
      lever.style.setProperty('--reach', String(1 - (dy / STICK.throw) * STICK.lean));
      steer(dx / STICK.throw, dy / STICK.throw);
    });
    const release = () => {
      if (!grab) return;
      grab = null;
      stick.classList.remove('held');
      stick.classList.add('spring');
      lever.style.setProperty('--tilt', '0deg');
      lever.style.setProperty('--reach', '1');
      steer(0, 0);
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
        if (selected) {
          clearTimeout(selectTimer);
          launch(selected);
        }
      });
      const up = () => btn.classList.remove('pressed');
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
    });
  }

  setupStick();
  setupButtons();

  // Safari can still zoom on a double tap despite touch-action, so swallow
  // the second tap.
  let lastTap = 0;
  document.addEventListener('touchend', e => {
    if (e.timeStamp - lastTap < 350) e.preventDefault();
    lastTap = e.timeStamp;
  }, { passive: false });

  window.addEventListener('resize', () => frame(shot));

  // Coming back with the browser's back button can restore the page as we
  // left it (zoomed in, loading). Play the way back, or at least put it back
  // on the game select.
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    const from = returningFrom(true);
    if (from) {
      comeBack(from);
      return;
    }
    launching = false;
    loading.hidden = true;
    screen.classList.remove('picking');
    previewArt.classList.remove('chosen');
    previewArt.style.removeProperty('--dx');
    previewArt.style.removeProperty('--dy');
    select(null);
    frame('screen');
  });

  feature(tiles[0]);
  attract();

  // Fonts change text widths, so wait for them before measuring.
  const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  const from = returningFrom(false);
  const start = from ? () => comeBack(from) : intro;
  ready.then(start, start);
})();
