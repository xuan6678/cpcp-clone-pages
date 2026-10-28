(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function on(node, ev, fn) {
    node.addEventListener(ev, fn);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function inputEl(type, value, ph) {
    var n = document.createElement('input');
    n.className = 'input';
    n.type = type;
    if (value !== undefined && value !== null) n.value = String(value);
    if (ph) n.placeholder = ph;
    return n;
  }

  function areaEl(value, rows, ph) {
    var n = document.createElement('textarea');
    n.className = 'input mono';
    n.rows = rows || 3;
    n.value = value === undefined || value === null ? '' : String(value);
    if (ph) n.placeholder = ph;
    n.spellcheck = false;
    return n;
  }

  function checkEl(checked) {
    var n = document.createElement('input');
    n.type = 'checkbox';
    n.checked = !!checked;
    return n;
  }

  function labeled(labelText, node, extraCls) {
    var f = h('label', 'field' + (extraCls ? ' ' + extraCls : ''));
    f.appendChild(h('span', null, labelText));
    f.appendChild(node);
    return f;
  }

  function checkField(labelText, node) {
    var f = h('label', 'field check');
    f.appendChild(node);
    f.appendChild(h('span', null, labelText));
    return f;
  }

  function num(v, d) {
    var n = parseInt(v, 10);
    return isNaN(n) ? d : n;
  }

  function fmtTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function fmtSize(n) {
    if (n === null || n === undefined || n === '') return '—';
    var v = Number(n);
    if (isNaN(v)) return '—';
    if (v < 1024) return v + ' B';
    if (v < 1048576) return (v / 1024).toFixed(1) + ' KB';
    return (v / 1048576).toFixed(2) + ' MB';
  }

  function localInputToTs(v) {
    if (!v) return 0;
    var t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  }

  function tsToLocalInput(ts) {
    if (!ts) return '';
    var d = new Date(Number(ts));
    if (isNaN(d.getTime())) return '';
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function dateKey(d) {
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function listOf(res, key) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res[key])) return res[key];
    if (res && Array.isArray(res.items)) return res.items;
    return [];
  }

  function toast(msg, ok) {
    var box = $('toasts');
    if (!box) return;
    var t = h('div', 'toast ' + (ok === false ? 'bad' : 'ok'), msg);
    box.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 320);
    }, 3000);
  }

  function fail(e) {
    if (e && e.handled) return;
    toast((e && e.message) ? e.message : '操作失败', false);
  }

  async function api(method, path, body) {
    var opt = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined && body !== null) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    var res;
    try {
      res = await fetch(path, opt);
    } catch (e) {
      throw new Error('网络错误，请检查服务是否在运行');
    }
    var data = null;
    var ct = res.headers.get('content-type') || '';
    if (ct.indexOf('application/json') !== -1) {
      try { data = await res.json(); } catch (e2) { data = null; }
    } else {
      try {
        var txt = await res.text();
        data = txt ? { raw: txt } : null;
      } catch (e3) { data = null; }
    }
    if (!res.ok) {
      var err = new Error((data && data.error) ? data.error : ('HTTP ' + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data === null ? {} : data;
  }

  async function apiAdmin(method, path, body) {
    try {
      return await api(method, path, body);
    } catch (e) {
      if (e && e.status === 401) {
        e.handled = true;
        showLogin();
        toast('登录已失效，请重新登录', false);
      }
      throw e;
    }
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.left = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e2) {
      return false;
    }
  }

  var PANEL_TITLE = {
    overview: '概览',
    sites: '站点管理',
    tokens: '令牌管理',
    uploads: '上传管理',
    stats: '统计',
    settings: '设置',
    data: '导入导出'
  };

  var PAGE_SIZE = 50; // 与契约里 /api/admin/uploads 的默认 limit 对齐

  var state = {
    user: null,
    panel: 'overview',
    sites: [],
    overview: null,
    editingId: null,
    tokenSite: '',
    uploadSite: '',
    uploadOffset: 0,
    uploadHasNext: false,
    settings: null
  };

  var curLinks = [];

  function showLogin() {
    $('app').hidden = true;
    $('loginMask').hidden = false;
    $('loginErr').textContent = '';
    var p = $('loginPass');
    if (p) p.focus();
  }

  function enterApp() {
    $('loginMask').hidden = true;
    $('app').hidden = false;
    $('who').textContent = state.user || 'admin';
    go('overview');
  }

  function bindLogin() {
    var form = $('loginForm');
    on(form, 'submit', async function (ev) {
      ev.preventDefault();
      var user = $('loginUser').value.trim();
      var pass = $('loginPass').value;
      var btn = $('loginBtn');
      var errBox = $('loginErr');
      errBox.textContent = '';
      if (!user || !pass) {
        errBox.textContent = '用户名和密码都要填';
        return;
      }
      btn.disabled = true;
      btn.textContent = '登录中…';
      try {
        var res = await api('POST', '/api/admin/login', { user: user, pass: pass });
        state.user = (res && res.user) ? res.user : user;
        toast('登录成功', true);
        enterApp();
      } catch (e) {
        errBox.textContent = (e && e.status === 401) ? '用户名或密码错误' : ((e && e.message) || '登录失败');
      } finally {
        btn.disabled = false;
        btn.textContent = '登录';
      }
    });
  }

  function bindLogout() {
    on($('logoutBtn'), 'click', async function () {
      try {
        await api('POST', '/api/admin/logout', {});
      } catch (e) {
      }
      state.user = null;
      state.overview = null;
      state.sites = [];
      state.editingId = null;
      $('who').textContent = '';
      showLogin();
      toast('已退出登录', true);
    });
  }

  function bindNav() {
    var items = $('nav').querySelectorAll('.nav-item');
    Array.prototype.forEach.call(items, function (b) {
      on(b, 'click', function () { go(b.dataset.go); });
    });
  }

  async function go(name) {
    state.panel = name;
    var items = $('nav').querySelectorAll('.nav-item');
    Array.prototype.forEach.call(items, function (b) {
      b.classList.toggle('active', b.dataset.go === name);
    });
    var panels = document.querySelectorAll('[data-panel]');
    Array.prototype.forEach.call(panels, function (p) {
      p.classList.toggle('active', p.dataset.panel === name);
    });
    $('crumb').textContent = PANEL_TITLE[name] || name;
    try {
      if (name === 'overview') await loadOverview();
      else if (name === 'sites') await loadSites();
      else if (name === 'tokens') await loadTokens();
      else if (name === 'uploads') await loadUploads(0);
      else if (name === 'stats') await loadStats();
      else if (name === 'settings') await loadSettings();
    } catch (e) {
      fail(e);
    }
  }

  function fillSiteSelect(sel, withAll) {
    var prev = sel.value;
    clear(sel);
    if (withAll) {
      var o0 = document.createElement('option');
      o0.value = '';
      o0.textContent = '全部站点';
      sel.appendChild(o0);
    }
    state.sites.forEach(function (s) {
      if (!s || !s.id) return;
      var o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.id + (s.name ? ' — ' + s.name : '');
      sel.appendChild(o);
    });
    if (prev) sel.value = prev;
    if (!sel.value && sel.options.length) sel.selectedIndex = 0;
  }

  function card(label, value) {
    var c = h('div', 'card');
    c.appendChild(h('div', 'card-num', value));
    c.appendChild(h('div', 'card-label', label));
    return c;
  }

  async function loadOverview() {
    var res = await apiAdmin('GET', '/api/admin/overview');
    state.overview = res || {};
    var o = state.overview;
    var bySite = (o.bySite && typeof o.bySite === 'object') ? o.bySite : {};

    var box = clear($('ovCards'));
    box.appendChild(card('站点数', num(o.sites, 0)));
    box.appendChild(card('令牌数', num(o.tokens, 0)));
    box.appendChild(card('上传数', num(o.uploads, 0)));
    box.appendChild(card('口令请求数', num(o.hits, 0)));
    box.appendChild(card('今日请求', num(o.today, 0)));
    var siteKeys = Object.keys(bySite);
    var siteSum = 0;
    siteKeys.forEach(function (k) { siteSum += num(bySite[k], 0); });
    box.appendChild(card('站点分布条目', siteKeys.length + ' 个 / 合计 ' + siteSum));

    var recent = Array.isArray(o.recentUploads) ? o.recentUploads : [];
    var grid = clear($('ovRecent'));
    if (!recent.length) {
      grid.appendChild(h('div', 'empty', '还没有上传记录'));
    } else {
      recent.forEach(function (u) {
        grid.appendChild(uploadTile(u, false));
      });
    }
  }

  function siteStatusBadge(enabled) {
    var b = h('span', 'badge ' + (enabled ? 'on' : 'off'), enabled ? '启用' : '停用');
    return b;
  }

  function renderSiteList() {
    var wrap = clear($('siteList'));
    if (!state.sites.length) {
      wrap.appendChild(h('div', 'empty', '还没有站点，点右上角「新建站点」'));
      return;
    }
    var tbl = h('table', 'tbl');
    var thead = h('thead');
    var hr = h('tr');
    ['ID', '名称', '状态', '评论数', '需上传', '链接', '口令', '操作'].forEach(function (t) {
      hr.appendChild(h('th', null, t));
    });
    thead.appendChild(hr);
    tbl.appendChild(thead);

    var tbody = h('tbody');
    state.sites.forEach(function (s) {
      var tr = h('tr');
      if (state.editingId === s.id) tr.style.background = '#1a2432';
      tr.appendChild(h('td', 'mono', s.id));
      tr.appendChild(h('td', null, s.name || '—'));
      var tdSt = h('td');
      tdSt.appendChild(siteStatusBadge(!!s.enabled));
      tr.appendChild(tdSt);
      tr.appendChild(h('td', null, s.commentCount === undefined ? '—' : s.commentCount));
      tr.appendChild(h('td', null, s.uploadCount === undefined ? '—' : s.uploadCount));
      tr.appendChild(h('td', null, Array.isArray(s.links) ? s.links.length : 0));
      var tdCopy = h('td', 'mono dim', (s.copyText || '').slice(0, 16) + ((s.copyText || '').length > 16 ? '…' : ''));
      tr.appendChild(tdCopy);

      var tdOp = h('td', 'ops');
      var edit = h('button', 'btn sm', '编辑');
      edit.type = 'button';
      on(edit, 'click', function () { selectSite(s.id); });
      tdOp.appendChild(edit);
      var del = h('button', 'btn danger sm', '删除');
      del.type = 'button';
      on(del, 'click', async function () {
        if (!confirm('确定删除站点「' + (s.name || s.id) + '」？关联数据不会被自动清理，操作不可撤销。')) return;
        try {
          await apiAdmin('DELETE', '/api/admin/sites/' + encodeURIComponent(s.id));
          toast('站点已删除', true);
          if (state.editingId === s.id) {
            state.editingId = null;
            clear($('siteForm'));
            $('siteFormTitle').textContent = '编辑站点';
            $('siteFormHint').textContent = '从上方列表选一个站点，或点「新建站点」';
          }
          await loadSites();
        } catch (e) {
          fail(e);
        }
      });
      tdOp.appendChild(del);
      tr.appendChild(tdOp);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
  }

  async function loadSites() {
    var res = await apiAdmin('GET', '/api/admin/sites');
    state.sites = listOf(res, 'sites');
    renderSiteList();
    fillSiteSelect($('tkFilter'), true);
    fillSiteSelect($('upFilter'), true);
    fillSiteSelect($('tkNewSite'), false);
    if (!state.editingId && state.sites.length) {
      selectSite(state.sites[0].id);
    }
  }

  function selectSite(id) {
    var s = null;
    for (var i = 0; i < state.sites.length; i++) {
      if (state.sites[i] && state.sites[i].id === id) { s = state.sites[i]; break; }
    }
    if (!s) return;
    state.editingId = id;
    renderSiteForm(s, false);
    renderSiteList();
  }

  function renderLinkCards() {
    var box = $('siteLinks');
    if (!box) return;
    clear(box);
    if (!curLinks.length) {
      box.appendChild(h('div', 'empty', '还没有链接，点右上角「添加链接」'));
      return;
    }
    curLinks.forEach(function (lk, i) {
      box.appendChild(linkCard(lk, i));
    });
  }

  function linkCard(lk, i) {
    var card = h('div', 'link-card');

    var head = h('div', 'link-head');
    head.appendChild(h('span', 'link-idx', 'link #' + (i + 1)));
    var del = h('button', 'btn danger sm', '删除这条');
    del.type = 'button';
    on(del, 'click', function () {
      syncLinks();
      curLinks.splice(i, 1);
      renderLinkCards();
    });
    head.appendChild(del);
    card.appendChild(head);

    var grid = h('div', 'link-grid');

    var slot = inputEl('text', lk.slot, 'aa');
    slot.dataset.k = 'slot';
    grid.appendChild(labeled('slot', slot));

    var label = inputEl('text', lk.label, '本月通用口令');
    label.dataset.k = 'label';
    grid.appendChild(labeled('label', label));

    var icon = inputEl('text', lk.icon, '/ll/图片/dt11.gif');
    icon.dataset.k = 'icon';
    grid.appendChild(labeled('icon', icon));

    var urls = areaEl((lk.urls || []).join('\n'), 4, '每行一个 URL');
    urls.dataset.k = 'urls';
    grid.appendChild(labeled('urls（每行一个）', urls, 'wide'));

    card.appendChild(grid);
    return card;
  }

  function syncLinks() {
    var box = $('siteLinks');
    if (!box) return;
    var cards = box.querySelectorAll('.link-card');
    var out = [];
    Array.prototype.forEach.call(cards, function (card) {
      function get(k) {
        var n = card.querySelector('[data-k="' + k + '"]');
        return n ? n.value : '';
      }
      out.push({
        slot: get('slot').trim(),
        label: get('label').trim(),
        icon: get('icon').trim(),
        urls: get('urls').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; })
      });
    });
    curLinks = out;
  }

  function renderSiteForm(site, isNew) {
    var box = clear($('siteForm'));
    curLinks = [];

    if (site && Array.isArray(site.links)) {
      curLinks = site.links.map(function (lk) {
        return {
          slot: (lk && lk.slot) ? String(lk.slot) : '',
          label: (lk && lk.label) ? String(lk.label) : '',
          icon: (lk && lk.icon) ? String(lk.icon) : '',
          urls: (lk && Array.isArray(lk.urls)) ? lk.urls.slice() : []
        };
      });
    }

    state.editingId = isNew ? null : (site ? site.id : null);
    $('siteFormTitle').textContent = isNew ? '新建站点' : ('编辑站点：' + (site ? site.id : ''));
    $('siteFormHint').textContent = isNew
      ? 'ID 创建后不可修改，其余字段随时可改'
      : '保存会以完整对象 PUT 覆盖该站点';

    var ua = (site && site.uaGate) ? site.uaGate : {};
    var tg = (site && site.target) ? site.target : {};
    var f = {};

    var base = h('div', 'form-grid');

    f.id = inputEl('text', isNew ? '' : (site ? site.id : ''), '例如 trdy');
    f.id.disabled = !isNew;
    base.appendChild(labeled('站点 ID（唯一，创建后不可改）', f.id));

    f.name = inputEl('text', site ? site.name : '', '例如 抖音口令');
    base.appendChild(labeled('名称 name', f.name));

    f.commentCount = inputEl('number', (site && site.commentCount !== undefined) ? site.commentCount : 3);
    f.commentCount.min = '0';
    base.appendChild(labeled('评论数 commentCount', f.commentCount));

    f.uploadCount = inputEl('number', (site && site.uploadCount !== undefined) ? site.uploadCount : 3);
    f.uploadCount.min = '1';
    base.appendChild(labeled('需上传数 uploadCount', f.uploadCount));

    f.tips = inputEl('text', site ? site.tips : '', '例如 跳转后评论3个视频');
    base.appendChild(labeled('提示 tips', f.tips));

    f.enabled = checkEl(site ? !!site.enabled : true);
    base.appendChild(checkField('启用 enabled', f.enabled));

    f.requireUpload = checkEl(site ? !!site.requireUpload : true);
    base.appendChild(checkField('需上传 requireUpload', f.requireUpload));

    f.copyText = areaEl(site ? site.copyText : '', 3, '[吐彩虹]...');
    base.appendChild(labeled('口令文本 copyText', f.copyText, 'wide'));

    box.appendChild(base);

    var uaBlock = h('div', 'block sub');
    var uaHead = h('div', 'block-head');
    uaHead.appendChild(h('h3', null, 'uaGate — 非移动端拦截'));
    uaBlock.appendChild(uaHead);
    var uaGrid = h('div', 'form-grid');

    f.uaEnabled = checkEl(ua.enabled !== undefined ? !!ua.enabled : true);
    uaGrid.appendChild(checkField('启用 uaGate.enabled', f.uaEnabled));
    f.uaAllowDesktop = checkEl(ua.allowDesktop !== undefined ? !!ua.allowDesktop : true);
    uaGrid.appendChild(checkField('放行桌面 uaGate.allowDesktop', f.uaAllowDesktop));
    f.uaRedirect = inputEl('text', ua.redirect || '', 'https://a34.xyz');
    uaGrid.appendChild(labeled('重定向地址 uaGate.redirect', f.uaRedirect, 'wide'));

    uaBlock.appendChild(uaGrid);
    box.appendChild(uaBlock);

    var tgBlock = h('div', 'block sub');
    var tgHead = h('div', 'block-head');
    tgHead.appendChild(h('h3', null, 'target — 跳转目标'));
    tgBlock.appendChild(tgHead);
    var tgGrid = h('div', 'form-grid');

    f.tgAndroid = inputEl('text', tg.android || '', 'snssdk1128://aweme/detail/');
    tgGrid.appendChild(labeled('android', f.tgAndroid));
    f.tgIos = inputEl('text', tg.ios || '', 'snssdk1128://aweme/detail/');
    tgGrid.appendChild(labeled('ios', f.tgIos));
    f.tgFallback = inputEl('text', tg.fallback || '', 'https://www.douyin.com/');
    tgGrid.appendChild(labeled('fallback', f.tgFallback));
    f.tgKeyword = inputEl('text', tg.searchKeyword || '', '苦楝');
    tgGrid.appendChild(labeled('searchKeyword', f.tgKeyword));

    tgBlock.appendChild(tgGrid);
    box.appendChild(tgBlock);

    var lkBlock = h('div', 'block sub');
    var lkHead = h('div', 'block-head');
    lkHead.appendChild(h('h3', null, 'links — 网盘链接'));
    var addBtn = h('button', 'btn sm', '添加链接');
    addBtn.type = 'button';
    on(addBtn, 'click', function () {
      syncLinks();
      curLinks.push({ slot: '', label: '', icon: '', urls: [] });
      renderLinkCards();
    });
    lkHead.appendChild(addBtn);
    lkBlock.appendChild(lkHead);
    var lkBox = h('div', 'links');
    lkBox.id = 'siteLinks';
    lkBlock.appendChild(lkBox);
    box.appendChild(lkBlock);
    renderLinkCards();

    var actions = h('div', 'row');
    actions.style.marginTop = '10px';

    var saveBtn = h('button', 'btn primary', isNew ? '创建站点' : '保存站点');
    saveBtn.type = 'button';

    var resetBtn = h('button', 'btn ghost', '重置表单');
    resetBtn.type = 'button';
    on(resetBtn, 'click', function () {
      if (isNew) renderSiteForm(null, true);
      else renderSiteForm(site, false);
    });

    actions.appendChild(saveBtn);
    actions.appendChild(resetBtn);

    if (!isNew) {
      var copyIdBtn = h('button', 'btn ghost', '复制 ID');
      copyIdBtn.type = 'button';
      on(copyIdBtn, 'click', async function () {
        var ok = await copyText(site.id);
        toast(ok ? '已复制站点 ID' : '复制失败，请手动选择', ok);
      });
      actions.appendChild(copyIdBtn);
    }

    on(saveBtn, 'click', async function () {
      syncLinks();
      var sid = (isNew ? f.id.value : site.id).trim();
      if (!sid) {
        toast('站点 ID 不能为空', false);
        f.id.focus();
        return;
      }
      if (!/^[A-Za-z0-9_-]+$/.test(sid)) {
        toast('站点 ID 只允许字母、数字、下划线和短横线', false);
        return;
      }

      var payload = {
        id: sid,
        name: f.name.value.trim() || sid,
        enabled: f.enabled.checked,
        copyText: f.copyText.value,
        commentCount: Math.max(0, num(f.commentCount.value, 0)),
        uploadCount: Math.max(1, num(f.uploadCount.value, 1)),
        tips: f.tips.value,
        requireUpload: f.requireUpload.checked,
        uaGate: {
          enabled: f.uaEnabled.checked,
          allowDesktop: f.uaAllowDesktop.checked,
          redirect: f.uaRedirect.value.trim()
        },
        target: {
          android: f.tgAndroid.value.trim(),
          ios: f.tgIos.value.trim(),
          fallback: f.tgFallback.value.trim(),
          searchKeyword: f.tgKeyword.value.trim()
        },
        links: curLinks
      };

      saveBtn.disabled = true;
      var oldText = saveBtn.textContent;
      saveBtn.textContent = '保存中…';
      try {
        if (isNew) {
          payload.createdAt = Date.now();
          await apiAdmin('POST', '/api/admin/sites', payload);
          toast('站点已创建', true);
        } else {
          await apiAdmin('PUT', '/api/admin/sites/' + encodeURIComponent(sid), payload);
          toast('站点已保存', true);
        }
        await loadSites();
        selectSite(sid);
      } catch (e) {
        fail(e);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = oldText;
      }
    });

    box.appendChild(actions);
  }

  function bindSites() {
    on($('siteNewBtn'), 'click', function () {
      state.editingId = null;
      renderSiteForm(null, true);
      renderSiteList();
      var el = $('siteForm');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function shortToken(t) {
    var s = String(t || '');
    if (s.length <= 14) return s;
    return s.slice(0, 8) + '…' + s.slice(-4);
  }

  async function loadTokens() {
    var path = '/api/admin/tokens';
    if (state.tokenSite) path += '?site=' + encodeURIComponent(state.tokenSite);
    var res = await apiAdmin('GET', path);
    var list = listOf(res, 'tokens');
    renderTokenList(list);
  }

  function renderTokenList(list) {
    var wrap = clear($('tkList'));
    if (!list.length) {
      wrap.appendChild(h('div', 'empty', '没有令牌'));
      return;
    }
    var tbl = h('table', 'tbl');
    var thead = h('thead');
    var hr = h('tr');
    ['令牌', '站点', '状态', '过期', '命中', '备注', '操作'].forEach(function (t) {
      hr.appendChild(h('th', null, t));
    });
    thead.appendChild(hr);
    tbl.appendChild(thead);

    var tbody = h('tbody');
    list.forEach(function (tk) {
      var tr = h('tr');

      var tdTk = h('td');
      var cell = h('div', 'tk-cell');
      var span = h('span', 'token mono', shortToken(tk.token));
      span.title = '点击展开全文并复制';
      var expanded = false;
      on(span, 'click', async function () {
        expanded = !expanded;
        span.classList.toggle('full', expanded);
        span.textContent = expanded ? String(tk.token) : shortToken(tk.token);
        if (expanded) {
          var ok = await copyText(String(tk.token));
          toast(ok ? '已复制完整令牌' : '已展开，复制失败请手动选择', ok);
        }
      });
      cell.appendChild(span);
      tdTk.appendChild(cell);
      tr.appendChild(tdTk);

      tr.appendChild(h('td', null, tk.site || '—'));

      var tdEn = h('td');
      var badge = h('span', 'badge ' + (tk.enabled ? 'on' : 'off'), tk.enabled ? '启用' : '停用');
      tdEn.appendChild(badge);
      tr.appendChild(tdEn);

      var tdExp = h('td');
      var expInput = document.createElement('input');
      expInput.className = 'input sm';
      expInput.type = 'datetime-local';
      expInput.value = tsToLocalInput(tk.expiresAt);
      expInput.title = '留空 = 永不过期';
      on(expInput, 'change', async function () {
        try {
          await apiAdmin('PATCH', '/api/admin/tokens/' + encodeURIComponent(tk.token), {
            expiresAt: localInputToTs(expInput.value)
          });
          toast('过期时间已更新', true);
          await loadTokens();
        } catch (e) {
          fail(e);
          expInput.value = tsToLocalInput(tk.expiresAt);
        }
      });
      tdExp.appendChild(expInput);
      tr.appendChild(tdExp);

      tr.appendChild(h('td', null, num(tk.hits, 0)));
      tr.appendChild(h('td', 'dim', tk.note || '—'));

      var tdOp = h('td', 'ops');

      var toggle = h('button', 'btn sm', tk.enabled ? '禁用' : '启用');
      toggle.type = 'button';
      on(toggle, 'click', async function () {
        try {
          await apiAdmin('PATCH', '/api/admin/tokens/' + encodeURIComponent(tk.token), {
            enabled: !tk.enabled
          });
          toast(tk.enabled ? '令牌已禁用' : '令牌已启用', true);
          await loadTokens();
        } catch (e) {
          fail(e);
        }
      });
      tdOp.appendChild(toggle);

      var cp = h('button', 'btn sm', '复制');
      cp.type = 'button';
      on(cp, 'click', async function () {
        var ok = await copyText(String(tk.token));
        toast(ok ? '已复制' : '复制失败，请手动选择', ok);
      });
      tdOp.appendChild(cp);

      var del = h('button', 'btn danger sm', '删除');
      del.type = 'button';
      on(del, 'click', async function () {
        if (!confirm('确定删除令牌 ' + shortToken(tk.token) + ' ？删除后使用它的页面会立刻失效。')) return;
        try {
          await apiAdmin('DELETE', '/api/admin/tokens/' + encodeURIComponent(tk.token));
          toast('令牌已删除', true);
          await loadTokens();
        } catch (e) {
          fail(e);
        }
      });
      tdOp.appendChild(del);

      tr.appendChild(tdOp);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
  }

  function bindTokens() {
    on($('tkFilter'), 'change', function () {
      state.tokenSite = $('tkFilter').value;
      loadTokens().catch(fail);
    });

    on($('tkNewBtn'), 'click', function () {
      var form = $('tkNewForm');
      form.hidden = !form.hidden;
      if (!form.hidden) {
        fillSiteSelect($('tkNewSite'), false);
        if (state.tokenSite) $('tkNewSite').value = state.tokenSite;
        $('tkNewToken').value = '';
        $('tkNewNote').value = '';
        $('tkNewExp').value = '';
        $('tkNewToken').focus();
      }
    });

    on($('tkCancelBtn'), 'click', function () {
      $('tkNewForm').hidden = true;
    });

    on($('tkCreateBtn'), 'click', async function () {
      var site = $('tkNewSite').value;
      if (!site) {
        toast('请先选择站点（没有站点就先到「站点」面板建一个）', false);
        return;
      }
      var body = { site: site };
      var t = $('tkNewToken').value.trim();
      if (t) body.token = t;
      var note = $('tkNewNote').value.trim();
      if (note) body.note = note;
      var exp = localInputToTs($('tkNewExp').value);
      if (exp) body.expiresAt = exp;

      var btn = $('tkCreateBtn');
      btn.disabled = true;
      try {
        var res = await apiAdmin('POST', '/api/admin/tokens', body);
        var made = (res && res.token) ? String(res.token) : (t || '');
        if (made) {
          var ok = await copyText(made);
          toast(ok ? ('令牌已生成并复制：' + shortToken(made)) : ('令牌已生成：' + shortToken(made)), true);
        } else {
          toast('令牌已生成', true);
        }
        $('tkNewForm').hidden = true;
        await loadTokens();
      } catch (e) {
        fail(e);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function uploadTile(u, withDelete) {
    var tile = h('div', 'tile');
    var src = (u && u.path) ? String(u.path) : '';
    var label = u && u.name ? u.name : (u && u.id ? u.id : '');

    if (src) {
      var img = document.createElement('img');
      img.src = src;
      img.alt = label;
      img.loading = 'lazy';
      tile.appendChild(img);
    } else {
      tile.appendChild(h('div', 'tile-none', '无图'));
    }

    var tip = [];
    if (u && u.name) tip.push(u.name);
    if (u && u.site) tip.push('站点 ' + u.site);
    if (u && u.size !== undefined) tip.push(fmtSize(u.size));
    if (u && u.createdAt) tip.push(fmtTime(u.createdAt));
    if (u && u.ip) tip.push(u.ip);
    tile.title = tip.join(' · ');

    if (withDelete) {
      var del = h('button', 'tile-del', '×');
      del.type = 'button';
      del.title = '删除这张上传记录和文件';
      on(del, 'click', async function () {
        if (!confirm('确定删除这张上传记录和文件？不可撤销。')) return;
        try {
          await apiAdmin('DELETE', '/api/admin/uploads/' + encodeURIComponent(u.id));
          toast('已删除', true);
          await loadUploads(state.uploadOffset);
        } catch (e) {
          fail(e);
        }
      });
      tile.appendChild(del);
    }
    return tile;
  }

  async function loadUploads(offset) {
    if (offset < 0) offset = 0;
    state.uploadOffset = offset;
    var q = [];
    if (state.uploadSite) q.push('site=' + encodeURIComponent(state.uploadSite));
    q.push('limit=' + PAGE_SIZE);
    q.push('offset=' + offset);
    var res = await apiAdmin('GET', '/api/admin/uploads?' + q.join('&'));
    var list = listOf(res, 'uploads');

    state.uploadHasNext = list.length >= PAGE_SIZE;

    var grid = clear($('upGrid'));
    if (!list.length) {
      grid.appendChild(h('div', 'empty', offset > 0 ? '这一页没有数据了' : '没有上传记录'));
    } else {
      list.forEach(function (u) {
        grid.appendChild(uploadTile(u, true));
      });
    }

    var pager = clear($('upPager'));
    var prev = h('button', 'btn sm', '上一页');
    prev.type = 'button';
    prev.disabled = offset <= 0;
    on(prev, 'click', function () {
      loadUploads(Math.max(0, state.uploadOffset - PAGE_SIZE)).catch(fail);
    });
    pager.appendChild(prev);

    var from = list.length ? (offset + 1) : 0;
    var to = offset + list.length;
    pager.appendChild(h('span', 'hint', '第 ' + from + '–' + to + ' 条 / 本页 ' + list.length + ' 条'));

    var next = h('button', 'btn sm', '下一页');
    next.type = 'button';
    next.disabled = !state.uploadHasNext;
    on(next, 'click', function () {
      loadUploads(state.uploadOffset + PAGE_SIZE).catch(fail);
    });
    pager.appendChild(next);
  }

  function bindUploads() {
    on($('upFilter'), 'change', function () {
      state.uploadSite = $('upFilter').value;
      loadUploads(0).catch(fail);
    });
    on($('upReload'), 'click', function () {
      loadUploads(state.uploadOffset).catch(fail);
    });
  }

  async function loadStats() {
    var res = await apiAdmin('GET', '/api/admin/stats');
    var st = res || {};

    var bySite = (st.bySite && typeof st.bySite === 'object') ? st.bySite : {};
    var byIp = (st.byIp && typeof st.byIp === 'object') ? st.byIp : {};
    var daily = (st.daily && typeof st.daily === 'object') ? st.daily : {};

    var cards = clear($('stCards'));
    cards.appendChild(card('总请求 hits', num(st.hits, 0)));
    cards.appendChild(card('总上传 uploads', num(st.uploads, 0)));
    cards.appendChild(card('站点条目', Object.keys(bySite).length));
    cards.appendChild(card('来源 IP 数', Object.keys(byIp).length));

    var series = [];
    var now = new Date();
    for (var i = 13; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var k = dateKey(d);
      var raw = daily[k];
      var v = Number(raw);
      if (isNaN(v)) v = 0;
      series.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), value: v });
    }
    var max = 1;
    series.forEach(function (p) { if (p.value > max) max = p.value; });

    var chart = clear($('stChart'));
    series.forEach(function (p) {
      var wrap = h('div', 'bar-wrap');
      wrap.appendChild(h('div', 'bar-val', p.value));
      var track = h('div', 'bar-track');
      var bar = h('div', 'bar');
      var pct = max > 0 ? (p.value / max) * 100 : 0;
      bar.style.height = pct + '%';
      bar.title = p.label + '：' + p.value;
      track.appendChild(bar);
      wrap.appendChild(track);
      wrap.appendChild(h('div', 'bar-x', p.label));
      chart.appendChild(wrap);
    });
    $('stDailyHint').textContent = '最近 14 天（峰值 ' + max + '）';

    var siteWrap = clear($('stBySite'));
    var sKeys = Object.keys(bySite);
    if (!sKeys.length) {
      siteWrap.appendChild(h('div', 'empty', '暂无数据'));
    } else {
      var st1 = h('table', 'tbl');
      var th1 = h('thead');
      var r1 = h('tr');
      r1.appendChild(h('th', null, '站点'));
      r1.appendChild(h('th', null, '请求数'));
      th1.appendChild(r1);
      st1.appendChild(th1);
      var tb1 = h('tbody');
      sKeys.sort(function (a, b) { return num(bySite[b], 0) - num(bySite[a], 0); });
      sKeys.forEach(function (k) {
        var tr = h('tr');
        tr.appendChild(h('td', 'mono', k));
        tr.appendChild(h('td', null, num(bySite[k], 0)));
        tb1.appendChild(tr);
      });
      st1.appendChild(tb1);
      siteWrap.appendChild(st1);
    }

    var ipWrap = clear($('stByIp'));
    var iKeys = Object.keys(byIp);
    if (!iKeys.length) {
      ipWrap.appendChild(h('div', 'empty', '暂无数据'));
    } else {
      iKeys.sort(function (a, b) { return num(byIp[b], 0) - num(byIp[a], 0); });
      var top = iKeys.slice(0, 20);
      var st2 = h('table', 'tbl');
      var th2 = h('thead');
      var r2 = h('tr');
      r2.appendChild(h('th', null, 'IP'));
      r2.appendChild(h('th', null, '请求数'));
      th2.appendChild(r2);
      st2.appendChild(th2);
      var tb2 = h('tbody');
      top.forEach(function (k) {
        var tr = h('tr');
        tr.appendChild(h('td', 'mono', k));
        tr.appendChild(h('td', null, num(byIp[k], 0)));
        tb2.appendChild(tr);
      });
      st2.appendChild(tb2);
      ipWrap.appendChild(st2);
    }
  }

  async function loadSettings() {
    var res = await apiAdmin('GET', '/api/admin/settings');
    var s = (res && res.settings && typeof res.settings === 'object') ? res.settings : (res || {});
    state.settings = s;

    var dedupe = s.dedupeScope || 'site';
    var sel = $('setDedupe');
    var found = false;
    Array.prototype.forEach.call(sel.options, function (o) {
      if (o.value === dedupe) found = true;
    });
    sel.value = found ? dedupe : 'site';

    $('setMax').value = (s.maxUploadBytes !== undefined && s.maxUploadBytes !== null) ? s.maxUploadBytes : 8388608;
    $('setSnippet').value = s.analyticsSnippet ? String(s.analyticsSnippet) : '';
    $('setHint').textContent = '当前：' + sel.value + ' / ' + fmtSize($('setMax').value);
  }

  function bindSettings() {
    on($('setSave'), 'click', async function () {
      var maxBytes = num($('setMax').value, 8388608);
      if (maxBytes < 1024) {
        toast('单文件上限不能小于 1024 字节', false);
        return;
      }
      var btn = $('setSave');
      btn.disabled = true;
      try {
        await apiAdmin('PUT', '/api/admin/settings', {
          dedupeScope: $('setDedupe').value,
          maxUploadBytes: maxBytes,
          analyticsSnippet: $('setSnippet').value
        });
        toast('设置已保存', true);
        $('setHint').textContent = '当前：' + $('setDedupe').value + ' / ' + fmtSize(maxBytes);
      } catch (e) {
        fail(e);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function bindData() {
    on($('expBtn'), 'click', async function () {
      var btn = $('expBtn');
      btn.disabled = true;
      try {
        var res = await fetch('/api/admin/export', {
          method: 'GET',
          credentials: 'same-origin'
        });
        if (!res.ok) {
          var msg = '导出失败 HTTP ' + res.status;
          if (res.status === 401) {
            showLogin();
            msg = '登录已失效，请重新登录';
          }
          throw new Error(msg);
        }
        var blob = await res.blob();
        var url = URL.createObjectURL(blob);
        var d = new Date();
        function p(n) { return n < 10 ? '0' + n : '' + n; }
        var name = 'cpcp-db-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
          '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.json';
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        toast('已开始下载 ' + name, true);
      } catch (e) {
        fail(e);
      } finally {
        btn.disabled = false;
      }
    });

    on($('impBtn'), 'click', async function () {
      var input = $('impFile');
      var hint = $('impHint');
      var file = input.files && input.files[0];
      if (!file) {
        toast('请先选择一个 JSON 文件', false);
        return;
      }
      var text;
      try {
        text = await file.text();
      } catch (e) {
        toast('读取文件失败', false);
        return;
      }
      var db;
      try {
        db = JSON.parse(text);
      } catch (e) {
        toast('文件不是合法 JSON', false);
        hint.textContent = '解析失败：' + (e && e.message ? e.message : 'JSON 语法错误');
        return;
      }
      if (!db || typeof db !== 'object') {
        toast('JSON 根节点必须是对象', false);
        return;
      }
      if (db.version !== 1) {
        toast('version 必须是 1，当前为 ' + db.version, false);
        hint.textContent = '版本不匹配，拒绝导入（避免把结构不同的库灌进来）';
        return;
      }
      if (!Array.isArray(db.sites)) {
        toast('缺少 sites 数组', false);
        hint.textContent = '结构校验失败：sites 必须是数组';
        return;
      }
      var ok = confirm('将用该文件覆盖导入，当前全部站点/令牌/上传记录会被替换。\n站点数：' +
        db.sites.length + '，确认继续？');
      if (!ok) return;

      var btn = $('impBtn');
      btn.disabled = true;
      try {
        var res = await apiAdmin('POST', '/api/admin/import', { db: db });
        if (res && res.ok === false) {
          throw new Error(res.error || '后端拒绝了这次导入');
        }
        toast('导入成功', true);
        hint.textContent = '导入完成，已刷新站点列表。';
        input.value = '';
        state.editingId = null;
        await loadSites();
      } catch (e) {
        fail(e);
        hint.textContent = '导入失败：' + ((e && e.message) || '未知错误');
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function boot() {
    bindLogin();
    bindLogout();
    bindNav();
    bindSites();
    bindTokens();
    bindUploads();
    bindSettings();
    bindData();

    try {
      var me = await api('GET', '/api/admin/me');
      state.user = (me && me.user) ? me.user : 'admin';
      enterApp();
    } catch (e) {
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();