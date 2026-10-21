/* İş Takip — tarayıcı içi demo: api.php'nin JavaScript karşılığı (örnek verilerle). */
(function () {
  'use strict';

  /* ---------- kalıcılık ---------- */
  const KEY = 'istakip-demo-v19';
  const REPORT_CATS = { clean: 'Temizlik gerekiyor', supply: 'Malzeme bitti', broken: 'Arıza / tamir', climate: 'Isıtma / soğutma', other: 'Diğer' };
  const store = {
    get() {
      try { const v = localStorage.getItem(KEY); if (v) return JSON.parse(v); } catch (e) { /* yoksay */ }
      try { const w = JSON.parse(window.name || '{}'); if (w[KEY]) return w[KEY]; } catch (e) { /* yoksay */ }
      return null;
    },
    set(v) {
      try { localStorage.setItem(KEY, JSON.stringify(v)); return; } catch (e) { /* yoksay */ }
      try { const w = JSON.parse(window.name || '{}'); w[KEY] = v; window.name = JSON.stringify(w); } catch (e) { /* yoksay */ }
    },
    clear() {
      try { localStorage.removeItem(KEY); } catch (e) { /* yoksay */ }
      try { const w = JSON.parse(window.name || '{}'); delete w[KEY]; window.name = JSON.stringify(w); } catch (e) { /* yoksay */ }
    },
  };
  function getMode() {
    try { const m = localStorage.getItem(KEY + '-mode'); if (m) return m; } catch (e) { /* yoksay */ }
    try { return JSON.parse(window.name || '{}')[KEY + '-mode'] || 'admin'; } catch (e) { return 'admin'; }
  }
  /** Demo tercihleri (görünüm, personel ekranında gösterilen kişi) */
  function getPref(name, def) {
    try { const v = localStorage.getItem(KEY + '-' + name); if (v) return v; } catch (e) { /* yoksay */ }
    try { return JSON.parse(window.name || '{}')[KEY + '-' + name] || def; } catch (e) { return def; }
  }
  function setPref(name, v) {
    try { localStorage.setItem(KEY + '-' + name, v); } catch (e) { /* yoksay */ }
    try { const w = JSON.parse(window.name || '{}'); w[KEY + '-' + name] = v; window.name = JSON.stringify(w); } catch (e) { /* yoksay */ }
  }
  function setMode(m) {
    try { localStorage.setItem(KEY + '-mode', m); } catch (e) { /* yoksay */ }
    try { const w = JSON.parse(window.name || '{}'); w[KEY + '-mode'] = m; window.name = JSON.stringify(w); } catch (e) { /* yoksay */ }
  }

  /* ---------- tarih ve plan motoru (lib/schedule.php ile aynı) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const dn = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
  const ymd = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
  const iso = (n) => ((((n + 3) % 7) + 7) % 7) + 1;
  const DAY_SHORT = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const localToday = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const nowHm = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const nowStr = () => { const d = new Date(); return localToday() + ' ' + nowHm() + ':' + pad(d.getSeconds()); };

  class Sched {
    constructor(workDays, holidays) {
      this.wd = new Set(workDays.map(Number).filter((d) => d >= 1 && d <= 7));
      if (!this.wd.size) [1, 2, 3, 4, 5].forEach((d) => this.wd.add(d));
      this.hol = new Set(holidays.filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h)).map(dn));
    }
    isWorkday(n) { return this.wd.has(iso(n)) && !this.hol.has(n); }
    workdaysBetween(a, b) {
      if (b <= a) return 0;
      const full = Math.floor((b - a) / 7);
      let c = full * this.wd.size;
      for (let d = a + full * 7; d < b; d++) if (this.wd.has(iso(d))) c++;
      this.hol.forEach((h) => { if (h >= a && h < b && this.wd.has(iso(h))) c--; });
      return c;
    }
    prep(p) {
      p = Object.assign({}, p);
      p._start = dn(p.start_date);
      p._end = p.end_date ? dn(p.end_date) : null;
      p._n = Math.max(1, +p.freq_interval || 1);
      p._wd = new Set(String(p.weekdays || '').split(',').map(Number).filter((w) => w >= 1 && w <= 7));
      p._md = Math.min(31, Math.max(1, +p.month_day || 1));
      let f = p._start;
      for (let i = 0; i < 60 && !this.isWorkday(f); i++) f++;
      p._first = f;
      let a = p._start;
      for (let i = 0; i < 7 && p._wd.size && !p._wd.has(iso(a)); i++) a++;
      p._wanchor = a - (iso(a) - 1);
      p.due_time = p.due_time || null;
      return p;
    }
    monthTarget(y, m, md) {
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      let t = Math.round(Date.UTC(y, m - 1, Math.min(md, dim)) / 864e5);
      for (let i = 0; i < 15 && !this.isWorkday(t); i++) t++;
      return t;
    }
    isDue(p, n) {
      if (p.freq_type === 'on_demand') return false;
      if (n < p._start || (p._end !== null && n > p._end) || !this.isWorkday(n)) return false;
      switch (p.freq_type) {
        case 'every_n_days': return this.workdaysBetween(p._first, n) % p._n === 0;
        case 'weekly': {
          if (!p._wd.has(iso(n))) return false;
          const w = Math.floor((n - (iso(n) - 1) - p._wanchor) / 7);
          return w >= 0 && w % p._n === 0;
        }
        case 'monthly': {
          const d = new Date(n * 864e5), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
          const s = new Date(p._start * 864e5), sy = s.getUTCFullYear(), sm = s.getUTCMonth() + 1;
          for (const [yy, mm] of [[y, m], m === 1 ? [y - 1, 12] : [y, m - 1]]) {
            if (this.monthTarget(yy, mm, p._md) === n) {
              const since = yy * 12 + mm - (sy * 12 + sm);
              if (since >= 0 && since % p._n === 0) return true;
            }
          }
          return false;
        }
        default: return true;
      }
    }
    lookback(p) {
      return { every_n_days: p._n * 3 + 20, weekly: p._n * 7 + 20, monthly: p._n * 31 + 20 }[p.freq_type] || 20;
    }
    latest(p, n) {
      const min = Math.max(p._start, n - this.lookback(p));
      for (let d = n; d >= min; d--) if (this.isDue(p, d)) return d;
      return null;
    }
    next(p, from) {
      let max = from + this.lookback(p);
      if (p._end !== null) max = Math.min(max, p._end);
      for (let d = Math.max(from, p._start); d <= max; d++) if (this.isDue(p, d)) return d;
      return null;
    }
    occurrences(p, from, to) {
      const out = [];
      from = Math.max(from, p._start);
      if (p._end !== null) to = Math.min(to, p._end);
      for (let d = from; d <= to; d++) if (this.isDue(p, d)) out.push(d);
      return out;
    }
    static timesOf(p) {
      return [...new Set(String(p.times || '').split(',').map((t) => t.trim()).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort();
    }
    slots(p) {
      const ts = Sched.timesOf(p);
      if (ts.length < 2) return [Object.assign({}, p, { _slot: 0, _slots: 1, _next: null, _prev: null })];
      return ts.map((t, i) => Object.assign({}, p, { due_time: t, _slot: i, _slots: ts.length, _next: ts[i + 1] || null, _prev: ts[i - 1] || null }));
    }
    status(p, occ, c, today, hm) {
      if (c) return c.status === 'issue' ? 'issue' : 'done';
      if (occ > today) return 'upcoming';
      if (occ === today && p._prev && hm < p._prev) return 'upcoming';
      if (p._next && (occ < today || hm >= p._next)) return 'missed';
      const nx = this.next(p, occ + 1);
      if (nx !== null && nx <= today) return 'missed';
      if (nx === null && p._end !== null && today > p._end) return 'missed';
      if (occ < today) return 'overdue';
      if (p.due_time && hm > p.due_time) return 'overdue';
      return 'pending';
    }
    static label(p) {
      const k = Sched.timesOf(p).length;
      return Sched.baseLabel(p) + (k > 1 ? ` · günde ${k} kez` : '');
    }
    static baseLabel(p) {
      const n = Math.max(1, +p.freq_interval || 1);
      switch (p.freq_type) {
        case 'every_n_days': return n === 1 ? 'Her gün' : n + ' günde 1';
        case 'weekly': {
          const d = String(p.weekdays || '').split(',').map((w) => DAY_SHORT[+w]).filter(Boolean).join(', ');
          return (n === 1 ? 'Her hafta' : n + ' haftada 1') + (d ? ' · ' + d : '');
        }
        case 'monthly': return (n === 1 ? 'Her ay' : n + ' ayda 1') + ' · ayın ' + (+p.month_day) + '. günü';
        case 'on_demand': return 'İhtiyaç olduğunda';
        default: return 'Her gün';
      }
    }
  }

  const DEFAULT_STAFF = [['Aysel Akman', 'aysel.akman'], ['Deniz Karabulut', 'deniz.karabulut'], ['Gülnaz Yalçın', 'gulnaz.yalcin'],
    ['Mahmut Demirel', 'mahmut.demirel'], ['Mumin Tekin', 'mumin.tekin'], ['Yalçın Bıçakcı', 'yalcin.bicakci']];

  function looksConsumable(name) {
    const n = name.toLocaleLowerCase('tr');
    if (n.includes('temizl')) return false;
    return /genel kontrol|tuvalet ka[gğ]ı|havlu|sabun|sebil|damacana|rulo|ikram tabağı|ö[gğ]ütücü|(^|\s)pil(\s|$)/.test(n);
  }

  /* ---------- örnek veri ---------- */
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function seed() {
    const now = nowStr();
    const S = { seq: 1, users: [], locations: [], tasks: [], packages: [], package_items: [], plans: [], completions: [], leaves: [], links: [], photos: {},
      settings: { company_name: 'YÖKAK Destek Hizmetleri', work_days: '1,2,3,4,5', holidays: '' } };
    const id = () => S.seq++;
    const add = (tbl, row) => { row.id = id(); S[tbl].push(row); return row; };
    const admin = add('users', { name: 'Bina Yöneticisi', username: 'yonetici', role: 'admin', phone: null, active: 1, created_at: now });
    const st = (name, username) => add('users', { name, username, role: 'staff', phone: null, active: 1, created_at: now });
    const aysel = st('Aysel Akman', 'aysel.akman');
    const deniz = st('Deniz Karabulut', 'deniz.karabulut');
    const gulnaz = st('Gülnaz Yalçın', 'gulnaz.yalcin');
    const mahmut = st('Mahmut Demirel', 'mahmut.demirel');
    const mumin = st('Mumin Tekin', 'mumin.tekin');
    const yalcin = st('Yalçın Bıçakcı', 'yalcin.bicakci');
    const L = {};
    ['Uzman Yardımcıları Koridoru', 'Makam Koridoru', 'Tuvalet Erkek', 'Tuvalet Kadın', 'Ana Giriş (Bahçe)', 'YÖK Girişi (Asansör)', 'Fotokopi Alanı', 'Arşiv', 'Çay Ocağı', 'Bahçe ve Otopark']
      .forEach((n, i) => { L[n] = add('locations', { name: n, description: null, sort_order: i, active: 1, created_at: now }); });
    const P = [
      ['Çay Ocağı Ana Sorumluluk Paketi', '#b45309', 'Çay ocağı ana sorumlusunun günlük ve haftalık işleri', [
        ['Çay hazırlama', 'daily', 1, null, null, '08:30', '08:30,13:30'],
        ['Bulaşık Yıkama', 'daily', 1, null, null, '16:30'],
        ['Çay malzeme eksiklerinin tedarik edilmesi', 'weekly', 1, '1', null, '10:00'],
        ['Su/Damacana kontrolü', 'daily', 1, null, null, '09:00'],
        ['Çaydanlıkların detaylı temizliği', 'weekly', 1, '5', null, '15:00'],
        ['Kahve makinesi temizliği', 'daily', 1, null, null, '16:00'],
        ['Çay Ocağı Zemin Temizliği', 'daily', 1, null, null, '17:00'],
        ['Yemek görevi', 'daily', 1, null, null, '12:00'],
        ['Detaylı Çay Ocağı Temizliği', 'weekly', 1, '5', null, '16:00'],
        ['Makam ikram tabağı kontrolü', 'daily', 1, null, null, '09:30'],
        ['Çay ocağı rulosunun değiştirilmesi', 'daily', 1, null, null, '09:30'],
        ['Toplantıların ikramlarının hazırlanması ve sunumu', 'on_demand', 1, null, null, null]]],
      ['Koridor İş Paketi', '#0f766e', 'Koridor sorumlusunun odalar, tuvaletler, çay servisi ve toplantı odası işleri', [
        ['Çay demleme', 'daily', 1, null, null, '08:15', '08:15,13:00'],
        ['Odalarda masa üstü, pencere önü temizliği ve düzeni', 'daily', 1, null, null, '09:00'],
        ['Tuvalet zemin temizliği', 'daily', 1, null, null, '10:00'],
        ['Tuvalet klozet temizliği', 'daily', 1, null, null, '10:00'],
        ['Tuvalet lavabo temizliği', 'daily', 1, null, null, '10:00'],
        ['Tuvalet ayna temizliği', 'daily', 1, null, null, '10:00'],
        ['Sabunluk kontrolü', 'daily', 1, null, null, '09:30'],
        ['Tuvalet Genel Kontrol', 'daily', 1, null, null, '10:00', '10:00,11:00,12:00,14:00,15:00,16:00,17:00'],
        ['Detaylı tuvalet temizliği', 'weekly', 1, '5', null, '15:00'],
        ['Koridor pencere küpeşte önü temizliği', 'weekly', 1, '2,4', null, '14:00'],
        ['Çay servis hizmetleri', 'daily', 1, null, null, null],
        ['Başkanlık yemek getirme', 'daily', 1, null, null, '12:00'],
        ['Toplantı odalarında temizlik ve düzen oluşturulması', 'daily', 1, null, null, '08:30'],
        ['Detaylı oda temizliği', 'weekly', 1, '3', null, '14:00'],
        ['Misafir alanı temizliği', 'every_n_days', 2, null, null, '11:00']]],
      ['Bahçe Sorumluluk Paketi', '#15803d', 'Bahçe, otopark ve giriş çevresi; çiçek bakımı, sulama ve depo işleri', [
        ['Girişin temizliği, halı temizliği', 'daily', 1, null, null, '08:00'],
        ['Bahçe çöplerinin toplanması', 'every_n_days', 2, null, null, '10:00'],
        ['Çiçeklerin bakımı, budama', 'weekly', 1, '3', null, '10:00'],
        ['Sulama', 'daily', 1, null, null, '08:30'],
        ['Yaprak temizliği', 'daily', 1, null, null, '11:00'],
        ['Ofis ve koridor saksı çiçeklerinin bakımı', 'weekly', 1, '1', null, '14:00'],
        ['Kar küreme ve tuzlama işlemleri', 'daily', 1, null, null, '07:30'],
        ['Bahçe ilaçlaması', 'monthly', 1, null, 5, '10:00'],
        ['Depo düzenlemesi', 'weekly', 1, '5', null, '14:00']]],
      ['Fotokopi Alanı Paketi', '#7c3aed', 'Fotokopi alanı ve makine çevresinin düzenli temizliği', [
        ['Fotokopi makinesinin çevre temizliği', 'weekly', 1, '1,4', null, '15:00']]],
    ];
    const T = {};
    const pk = {};
    P.forEach(([name, color, desc, items]) => {
      const p = add('packages', { name, description: desc, color, created_at: now });
      pk[name] = p;
      items.forEach(([tn, ft, iv, wd, md, dt, times], i) => {
        times = times || null;
        if (!T[tn]) T[tn] = add('tasks', { name: tn, description: null, freq_type: ft, freq_interval: iv, weekdays: wd, month_day: md, due_time: dt, times,
          kind: looksConsumable(tn) ? 'consumable' : 'normal', active: 1, created_at: now });
        add('package_items', { package_id: p.id, task_id: T[tn].id, freq_type: ft, freq_interval: iv, weekdays: wd, month_day: md, due_time: dt, times, sort_order: i });
      });
    });
    T['Kar küreme ve tuzlama işlemleri'].description = 'Kış döneminde (1 Aralık – 15 Mart) her sabah: kar veya buzlanma varsa giriş, yürüyüş yolları ve otopark kürenir ve tuzlanır; yoksa kontrol edilip işaretlenir.';
    T['Odalarda masa üstü, pencere önü temizliği ve düzeni'].description = 'Makam odası dahil.';
    const start = ymd(dn(localToday()) - 28);
    // Kış dönemi: 1 Aralık – 15 Mart (lib/schema.php winter_window ile aynı)
    const winter = () => {
      const t = localToday(), y = +t.slice(0, 4), md = t.slice(5);
      if (md >= '12-01') return [t, (y + 1) + '-03-15'];
      if (md <= '03-15') return [t, y + '-03-15'];
      return [y + '-12-01', (y + 1) + '-03-15'];
    };
    const apply = (pkgName, locName, user, only, season) => {
      const [s0, e0] = season === 'winter' ? winter() : [start, null];
      S.package_items.filter((i) => i.package_id === pk[pkgName].id).forEach((it) => {
        const tname = S.tasks.find((t) => t.id === it.task_id).name;
        if (only && !only.includes(tname)) return;
        add('plans', { task_id: it.task_id, location_id: L[locName].id, user_id: user ? user.id : null, package_id: pk[pkgName].id,
          freq_type: it.freq_type, freq_interval: it.freq_interval, weekdays: it.weekdays, month_day: it.month_day, due_time: it.due_time, times: it.times,
          start_date: s0, end_date: e0, note: null, active: 1, created_at: now });
      });
    };
    apply('Bahçe Sorumluluk Paketi', 'Bahçe ve Otopark', mahmut, ['Girişin temizliği, halı temizliği', 'Bahçe çöplerinin toplanması', 'Çiçeklerin bakımı, budama', 'Sulama', 'Yaprak temizliği', 'Ofis ve koridor saksı çiçeklerinin bakımı', 'Bahçe ilaçlaması', 'Depo düzenlemesi']);
    apply('Bahçe Sorumluluk Paketi', 'Bahçe ve Otopark', mahmut, ['Kar küreme ve tuzlama işlemleri'], 'winter');
    apply('Fotokopi Alanı Paketi', 'Fotokopi Alanı', deniz);
    apply('Koridor İş Paketi', 'Uzman Yardımcıları Koridoru', deniz);
    apply('Koridor İş Paketi', 'Makam Koridoru', gulnaz);
    apply('Çay Ocağı Ana Sorumluluk Paketi', 'Çay Ocağı', aysel);

    // Hangi mekanda hangi işler yapılır (lib/schema.php ile aynı)
    Object.entries({
      'Uzman Yardımcıları Koridoru': ['Çay demleme', 'Odalarda masa üstü, pencere önü temizliği ve düzeni', 'Tuvalet zemin temizliği', 'Tuvalet klozet temizliği', 'Tuvalet lavabo temizliği', 'Tuvalet ayna temizliği', 'Sabunluk kontrolü', 'Tuvalet Genel Kontrol', 'Detaylı tuvalet temizliği', 'Koridor pencere küpeşte önü temizliği', 'Çay servis hizmetleri', 'Başkanlık yemek getirme', 'Toplantı odalarında temizlik ve düzen oluşturulması', 'Detaylı oda temizliği', 'Misafir alanı temizliği'],
      'Makam Koridoru': ['Çay demleme', 'Odalarda masa üstü, pencere önü temizliği ve düzeni', 'Tuvalet zemin temizliği', 'Tuvalet klozet temizliği', 'Tuvalet lavabo temizliği', 'Tuvalet ayna temizliği', 'Sabunluk kontrolü', 'Tuvalet Genel Kontrol', 'Detaylı tuvalet temizliği', 'Koridor pencere küpeşte önü temizliği', 'Çay servis hizmetleri', 'Başkanlık yemek getirme', 'Toplantı odalarında temizlik ve düzen oluşturulması', 'Detaylı oda temizliği', 'Misafir alanı temizliği'],
      'Çay Ocağı': ['Çay hazırlama', 'Bulaşık Yıkama', 'Çay malzeme eksiklerinin tedarik edilmesi', 'Su/Damacana kontrolü', 'Çaydanlıkların detaylı temizliği', 'Kahve makinesi temizliği', 'Çay Ocağı Zemin Temizliği', 'Yemek görevi', 'Detaylı Çay Ocağı Temizliği', 'Makam ikram tabağı kontrolü', 'Çay ocağı rulosunun değiştirilmesi', 'Toplantıların ikramlarının hazırlanması ve sunumu'],
      'Bahçe ve Otopark': ['Girişin temizliği, halı temizliği', 'Bahçe çöplerinin toplanması', 'Çiçeklerin bakımı, budama', 'Sulama', 'Yaprak temizliği', 'Ofis ve koridor saksı çiçeklerinin bakımı', 'Kar küreme ve tuzlama işlemleri', 'Bahçe ilaçlaması', 'Depo düzenlemesi'],
      'Fotokopi Alanı': ['Fotokopi makinesinin çevre temizliği'],
    }).forEach(([loc, tasks]) => tasks.forEach((t) => {
      if (!S.links.some((x) => x.location_id === L[loc].id && x.task_id === T[t].id)) S.links.push({ location_id: L[loc].id, task_id: T[t].id });
    }));
    S.plans.forEach((p) => { if (!S.links.some((x) => x.location_id === p.location_id && x.task_id === p.task_id)) S.links.push({ location_id: p.location_id, task_id: p.task_id }); });

    // Örnek izinler
    const sch = new Sched([1, 2, 3, 4, 5], []);
    const workdayBack = (n) => { let d = dn(localToday()); while (n > 0) { d--; if (sch.isWorkday(d)) n--; } return ymd(d); };
    const workdayFwd = (n) => { let d = dn(localToday()); while (n > 0) { d++; if (sch.isWorkday(d)) n--; } return ymd(d); };
    add('leaves', { user_id: aysel.id, leave_date: workdayBack(4), note: 'Yıllık izin', created_by: aysel.id, created_at: now });
    add('leaves', { user_id: gulnaz.id, leave_date: workdayBack(2), note: 'Sağlık raporu', created_by: admin.id, created_at: now });
    add('leaves', { user_id: yalcin.id, leave_date: workdayFwd(3), note: 'Mazeret izni', created_by: yalcin.id, created_at: now });
    const onLeave = new Set(S.leaves.map((l) => l.user_id + '|' + l.leave_date));

    // Geçmiş kayıtlar
    const r = rng(20261007), r2 = rng(20261013);
    const today = dn(localToday());
    const hm = nowHm();
    const issues = ['Sabun stoğu bitti, depodan istendi.', 'Kağıt havlu dispenseri kırık.', 'Çamaşır suyu kalmadı.', 'Süpürge arızalı, elle yapıldı.'];
    const staff = [aysel, deniz, gulnaz, mahmut, mumin, yalcin];
    S.plans.forEach((p0) => {
      const p = sch.prep(p0);
      sch.occurrences(p, p._start, today).forEach((o) => sch.slots(p).forEach((ps) => {
        const isToday = o === today;
        if (p0.user_id && onLeave.has(p0.user_id + '|' + ymd(o))) return;
        const due = ps.due_time || '16:00';
        if (isToday && due > hm) return;
        const x = r();
        // Ahmet bugün biraz geride, böylece listede gecikenler görünür.
        const rate = isToday ? (p0.user_id === aysel.id ? 0.45 : 0.75) : 0.86;
        if (x > rate + 0.04) return;
        const who = p0.user_id || staff[Math.floor(r() * staff.length)].id;
        const [h, m] = due.split(':').map(Number);
        let mins = h * 60 + m - 75 + Math.floor(r() * 85);
        if (isToday) { const [nh, nm] = hm.split(':').map(Number); mins = Math.min(mins, nh * 60 + nm - 1); }
        const at = ymd(o) + ' ' + pad(Math.floor(mins / 60)) + ':' + pad(mins % 60) + ':00';
        const issue = x > rate;
        const kind = S.tasks.find((t) => t.id === p0.task_id).kind;
        const st = issue ? 'issue' : kind === 'consumable' && r() < 0.35 ? 'replaced' : 'done';
        const c = add('completions', { plan_id: p0.id, occ_date: ymd(o), slot: ps._slot, user_id: who, status: st,
          note: issue ? issues[Math.floor(r() * issues.length)] : null, photo: null, created_at: at });
        // Yöneticinin bir kısmını kontrol etmesi (son iki günün kontrolleri personele bildirim olarak düşer)
        if (!issue && r2() < 0.22) {
          let im = mins + 25 + Math.floor(r2() * 90);
          if (isToday) { const [nh, nm] = hm.split(':').map(Number); im = Math.min(im, nh * 60 + nm); }
          Object.assign(c, { inspected_by: admin.id, inspected_at: ymd(o) + ' ' + pad(Math.floor(im / 60)) + ':' + pad(im % 60) + ':00', inspect_seen: o < today - 1 ? 1 : 0 });
        }
      }));
    });
    // "İhtiyaç olduğunda" işler: toplantı olan günlerde 1–2 kayıt
    const r3 = rng(20261021);
    const meetings = ['Kurul toplantısı', 'Birim toplantısı', 'Misafir ziyareti', 'Komisyon toplantısı', null];
    S.plans.filter((p0) => p0.freq_type === 'on_demand').forEach((p0) => {
      for (let o = sch.prep(p0)._start; o <= today; o++) {
        if (!sch.isWorkday(o) || (p0.user_id && onLeave.has(p0.user_id + '|' + ymd(o)))) continue;
        const k = Math.floor(r3() * 3);
        [600, 840].slice(0, k).forEach((mins, slot) => {
          mins += Math.floor(r3() * 50);
          if (o === today && mins > +hm.slice(0, 2) * 60 + +hm.slice(3)) return;
          add('completions', { plan_id: p0.id, occ_date: ymd(o), slot, user_id: p0.user_id || aysel.id, status: 'done',
            note: meetings[Math.floor(r3() * meetings.length)], photo: null, created_at: ymd(o) + ' ' + pad(Math.floor(mins / 60)) + ':' + pad(mins % 60) + ':00' });
        });
      }
    });
    return S;
  }

  let S = store.get() || seed();
  // Önceki demo sürümünden kalan kurum adını güncelle (diğer değişiklikler korunur).
  if (S.settings && S.settings.company_name === 'Merkez Bina Destek Hizmetleri') S.settings.company_name = 'YÖKAK Destek Hizmetleri';
  // Karekodla sorun bildirimi: mekan anahtarları ve örnek bildirimler
  const rtok = () => Array.from({ length: 20 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  S.locations.forEach((l) => { if (!l.qr_token) l.qr_token = rtok(); });
  if (!S.reports) {
    S.reports = [];
    const locN = (n) => (S.locations.find((l) => l.name === n) || S.locations[0] || {}).id;
    const ago = (min) => { const d = new Date(Date.now() - min * 60000); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00'; };
    [
      ['Tuvalet Erkek', 'supply', 'Sabunluk boş, kağıt havlu da azalmış.', 'Emre Y.', null, 'new', 18],
      ['Makam Koridoru', 'climate', 'Toplantı salonunun kliması çalışmıyor, içerisi çok sıcak.', 'Selin A.', '0532 000 00 00', 'new', 55],
      ['Fotokopi Alanı', 'broken', 'Fotokopi makinesinin yanındaki priz yerinden çıkmış.', null, null, 'progress', 140],
      ['Çay Ocağı', 'clean', 'Tezgahın üzeri dökülmüş çay ile kirli.', 'Burak T.', null, 'done', 300],
    ].forEach(([ln, cat, desc, name, contact, st, min], i) => S.reports.push({ id: 9000 + i, location_id: locN(ln), category: cat, description: desc, photo: null,
      reporter_name: name, reporter_contact: contact, status: st, admin_note: st === 'done' ? 'Tezgah temizlendi.' : null,
      handled_by: st === 'new' ? null : 1, handled_at: st === 'new' ? null : ago(min - 30), created_at: ago(min) }));
  }
  const save = () => store.set(S);
  save();

  /* ---------- sorgu yardımcıları ---------- */
  const err = (m) => { throw new Error(m); };
  const byId = (tbl, id) => S[tbl].find((r) => r.id === +id);
  const sched = () => new Sched(S.settings.work_days.split(','), S.settings.holidays.split(/[\s,;]+/));
  const todayCtx = () => [dn(localToday()), nowHm()];
  const nid = () => S.seq++;
  const cmpTr = (a, b) => String(a || '').localeCompare(String(b || ''), 'tr');

  function plansQuery(filter) {
    return S.plans.filter(filter || (() => true)).map((p) => {
      const t = byId('tasks', p.task_id), l = byId('locations', p.location_id), u = p.user_id ? byId('users', p.user_id) : null, k = p.package_id ? byId('packages', p.package_id) : null;
      return Object.assign({}, p, { task_name: t.name, task_desc: t.description, task_kind: t.kind || 'normal', location_name: l.name, location_sort: l.sort_order,
        user_name: u ? u.name : null, package_name: k ? k.name : null, package_color: k ? k.color : null });
    }).sort((a, b) => a.location_sort - b.location_sort || cmpTr(a.location_name, b.location_name) || cmpTr(a.due_time, b.due_time) || cmpTr(a.task_name, b.task_name));
  }
  /** "İhtiyaç olduğunda" işler ve aralıktaki işaretlemeleri (api.php on_demand_items karşılığı) */
  function onDemandItems(plans, from, to) {
    return plans.filter((p) => p.freq_type === 'on_demand' && p.start_date <= to && (!p.end_date || p.end_date >= from)).map((p) => {
      const entries = S.completions.filter((c) => c.plan_id === p.id && c.occ_date >= from && c.occ_date <= to)
        .sort((a, b) => cmpTr(a.created_at, b.created_at) || a.id - b.id)
        .map((c) => { const u = byId('users', c.user_id), iu = c.inspected_by ? byId('users', c.inspected_by) : null;
          return { id: c.id, slot: c.slot || 0, occ_date: c.occ_date, by: u ? u.name : null, by_id: c.user_id, at: c.created_at, status: c.status, note: c.note, photo: !!c.photo,
            inspected: c.inspected_at ? { by: iu ? iu.name : null, at: c.inspected_at } : null }; });
      return { plan_id: p.id, occ_date: to, task: p.task_name, task_desc: p.task_desc, location: p.location_name, location_id: p.location_id, user: p.user_name, user_id: p.user_id,
        package: p.package_name, color: p.package_color, kind: p.task_kind || 'normal', note: p.note, freq: Sched.label(p), on_demand: true, count: entries.length, entries };
    });
  }
  function cmap(from, to) {
    const m = {};
    S.completions.forEach((c) => {
      if (c.occ_date >= from && c.occ_date <= to) {
        const u = byId('users', c.user_id);
        const iu = c.inspected_by ? byId('users', c.inspected_by) : null;
        m[ck(c.plan_id, c.occ_date, c.slot || 0)] = Object.assign({}, c, { by_name: u ? u.name : null, inspected_name: iu ? iu.name : null });
      }
    });
    return m;
  }
  function lmap(from, to) {
    const m = {};
    S.leaves.forEach((l) => { if (l.leave_date >= from && l.leave_date <= to) m[l.user_id + '|' + l.leave_date] = l; });
    return m;
  }
  function occStatus(sc, p, occ, c, today, hm, lv) {
    if (!c && p.user_id && lv[p.user_id + '|' + ymd(occ)]) return 'leave';
    return sc.status(p, occ, c, today, hm);
  }
  const ck = (pid, d, slot) => pid + '|' + d + '|' + (slot || 0);
  function itemOut(p, occ, c, status) {
    const o = ymd(occ);
    let late = false;
    if (c) late = c.created_at.slice(0, 10) > o || c.created_at > o + ' ' + (p.due_time || '23:59') + ':59';
    return {
      plan_id: p.id, occ_date: o, slot: p._slot || 0, slot_count: p._slots || 1, opens_at: p._prev || null, task: p.task_name, task_desc: p.task_desc, location: p.location_name, location_id: p.location_id,
      user: p.user_name, user_id: p.user_id, package: p.package_name, color: p.package_color, due_time: p.due_time,
      freq: Sched.label(p), kind: p.task_kind || 'normal', note: p.note, status,
      completion: c ? { id: c.id, by: c.by_name, by_id: c.user_id, at: c.created_at, status: c.status, note: c.note, photo: !!c.photo, late,
        inspected: c.inspected_at ? { by: c.inspected_name, at: c.inspected_at } : null } : null,
    };
  }
  function dayItems(sc, plans, day) {
    const [today, hm] = todayCtx();
    let lb = 20;
    const pp = plans.map((p) => { const q = sc.prep(p); lb = Math.max(lb, sc.lookback(q)); return q; });
    const cm = cmap(ymd(day - lb), ymd(day));
    const lv = lmap(ymd(day - lb), ymd(day));
    const items = [];
    pp.forEach((p) => {
      const occ = sc.latest(p, day);
      if (occ === null) return;
      sc.slots(p).forEach((ps) => {
        const c = cm[ck(p.id, ymd(occ), ps._slot)] || null;
        if (occ < day && c && c.created_at.slice(0, 10) < ymd(day)) return;
        const st = occStatus(sc, ps, occ, c, today, hm, lv);
        if ((st === 'missed' || st === 'leave') && occ < day) return;
        items.push(itemOut(ps, occ, c, st));
      });
    });
    return items;
  }
  function tally(items) {
    const t = { total: 0, done: 0, issue: 0, pending: 0, overdue: 0, missed: 0, upcoming: 0, leave: 0 };
    items.forEach((i) => { t.total++; t[i.status]++; });
    const base = t.total - t.leave;
    t.rate = base > 0 ? Math.round(((t.done + t.issue) * 100) / base) : (t.total ? 100 : 0);
    return t;
  }
  function groupTally(items, key, empty) {
    const g = new Map();
    items.forEach((i) => { const n = i[key] || empty; if (!g.has(n)) g.set(n, []); g.get(n).push(i); });
    return [...g].map(([name, l]) => Object.assign({ name }, tally(l))).sort((a, b) => a.rate - b.rate || cmpTr(a.name, b.name));
  }
  function freqFrom(src) {
    const type = src.freq_type || 'daily';
    if (!['daily', 'every_n_days', 'weekly', 'monthly'].includes(type)) err('Geçersiz sıklık türü.');
    let n = Math.max(1, Math.min(365, +src.freq_interval || 1));
    let wd = null, md = null;
    if (type === 'weekly') {
      const days = [...new Set(String(src.weekdays || '').split(',').map(Number).filter((d) => d >= 1 && d <= 7))].sort();
      if (!days.length) err('Haftalık işler için en az bir gün seçin.');
      wd = days.join(',');
    }
    if (type === 'monthly') md = Math.max(1, Math.min(31, +src.month_day || 1));
    if (type === 'daily') n = 1;
    const t = String(src.due_time || '').trim();
    if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) err('Saat SS:DD biçiminde olmalı.');
    const times = Sched.timesOf({ times: String(src.times || '') });
    if (times.length > 12) err('Günde en fazla 12 kez seçilebilir.');
    return { freq_type: type, freq_interval: n, weekdays: wd, month_day: md, due_time: times.length > 1 ? times[0] : t || null, times: times.length > 1 ? times.join(',') : null };
  }
  function linkTask(lid, tid) {
    lid = +lid; tid = +tid;
    if (!S.links.some((x) => x.location_id === lid && x.task_id === tid)) S.links.push({ location_id: lid, task_id: tid });
  }
  function linkIds(key, val, id) {
    return S.links.filter((x) => x[key] === id && byId('locations', x.location_id)?.active && byId('tasks', x.task_id)?.active).map((x) => x[val]);
  }
  function resolveTask(src) {
    if (src.task_id && byId('tasks', src.task_id)) return +src.task_id;
    const name = String(src.task_name || '').trim();
    if (!name) err('İş adı gerekli.');
    const ex = S.tasks.find((t) => t.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'));
    if (ex) { ex.active = 1; return ex.id; }
    const t = { id: nid(), name: name.slice(0, 200), description: null, kind: 'normal', freq_type: 'daily', freq_interval: 1, weekdays: null, month_day: null, due_time: null, active: 1, created_at: nowStr() };
    S.tasks.push(t);
    return t.id;
  }
  const str = (v, req, label) => { v = v === undefined || v === null ? '' : String(v).trim(); if (!v && req) err(label + ' boş bırakılamaz.'); return v || null; };
  const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
  const fileToDataUrl = (f) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(f); });

  function leaveOp(kind, b) {
    const u = me();
    const uid = u.role === 'admin' && +b.user_id ? +b.user_id : u.id;
    if (!validDate(b.date)) err('Tarih gerekli.');
    const today = dn(localToday());
    if (u.role !== 'admin' && dn(b.date) < today) err('Geçmiş günler için izin yalnızca yönetici tarafından girilebilir.');
    if (dn(b.date) > today + 365) err('En fazla bir yıl sonrası için izin girilebilir.');
    if (kind === 'delete') { S.leaves = S.leaves.filter((l) => !(l.user_id === uid && l.leave_date === b.date)); save(); return null; }
    const to = validDate(b.to) ? b.to : b.date;
    if (to < b.date || dn(to) - dn(b.date) > 60) err('İzin aralığı en fazla 61 gün olabilir.');
    let count = 0;
    for (let d = dn(b.date); d <= dn(to); d++) {
      if (S.leaves.some((l) => l.user_id === uid && l.leave_date === ymd(d))) continue;
      S.leaves.push({ id: nid(), user_id: uid, leave_date: ymd(d), note: str(b.note), created_by: u.id, created_at: nowStr() });
      count++;
    }
    save();
    return { count };
  }

  function me() { return MODE === 'admin' ? byId('users', 1) : STAFF; }
  function needAdmin() { if (me().role !== 'admin') err('Bu işlem için yönetici yetkisi gerekli.'); }

  /* ---------- işlemler ---------- */
  const A = {
    async my_day(b, q) {
      const u = me(), sc = sched(), [today] = todayCtx();
      let day = validDate(q.date) ? dn(q.date) : today;
      day = Math.max(today - 60, Math.min(day, today));
      const D = ymd(day);
      const plans = day < today
        ? plansQuery((p) => p.start_date <= D && (!p.end_date || p.end_date >= D) && (p.user_id === u.id || p.user_id === null))
        : plansQuery((p) => p.active && (p.user_id === u.id || p.user_id === null));
      const items = dayItems(sc, plans, day);
      const lv = S.leaves.find((l) => l.user_id === u.id && l.leave_date === D);
      const inspections = S.completions.filter((c) => c.user_id === u.id && c.inspected_at && !c.inspect_seen).map((c) => {
        const p = byId('plans', c.plan_id), t = p && byId('tasks', p.task_id), l = p && byId('locations', p.location_id), iu = byId('users', c.inspected_by);
        return { id: c.id, occ_date: c.occ_date, slot: c.slot || 0, inspected_at: c.inspected_at, task: t ? t.name : '', location: l ? l.name : '', inspected_name: iu ? iu.name : null };
      }).sort((a, b2) => cmpTr(b2.inspected_at, a.inspected_at));
      return { date: D, today: ymd(today), workday: sc.isWorkday(day), on_leave: !!lv, leave_note: lv ? lv.note : null, items, tally: tally(items), inspections,
        on_demand: onDemandItems(plans, D, D) };
    },
    async inspections_seen() {
      const u = me();
      S.completions.forEach((c) => { if (c.user_id === u.id && c.inspected_at) c.inspect_seen = 1; });
      save();
      return null;
    },
    async inspect(b) {
      needAdmin();
      const slot = +b.slot || 0;
      const c = S.completions.find((x) => x.plan_id === +b.plan_id && x.occ_date === b.occ_date && (x.slot || 0) === slot);
      const p = plansQuery((x) => x.id === +b.plan_id)[0];
      if (!c || !p) err('Kontrol edilecek bir kayıt yok; iş henüz işaretlenmemiş.');
      if (+b.revert) Object.assign(c, { inspected_by: null, inspected_at: null, inspect_seen: 0 });
      else Object.assign(c, { inspected_by: me().id, inspected_at: nowStr(), inspect_seen: c.user_id === me().id ? 1 : 0 });
      save();
      const sc = sched(), pp = sc.slots(sc.prep(p))[slot], [today, hm] = todayCtx(), o = dn(b.occ_date);
      const cc = cmap(b.occ_date, b.occ_date)[ck(p.id, b.occ_date, slot)];
      return itemOut(pp, o, cc, sc.status(pp, o, cc, today, hm));
    },
    async my_history() {
      const u = me(), sc = sched(), [today, hm] = todayCtx();
      const from = today - 13;
      const cm = cmap(ymd(from), ymd(today)), lv = lmap(ymd(from), ymd(today));
      const days = {};
      for (let d = from; d <= today; d++) days[d] = { date: ymd(d), workday: sc.isWorkday(d), on_leave: !!lv[u.id + '|' + ymd(d)], items: [] };
      plansQuery((p) => p.start_date <= ymd(today) && (!p.end_date || p.end_date >= ymd(from)) && (p.user_id === u.id || p.user_id === null)).forEach((p0) => {
        const p = sc.prep(p0);
        sc.occurrences(p, from, today).forEach((o) => {
          sc.slots(p).forEach((ps) => days[o].items.push({ status: occStatus(sc, ps, o, cm[ck(p.id, ymd(o), ps._slot)] || null, today, hm, lv) }));
        });
      });
      return Object.values(days).map((d) => { const t = tally(d.items); delete d.items; return Object.assign(d, { tally: t }); });
    },
    async leave_set(b) { return leaveOp('set', b); },
    async leave_delete(b) { return leaveOp('delete', b); },
    async leaves(b, q) {
      const u = me();
      const uid = u.role === 'admin' ? +q.user_id || null : u.id;
      const from = validDate(q.from) ? q.from : localToday();
      return S.leaves.filter((l) => l.leave_date >= from && (!uid || l.user_id === uid))
        .sort((a, c) => cmpTr(a.leave_date, c.leave_date))
        .map((l) => ({ user_id: l.user_id, leave_date: l.leave_date, note: l.note, name: byId('users', l.user_id).name }));
    },
    async complete(b) {
      const u = me();
      const planId = +b.plan_id, occ = b.occ_date;
      let status = ['issue', 'replaced'].includes(b.status) ? b.status : 'done';
      const note = str(b.note);
      const p = plansQuery((x) => x.id === planId && x.active)[0];
      if (!p) err('İş bulunamadı.');
      if (status === 'replaced' && p.task_kind !== 'consumable') status = 'done';
      if (u.role !== 'admin' && p.user_id !== null && p.user_id !== u.id) err('Bu iş size atanmamış.');
      if (p.freq_type === 'on_demand') {
        const td = dn(localToday()), o = dn(occ);
        if (o > td || (u.role !== 'admin' && o !== td)) err('Bu iş yalnızca bugün için işaretlenebilir.');
        if (status === 'issue' && !note) err('Sorun bildirirken kısa bir açıklama yazın.');
        const used = S.completions.filter((c) => c.plan_id === planId && c.occ_date === occ).map((c) => c.slot || 0);
        const c = { id: nid(), plan_id: planId, occ_date: occ, slot: used.length ? Math.max(...used) + 1 : 0, user_id: u.id, status, note, photo: null, created_at: nowStr() };
        if (b.photo && b.photo.size) { const url = await fileToDataUrl(b.photo); if (url) { c.photo = 'demo'; S.photos[c.id] = url; } }
        S.completions.push(c); save();
        return onDemandItems([p], occ, occ)[0];
      }
      const slot = +b.slot || 0;
      const sc = sched(), all = sc.slots(sc.prep(p)), [today, hm] = todayCtx(), o = dn(occ);
      if (!all[slot]) err('Bu iş için böyle bir kontrol yok.');
      const pp = all[slot];
      if (u.role !== 'admin' && sc.isDue(pp, o) && sc.status(pp, o, null, today, hm) === 'upcoming' && o === today) err(`Bu kontrolün zamanı henüz gelmedi; ${pp._prev} sonrasında işaretlenebilir.`);
      if (!sc.isDue(pp, o) || o > today) err('Bu tarih için böyle bir iş yok.');
      if (u.role !== 'admin' && sc.status(pp, o, null, today, hm) === 'missed') err('Bu işin süresi geçti; artık işaretlenemez.');
      if (status === 'issue' && !note) err('Sorun bildirirken kısa bir açıklama yazın.');
      if (S.completions.some((c) => c.plan_id === planId && c.occ_date === occ && (c.slot || 0) === slot)) err('Bu iş zaten işaretlenmiş.');
      const c = { id: nid(), plan_id: planId, occ_date: occ, slot, user_id: u.id, status, note, photo: null, created_at: nowStr() };
      if (b.photo && b.photo.size) { const url = await fileToDataUrl(b.photo); if (url) { c.photo = 'demo'; S.photos[c.id] = url; } }
      S.completions.push(c);
      save();
      const cc = cmap(occ, occ)[ck(planId, occ, slot)];
      return itemOut(pp, o, cc, sc.status(pp, o, cc, today, hm));
    },
    async mark_replaced(b) {
      const u = me();
      const slot = +b.slot || 0;
      const c = S.completions.find((x) => x.plan_id === +b.plan_id && x.occ_date === b.occ_date && (x.slot || 0) === slot);
      const p = plansQuery((x) => x.id === +b.plan_id)[0];
      if (!c || !p) err('Kayıt bulunamadı.');
      if (p.task_kind !== 'consumable') err('Bu iş bir sarf malzemesi değil.');
      if (u.role !== 'admin') {
        if (c.user_id !== u.id) err('Bu kaydı başka biri işaretlemiş; değiştirmek için yöneticinize başvurun.');
        if (c.inspected_at) err('Bu iş yönetici tarafından kontrol edildi; değiştirilemez.');
        if (c.created_at.slice(0, 10) !== localToday()) err('Geçmiş günlerdeki kayıtlar değiştirilemez.');
      }
      if (c.status === 'issue') err('Sorun bildirilen kayıt değiştirilemez; önce işareti geri alın.');
      c.status = +b.revert ? 'done' : 'replaced';
      save();
      const sc = sched(), pp = sc.slots(sc.prep(p))[slot], [today, hm] = todayCtx(), o = dn(b.occ_date);
      const cc = cmap(b.occ_date, b.occ_date)[ck(p.id, b.occ_date, slot)];
      return itemOut(pp, o, cc, sc.status(pp, o, cc, today, hm));
    },
    async uncomplete(b) {
      const u = me();
      const i = S.completions.findIndex((c) => c.plan_id === +b.plan_id && c.occ_date === b.occ_date && (c.slot || 0) === (+b.slot || 0));
      if (i < 0) err('Kayıt bulunamadı.');
      const c = S.completions[i];
      if (u.role !== 'admin') {
        if (c.user_id !== u.id) err('Yalnızca kendi işaretlediğiniz işleri geri alabilirsiniz.');
        if (c.inspected_at) err('Bu iş yönetici tarafından kontrol edildi; geri alınamaz.');
        if (c.created_at.slice(0, 10) !== localToday()) err('Geçmiş günlerdeki kayıtlar geri alınamaz.');
      }
      S.completions.splice(i, 1);
      delete S.photos[c.id];
      save();
      return null;
    },
    async dashboard(b, q) {
      needAdmin();
      const sc = sched(), [today, hm] = todayCtx();
      const day = Math.min(validDate(q.date) ? dn(q.date) : today, today);
      const items = dayItems(sc, plansQuery((p) => p.active), day);
      const missed = [];
      const from = day - 7, cm = cmap(ymd(from), ymd(day)), lv = lmap(ymd(from), ymd(day));
      plansQuery((p) => p.start_date <= ymd(day)).forEach((p0) => {
        const p = sc.prep(p0);
        sc.occurrences(p, from, day - 1).forEach((o) => {
          sc.slots(p).forEach((ps) => { if (!cm[ck(p.id, ymd(o), ps._slot)] && occStatus(sc, ps, o, null, today, hm, lv) === 'missed') missed.push(itemOut(ps, o, null, 'missed')); });
        });
      });
      missed.sort((a, b2) => cmpTr(b2.occ_date, a.occ_date));
      const pmap = {};
      plansQuery((p) => p.start_date <= ymd(day)).forEach((p) => { pmap[p.id] = sc.prep(p); });
      const issues = Object.values(cm).filter((c) => c.status === 'issue' && pmap[c.plan_id]).map((c) => {
        const p = pmap[c.plan_id], ps = sc.slots(p)[c.slot || 0] || p;
        return itemOut(ps, dn(c.occ_date), c, 'issue');
      }).sort((a, b2) => cmpTr(b2.completion.at, a.completion.at));
      return { date: ymd(day), on_demand: onDemandItems(plansQuery((p) => p.active), ymd(day), ymd(day)), issues: issues.slice(0, 100), issue_count: issues.length, today: ymd(today), now: hm, workday: sc.isWorkday(day), items, tally: tally(items),
        by_location: groupTally(items, 'location', '-'), by_user: groupTally(items, 'user', 'Ortak (herkes)'),
        missed: missed.slice(0, 200), missed_count: missed.length,
        staff_count: S.users.filter((u) => u.active && u.role === 'staff').length,
        on_leave: S.leaves.filter((l) => l.leave_date === ymd(day)).map((l) => byId('users', l.user_id)).filter((u) => u.active)
          .map((u) => ({ id: u.id, name: u.name })) };
    },
    async report(b, q) {
      needAdmin();
      const sc = sched(), [today, hm] = todayCtx();
      let to = Math.min(validDate(q.to) ? dn(q.to) : today, today);
      let from = validDate(q.from) ? dn(q.from) : to - 6;
      if (from > to) [from, to] = [to, from];
      if (to - from > 92) err('Rapor aralığı en fazla 93 gün olabilir.');
      const cm = cmap(ymd(from), ymd(to)), lv = lmap(ymd(from), ymd(to));
      const items = [], odPlans = [];
      plansQuery((p) => p.start_date <= ymd(to)).forEach((p0) => {
        if (q.user_id && p0.user_id !== +q.user_id) return;
        if (q.location_id && p0.location_id !== +q.location_id) return;
        if (p0.freq_type === 'on_demand') { odPlans.push(p0); return; }
        const p = sc.prep(p0);
        sc.occurrences(p, from, to).forEach((o) => {
          sc.slots(p).forEach((ps) => {
            const c = cm[ck(p.id, ymd(o), ps._slot)] || null;
            items.push(itemOut(ps, o, c, occStatus(sc, ps, o, c, today, hm, lv)));
          });
        });
      });
      items.sort((a, b2) => cmpTr(a.occ_date, b2.occ_date) || cmpTr(a.location, b2.location));
      const daily = {};
      for (let d = from; d <= to; d++) daily[ymd(d)] = { date: ymd(d), total: 0, done: 0, issue: 0, missed: 0, leave: 0, open: 0 };
      let lateDone = 0;
      items.forEach((i) => {
        const r = daily[i.occ_date];
        r.total++;
        if (['done', 'issue', 'missed', 'leave'].includes(i.status)) r[i.status]++; else r.open++;
        if (i.completion && i.completion.late) lateDone++;
      });
      const problems = items.filter((i) => ['missed', 'issue', 'overdue'].includes(i.status)).sort((a, b2) => cmpTr(b2.occ_date, a.occ_date));
      const cons = {};
      items.filter((i) => i.kind === 'consumable').forEach((i) => {
        const r = cons[i.task] = cons[i.task] || { name: i.task, total: 0, checked: 0, replaced: 0, issue: 0, missed: 0, locations: {} };
        r.total++;
        const cs = i.completion && i.completion.status;
        if (cs === 'replaced') { r.replaced++; r.locations[i.location] = (r.locations[i.location] || 0) + 1; }
        else if (cs === 'done') r.checked++;
        else if (cs === 'issue') r.issue++;
        else if (i.status === 'missed') r.missed++;
      });
      return { from: ymd(from), to: ymd(to), summary: Object.assign(tally(items), { late_done: lateDone }),
        consumables: Object.values(cons).sort((a, c) => c.replaced - a.replaced || cmpTr(a.name, c.name)),
        by_user: groupTally(items, 'user', 'Ortak (herkes)'), by_location: groupTally(items, 'location', '-'), by_task: groupTally(items, 'task', '-'),
        daily: Object.values(daily), problems: problems.slice(0, 300), problem_count: problems.length,
        on_demand: onDemandItems(odPlans, ymd(from), ymd(to)).filter((i) => i.count).map((i) => {
          const by_user = {}; i.entries.forEach((e) => { by_user[e.by] = (by_user[e.by] || 0) + 1; });
          const { entries, ...rest } = i; return Object.assign(rest, { by_user, last_at: entries.length ? entries[entries.length - 1].at : null });
        }) };
    },
    async locations() {
      return S.locations.filter((l) => l.active).sort((a, b) => a.sort_order - b.sort_order || cmpTr(a.name, b.name))
        .map((l) => Object.assign({}, l, { plan_count: S.plans.filter((p) => p.location_id === l.id && p.active).length, task_ids: linkIds('location_id', 'task_id', l.id) }));
    },
    async location_save(b) {
      needAdmin();
      const name = str(b.name, true, 'Mekan adı');
      let id = +b.id;
      if (id) Object.assign(byId('locations', id), { name, description: str(b.description), sort_order: +b.sort_order || 0 });
      else { id = nid(); S.locations.push({ id, name, description: str(b.description), sort_order: +b.sort_order || 0, active: 1, created_at: nowStr() }); }
      if (b.task_ids) { S.links = S.links.filter((x) => x.location_id !== id); b.task_ids.forEach((t) => linkTask(id, t)); }
      (b.new_tasks || []).forEach((n) => { if (String(n).trim()) linkTask(id, resolveTask({ task_name: n })); });
      save(); return { id };
    },
    async location_task_toggle(b) {
      needAdmin();
      if (+b.on) linkTask(b.location_id, b.task_id);
      else S.links = S.links.filter((x) => !(x.location_id === +b.location_id && x.task_id === +b.task_id));
      save(); return null;
    },
    async location_assign(b) {
      needAdmin();
      const lid = +b.location_id;
      if (!byId('locations', lid)) err('Mekan bulunamadı.');
      const uid = +b.user_id || null;
      const start = validDate(b.start_date) ? b.start_date : localToday();
      const tids = (b.task_ids || []).map(Number).filter(Boolean);
      if (!tids.length) err('En az bir iş seçin.');
      let created = 0, skipped = 0;
      tids.forEach((tid) => {
        const t = byId('tasks', tid);
        if (!t || !t.active) return;
        if (S.plans.some((p) => p.active && p.task_id === tid && p.location_id === lid)) { skipped++; return; }
        S.plans.push({ id: nid(), task_id: tid, location_id: lid, user_id: uid, package_id: null, freq_type: t.freq_type, freq_interval: t.freq_interval,
          weekdays: t.weekdays, month_day: t.month_day, due_time: t.due_time, times: t.times || null, start_date: start, end_date: null, note: null, active: 1, created_at: nowStr() });
        linkTask(lid, tid);
        created++;
      });
      save(); return { created, skipped };
    },
    async location_delete(b) {
      needAdmin();
      const n = S.plans.filter((p) => p.location_id === +b.id && p.active).length;
      if (n) err(`Bu mekanda ${n} aktif iş ataması var. Önce atamaları kaldırın.`);
      byId('locations', b.id).active = 0;
      S.links = S.links.filter((x) => x.location_id !== +b.id);
      save(); return null;
    },
    async locations_order(b) { needAdmin(); (b.ids || []).forEach((id, i) => { byId('locations', id).sort_order = i; }); save(); return null; },
    async tasks() {
      needAdmin();
      return S.tasks.filter((t) => t.active).sort((a, b) => cmpTr(a.name, b.name))
        .map((t) => Object.assign({}, t, { plan_count: S.plans.filter((p) => p.task_id === t.id && p.active).length,
          location_ids: linkIds('task_id', 'location_id', t.id), freq: Sched.label(t) }));
    },
    async task_save(b) {
      needAdmin();
      const name = str(b.name, true, 'İş adı');
      const f = freqFrom(b);
      let id = +b.id;
      const kind = b.kind === 'consumable' ? 'consumable' : 'normal';
      if (id) Object.assign(byId('tasks', id), { name, description: str(b.description), kind }, f);
      else { id = nid(); S.tasks.push(Object.assign({ id, name, description: str(b.description), kind, active: 1, created_at: nowStr() }, f)); }
      if (b.location_ids) { S.links = S.links.filter((x) => x.task_id !== id); b.location_ids.forEach((l) => linkTask(l, id)); }
      save(); return { id };
    },
    async task_delete(b) {
      needAdmin();
      const n = S.plans.filter((p) => p.task_id === +b.id && p.active).length;
      if (n) err(`Bu iş ${n} aktif atamada kullanılıyor. Önce atamaları kaldırın.`);
      byId('tasks', b.id).active = 0;
      S.package_items = S.package_items.filter((i) => i.task_id !== +b.id);
      S.links = S.links.filter((x) => x.task_id !== +b.id);
      save(); return null;
    },
    async packages() {
      needAdmin();
      return S.packages.slice().sort((a, b) => cmpTr(a.name, b.name)).map((p) => Object.assign({}, p, {
        items: S.package_items.filter((i) => i.package_id === p.id).sort((a, b) => a.sort_order - b.sort_order)
          .map((i) => Object.assign({}, i, { task_name: byId('tasks', i.task_id).name, freq: Sched.label(i) })),
        plan_count: S.plans.filter((x) => x.package_id === p.id && x.active).length,
      }));
    },
    async package_save(b) {
      needAdmin();
      const name = str(b.name, true, 'Paket adı');
      const color = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#6366f1';
      if (!b.items || !b.items.length) err('Pakete en az bir iş ekleyin.');
      const rows = b.items.map((it, i) => Object.assign({ task_id: resolveTask(it), sort_order: i }, freqFrom(it)));
      let p = b.id ? byId('packages', b.id) : null;
      if (p) Object.assign(p, { name, description: str(b.description), color });
      else { p = { id: nid(), name, description: str(b.description), color, created_at: nowStr() }; S.packages.push(p); }
      S.package_items = S.package_items.filter((i) => i.package_id !== p.id);
      rows.forEach((r) => S.package_items.push(Object.assign({ id: nid(), package_id: p.id }, r)));
      save(); return { id: p.id };
    },
    async package_delete(b) {
      needAdmin();
      S.package_items = S.package_items.filter((i) => i.package_id !== +b.id);
      S.packages = S.packages.filter((p) => p.id !== +b.id);
      S.plans.forEach((p) => { if (p.package_id === +b.id) p.package_id = null; });
      save(); return null;
    },
    async package_apply(b) {
      needAdmin();
      const locs = (b.location_ids || []).map(Number).filter(Boolean);
      if (!locs.length) err('En az bir mekan seçin.');
      const uid = +b.user_id || null;
      const start = validDate(b.start_date) ? b.start_date : localToday();
      const items = S.package_items.filter((i) => i.package_id === +b.package_id).sort((a, c) => a.sort_order - c.sort_order);
      if (!items.length) err('Paket bulunamadı ya da boş.');
      let created = 0, skipped = 0;
      locs.forEach((lid) => items.forEach((it) => {
        if (S.plans.some((p) => p.active && p.task_id === it.task_id && p.location_id === lid && p.user_id === uid)) { skipped++; return; }
        S.plans.push({ id: nid(), task_id: it.task_id, location_id: lid, user_id: uid, package_id: +b.package_id, freq_type: it.freq_type,
          freq_interval: it.freq_interval, weekdays: it.weekdays, month_day: it.month_day, due_time: it.due_time, times: it.times || null, start_date: start,
          end_date: null, note: null, active: 1, created_at: nowStr() });
        linkTask(lid, it.task_id);
        created++;
      }));
      save(); return { created, skipped };
    },
    async plans() { needAdmin(); return plansQuery((p) => p.active).map((p) => Object.assign(p, { freq: Sched.label(p) })); },
    async plan_save(b) {
      needAdmin();
      if (!S.locations.some((l) => l.id === +b.location_id && l.active)) err('Mekan seçin.');
      const uid = +b.user_id || null;
      const start = validDate(b.start_date) ? b.start_date : localToday();
      const end = validDate(b.end_date) ? b.end_date : null;
      if (end && end < start) err('Bitiş tarihi başlangıçtan önce olamaz.');
      const f = freqFrom(b);
      const vals = Object.assign({ task_id: resolveTask(b), location_id: +b.location_id, user_id: uid }, f);
      linkTask(vals.location_id, vals.task_id);
      const note = str(b.note);
      const today = localToday();
      if (b.id) {
        const old = byId('plans', b.id);
        if (!old || !old.active) err('Atama bulunamadı.');
        const changed = Object.keys(vals).some((k) => String(vals[k] ?? '') !== String(old[k] ?? ''));
        if (changed && old.start_date < today) {
          old.active = 0; old.end_date = ymd(dn(today) - 1);
          const np = Object.assign({ id: nid(), package_id: old.package_id, start_date: start > today ? start : today, end_date: end, note, active: 1, created_at: nowStr() }, vals);
          S.plans.push(np);
          S.completions.forEach((c) => { if (c.plan_id === old.id && c.occ_date >= today) c.plan_id = np.id; });
        } else Object.assign(old, vals, { start_date: changed ? start : old.start_date, end_date: end, note });
      } else {
        S.plans.push(Object.assign({ id: nid(), package_id: null, start_date: start, end_date: end, note, active: 1, created_at: nowStr() }, vals));
      }
      save(); return {};
    },
    async plan_delete(b) {
      needAdmin();
      const ids = (b.ids || [b.id]).map(Number);
      const today = localToday(), yest = ymd(dn(today) - 1);
      ids.forEach((id) => {
        const p = byId('plans', id);
        if (!p) return;
        const hist = S.completions.some((c) => c.plan_id === id);
        if (p.start_date >= today && !hist) S.plans = S.plans.filter((x) => x.id !== id);
        else { p.active = 0; p.end_date = yest; S.completions = S.completions.filter((c) => !(c.plan_id === id && c.occ_date >= today)); }
      });
      save(); return { count: ids.length };
    },
    async plans_reassign(b) {
      needAdmin();
      (b.ids || []).forEach((id) => { const p = byId('plans', id); if (p && p.active) p.user_id = +b.user_id || null; });
      save(); return null;
    },
    async default_staff() {
      needAdmin();
      return DEFAULT_STAFF.filter(([, un]) => !S.users.some((u) => u.username === un)).map(([n]) => n);
    },
    async default_staff_add() {
      needAdmin();
      const out = [];
      DEFAULT_STAFF.forEach(([name, username]) => {
        if (S.users.some((u) => u.username === username)) return;
        const pw = Array.from({ length: 8 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
        S.users.push({ id: nid(), name, username, role: 'staff', phone: null, active: 1, created_at: nowStr() });
        out.push({ name, username, password: pw });
      });
      save(); return out;
    },
    async users() {
      needAdmin();
      return S.users.filter((u) => u.active).sort((a, b) => cmpTr(a.role, b.role) || cmpTr(a.name, b.name))
        .map((u) => Object.assign({}, u, { plan_count: S.plans.filter((p) => p.user_id === u.id && p.active).length,
          on_leave: S.leaves.some((l) => l.user_id === u.id && l.leave_date === localToday()) ? 1 : 0 }));
    },
    async user_save(b) {
      needAdmin();
      const name = str(b.name, true, 'Ad soyad');
      const username = String(str(b.username, true, 'Kullanıcı adı')).toLowerCase();
      if (!/^[a-z0-9._-]{3,60}$/.test(username)) err('Kullanıcı adı en az 3 karakter olmalı; yalnızca küçük harf (Türkçe karakter olmadan), rakam, nokta, tire içerebilir.');
      if (b.password && b.password.length < 6) err('Şifre en az 6 karakter olmalı.');
      if (S.users.some((u) => u.username === username && u.id !== +b.id)) err('Bu kullanıcı adı kullanılıyor.');
      const role = b.role === 'admin' ? 'admin' : 'staff';
      if (b.id) {
        if (+b.id === me().id && role !== 'admin') err('Kendi yönetici yetkinizi kaldıramazsınız.');
        Object.assign(byId('users', b.id), { name, username, role, phone: str(b.phone), active: 1 });
      } else {
        if (!b.password) err('Yeni kullanıcı için şifre belirleyin.');
        S.users.push({ id: nid(), name, username, role, phone: str(b.phone), active: 1, created_at: nowStr() });
      }
      save(); return {};
    },
    async user_delete(b) {
      needAdmin();
      if (+b.id === me().id) err('Kendi hesabınızı silemezsiniz.');
      const n = S.plans.filter((p) => p.user_id === +b.id && p.active).length;
      if (n) err(`Bu kişiye atanmış ${n} aktif iş var. Önce atamaları başka birine devredin.`);
      byId('users', b.id).active = 0; save(); return null;
    },
    async settings() { return Object.assign({}, S.settings); },
    async settings_save(b) {
      needAdmin();
      const name = str(b.company_name, true, 'Kurum adı');
      const wd = [...new Set((b.work_days || []).map(Number).filter((d) => d >= 1 && d <= 7))].sort();
      if (!wd.length) err('En az bir çalışma günü seçin.');
      const hol = String(b.holidays || '').split(/[\s,;]+/).filter(Boolean);
      hol.forEach((h) => { if (!validDate(h)) err('Tatil tarihi YYYY-AA-GG biçiminde olmalı: ' + h); });
      Object.assign(S.settings, { company_name: name, work_days: wd.join(','), holidays: [...new Set(hol)].sort().join('\n') });
      if (b.public_reports !== undefined) S.settings.public_reports = b.public_reports === '1' || b.public_reports === true ? '1' : '0';
      save(); return null;
    },
    /* ----- karekodla sorun bildirimi ----- */
    async public_location(b, q) {
      const l = S.locations.find((x) => x.active && x.qr_token === q.t);
      if (!l) err('Bu karekod geçersiz ya da yenilenmiş. Lütfen görevlilere haber verin.');
      return { location: l.name, company: S.settings.company_name, enabled: S.settings.public_reports !== '0', categories: REPORT_CATS };
    },
    async public_report(b) {
      const l = S.locations.find((x) => x.active && x.qr_token === b.t);
      if (!l) err('Bu karekod geçersiz ya da yenilenmiş.');
      if (S.settings.public_reports === '0') err('Sorun bildirimi şu anda kapalı.');
      const desc = String(b.description || '').trim().slice(0, 1000);
      if (desc.length < 3) err('Lütfen sorunu kısaca yazın.');
      const r = { id: S.seq++, location_id: l.id, category: REPORT_CATS[b.category] ? b.category : 'other', description: desc, photo: null,
        reporter_name: str(b.name) || null, reporter_contact: str(b.contact) || null, status: 'new', admin_note: null, handled_by: null, handled_at: null, created_at: nowStr() };
      if (b.photo && b.photo.size) { const url = await fileToDataUrl(b.photo); if (url) { r.photo = 'demo'; S.photos['r' + r.id] = url; } }
      S.reports.push(r); save();
      return { id: r.id };
    },
    async reports(b, q) {
      needAdmin();
      const ord = { new: 0, progress: 1, done: 2 };
      const items = S.reports.filter((r) => !['new', 'progress', 'done'].includes(q.status) || r.status === q.status)
        .sort((a, b2) => ord[a.status] - ord[b2.status] || cmpTr(b2.created_at, a.created_at) || b2.id - a.id)
        .map((r) => { const l = byId('locations', r.location_id), u = r.handled_by ? byId('users', r.handled_by) : null;
          return Object.assign({}, r, { photo: !!r.photo, location: l ? l.name : null, handled_name: u ? u.name : null, category_label: REPORT_CATS[r.category] || 'Diğer' }); });
      const counts = { new: 0, progress: 0, done: 0 };
      S.reports.forEach((r) => { counts[r.status]++; });
      return { items, counts };
    },
    async reports_count() {
      needAdmin();
      return { open: S.reports.filter((r) => r.status !== 'done').length, new: S.reports.filter((r) => r.status === 'new').length };
    },
    async report_update(b) {
      needAdmin();
      const r = S.reports.find((x) => x.id === +b.id);
      if (!r) err('Bildirim bulunamadı.');
      if (!['new', 'progress', 'done'].includes(b.status)) err('Geçersiz durum.');
      Object.assign(r, { status: b.status, admin_note: str(b.admin_note) || null, handled_by: b.status === 'new' ? null : me().id, handled_at: b.status === 'new' ? null : nowStr() });
      save(); return null;
    },
    async report_delete(b) {
      needAdmin();
      S.reports = S.reports.filter((r) => r.id !== +b.id); delete S.photos['r' + b.id];
      save(); return null;
    },
    async location_qr_reset(b) { needAdmin(); const l = byId('locations', b.id); if (l) l.qr_token = rtok(); save(); return null; },
    async doc_settings_save(b) {
      needAdmin();
      const lim = { doc_header: 600, doc_intro: 3000, doc_signer_name: 120, doc_signer_title: 160, doc_staff_title: 120, doc_subject: 200, doc_print_header: 1 };
      Object.keys(lim).forEach((k) => { S.settings[k] = String(b[k] == null ? '' : b[k]).trim().slice(0, lim[k]); });
      save(); return null;
    },
    async password(b) { if (!b.new || b.new.length < 6) err('Yeni şifre en az 6 karakter olmalı.'); return null; },
    async me() { return me(); },
  };

  /* ---------- dışa açılan demo arayüzü ---------- */
  const MODE = ['staff', 'report'].includes(getMode()) ? getMode() : 'admin';
  const qrLocs = S.locations.filter((l) => l.active).sort((a, b) => a.sort_order - b.sort_order);
  const QRLOC = qrLocs.find((l) => l.qr_token === getPref('qr', '')) || qrLocs.find((l) => l.name === 'Tuvalet Kadın') || qrLocs[0];
  // Personel ekranında gösterilen kişi (varsayılan: Deniz Karabulut)
  const staffList = S.users.filter((u) => u.active && u.role === 'staff');
  const STAFF = staffList.find((u) => u.username === getPref('staff', 'deniz.karabulut')) || staffList[0] || byId('users', 1);
  const u0 = MODE === 'admin' ? byId('users', 1) : STAFF;
  window.BOOT = MODE === 'report'
    ? { token: QRLOC ? QRLOC.qr_token : '', company: S.settings.company_name }
    : { user: { id: u0.id, name: u0.name, username: u0.username, role: u0.role, phone: u0.phone }, company: S.settings.company_name };

  window.DEMO = {
    mode: MODE,
    switchTo(m) { setMode(m); location.reload(); },
    staff: staffList.map((u) => ({ username: u.username, name: u.name })),
    staffUser: STAFF.username,
    switchStaff(username) { setPref('staff', username); setMode('staff'); location.reload(); },
    reset() { store.clear(); location.reload(); },
    qrLocs: qrLocs.map((l) => ({ token: l.qr_token, name: l.name })),
    qrToken: QRLOC ? QRLOC.qr_token : '',
    openReport(token) { setPref('qr', token); setMode('report'); location.reload(); },
    reportPhoto(id) { return S.photos['r' + id] || ''; },
    async api(action, body, query) {
      await new Promise((r) => setTimeout(r, 120 + Math.random() * 160));
      const fn = A[action];
      if (!fn) throw new Error('Bu işlem demoda kullanılamıyor.');
      let b = body || {};
      if (body instanceof FormData) { b = {}; body.forEach((v, k) => { b[k] = v; }); }
      const r = await fn(b, query || {});
      return r === undefined ? null : JSON.parse(JSON.stringify(r));
    },
    photo(c) { return S.photos[c.id] || ''; },
  };
})();
