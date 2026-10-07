/* İş Takip — ortak yardımcılar, efektler ve bileşenler */
(function () {
  'use strict';
  const App = (window.App = {});
  const csrfMeta = document.querySelector('meta[name=csrf]');
  App.csrf = csrfMeta ? csrfMeta.content : '';

  /* ---------- API ---------- */
  App.api = async function (action, body, query) {
    let url = 'api.php?a=' + encodeURIComponent(action);
    if (query) {
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
    }
    const opt = { headers: { 'X-CSRF-Token': App.csrf, Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined && body !== null) {
      opt.method = 'POST';
      if (body instanceof FormData) opt.body = body;
      else { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
    }
    let res, json;
    try {
      res = await fetch(url, opt);
      json = await res.json();
    } catch (e) {
      throw new Error(navigator.onLine ? 'Sunucuya ulaşılamadı.' : 'İnternet bağlantısı yok.');
    }
    if (res.status === 401 && action !== 'login') { setTimeout(() => location.reload(), 1200); }
    if (!json.ok) throw new Error(json.error || 'Bir hata oluştu.');
    return json.data;
  };

  /* ---------- DOM yardımcıları ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  App.h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  App.el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  App.$ = (sel, root) => (root || document).querySelector(sel);
  App.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const P = {
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 17.5v.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    play: '<path d="M6 4l14 8-14 8z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  };
  App.icon = (n, cls) => `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

  /* ---------- tarih ---------- */
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  App.DAY_SHORT = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  App.parseDate = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  App.ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  App.today = () => App.ymd(new Date());
  App.addDays = (s, n) => { const d = App.parseDate(s); d.setDate(d.getDate() + n); return App.ymd(d); };
  App.fmtDate = (s, withDay) => { const d = App.parseDate(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + (withDay ? ' ' + DAYS[d.getDay()] : ''); };
  App.fmtShort = (s) => { const d = App.parseDate(s); return d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0'); };
  App.dayName = (s) => DAYS[App.parseDate(s).getDay()];
  App.fmtTime = (dt) => (dt ? dt.slice(11, 16) : '');
  App.relDay = (s) => {
    const diff = Math.round((App.parseDate(App.today()) - App.parseDate(s)) / 864e5);
    if (diff === 0) return 'Bugün';
    if (diff === 1) return 'Dün';
    if (diff > 1 && diff < 7) return diff + ' gün önce';
    return App.fmtDate(s);
  };
  App.greeting = () => { const h = new Date().getHours(); return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar'; };

  App.STATUS = {
    done: 'Yapıldı', issue: 'Sorun bildirildi', pending: 'Bekliyor', overdue: 'Gecikti', missed: 'Yapılmadı', upcoming: 'Planlandı',
  };
  App.badge = (st, txt) => `<span class="badge ${st}">${App.h(txt || App.STATUS[st] || st)}</span>`;

  App.initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toLocaleUpperCase('tr');
  const PAL = [['#6366f1', '#ec4899'], ['#06b6d4', '#6366f1'], ['#10b981', '#06b6d4'], ['#f59e0b', '#ef4444'], ['#8b5cf6', '#06b6d4'], ['#ec4899', '#f59e0b']];
  App.avatar = (name, size) => {
    let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const [a, b] = PAL[h % PAL.length];
    const s = size ? `width:${size}px;height:${size}px;font-size:${Math.round(size / 2.8)}px;` : '';
    return `<span class="avatar" style="--c1:${a};--c2:${b};${s}">${App.h(App.initials(name))}</span>`;
  };

  /* ---------- efektler ---------- */
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // İmleci takip eden cam ışığı
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('.glass, .btn');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', e.clientX - r.left + 'px');
    t.style.setProperty('--my', e.clientY - r.top + 'px');
  }, { passive: true });

  // 3B eğim
  if (fine && !reduce) {
    document.addEventListener('pointermove', (e) => {
      const t = e.target.closest && e.target.closest('[data-tilt]');
      if (!t) return;
      const r = t.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      const k = parseFloat(t.dataset.tilt) || 6;
      t.style.transform = `perspective(900px) rotateX(${(-y * k).toFixed(2)}deg) rotateY(${(x * k).toFixed(2)}deg) translateZ(0)`;
    }, { passive: true });
    document.addEventListener('pointerout', (e) => {
      const t = e.target.closest && e.target.closest('[data-tilt]');
      if (t && !t.contains(e.relatedTarget)) t.style.transform = '';
    });
  }

  // Dalgalanma
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('.btn, .chip, .tick');
    if (!b || reduce) return;
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(s);
    setTimeout(() => s.remove(), 700);
  });

  App.confetti = (x, y, n) => {
    if (reduce) return;
    const colors = ['#6366f1', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6'];
    n = n || 26;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.background = colors[i % colors.length];
      document.body.appendChild(c);
      const ang = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 140;
      const dx = Math.cos(ang) * v, dy = Math.sin(ang) * v - 80;
      const rot = Math.random() * 720 - 360;
      c.animate([
        { transform: `translate(${x}px, ${y}px) rotate(0) scale(1)`, opacity: 1 },
        { transform: `translate(${x + dx}px, ${y + dy}px) rotate(${rot / 2}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${x + dx * 1.3}px, ${y + dy + 180}px) rotate(${rot}deg) scale(.6)`, opacity: 0 },
      ], { duration: 1100 + Math.random() * 500, easing: 'cubic-bezier(.22,1,.36,1)' }).onfinish = () => c.remove();
    }
  };

  App.countUp = (el, to, dur) => {
    if (!el) return;
    const from = parseInt(el.dataset.v || '0', 10) || 0;
    el.dataset.v = to;
    if (reduce || from === to) { el.textContent = to; return; }
    const start = performance.now(); dur = dur || 900;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  App.ring = (pct, size, label, sub) => {
    size = size || 120;
    const sw = Math.max(8, size / 11), r = (size - sw) / 2, c = 2 * Math.PI * r;
    const html = `<div class="ring" style="width:${size}px;height:${size}px" data-pct="${pct}">
      <svg width="${size}" height="${size}"><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#6366f1"/><stop offset=".55" stop-color="#8b5cf6"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs>
        <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${sw}"/>
        <circle class="bar" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${sw}" stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg>
      <div class="label"><b>${label === undefined ? '%' : ''}<span class="rn">0</span></b><small>${App.h(sub || '')}</small></div></div>`;
    return html;
  };
  App.animateRings = (root) => {
    App.$$('.ring', root).forEach((rg) => {
      const bar = rg.querySelector('.bar');
      const c = parseFloat(bar.getAttribute('stroke-dasharray'));
      const pct = Math.max(0, Math.min(100, +rg.dataset.pct || 0));
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.strokeDashoffset = c * (1 - pct / 100); }));
      App.countUp(rg.querySelector('.rn'), Math.round(pct));
    });
  };
  App.animateBars = (root) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      App.$$('.track-h i[data-w]', root).forEach((i) => { i.style.width = i.dataset.w + '%'; });
    }));
  };

  /* ---------- bildirim ---------- */
  let toastBox;
  App.toast = (msg, type, opts) => {
    opts = opts || {};
    if (!toastBox) { toastBox = App.el('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.appendChild(toastBox); }
    const ic = type === 'bad' ? P.x : type === 'info' ? P.sparkle : P.check;
    const t = App.el(`<div class="toast glass ${type || ''}"><span class="tdot"><svg viewBox="0 0 24 24">${ic}</svg></span><span>${App.h(msg)}</span></div>`);
    if (opts.action) {
      const b = App.el(`<button class="btn sm">${App.h(opts.action)}</button>`);
      b.onclick = () => { opts.onAction && opts.onAction(); close(); };
      t.appendChild(b);
    }
    toastBox.appendChild(t);
    const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 350); };
    setTimeout(close, opts.duration || (opts.action ? 5000 : 2800));
    return close;
  };
  App.err = (e) => App.toast(e && e.message ? e.message : String(e), 'bad');

  /* ---------- modal ---------- */
  App.modal = ({ title, body, actions, wide, onOpen, onClose }) => {
    const back = App.el(`<div class="modal-back"><div class="modal glass ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <header><h3>${App.h(title || '')}</h3><button class="btn icon sm ghost" data-x aria-label="Kapat">${App.icon('x')}</button></header>
      <div class="body"></div><footer></footer></div></div>`);
    const bodyEl = back.querySelector('.body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const foot = back.querySelector('footer');
    const m = { root: back, body: bodyEl, closed: false };
    m.close = (val) => {
      if (m.closed) return; m.closed = true;
      back.classList.add('closing');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => back.remove(), 260);
      onClose && onClose(val);
    };
    (actions || []).forEach((a) => {
      const b = App.el(`<button class="btn ${a.cls || ''}" type="button">${a.icon ? App.icon(a.icon) : ''}<span>${App.h(a.label)}</span></button>`);
      b.onclick = async () => {
        if (!a.onClick) return m.close();
        b.classList.add('loading'); b.disabled = true;
        try { const r = await a.onClick(m, b); if (r !== false) m.close(r); } catch (e) { App.err(e); bodyEl.closest('.modal').classList.add('shake'); setTimeout(() => bodyEl.closest('.modal').classList.remove('shake'), 500); } finally { b.classList.remove('loading'); b.disabled = false; }
      };
      foot.appendChild(b);
    });
    if (!foot.children.length) foot.remove();
    const onKey = (e) => { if (e.key === 'Escape') m.close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) m.close(); });
    back.querySelector('[data-x]').onclick = () => m.close();
    document.body.appendChild(back);
    const first = bodyEl.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea');
    if (first && window.matchMedia('(hover: hover)').matches) setTimeout(() => first.focus(), 80);
    onOpen && onOpen(m);
    return m;
  };
  App.confirm = (msg, { ok = 'Evet', danger = true, title = 'Emin misiniz?' } = {}) => new Promise((resolve) => {
    let v = false;
    App.modal({
      title,
      body: `<p>${App.h(msg)}</p>`,
      actions: [
        { label: 'Vazgeç', cls: 'ghost' },
        { label: ok, cls: danger ? 'warn' : 'primary', onClick: () => { v = true; } },
      ],
      onClose: () => resolve(v),
    });
  });

  App.formData = (form) => {
    const o = {};
    new FormData(form).forEach((v, k) => {
      if (k.endsWith('[]')) { k = k.slice(0, -2); (o[k] = o[k] || []).push(v); } else o[k] = v;
    });
    return o;
  };

  /* ---------- sıklık editörü ---------- */
  App.freqFields = (v, prefix) => {
    v = v || {}; prefix = prefix || 'f' + Math.random().toString(36).slice(2, 7);
    const t = v.freq_type || 'daily';
    const wd = String(v.weekdays || '').split(',');
    const r = (val, lbl) => `<label><input type="radio" name="${prefix}_type" value="${val}" ${t === val ? 'checked' : ''}><span>${lbl}</span></label>`;
    const days = [1, 2, 3, 4, 5, 6, 7].map((d) => `<label><input type="checkbox" name="${prefix}_wd" value="${d}" ${wd.includes(String(d)) ? 'checked' : ''}><span>${App.DAY_SHORT[d]}</span></label>`).join('');
    return `<div class="freq" data-freq="${prefix}">
      <div class="seg">${r('daily', 'Her gün')}${r('every_n_days', 'X günde 1')}${r('weekly', 'Haftalık')}${r('monthly', 'Aylık')}</div>
      <div class="inline" data-show="every_n_days"><input type="number" min="2" max="365" name="${prefix}_n_days" value="${t === 'every_n_days' ? v.freq_interval || 2 : 2}"> iş gününde bir</div>
      <div data-show="weekly" class="freq">
        <div class="days">${days}</div>
        <div class="inline"><input type="number" min="1" max="52" name="${prefix}_n_weeks" value="${t === 'weekly' ? v.freq_interval || 1 : 1}"> haftada bir</div>
      </div>
      <div class="inline" data-show="monthly"><input type="number" min="1" max="12" name="${prefix}_n_months" value="${t === 'monthly' ? v.freq_interval || 1 : 1}"> ayda bir, ayın
        <input type="number" min="1" max="31" name="${prefix}_md" value="${v.month_day || 1}">. günü</div>
      <div class="inline">Hedef saat <input type="time" name="${prefix}_time" value="${App.h(v.due_time || '')}"><small class="muted">boş bırakılırsa gün sonuna kadar</small></div>
    </div>`;
  };
  App.bindFreq = (root) => {
    App.$$('[data-freq]', root).forEach((f) => {
      if (f.dataset.bound) return; f.dataset.bound = 1;
      const p = f.dataset.freq;
      const sync = () => {
        const t = (f.querySelector(`input[name=${p}_type]:checked`) || {}).value;
        App.$$(':scope > [data-show]', f).forEach((s) => { s.hidden = s.dataset.show !== t; });
      };
      f.addEventListener('change', sync); sync();
    });
  };
  App.readFreq = (f) => {
    const p = f.dataset.freq;
    const val = (n) => (f.querySelector(`[name=${p}_${n}]`) || {}).value;
    const t = f.querySelector(`input[name=${p}_type]:checked`).value;
    const o = { freq_type: t, freq_interval: 1, weekdays: null, month_day: null, due_time: val('time') || null };
    if (t === 'every_n_days') o.freq_interval = +val('n_days') || 2;
    if (t === 'weekly') { o.freq_interval = +val('n_weeks') || 1; o.weekdays = App.$$(`input[name=${p}_wd]:checked`, f).map((i) => i.value).join(','); }
    if (t === 'monthly') { o.freq_interval = +val('n_months') || 1; o.month_day = +val('md') || 1; }
    return o;
  };

  /* ---------- giriş ---------- */
  App.initLogin = () => {
    const f = document.getElementById('login-form');
    const alert = f.querySelector('.alert');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = f.querySelector('button[type=submit]');
      b.classList.add('loading'); alert.hidden = true;
      try {
        await App.api('login', App.formData(f));
        App.confetti(innerWidth / 2, innerHeight / 2, 30);
        setTimeout(() => location.reload(), 350);
      } catch (err) {
        alert.textContent = err.message; alert.hidden = false;
        f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
        b.classList.remove('loading');
      }
    });
  };

  App.logout = async () => {
    try { await App.api('logout', {}); } catch (e) { /* yoksay */ }
    location.href = 'index.php';
  };

  App.changePassword = () => {
    App.modal({
      title: 'Şifre değiştir',
      body: `<form class="form"><label class="field"><span>Mevcut şifre</span><input type="password" name="current" autocomplete="current-password"></label>
        <label class="field"><span>Yeni şifre</span><input type="password" name="new" autocomplete="new-password" minlength="6"></label></form>`,
      actions: [{ label: 'Vazgeç', cls: 'ghost' }, {
        label: 'Kaydet', cls: 'primary', onClick: async (m) => {
          await App.api('password', App.formData(m.body.querySelector('form')));
          App.toast('Şifreniz güncellendi');
        },
      }],
    });
  };

  /** Telefonda çekilen fotoğrafı yüklemeden önce küçültür. */
  App.shrinkImage = (file, max) => new Promise((resolve) => {
    max = max || 1400;
    if (!file || !/^image\//.test(file.type)) return resolve(file);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => resolve(b ? new File([b], 'foto.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
})();

/* ---------- iş detay / işaretleme penceresi (personel ve yönetici ortak) ---------- */
(function () {
  'use strict';
  const { h, icon, badge } = App;

  App.canUndo = (it) => {
    const me = window.BOOT && BOOT.user;
    if (!it.completion || !me) return false;
    if (me.role === 'admin') return true;
    return it.completion.by_id === me.id && it.completion.at.slice(0, 10) === App.today();
  };

  App.completeItem = async (it, status, note, photo) => {
    const fd = new FormData();
    fd.append('plan_id', it.plan_id);
    fd.append('occ_date', it.occ_date);
    fd.append('status', status || 'done');
    if (note) fd.append('note', note);
    if (photo) fd.append('photo', photo, photo.name || 'foto.jpg');
    return App.api('complete', fd);
  };
  App.uncompleteItem = (it) => App.api('uncomplete', { plan_id: it.plan_id, occ_date: it.occ_date });

  App.taskSheet = (it, onChange) => {
    const c = it.completion;
    const isAdmin = BOOT.user.role === 'admin';
    const canMark = !c && it.status !== 'upcoming' && (it.status !== 'missed' || isAdmin);
    const carried = it.occ_date !== App.today();
    let body = `<div class="sheet-task">
      <div class="meta">${badge(it.status)}<span class="tag">${icon('pin')}${h(it.location)}</span>
        <span class="tag">${icon('refresh')}${h(it.freq)}</span>
        ${it.due_time ? `<span class="tag">${icon('clock')}${h(it.due_time)}</span>` : ''}
        ${carried ? `<span class="tag">${icon('calendar')}${h(App.fmtDate(it.occ_date, true))}</span>` : ''}
        ${it.user ? `<span class="tag">${icon('user')}${h(it.user)}</span>` : '<span class="tag">' + icon('users') + 'Ortak iş</span>'}</div>
      ${it.task_desc ? `<p class="muted">${h(it.task_desc)}</p>` : ''}
      ${it.note ? `<div class="alert info">${h(it.note)}</div>` : ''}`;
    if (c) {
      body += `<div class="glass card" style="padding:14px">
        <div style="display:flex;gap:10px;align-items:center">${App.avatar(c.by || '?')}<div><b>${h(c.by || '')}</b>
        <div class="muted small">${h(App.relDay(c.at))} ${h(App.fmtTime(c.at))}${c.late ? ' · <span style="color:var(--warn);font-weight:700">geç yapıldı</span>' : ''}</div></div></div>
        ${c.note ? `<p style="margin-top:10px">${h(c.note)}</p>` : ''}
        ${c.photo ? `<img class="photo-thumb" src="photo.php?id=${c.id}" alt="Fotoğraf" loading="lazy">` : ''}</div>`;
    } else if (canMark) {
      body += `<label class="field"><span>Not (isteğe bağlı, sorun bildirirken zorunlu)</span><textarea name="note" placeholder="Örn. sabun bitti, depodan istendi"></textarea></label>
        <label class="photo-drop">${icon('camera')}<span>Fotoğraf ekle (isteğe bağlı)</span><input type="file" accept="image/*" capture="environment" hidden></label>
        <div class="big-actions"><button class="btn warn" data-act="issue">${icon('flag')}<span>Sorun var</span></button>
        <button class="btn success" data-act="done">${icon('check')}<span>Tamamlandı</span></button></div>`;
    } else if (it.status === 'missed') {
      body += `<div class="alert bad">Bu işin süresi geçti, yapılmadı olarak kaydedildi.</div>`;
    }
    body += '</div>';

    const actions = [];
    if (c && App.canUndo(it)) {
      actions.push({ label: 'İşareti geri al', cls: 'danger', icon: 'refresh', onClick: async () => {
        await App.uncompleteItem(it); App.toast('İşaret geri alındı', 'info'); onChange && onChange();
      } });
    }
    const m = App.modal({ title: it.task, body, actions });
    if (!canMark) return m;

    let photo = null;
    const drop = m.body.querySelector('.photo-drop');
    const input = drop.querySelector('input');
    input.onchange = async () => {
      if (!input.files[0]) return;
      photo = await App.shrinkImage(input.files[0]);
      const url = URL.createObjectURL(photo);
      drop.innerHTML = `<img src="${url}" alt=""><span>Değiştirmek için dokunun</span>`;
      drop.appendChild(input);
    };
    App.$$('[data-act]', m.body).forEach((b) => {
      b.onclick = async () => {
        const status = b.dataset.act;
        const note = m.body.querySelector('textarea').value.trim();
        if (status === 'issue' && !note) { App.toast('Lütfen sorunu kısaca yazın', 'bad'); m.body.querySelector('textarea').focus(); return; }
        b.classList.add('loading');
        try {
          const r = await App.completeItem(it, status, note, photo);
          const rect = b.getBoundingClientRect();
          if (status === 'done') App.confetti(rect.left + rect.width / 2, rect.top, 30);
          App.toast(status === 'done' ? 'Harika, iş tamamlandı!' : 'Sorun bildirildi', status === 'done' ? '' : 'info');
          m.close();
          onChange && onChange(r);
        } catch (e) { App.err(e); b.classList.remove('loading'); }
      };
    });
    return m;
  };
})();
