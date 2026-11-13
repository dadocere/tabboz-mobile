/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  'use strict';
  // Adapt the existing mobile bridge without changing the shared iOS game files.
  if (window.TabbozNative?.postMessage) {
    window.webkit = { messageHandlers: { tabboz: {
      postMessage(message) { window.TabbozNative.postMessage(JSON.stringify(message)); }
    } } };
  }
  const audio = new Set();
  const OriginalAudio = window.Audio;
  window.Audio = new Proxy(OriginalAudio, {
    construct(Target, args) {
      const item = new Target(...args);
      audio.add(item);
      item.addEventListener('ended', () => audio.delete(item), { once: true });
      return item;
    }
  });
  window.TabbozAndroid = {
    prepareAd(token, request) {
      Promise.resolve(window.TabbozMobile.beginAd(token)).then(ready => {
        window.webkit.messageHandlers.tabboz.postMessage({ type: 'adPrepared', request, ready: String(ready) });
      }).catch(() => {
        window.webkit.messageHandlers.tabboz.postMessage({ type: 'adPrepared', request, ready: 'false' });
      });
    },
    setActive(active) {
      if (!active) { window.TabbozMobile?.save(); audio.forEach(item => item.pause()); }
    },
    restore(payload) {
      try { window.TabbozMobile.restoreSave(payload); location.reload(); }
      catch (_) { window.webkit.messageHandlers.tabboz.postMessage({ type: 'importError' }); }
    }
  };
})();
