(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CPCPJump = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEME_MAIN = 'snssdk1128://search?keyword=';
  var SCHEME_LITE = 'snssdk2329://search?keyword=';   // 极速版

  var FALLBACK_MS = 5000;

  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || '');
  }

  function fireByIframe(url) {
    try {
      var ifr = document.createElement('iframe');
      ifr.style.cssText = 'display:none;width:0;height:0;border:0;';
      ifr.setAttribute('src', url);
      document.body.appendChild(ifr);
      setTimeout(function () {
        if (ifr.parentNode) ifr.parentNode.removeChild(ifr);
      }, 1000);
      return true;
    } catch (e) {
      return false;
    }
  }

  function showGuide(anchor, text) {    if (!anchor || !anchor.parentNode) return;

    if (document.getElementById('jump-guide')) return;

    var div = document.createElement('div');
    div.id = 'jump-guide';
    div.style.cssText =
      'margin:12px 0 0;padding:10px 14px;border-radius:8px;' +
      'background:rgba(255,193,7,.12);border:1px solid rgba(255,193,7,.35);' +
      'color:#ffc107;font-size:13px;line-height:1.6;text-align:center;';
    div.innerHTML = text || '再次点击，请允许跳转。<br>如点击没反应，请更换浏览器打开此页面。';

    anchor.parentNode.insertBefore(div, anchor.nextSibling);
  }

  function bind(btn, getKeyword, opts) {
    if (!btn || typeof getKeyword !== 'function') return;

    opts = opts || {};
    var timeoutMs = typeof opts.timeout === 'number' ? opts.timeout : FALLBACK_MS;
    var guideText = opts.guideText || '';
    var onFallback = typeof opts.onFallback === 'function' ? opts.onFallback : null;

    var timer = 0;

    function clearTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
    }

    function unbindWatchers() {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageHide);
    }

    function onVisibility() {
      if (document.hidden) {
        clearTimer();
        unbindWatchers();
      }
    }

    function onPageHide() {
      clearTimer();
      unbindWatchers();
    }

    function watch() {
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('pageshow', onPageHide);
    }

    btn.addEventListener('click', function () {
      if (btn.dataset.jumping === '1') return;
      btn.dataset.jumping = '1';

      Promise.resolve()
        .then(getKeyword)
        .then(function (keyword) {
          keyword = String(keyword || '').trim();
          if (!keyword) {
            btn.dataset.jumping = '';
            alert('链接加载失败，请检查网络后刷新重试');
            return;
          }

          var kw = encodeURIComponent(keyword);

          var old = document.getElementById('jump-guide');
          if (old) old.remove();

          clearTimer();
          unbindWatchers();

          if (isIOS()) {
            location.href = SCHEME_MAIN + kw;
          } else if (isAndroid()) {
            location.href = SCHEME_MAIN + kw;
            fireByIframe(SCHEME_LITE + kw);
          } else {
            location.href = 'https://www.douyin.com/search/' + kw;
            btn.dataset.jumping = '';
            return;
          }

          timer = setTimeout(function () {
            timer = 0;
            btn.dataset.jumping = '';
            if (document.visibilityState === 'visible') {
              showGuide(btn, guideText);
              if (onFallback) {
                try { onFallback(); } catch (e) {}
              }
            }
            unbindWatchers();
          }, timeoutMs);

          watch();
        })
        .catch(function () {
          btn.dataset.jumping = '';
        });
    });
  }

  return {
    bind: bind,
    isIOS: isIOS,
    isAndroid: isAndroid,
    SCHEME_MAIN: SCHEME_MAIN,
    SCHEME_LITE: SCHEME_LITE
  };
}));