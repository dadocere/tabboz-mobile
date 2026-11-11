/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  let scale = 1;
  let mainHandle = null;
  let pendingFrame = false;
  let adPaused = false;
  let activityPending = false;
  let activityBaseline = '';
  let boundaryToken = 0;
  let completedSequence = 0;
  const completedSession = Math.random().toString(36).slice(2);
  let lastInputAt = 0;
  let pointerHeld = false;
  const gameAudio = new Set();
  const resumeAudio = new WeakMap();
  let pausedAudio = [];
  const adBridge = message => window.webkit?.messageHandlers?.tabboz?.postMessage(message);
  const mainWindow = () => document.querySelector('#screen > [data-dialog="1"]');
  const summary = () => {
    const main = mainWindow();
    return main ? [...main.querySelectorAll('.dlg_item:not(img):not(input)')].map(e => e.textContent).join('|') : '';
  };
  const mainAtRest = () => Boolean(mainWindow() && window._activeWindowHwnd === mainHandle &&
    [...document.querySelectorAll('#screen > .window')].every(e => e === mainWindow() || getComputedStyle(e).display === 'none'));
  const safeForAd = () => mainAtRest() && !pointerHeld && !document.hidden && !document.querySelector('.active-menu') &&
    !document.querySelector('input:focus, textarea:focus');
  function completedBoundary() {
    if (!activityPending || adPaused || !mainAtRest()) return;
    // Counting survives rapid navigation; only presentation opportunities may be dropped.
    if (summary() === activityBaseline) return;
    activityPending = false;
    adBridge({ type: 'adCompleted', token: `${completedSession}:${++completedSequence}` });
    if (!safeForAd()) return;
    const token = String(++boundaryToken);
    save();
    setTimeout(() => {
      if (safeForAd() && !adPaused && String(boundaryToken) === token && Date.now() - lastInputAt >= 600)
        adBridge({ type: 'adOpportunity', token });
    }, 650);
  }
  const positioned = new WeakSet();
  const cigaretteNames = ['Barclay', 'Camel', 'Davidoff Superior Lights', 'Davidoff Mildnes', 'Davidoff Classic', 'Diana Blu', 'Diana Rosse', 'Dunhill Lights', 'Merit', 'Gauloises Blu', 'Gauloises Rosse', 'Unlucky Strike', 'Unlucky Strike Lights', 'Malborro Medium', 'Malborro Rosse', 'Malborro Lights', 'NS Rosse', 'NS Mild', 'Poll Mon Blu', 'Poll Mon Rosse', 'Philip Morris', 'Philip Morris Super Light', 'Armadis', 'Winston'];
  // Win32's optional PlaySound calls quietly ignore absent clips. Preserve that
  // behavior for the original engine's references to files missing upstream.
  if (typeof window.fetch === 'function' && typeof window.Audio === 'function') {
    const soundFiles = fetch('audio-files.json').then(response => {
      if (!response.ok) throw new Error('Audio manifest unavailable');
      return response.json();
    }).then(files => new Set(files)).catch(error => {
      console.warn(error.message);
      return null;
    });
    window.Audio = new Proxy(window.Audio, {
      construct(Target, args) {
        const [source] = args;
        const audio = new Target();
        gameAudio.add(audio);
        audio.addEventListener('ended', () => gameAudio.delete(audio), { once: true });
        const play = audio.play.bind(audio);
        resumeAudio.set(audio, play);
        audio.play = async () => {
          const files = await soundFiles;
          const match = typeof source === 'string' && source.match(/^resources\/wavs\/([^/]+)$/);
          if (match && files && !files.has(match[1])) { gameAudio.delete(audio); return; }
          if (source) audio.src = source;
          if (adPaused) { gameAudio.delete(audio); return; }
          try { await play(); }
          catch (error) { gameAudio.delete(audio); console.warn('Tabboz sound:', error.message); }
        };
        return audio;
      }
    });
  }
  // Emscripten postRun can occur while the original asynchronous main() is
  // still loading strings/artwork. Its final UI setup signals actual readiness.
  let finishInitialization;
  const initialized = new Promise(resolve => { finishInitialization = resolve; });
  const originalEventSetup = window.eventListenerSetup;
  window.eventListenerSetup = () => {
    originalEventSetup();
    finishInitialization();
  };
  const registryPrefix = 'HKEY_CURRENT_USER\\Software\\Obscured Truckware\\Tabboz Simulator 32';

  function snapshot() {
    const values = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === registryPrefix || key.startsWith(registryPrefix + '\\')) values[key] = localStorage.getItem(key);
    }
    return values;
  }

  function restoreSave(payload) {
    const data = JSON.parse(payload);
    if (data?.format !== 'tabboz-mobile' || data.version !== 1 || !data.registry ||
        typeof data.registry !== 'object' || Array.isArray(data.registry)) throw new Error('Invalid save format');
    const entries = Object.entries(data.registry);
    if (!entries.length || entries.length > 512) throw new Error('Invalid save size');
    for (const [key, value] of entries) {
      if (!(key === registryPrefix || key.startsWith(registryPrefix + '\\')) ||
          typeof value !== 'string' || value.length > 8192) throw new Error('Invalid save entry');
      const entry = JSON.parse(value);
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid registry entry');
      if (key !== registryPrefix && (typeof entry[''] !== 'string' || entry[''].length > 255)) throw new Error('Invalid registry value');
    }
    // Reject truncated backups before replacing any existing progress.
    for (const key of ['Nome', 'Cognome', 'Soldi', 'Version', 'SoftCheck']) {
      if (!(registryPrefix + '\\' + key in data.registry)) throw new Error('Incomplete save');
    }
    const previous = snapshot();
    try {
      Object.keys(previous).forEach(key => localStorage.removeItem(key));
      entries.forEach(([key, value]) => localStorage.setItem(key, value));
    } catch (error) {
      Object.keys(snapshot()).forEach(key => localStorage.removeItem(key));
      Object.entries(previous).forEach(([key, value]) => localStorage.setItem(key, value));
      throw error;
    }
    // Do not let pagehide overwrite the imported save with the old in-memory game.
    mainHandle = null;
    return true;
  }

  function fit() {
    const screen = document.getElementById('screen');
    if (!screen) return;
    const windows = [...screen.querySelectorAll(':scope > .window')];
    // Original bitmap controls have no text; expose names without changing art.
    screen.querySelectorAll('.button_ok').forEach(button => button.setAttribute('aria-label', 'OK'));
    screen.querySelectorAll('.button_cancel').forEach(button => button.setAttribute('aria-label', 'Annulla'));
    screen.querySelectorAll('[data-dialog="88"] img.dlg_item').forEach(image => {
      const id = Number(image.className.match(/control(\d+)/)?.[1]);
      if (cigaretteNames[id - 400]) {
        image.setAttribute('role', 'button');
        image.setAttribute('aria-label', cigaretteNames[id - 400]);
      }
    });
    screen.querySelectorAll('.dlgframe .control202').forEach(image => {
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', 'Avvia Tabboz Simulator');
    });
    const profileLabels = { 101: 'Cognome', 102: 'Nome', 105: 'Luogo di nascita', 107: 'Indirizzo', 111: 'Residenza' };
    screen.querySelectorAll('[data-dialog="11"] input').forEach(input => {
      const label = profileLabels[input.id];
      if (label) input.setAttribute('aria-label', label);
    });
    if (window.webkit?.messageHandlers?.tabboz) {
      screen.querySelectorAll('.menu106, .menu107').forEach(item => item.classList.remove('disabled'));
      const help = screen.querySelector('[data-dialog="1"] .main-menu > li:last-child > ul');
      if (help && !help.querySelector('.mobile-privacy')) {
        const item = document.createElement('li');
        item.className = 'mobile-privacy';
        item.setAttribute('role', 'menuitem');
        item.setAttribute('aria-label', 'Privacy e diagnostica...');
        item.tabIndex = 0;
        item.textContent = 'Privacy e diagnostica...';
        help.appendChild(item);
        for (const [className, label] of [['mobile-ad-reward', '10 minuti senza pubblicità...'], ['mobile-ad-privacy', 'Preferenze pubblicitarie...']]) {
          const entry = document.createElement('li');
          entry.className = className;
          entry.setAttribute('role', 'menuitem');
          entry.setAttribute('aria-label', label);
          entry.tabIndex = 0;
          entry.textContent = label;
          help.appendChild(entry);
        }
      }
    }
    const visible = windows.filter(win => getComputedStyle(win).display !== 'none');
    // Expose the top dialog to assistive technology; obscured parents are not actionable.
    const top = visible[visible.length - 1];
    windows.forEach(win => win.setAttribute('aria-hidden', String(win !== top)));
    // Fit the complete visible dialog, preserving every original control coordinate.
    const width = Math.max(430, ...visible.map(win => win.offsetWidth + 16));
    const height = Math.max(440, ...visible.map(win => win.offsetHeight + 16));
    scale = Math.min(document.documentElement.clientWidth / width, document.documentElement.clientHeight / height, 1.5);
    screen.style.width = `${document.documentElement.clientWidth / scale}px`;
    screen.style.height = `${document.documentElement.clientHeight / scale}px`;
    screen.style.transform = `scale(${scale})`;
    for (const win of windows) {
      if (!positioned.has(win)) {
        win.style.left = `${(document.documentElement.clientWidth / scale - win.offsetWidth) / 2}px`;
        win.style.top = `${(document.documentElement.clientHeight / scale - win.offsetHeight) / 2}px`;
        positioned.add(win);
      }
      // Recenter after orientation/size changes, and keep dragged windows reachable.
      const left = parseFloat(win.style.left) || 0;
      const top = parseFloat(win.style.top) || 0;
      win.style.left = `${Math.max(4, Math.min(left, document.documentElement.clientWidth / scale - win.offsetWidth - 4))}px`;
      win.style.top = `${Math.max(4, Math.min(top, document.documentElement.clientHeight / scale - win.offsetHeight - 4))}px`;
    }
  }

  function scheduleFit() {
    if (pendingFrame) return;
    pendingFrame = true;
    requestAnimationFrame(() => { pendingFrame = false; fit(); });
  }

  function save() {
    // WM_ENDSESSION calls the original FineProgramma/SalvaTutto without ending
    // the game. Queue it through the engine; never re-enter suspended Asyncify.
    // The compatibility layer filters its message queue by the active dialog.
    // Do not accumulate main-window messages inside a nested modal loop.
    // Closing the dialog retries through the destroy hook below.
    if (mainHandle !== null && window._activeWindowHwnd === mainHandle && typeof window._PostMessage === 'function') {
      _PostMessage(mainHandle, 0x0016, 1, 0);
      stopWaiting();
    }
  }

  const originalDialog = window.dialogBox;
  window.dialogBox = async (...args) => {
    await originalDialog(...args);
    const win = document.getElementById?.(`win${args[0]}`);
    if (win) win.dataset.dialog = String(args[1]);
    if (String(args[1]) === '1') mainHandle = args[0];
    scheduleFit();
  };

  const originalDestroy = window.destroyWindow;
  window.destroyWindow = handle => {
    if (handle === mainHandle) mainHandle = null;
    originalDestroy(handle);
    scheduleFit();
    // Save after modal actions have been handled by the original game.
    setTimeout(save, 150);
    setTimeout(completedBoundary, 200);
  };

  function fail(message) {
    const boot = document.getElementById('boot');
    if (boot) boot.querySelector('.window-body').textContent = `Impossibile avviare il gioco. ${message}`;
    window.webkit?.messageHandlers?.tabboz?.postMessage({ type: 'error', message });
    console.error(message);
  }

  window.TabbozMobile = {
    save, fail, restoreSave,
    async beginAd(token) {
      if (token !== null && String(boundaryToken) !== token) return false;
      if (!safeForAd() || adPaused) return false;
      adPaused = true;
      pausedAudio = [...gameAudio].filter(a => !a.paused && !a.ended);
      pausedAudio.forEach(a => a.pause());
      save();
      await new Promise(resolve => setTimeout(resolve, 250));
      return safeForAd();
    },
    endAd() {
      adPaused = false;
      pausedAudio.forEach(a => resumeAudio.get(a)?.().catch(() => {}));
      pausedAudio = [];
    },
    get scale() { return scale; },
    async ready() {
      await initialized;
      document.getElementById('boot')?.remove();
      addDesktopIcon('zarrosim', 'ZARROSIM', 'Tabboz Simulator');
      scheduleFit();
      // The desktop icon remains available for relaunch after File > Chiudi.
      // Start only after Emscripten's postRun has unwound.
      setTimeout(() => {
        const icon = document.querySelector('.desktop-item');
        if (icon && !document.querySelector('#screen > .window')) icon.click();
      }, 0);
    }
  };

  addEventListener('DOMContentLoaded', () => {
    new MutationObserver(scheduleFit).observe(document.getElementById('screen'), { childList: true, subtree: true });
    scheduleFit();
    // Retain original small desktop fonts without WebKit auto-zoom shifting
    // text-field hit targets during keyboard editing. Pinch zoom is restored
    // when editing ends.
    const viewport = document.querySelector('meta[name="viewport"]');
    const normalViewport = viewport?.content;
    const textField = element => element?.matches?.('input[type="text"], textarea');
    const constrainEditingZoom = () => {
      if (viewport) viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
    };
    document.addEventListener('pointerdown', event => {
      pointerHeld = true;
      lastInputAt = Date.now();
      boundaryToken++;
      if (textField(event.target)) constrainEditingZoom();
    }, true);
    document.addEventListener('pointerup', () => { pointerHeld = false; }, true);
    document.addEventListener('pointercancel', () => { pointerHeld = false; }, true);
    document.addEventListener('pointermove', () => { if (pointerHeld) lastInputAt = Date.now(); }, true);
    document.addEventListener('focusin', event => {
      if (textField(event.target)) constrainEditingZoom();
    });
    document.addEventListener('focusout', () => setTimeout(() => {
      if (viewport && !textField(document.activeElement)) viewport.content = normalViewport;
    }, 0));

    // Count only completed activities that alter the original summary, never menu taps.
    document.addEventListener('click', event => {
      const control = event.target.closest('[data-dialog="1"] .dlg_item, [data-dialog="1"] .menu');
      if (control && !control.matches('.menu106, .menu107, .menu108, .menu120, .menu121, .menu139, .menu140')) {
        completedBoundary();
        activityBaseline = summary();
        activityPending = true;
      }
    }, true);
    setInterval(() => {
      const active = Boolean(mainWindow() && !document.hidden && !adPaused && !document.querySelector('.active-menu'));
      adBridge({ type: 'adHeartbeat', active: String(active) });
      completedBoundary();
    }, 1000);

    // Preserve the original File menu, using iOS Files for portable JSON backups.
    document.addEventListener('click', event => {
      const adItem = event.target.closest('.mobile-ad-reward, .mobile-ad-privacy');
      if (adItem && window.webkit?.messageHandlers?.tabboz) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.querySelectorAll('.active-menu').forEach(menu => {
          menu.classList.remove('active-menu');
          menu.querySelector('ul').style.display = 'none';
        });
        adBridge({ type: adItem.classList.contains('mobile-ad-reward') ? 'adReward' : 'adPrivacy' });
        return;
      }
      if (event.target.closest('.mobile-privacy') && window.webkit?.messageHandlers?.tabboz) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.querySelectorAll('.active-menu').forEach(menu => {
          menu.classList.remove('active-menu');
          menu.querySelector('ul').style.display = 'none';
        });
        window.webkit.messageHandlers.tabboz.postMessage({ type: 'privacy' });
        return;
      }
      const item = event.target.closest('.menu106, .menu107');
      const bridge = window.webkit?.messageHandlers?.tabboz;
      if (!item || !bridge) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelectorAll('.active-menu').forEach(menu => {
        menu.classList.remove('active-menu');
        menu.querySelector('ul').style.display = 'none';
      });
      if (item.classList.contains('menu106')) {
        bridge.postMessage({ type: 'import' });
      } else {
        save();
        setTimeout(() => bridge.postMessage({ type: 'export', payload: JSON.stringify({
          format: 'tabboz-mobile', version: 1, registry: snapshot()
        }, null, 2) }), 150);
      }
    }, true);

    // Touch dragging leaves the upstream mouse implementation intact.
    document.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || event.target.closest('button')) return;
      const bar = event.target.closest('.title-bar');
      const win = bar?.closest('#screen > .window');
      if (!win) return;
      const initialX = event.clientX, initialY = event.clientY;
      const left = parseFloat(win.style.left) || 0, top = parseFloat(win.style.top) || 0;
      bar.setPointerCapture(event.pointerId);
      const move = e => {
        win.style.left = `${Math.max(0, Math.min(document.documentElement.clientWidth / scale - win.offsetWidth, left + (e.clientX - initialX) / scale))}px`;
        win.style.top = `${Math.max(0, Math.min(document.documentElement.clientHeight / scale - win.offsetHeight, top + (e.clientY - initialY) / scale))}px`;
      };
      const end = () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', end);
        bar.removeEventListener('pointercancel', end);
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', end);
      bar.addEventListener('pointercancel', end);
    });
  });
  addEventListener('resize', () => {
    document.querySelectorAll('#screen > .window').forEach(win => positioned.delete(win));
    scheduleFit();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pointerHeld = false; save(); } });
  addEventListener('pagehide', save);
  setInterval(save, 15_000);
})();
