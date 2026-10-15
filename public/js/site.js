(function () {
  var btn = document.getElementById('menu-btn');
  var nav = document.getElementById('site-nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    });
  }

  var copyBtn = document.getElementById('copy-addr');
  var status = document.getElementById('copy-status');
  var addr = document.getElementById('addr');
  if (copyBtn && addr && status) {
    copyBtn.addEventListener('click', function () {
      var text = addr.innerText.trim();
      function fallback() {
        var r = document.createRange(); r.selectNodeContents(addr);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        status.textContent = 'ঠিকানাটি নির্বাচন করা হয়েছে; কপি করতে Ctrl+C চাপুন।';
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { status.textContent = 'ঠিকানা কপি হয়েছে।'; }, fallback);
      } else { fallback(); }
    });
  }

  var year = document.getElementById('year');
  if (year) {
    var digits = '০১২৩৪৫৬৭৮৯';
    year.textContent = String(new Date().getFullYear()).replace(/\d/g, function (d) { return digits[d]; });
  }
})();
