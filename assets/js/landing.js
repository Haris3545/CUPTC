(function () {
  'use strict';

  var cta = document.getElementById('cta');
  if (!cta) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Gentle "magnetic" pull towards the cursor while hovering the button.
  if (finePointer && !reduceMotion) {
    cta.addEventListener('pointermove', function (e) {
      var r = cta.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      cta.style.setProperty('--mx', (dx * 6).toFixed(2) + 'px');
      cta.style.setProperty('--my', (dy * 4).toFixed(2) + 'px');
    });
    cta.addEventListener('pointerleave', function () {
      cta.style.setProperty('--mx', '0px');
      cta.style.setProperty('--my', '0px');
    });
  }

  // Fade the page out before loading the game.
  cta.addEventListener('click', function (e) {
    if (reduceMotion || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    var href = cta.getAttribute('href');
    document.body.classList.add('leaving');
    setTimeout(function () { window.location.href = href; }, 380);
  });

  // Coming back with the browser's back button restores the page from cache.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) document.body.classList.remove('leaving');
  });
})();
