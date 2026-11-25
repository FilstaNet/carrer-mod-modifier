// Modifier updates: a block inside the Setup tab's "App updates" section (the game re-renders that page, so it is re-added when missing).
// Talks to src/engine/ux-update.js in the main process through console messages (window.__btierUpd.set receives the state back).
(function () {
  'use strict';
  if (window.__btierUpd) return;
  let s = { current: '', auto: true, phase: 'idle', latest: '', msg: '' };
  const send = (cmd, value) => console.debug('__btier_upd__' + JSON.stringify({ cmd, value }));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function html() {
    const line = {
      idle: 'Not checked yet.',
      checking: 'Checking GitHub...',
      uptodate: 'You have the latest Modifier.',
      available: 'Version ' + s.latest + ' is available.',
      downloading: 'Downloading version ' + s.latest + '...',
      done: 'Version ' + s.latest + ' installed. Close the game and start it with the Modifier to use it.',
      error: 'Update failed: ' + s.msg,
    }[s.phase] || '';
    const busy = s.phase === 'checking' || s.phase === 'downloading';
    return '<h2 class="doc-section-title">Modifier updates</h2><p class="doc-intro">Version ' + esc(s.current) + '. ' + esc(line) + '</p>'
      + '<div class="doc-actions"><button class="btn" data-btier-upd="check"' + (busy ? ' disabled' : '') + '>Check for Modifier updates</button>'
      + (s.phase === 'available' ? ' <button class="btn primary" data-btier-upd="apply">Update Modifier now</button>' : '') + '</div>'
      + '<p class="doc-intro" style="margin-top:14px"><label><input type="checkbox" data-btier-upd="auto"' + (s.auto ? ' checked' : '') + '> Update the Modifier automatically at launch</label></p>';
  }

  function ensure() {
    const b = document.querySelector('[data-action="beta-update-check"]'); // language-independent anchor of the section
    const sec = b && b.closest('section');
    if (!sec) return;
    let box = sec.nextElementSibling; // its own section after "App updates", so the game's red divider applies
    if (!box || !box.classList.contains('btier-upd')) { box = document.createElement('section'); box.className = 'doc-section btier-upd'; sec.after(box); }
    const h = html();
    if (box.__h !== h) { box.innerHTML = h; box.__h = h; }
  }

  // A popup, once per session and version, when a newer Modifier exists (or was just installed by the launch auto-update). Needs the game's showModal.
  let popped = '';
  function popup() {
    const key = s.phase + s.latest;
    if ((s.phase !== 'available' && s.phase !== 'done') || popped === key || typeof showModal !== 'function' || typeof closeModal !== 'function') return;
    popped = key;
    const done = s.phase === 'done';
    showModal('<div class="modal" style="max-width:520px"><div class="modal-h">' + (done ? 'Modifier updated' : 'New Modifier version') + '</div><div class="modal-b"><p>' +
      (done ? 'Version ' + esc(s.latest) + ' is installed. Close the game and start it with the Modifier to use it.' : 'Version ' + esc(s.latest) + ' is available (you have ' + esc(s.current) + ').') + '</p><div class="btnrow">' +
      (done ? '' : '<button class="btn primary" data-btier-upd="apply" data-btier-close="1">Update now</button>') + '<button class="btn ghost" data-btier-close="1">' + (done ? 'OK' : 'Later') + '</button></div></div></div>');
  }

  window.__btierUpd = { set(n) { s = n; ensure(); popup(); } };
  document.addEventListener('click', (e) => { const c = e.target.closest && e.target.closest('[data-btier-close]'); if (c && typeof closeModal === 'function') setTimeout(closeModal, 0); });
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button[data-btier-upd]'); if (b) send(b.dataset.btierUpd); });
  document.addEventListener('change', (e) => { const c = e.target; if (c && c.dataset && c.dataset.btierUpd === 'auto') { s.auto = c.checked; send('auto', c.checked); } });
  let queued = false;
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; ensure(); }); } }).observe(document.body, { childList: true, subtree: true });
  send('hello');
})();
