(function () {
  var btn = document.getElementById('a-menu');
  var nav = document.getElementById('a-nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  var dirty = false;
  // Confirm destructive actions
  document.addEventListener('submit', function (e) {
    var form = e.target;
    var msg = form.getAttribute && form.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) { e.preventDefault(); return; }
    dirty = false;
  });
  // Warn on leaving a page with unsaved form edits
  document.addEventListener('input', function (e) { if (e.target.closest('form.a-form')) dirty = true; });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
})();
