(function () {
  'use strict';

  var CFG = window.__CPCP__ || {};
  var SITE = typeof CFG.site === 'string' && CFG.site ? CFG.site : 'trdy';
  var TOKEN = typeof CFG.token === 'string' ? CFG.token : '';
  var API_BASE = typeof CFG.apiBase === 'string' ? CFG.apiBase : '';

  var FALLBACK = {
    uploadCount: 3,
    commentCount: 3,
    requireUpload: true,
    uaGate: { enabled: false, allowDesktop: true, redirect: '' },
    target: {
      android: 'snssdk1128://aweme/detail/',
      ios: 'snssdk1128://aweme/detail/',
      fallback: 'https://www.douyin.com/',
      searchKeyword: ''   // 留空：搜索词永远从第一步文案解析，保证一致
    },
    links: [
      { slot: 'aa', label: '本月通用口令', icon: '../../ll/图片/dt11.gif' },
      { slot: 'bb', label: '最新口令（推荐）', icon: '../../ll/图片/dt3.gif' }
    ]
  };

  if (CFG.target && typeof CFG.target === 'object') {
    var _t = CFG.target;
    if (typeof _t.android === 'string') FALLBACK.target.android = _t.android;
    if (typeof _t.ios === 'string') FALLBACK.target.ios = _t.ios;
    if (typeof _t.fallback === 'string' && _t.fallback) FALLBACK.target.fallback = _t.fallback;
    if (typeof _t.searchKeyword === 'string') FALLBACK.target.searchKeyword = _t.searchKeyword;
  }
  if (CFG.links && CFG.links.length) FALLBACK.links = CFG.links;
  if (typeof CFG.uploadCount === 'number') FALLBACK.uploadCount = CFG.uploadCount;

  var state = {
    config: FALLBACK,
    total: FALLBACK.uploadCount,
    count: 0,
    completed: false,
    completedShown: false, // 完成态是否已展示过（避免重复弹窗）
    uploading: 0,     // 正在飞的请求数，>0 时禁掉上传按钮防止并发超传
    copying: false,
    keyword: '',      // 文案里的核心词（仅展示用）
    searchKeyword: '' // 跳转抖音用的搜索词（独立，热点词池）
  };

  var el = {};      // DOM 句柄缓存，统一在 cacheDom 里取

  function api(path) {
    var base = API_BASE.replace(/\/+$/, '');
    return base + path;
  }

  function getJSON(url) {
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (res) {
      if (!res.ok) {
        var err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    });
  }

  function isDebug() {
    try {
      return new URLSearchParams(location.search).get('debug') === '1';
    } catch (e) {
      return false;
    }
  }

  function setText(node, text) {
    if (node) node.textContent = String(text);
  }

  function show(node) {
    if (node) node.classList.add('is-show');
  }

  function hide(node) {
    if (node) node.classList.remove('is-show');
  }

  function isMobileUA() {
    var ua = navigator.userAgent || '';
    return /mobile|Android|phone|iPhone|iPod|ios|iPad/i.test(ua);
  }

  function isAllowedPlatform() {
    var p = navigator.platform || '';
    return /^(Win|Mac)/i.test(p);
  }

  function applyUAGate(cfg) {
    var gate = (cfg && cfg.uaGate) || FALLBACK.uaGate;
    if (!gate || !gate.enabled) return false;
    if (isDebug()) return false;              // ?debug=1 本地调试直接绕过
    if (isMobileUA()) return false;
    if (gate.allowDesktop !== false && isAllowedPlatform()) return false;
    if (!gate.redirect) return false;         // 没配跳转地址就不跳，别把人送进死链
    location.href = gate.redirect;
    return true;
  }

  function splitJumpText(node) {
    if (!node) return;
    var text = node.textContent || '';
    node.textContent = '';
    var frag = document.createDocumentFragment();
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var span = document.createElement('span');
      span.textContent = ch === ' ' ? '\u00a0' : ch;
      span.style.setProperty('--i', String(i));
      frag.appendChild(span);
    }
    node.appendChild(frag);
  }

  function openImageModal() {
    if (!el.imageModal) return;
    el.imageModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeImageModal() {
    if (!el.imageModal) return;
    el.imageModal.classList.remove('is-open');
    document.body.style.overflow = ''; // 关闭时恢复滚动
  }

  function bindImageModal() {
    if (!el.imageModal) return;

    if (el.thumbnailCard) {
      el.thumbnailCard.addEventListener('click', openImageModal);
    }
    if (el.contentThumbnail) {
      el.contentThumbnail.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openImageModal();
      });
    }
    el.imageModal.addEventListener('click', closeImageModal);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' || ev.key === 'Esc') {
        closeImageModal();
        closeSuccessModal();
      }
    });
  }

  function renderSearchHint() {
    if (!el.searchWord) return;
    var w = state.searchKeyword || state.keyword || '';
    el.searchWord.textContent = w || '';
    if (el.searchHint) el.searchHint.style.display = 'none';
  }

  function siteUrl() {
    var injected = (CFG.target && CFG.target.fallback) || '';
    var t = (state.config && state.config.target) || FALLBACK.target || {};
    var u = injected || t.fallback || '';
    return /^https?:\/\//i.test(String(u || '')) ? u : '';
  }

  function extractShortCode(text) {
    var m = String(text || '').match(/\d{3,6}\.[^\s\[\]<>]+/);
    if (!m) return '';
    var code = m[0].replace(/[\u4e00-\u9fff]/g, '');
    if (/^\d{3,6}\.[A-Za-z][A-Za-z0-9.-]*$/.test(code)) return code;
    return '';
  }

  function codeLinkUrl(text) {
    var code = extractShortCode(text);
    if (code) return 'https://' + code + '/';
    return siteUrl();
  }

  function renderCopyText(text) {
    if (!el.copyText) return;
    text = String(text == null ? '' : text);
    el.copyText.textContent = '';
    el.copyText.classList.remove('is-loading', 'is-error');

    var href = codeLinkUrl(text);
    var m = href && text.match(/\d{3,6}\.[^\s\[\]<>]+/);
    if (!m) {
      el.copyText.textContent = text;
      return;
    }

    var start = m.index;
    var end = start + m[0].length;

    if (start > 0) {
      el.copyText.appendChild(document.createTextNode(text.slice(0, start)));
    }

    var a = document.createElement('a');
    a.href = href;
    a.textContent = m[0];
    a.className = 'code-site-link';
    a.setAttribute('rel', 'noopener');
    a.setAttribute('title', '点击进入我的站点');
    a.style.cssText = 'color:#58a6ff;text-decoration:underline;cursor:pointer;font-weight:700;';
    el.copyText.appendChild(a);

    if (end < text.length) {
      el.copyText.appendChild(document.createTextNode(text.slice(end)));
    }
  }

  function loadScript() {
    var localGen = function () {
      var gen = (window.CPCPKeyword && window.CPCPKeyword.generate)
        ? window.CPCPKeyword.generate()
        : null;
      if (!gen) return null;
      state.keyword = gen.copyWord || '';
      state.searchKeyword = gen.keyword || '';
      return gen.text;
    };

    if (!API_BASE) {
      var t0 = localGen();
      if (t0) {
        renderCopyText(t0);
        renderSearchHint();
        return Promise.resolve(t0);
      }
    }

    var url = api('/api/script?site=' + encodeURIComponent(SITE) + '&token=' + encodeURIComponent(TOKEN));
    return getJSON(url).then(function (data) {
      var text = data && typeof data.text === 'string' ? data.text : '';
      if (!text) throw new Error('empty text');

      if (data && typeof data.keyword === 'string' && data.keyword) {
        state.searchKeyword = data.keyword;
      } else if (window.CPCPKeyword && window.CPCPKeyword.pickSearchWord) {
        state.searchKeyword = window.CPCPKeyword.pickSearchWord();
      }

      if (el.copyText) {
        renderCopyText(text);
      }
      renderSearchHint();
      return text;
    }).catch(function () {
      var t = localGen();
      if (t) {
        renderCopyText(t);
        renderSearchHint();
        return t;
      }
      if (el.copyText) {
        el.copyText.textContent = '口令获取失败，请刷新重试';
        el.copyText.classList.remove('is-loading');
        el.copyText.classList.add('is-error');
      }
      return '';
    });
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function copyText() {
    if (!el.copyText || state.copying) return;
    var text = (el.copyText.textContent || '').trim();
    if (!text || el.copyText.classList.contains('is-loading') || el.copyText.classList.contains('is-error')) return;

    state.copying = true;
    var done = function (ok) {
      state.copying = false;
      if (!ok) return;
      var old = el.copyBtn ? el.copyBtn.textContent : '';
      if (el.copyBtn) {
        el.copyBtn.textContent = '已复制';
        el.copyBtn.classList.add('btn-success');
      }
      setTimeout(function () {
        if (el.copyBtn) {
          el.copyBtn.textContent = old || '点我复制';
          el.copyBtn.classList.remove('btn-success');
        }
      }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        done(true);
      }).catch(function () {
        done(legacyCopy(text));
      });
    } else {
      done(legacyCopy(text));
    }
  }

  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }

  function keywordFromText(text) {
    var t = String(text || '');

    var tag = t.match(/#[^\s\[\]<>，。,.]+/);
    if (tag) return tag[0];

    var m = t.match(/\d{3,6}\.([^\s\[\]<>]+)/);
    if (m) {
      var cn = m[1].replace(/[^\u4e00-\u9fff]/g, '');
      if (cn) return cn;
    }

    var m2 = t.match(/[\u4e00-\u9fff]{2,}/);
    return m2 ? m2[0] : '';
  }

  function getSearchKeyword() {
    if (state.searchKeyword) {
      return Promise.resolve(state.searchKeyword);
    }

    var cfg = state.config.target || FALLBACK.target;
    if (cfg.searchKeyword) {
      state.searchKeyword = cfg.searchKeyword;
      return Promise.resolve(cfg.searchKeyword);
    }

    if (window.CPCPKeyword && window.CPCPKeyword.pickSearchWord) {
      var w = window.CPCPKeyword.pickSearchWord();
      state.searchKeyword = w;
      return Promise.resolve(w);
    }

    return Promise.resolve('');
  }

  function bindJump() {
    if (!el.openKwaiBtn) return;

    if (window.CPCPJump && window.CPCPJump.bind) {
      window.CPCPJump.bind(el.openKwaiBtn, getSearchKeyword, {
        timeout: 5000,
        onFallback: function () {
          var t = state.config.target || FALLBACK.target;
          if (t && t.fallback) {
            if (confirm('抖音未打开？\n点击「确定」前往我的站点查看完整内容。')) {
              location.href = t.fallback;
            }
          }
        }
      });
      return;
    }

    el.openKwaiBtn.addEventListener('click', function () {
      getSearchKeyword().then(function (kw) {
        if (!kw) return;
        var u = 'https://www.douyin.com/search/' + encodeURIComponent(kw);
        location.href = u;
      });
    });
  }

  function renderProgress() {
    var total = state.total > 0 ? state.total : FALLBACK.uploadCount;
    if (el.progressBar) {
      el.progressBar.max = total;
      el.progressBar.value = Math.min(state.count, total);
    }
    setText(el.progressText, state.count + '/' + total);
  }

  function showDuplicate() {
    if (!el.duplicateAlert) return;
    show(el.duplicateAlert);
    if (el.duplicateAlert.scrollIntoView) {
      el.duplicateAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (showDuplicate._t) clearTimeout(showDuplicate._t);
    showDuplicate._t = setTimeout(function () {
      hide(el.duplicateAlert);
      showDuplicate._t = 0;
    }, 3000);
  }

  function addPreview(file) {
    if (!el.previewContainer || !file) return null;
    var wrap = document.createElement('div');
    wrap.className = 'preview-item';

    var img = document.createElement('img');
    img.className = 'preview-image';
    img.alt = file.name || '预览图';

    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-btn';
    remove.setAttribute('aria-label', '删除');
    remove.textContent = '×';
    remove.addEventListener('click', function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    });

    wrap.appendChild(img);
    wrap.appendChild(remove);
    el.previewContainer.appendChild(wrap);

    if (window.URL && URL.createObjectURL) {
      var objUrl = URL.createObjectURL(file);
      img.src = objUrl;
      img.addEventListener('load', function () {
        URL.revokeObjectURL(objUrl); // 图已解码，及时释放内存
      });
      img.addEventListener('error', function () {
        URL.revokeObjectURL(objUrl);
      });
    }
    return wrap;
  }

  function uploadOne(file) {
    if (!API_BASE) return Promise.resolve(localUpload(file));

    return new Promise(function (resolve, reject) {
      var form = new FormData();
      form.append('site', SITE);
      form.append('file', file, file.name || 'upload.png');

      var xhr = new XMLHttpRequest();
      xhr.open('POST', api('/api/upload'), true);
      xhr.withCredentials = true; // 带上 cp_sid，进度按会话累计

      xhr.upload.addEventListener('progress', function (ev) {
        if (!ev.lengthComputable || !el.progressText) return;
        var total = state.total > 0 ? state.total : FALLBACK.uploadCount;
        var pct = Math.round((ev.loaded / ev.total) * 100);
        setText(el.progressText, state.count + '/' + total + ' · ' + pct + '%');
      });

      xhr.addEventListener('load', function () {
        var data = null;
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch (e) {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && data) {
          resolve(data);
        } else {
          var err = new Error((data && data.error) || ('HTTP ' + xhr.status));
          err.status = xhr.status;
          err.data = data;
          reject(err);
        }
      });
      xhr.addEventListener('error', function () {
        reject(new Error('network error'));
      });
      xhr.addEventListener('abort', function () {
        reject(new Error('aborted'));
      });

      xhr.send(form);
    });
  }

  var LOCAL_KEY = 'cpcp_uploaded_' + SITE;

  function localState() {
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      var d = raw ? JSON.parse(raw) : null;
      if (d && typeof d.count === 'number' && Array.isArray(d.hashes)) return d;
    } catch (e) {}
    return { count: 0, hashes: [] };
  }

  function localSave(d) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); } catch (e) {}
  }

  function fileHash(file) {
    var s = (file.name || '') + '|' + (file.size || 0) + '|' + (file.lastModified || 0);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  function localUpload(file) {
    var st = localState();
    var total = state.total > 0 ? state.total : FALLBACK.uploadCount;
    var hash = fileHash(file);

    if (st.count >= total) {
      return { total: total, count: st.count, completed: true };
    }

    if (st.hashes.indexOf(hash) >= 0) {
      return {
        duplicate: true,
        reason: '这张图已经上传过了，请换一张不同的评论截图',
        total: total,
        count: st.count,
        completed: false
      };
    }

    st.hashes.push(hash);
    st.count = Math.min(st.count + 1, total);
    localSave(st);

    return {
      total: total,
      count: st.count,
      completed: st.count >= total
    };
  }

  function applyUploadResult(data) {
    if (typeof data.total === 'number' && data.total > 0) state.total = data.total;
    if (typeof data.count === 'number') state.count = data.count;
    if (typeof data.completed === 'boolean') state.completed = data.completed;
    var wasCompleted = state.completedShown;
    renderProgress();
    if (state.completed) {
      renderCompleted(!wasCompleted);
      state.completedShown = true;
    }
  }

  function handleFiles(fileList) {
    if (!fileList || !fileList.length) return;
    if (state.completed) return; // 已领完就别再传，省服务端判重开销

    var files = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      if (f && /^image\//i.test(f.type || '')) files.push(f);
    }
    if (!files.length) {
      window.alert('请选择图片文件');
      return;
    }

    files.forEach(function (file) {
      var node = addPreview(file);
      state.uploading++;
      if (el.uploadBtn) el.uploadBtn.classList.add('is-busy');

      uploadOne(file).then(function (data) {
        if (data && data.duplicate) {
          if (node && node.parentNode) node.parentNode.removeChild(node);
          if (el.duplicateAlert && data.reason) {
            var t = el.duplicateAlert.querySelector('.alert-text');
            setText(t, data.reason);
          }
          showDuplicate();
          return;
        }
        applyUploadResult(data || {});
      }).catch(function (err) {
        if (node && node.parentNode) node.parentNode.removeChild(node);
        if (err && err.status === 413) {
          window.alert('图片太大了，请换一张小一点的');
        } else if (err && err.status === 415) {
          window.alert('只支持图片文件');
        } else {
          window.alert('上传失败，请稍后重试');
        }
      }).then(function () {
        state.uploading--;
        if (state.uploading <= 0) {
          state.uploading = 0;
          if (el.uploadBtn) el.uploadBtn.classList.remove('is-busy');
        }
        renderProgress(); // 无论成败都用本地 count 重画一次，抹掉百分比残留
      });
    });
  }

  function renderCompleted(autoOpen) {
    if (el.uploadBtn) el.uploadBtn.classList.add('is-hidden');
    if (el.commentProgress) el.commentProgress.classList.add('is-hidden');
    if (el.resultBtnContainer) el.resultBtnContainer.classList.add('is-show');
    if (autoOpen) openSuccessModal();
  }

  function renderNotCompleted() {
    if (el.uploadBtn) el.uploadBtn.classList.remove('is-hidden');
    if (el.commentProgress) el.commentProgress.classList.remove('is-hidden');
    if (el.resultBtnContainer) el.resultBtnContainer.classList.remove('is-show');
  }

  function closeSuccessModal() {
    if (el.successModal) el.successModal.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function openSuccessModal() {
    if (!el.successModal) return;
    el.successModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    fillLinkHrefs();
  }

  function fillLinkHrefs() {
    var nodes = document.querySelectorAll('.link-btn[data-slot]');
    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        var slot = node.getAttribute('data-slot');
        if (!slot) return;
        var url = api('/api/links?site=' + encodeURIComponent(SITE) + '&slot=' + encodeURIComponent(slot));
        getJSON(url).then(function (data) {
          if (data && typeof data.url === 'string' && data.url) {
            node.setAttribute('href', data.url);
            node.setAttribute('rel', 'noopener');
          }
          if (data && typeof data.label === 'string' && data.label) {
            var label = node.querySelector('.link-label');
            if (label) label.textContent = data.label;
          }
        }).catch(function () {
        });
      })(nodes[i]);
    }
  }

  function bindResult() {
    if (el.resultBtn) el.resultBtn.addEventListener('click', openSuccessModal);
    if (el.successModal) {
      el.successModal.addEventListener('click', function (ev) {
        if (ev.target === el.successModal) closeSuccessModal();
      });
    }
  }

  function applyConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    state.config = cfg;

    if (typeof cfg.uploadCount === 'number' && cfg.uploadCount > 0) {
      state.total = cfg.uploadCount;
    }
    if (typeof cfg.tips === 'string' && cfg.tips && el.step2Tips) {
      var current = (el.step2Tips.textContent || '').replace(/\s+/g, '');
      if (current !== cfg.tips.replace(/\s+/g, '')) {
        el.step2Tips.textContent = cfg.tips;
      }
    }
    if (typeof cfg.commentCount === 'number') {
      setText(el.commentCount, cfg.commentCount);
    }
    if (Array.isArray(cfg.links)) {
      cfg.links.forEach(function (link) {
        if (!link || !link.slot) return;
        var node = document.querySelector('.link-btn[data-slot="' + link.slot + '"]');
        if (!node) return;
        if (link.label) {
          var label = node.querySelector('.link-label');
          if (label) label.textContent = link.label;
        }
        if (link.icon) {
          var icon = node.querySelector('.link-icon-img');
          if (icon) icon.setAttribute('src', link.icon);
        }
      });
    }
    renderProgress();
  }

  function loadConfig() {
    var url = api('/api/config?site=' + encodeURIComponent(SITE));
    return getJSON(url).then(function (data) {
      var cfg = data && data.site ? data.site : data;
      applyConfig(cfg);
      return cfg;
    }).catch(function () {
      applyConfig(FALLBACK);
      return FALLBACK;
    });
  }

  function loadSession() {
    if (!API_BASE) {
      var st = localState();
      var total = state.total > 0 ? state.total : FALLBACK.uploadCount;
      state.count = Math.min(st.count || 0, total);
      state.completed = state.count >= total;
      renderProgress();
      if (state.completed) {
        renderCompleted(false);
        state.completedShown = true;
      } else {
        renderNotCompleted();
      }
      return Promise.resolve();
    }

    var url = api('/api/session?site=' + encodeURIComponent(SITE));
    return getJSON(url).then(function (data) {
      if (!data) return;
      if (typeof data.total === 'number' && data.total > 0) state.total = data.total;
      if (typeof data.count === 'number') state.count = data.count;
      if (typeof data.completed === 'boolean') state.completed = data.completed;
      renderProgress();
      if (state.completed) {
        renderCompleted(false);
        state.completedShown = true;
      } else {
        renderNotCompleted();
      }
    }).catch(function () {
      renderProgress();
    });
  }

  function cacheDom() {
    el.copyText = document.getElementById('copyText');
    el.copyBtn = document.getElementById('copyBtn');
    el.searchHint = document.getElementById('searchHint');
    el.searchWord = document.getElementById('searchWord');
    el.openKwaiBtn = document.getElementById('openKwaiBtn');
    el.jumpText = document.getElementById('jumpText');
    el.thumbnailCard = document.getElementById('thumbnail-card');
    el.contentThumbnail = document.getElementById('content-thumbnail');
    el.imageModal = document.getElementById('image-modal');
    el.successModal = document.getElementById('success-only');
    el.fileInput = document.getElementById('file-input');
    el.uploadBtn = document.querySelector('.upload-btn');
    el.previewContainer = document.getElementById('preview-container');
    el.progressBar = document.getElementById('upload-progress');
    el.progressText = document.getElementById('progress-text');
    el.commentProgress = document.getElementById('comment-progress');
    el.duplicateAlert = document.getElementById('duplicate-alert');
    el.resultBtnContainer = document.getElementById('result-btn-container');
    el.resultBtn = document.getElementById('result-btn');
    el.commentCount = document.getElementById('commentCount');
    el.step2Tips = document.querySelector('#step2 .step-tips');
  }

  function bindAll() {
    if (el.copyBtn) el.copyBtn.addEventListener('click', copyText);
    if (el.fileInput) {
      el.fileInput.addEventListener('change', function () {
        handleFiles(el.fileInput.files);
        el.fileInput.value = '';
      });
    }
    bindImageModal();
    bindJump();
    bindResult();
  }

  function boot() {
    cacheDom();
    splitJumpText(el.jumpText);
    bindAll();

    loadConfig().then(function (cfg) {
      if (applyUAGate(cfg)) return;
      loadSession();
      loadScript().then(function () {
        renderSearchHint();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  if (typeof window !== 'undefined' && window.__CPCP_TEST__) {
    window.CPCPApp = {
      handleFiles: handleFiles,
      localState: localState,
      localUpload: localUpload,
      fileHash: fileHash,
      applyUploadResult: applyUploadResult,
      state: state,
      renderProgress: renderProgress,
      renderCompleted: renderCompleted
    };
  }
})();