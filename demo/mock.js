/* İş Takip — tarayıcı içi demo: api.php'nin JavaScript karşılığı (örnek verilerle). */
(function () {
  'use strict';

  /* ---------- kalıcılık ---------- */
  const KEY = 'istakip-demo-v2';
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
    status(p, occ, c, today, hm) {
      if (c) return c.status === 'issue' ? 'issue' : 'done';
      if (occ > today) return 'upcoming';
      const nx = this.next(p, occ + 1);
      if (nx !== null && nx <= today) return 'missed';
      if (nx === null && p._end !== null && today > p._end) return 'missed';
      if (occ < today) return 'overdue';
      if (p.due_time && hm > p.due_time) return 'overdue';
      return 'pending';
    }
    static label(p) {
      const n = Math.max(1, +p.freq_interval || 1);
      switch (p.freq_type) {
        case 'every_n_days': return n === 1 ? 'Her gün' : n + ' günde 1';
        case 'weekly': {
          const d = String(p.weekdays || '').split(',').map((w) => DAY_SHORT[+w]).filter(Boolean).join(', ');
          return (n === 1 ? 'Her hafta' : n + ' haftada 1') + (d ? ' · ' + d : '');
        }
        case 'monthly': return (n === 1 ? 'Her ay' : n + ' ayda 1') + ' · ayın ' + (+p.month_day) + '. günü';
        default: return 'Her gün';
      }
    }
  }

  /* ---------- örnek veri ---------- */
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function seed() {
    const now = nowStr();
    const S = { seq: 1, users: [], locations: [], tasks: [], packages: [], package_items: [], plans: [], completions: [], leaves: [], photos: {},
      settings: { company_name: 'Merkez Bina Destek Hizmetleri', work_days: '1,2,3,4,5', holidays: '' } };
    const id = () => S.seq++;
    const add = (tbl, row) => { row.id = id(); S[tbl].push(row); return row; };
    const admin = add('users', { name: 'Bina Yöneticisi', username: 'yonetici', role: 'admin', phone: null, active: 1, created_at: now });
    const ahmet = add('users', { name: 'Ahmet Yılmaz', username: 'ahmet', role: 'staff', phone: '0532 000 00 01', active: 1, created_at: now });
    const ayse = add('users', { name: 'Ayşe Demir', username: 'ayse', role: 'staff', phone: '0532 000 00 02', active: 1, created_at: now });
    const mehmet = add('users', { name: 'Mehmet Kaya', username: 'mehmet', role: 'staff', phone: '0532 000 00 03', active: 1, created_at: now });
    const L = {};
    ['Ana Giriş', 'Kazan Dairesi', 'Kat 1 - Ofisler', 'Kat 1 - Tuvaletler', 'Kat 2 - Ofisler', 'Kat 2 - Tuvaletler', 'Çay Ocağı', 'Toplantı Odası', 'Arşiv', 'Asansör', 'Fotokopi Alanı', 'Yemekhane']
      .forEach((n, i) => { L[n] = add('locations', { name: n, description: null, sort_order: i, active: 1, created_at: now }); });
    const P = [
      ['Sabah Açılış', '#f59e0b', 'Mesai başlangıcında yapılacak işler', [
        ['Kapıların açılması', 'daily', 1, null, null, '07:45'], ['Kazanın fişinin devreye alınması', 'daily', 1, null, null, '07:45']]],
      ['Tuvalet Temizliği', '#06b6d4', 'Her tuvalet için günlük temizlik ve sarf malzeme', [
        ['Lavaboların temizliği', 'daily', 1, null, null, '10:00'], ['Ayna ve klozetlerin temizlenmesi', 'daily', 1, null, null, '10:00'],
        ['Klozet temizliği', 'daily', 1, null, null, '15:00'], ['Tuvalet çöplerinin alınması', 'daily', 1, null, null, '16:00'],
        ['Tuvalet kağıdı ve kurulama havlularının değişimi', 'daily', 1, null, null, '09:30'], ['Sabun değişimi', 'daily', 1, null, null, '09:30'],
        ['Zemin giderlerine çamaşır suyu doldurulması', 'daily', 1, null, null, '17:00']]],
      ['Ofis Genel Temizlik', '#6366f1', 'Ofis katları için rutin temizlik', [
        ['Çöplerin toplanması', 'daily', 1, null, null, '09:00'], ['Süpürme', 'daily', 1, null, null, '11:00'], ['Paspas', 'daily', 1, null, null, '11:30'],
        ['Zemin temizliği', 'daily', 1, null, null, '14:00'], ['Halıların gezilmesi ve fırçalanması', 'daily', 1, null, null, '14:00'],
        ['Halı kenarlarına paspas atılması', 'every_n_days', 2, null, null, '15:00'], ['Kağıt öğütücü ve fotokopi makinesi çevresi temizliği', 'daily', 1, null, null, '16:00'],
        ['Çöp atılması (genel)', 'every_n_days', 3, null, null, '17:00'], ['Camların silinmesi', 'monthly', 1, null, 15, null]]],
      ['Çay Ocağı ve Ortak Alan', '#10b981', 'Çay ocağı, ortak alanlar ve su sebili', [
        ['Çay ocağı ve ortak alan çöplerinin toplanması', 'daily', 1, null, null, '12:30'], ['Zemin temizliği', 'daily', 1, null, null, '13:00'],
        ['Su sebilinin kontrolü', 'daily', 1, null, null, '09:00']]],
      ['Destek Hizmetleri', '#ec4899', 'Taşıma, arşiv, toplantı ve güvenlik kontrolleri', [
        ['Günlük yemek götürme', 'daily', 1, null, null, '12:00'], ['Evrak taşıma', 'daily', 1, null, null, null],
        ['Toplantı odasının hazırlanması (su, soda)', 'daily', 1, null, null, '08:30'], ['Arşivin düzenlenmesi', 'weekly', 1, '5', null, null],
        ['Yangın şaft dolaplarının kontrolü', 'weekly', 1, '1', null, null], ['Asansör temizliği', 'weekly', 2, '3', null, null]]],
    ];
    const T = {};
    const pk = {};
    P.forEach(([name, color, desc, items]) => {
      const p = add('packages', { name, description: desc, color, created_at: now });
      pk[name] = p;
      items.forEach(([tn, ft, iv, wd, md, dt], i) => {
        if (!T[tn]) T[tn] = add('tasks', { name: tn, description: null, active: 1, created_at: now });
        add('package_items', { package_id: p.id, task_id: T[tn].id, freq_type: ft, freq_interval: iv, weekdays: wd, month_day: md, due_time: dt, sort_order: i });
      });
    });
    T['Sabun değişimi'].description = 'Sıvı sabun haznesini doldurun; boşalan bidonu depoya bildirin.';
    T['Yangın şaft dolaplarının kontrolü'].description = 'Hortum, vana ve yangın tüpü basınç göstergesini kontrol edin.';
    const start = ymd(dn(localToday()) - 28);
    const apply = (pkgName, locName, user, only) => {
      S.package_items.filter((i) => i.package_id === pk[pkgName].id).forEach((it) => {
        const tname = S.tasks.find((t) => t.id === it.task_id).name;
        if (only && !only.includes(tname)) return;
        add('plans', { task_id: it.task_id, location_id: L[locName].id, user_id: user ? user.id : null, package_id: pk[pkgName].id,
          freq_type: it.freq_type, freq_interval: it.freq_interval, weekdays: it.weekdays, month_day: it.month_day, due_time: it.due_time,
          start_date: start, end_date: null, note: null, active: 1, created_at: now });
      });
    };
    apply('Sabah Açılış', 'Ana Giriş', mehmet, ['Kapıların açılması']);
    apply('Sabah Açılış', 'Kazan Dairesi', mehmet, ['Kazanın fişinin devreye alınması']);
    apply('Tuvalet Temizliği', 'Kat 1 - Tuvaletler', ahmet);
    apply('Tuvalet Temizliği', 'Kat 2 - Tuvaletler', ayse);
    apply('Ofis Genel Temizlik', 'Kat 1 - Ofisler', ahmet, ['Çöplerin toplanması', 'Süpürme', 'Paspas', 'Halı kenarlarına paspas atılması', 'Çöp atılması (genel)', 'Camların silinmesi']);
    apply('Ofis Genel Temizlik', 'Kat 2 - Ofisler', ayse, ['Çöplerin toplanması', 'Süpürme', 'Halıların gezilmesi ve fırçalanması']);
    apply('Çay Ocağı ve Ortak Alan', 'Çay Ocağı', mehmet);
    apply('Destek Hizmetleri', 'Toplantı Odası', null, ['Toplantı odasının hazırlanması (su, soda)', 'Günlük yemek götürme', 'Evrak taşıma']);
    apply('Destek Hizmetleri', 'Arşiv', mehmet, ['Arşivin düzenlenmesi', 'Yangın şaft dolaplarının kontrolü']);
    apply('Destek Hizmetleri', 'Asansör', ahmet, ['Asansör temizliği']);
    S.plans.find((p) => p.task_id === T['Kapıların açılması'].id).note = 'Anahtarlar güvenlik kulübesinde.';

    // Örnek izinler
    const sch = new Sched([1, 2, 3, 4, 5], []);
    const workdayBack = (n) => { let d = dn(localToday()); while (n > 0) { d--; if (sch.isWorkday(d)) n--; } return ymd(d); };
    const workdayFwd = (n) => { let d = dn(localToday()); while (n > 0) { d++; if (sch.isWorkday(d)) n--; } return ymd(d); };
    add('leaves', { user_id: ahmet.id, leave_date: workdayBack(4), note: 'Yıllık izin', created_by: ahmet.id, created_at: now });
    add('leaves', { user_id: ayse.id, leave_date: workdayBack(2), note: 'Sağlık raporu', created_by: admin.id, created_at: now });
    add('leaves', { user_id: mehmet.id, leave_date: workdayFwd(3), note: 'Mazeret izni', created_by: mehmet.id, created_at: now });
    const onLeave = new Set(S.leaves.map((l) => l.user_id + '|' + l.leave_date));

    // Geçmiş kayıtlar
    const r = rng(20261007);
    const today = dn(localToday());
    const hm = nowHm();
    const issues = ['Sabun stoğu bitti, depodan istendi.', 'Kağıt havlu dispenseri kırık.', 'Çamaşır suyu kalmadı.', 'Süpürge arızalı, elle yapıldı.'];
    const staff = [ahmet, ayse, mehmet];
    S.plans.forEach((p0) => {
      const p = sch.prep(p0);
      sch.occurrences(p, p._start, today).forEach((o) => {
        const isToday = o === today;
        if (p0.user_id && onLeave.has(p0.user_id + '|' + ymd(o))) return;
        const due = p.due_time || '16:00';
        if (isToday && due > hm) return;
        const x = r();
        // Ahmet bugün biraz geride, böylece listede gecikenler görünür.
        const rate = isToday ? (p0.user_id === ahmet.id ? 0.45 : 0.75) : 0.86;
        if (x > rate + 0.04) return;
        const who = p0.user_id || staff[Math.floor(r() * 3)].id;
        const [h, m] = due.split(':').map(Number);
        let mins = h * 60 + m - 75 + Math.floor(r() * 85);
        if (isToday) { const [nh, nm] = hm.split(':').map(Number); mins = Math.min(mins, nh * 60 + nm - 1); }
        const at = ymd(o) + ' ' + pad(Math.floor(mins / 60)) + ':' + pad(mins % 60) + ':00';
        const issue = x > rate;
        add('completions', { plan_id: p0.id, occ_date: ymd(o), user_id: who, status: issue ? 'issue' : 'done',
          note: issue ? issues[Math.floor(r() * issues.length)] : null, photo: null, created_at: at });
      });
    });
    return S;
  }

  let S = store.get() || seed();
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
      return Object.assign({}, p, { task_name: t.name, task_desc: t.description, location_name: l.name, location_sort: l.sort_order,
        user_name: u ? u.name : null, package_name: k ? k.name : null, package_color: k ? k.color : null });
    }).sort((a, b) => a.location_sort - b.location_sort || cmpTr(a.location_name, b.location_name) || cmpTr(a.due_time, b.due_time) || cmpTr(a.task_name, b.task_name));
  }
  function cmap(from, to) {
    const m = {};
    S.completions.forEach((c) => {
      if (c.occ_date >= from && c.occ_date <= to) {
        const u = byId('users', c.user_id);
        m[c.plan_id + '|' + c.occ_date] = Object.assign({}, c, { by_name: u ? u.name : null });
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
  function itemOut(p, occ, c, status) {
    const o = ymd(occ);
    let late = false;
    if (c) late = c.created_at.slice(0, 10) > o || c.created_at > o + ' ' + (p.due_time || '23:59') + ':59';
    return {
      plan_id: p.id, occ_date: o, task: p.task_name, task_desc: p.task_desc, location: p.location_name, location_id: p.location_id,
      user: p.user_name, user_id: p.user_id, package: p.package_name, color: p.package_color, due_time: p.due_time,
      freq: Sched.label(p), note: p.note, status,
      completion: c ? { id: c.id, by: c.by_name, by_id: c.user_id, at: c.created_at, status: c.status, note: c.note, photo: !!c.photo, late } : null,
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
      const c = cm[p.id + '|' + ymd(occ)] || null;
      if (occ < day && c && c.created_at.slice(0, 10) < ymd(day)) return;
      const st = occStatus(sc, p, occ, c, today, hm, lv);
      if ((st === 'missed' || st === 'leave') && occ < day) return;
      items.push(itemOut(p, occ, c, st));
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
    return { freq_type: type, freq_interval: n, weekdays: wd, month_day: md, due_time: t || null };
  }
  function resolveTask(src) {
    if (src.task_id && byId('tasks', src.task_id)) return +src.task_id;
    const name = String(src.task_name || '').trim();
    if (!name) err('İş adı gerekli.');
    const ex = S.tasks.find((t) => t.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'));
    if (ex) { ex.active = 1; return ex.id; }
    const t = { id: nid(), name: name.slice(0, 200), description: null, active: 1, created_at: nowStr() };
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

  function me() { return byId('users', MODE === 'admin' ? 1 : 2); }
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
      return { date: D, today: ymd(today), workday: sc.isWorkday(day), on_leave: !!lv, leave_note: lv ? lv.note : null, items, tally: tally(items) };
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
          days[o].items.push({ status: occStatus(sc, p, o, cm[p.id + '|' + ymd(o)] || null, today, hm, lv) });
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
      const status = b.status === 'issue' ? 'issue' : 'done';
      const note = str(b.note);
      const p = plansQuery((x) => x.id === planId && x.active)[0];
      if (!p) err('İş bulunamadı.');
      if (u.role !== 'admin' && p.user_id !== null && p.user_id !== u.id) err('Bu iş size atanmamış.');
      const sc = sched(), pp = sc.prep(p), [today, hm] = todayCtx(), o = dn(occ);
      if (!sc.isDue(pp, o) || o > today) err('Bu tarih için böyle bir iş yok.');
      if (u.role !== 'admin' && sc.status(pp, o, null, today, hm) === 'missed') err('Bu işin süresi geçti; artık işaretlenemez.');
      if (status === 'issue' && !note) err('Sorun bildirirken kısa bir açıklama yazın.');
      if (S.completions.some((c) => c.plan_id === planId && c.occ_date === occ)) err('Bu iş zaten işaretlenmiş.');
      const c = { id: nid(), plan_id: planId, occ_date: occ, user_id: u.id, status, note, photo: null, created_at: nowStr() };
      if (b.photo && b.photo.size) { const url = await fileToDataUrl(b.photo); if (url) { c.photo = 'demo'; S.photos[c.id] = url; } }
      S.completions.push(c);
      save();
      const cc = cmap(occ, occ)[planId + '|' + occ];
      return itemOut(pp, o, cc, sc.status(pp, o, cc, today, hm));
    },
    async uncomplete(b) {
      const u = me();
      const i = S.completions.findIndex((c) => c.plan_id === +b.plan_id && c.occ_date === b.occ_date);
      if (i < 0) err('Kayıt bulunamadı.');
      const c = S.completions[i];
      if (u.role !== 'admin') {
        if (c.user_id !== u.id) err('Yalnızca kendi işaretlediğiniz işleri geri alabilirsiniz.');
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
          if (!cm[p.id + '|' + ymd(o)] && occStatus(sc, p, o, null, today, hm, lv) === 'missed') missed.push(itemOut(p, o, null, 'missed'));
        });
      });
      missed.sort((a, b2) => cmpTr(b2.occ_date, a.occ_date));
      return { date: ymd(day), today: ymd(today), now: hm, workday: sc.isWorkday(day), items, tally: tally(items),
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
      const items = [];
      plansQuery((p) => p.start_date <= ymd(to)).forEach((p0) => {
        if (q.user_id && p0.user_id !== +q.user_id) return;
        if (q.location_id && p0.location_id !== +q.location_id) return;
        const p = sc.prep(p0);
        sc.occurrences(p, from, to).forEach((o) => {
          const c = cm[p.id + '|' + ymd(o)] || null;
          items.push(itemOut(p, o, c, occStatus(sc, p, o, c, today, hm, lv)));
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
      return { from: ymd(from), to: ymd(to), summary: Object.assign(tally(items), { late_done: lateDone }),
        by_user: groupTally(items, 'user', 'Ortak (herkes)'), by_location: groupTally(items, 'location', '-'), by_task: groupTally(items, 'task', '-'),
        daily: Object.values(daily), problems: problems.slice(0, 300), problem_count: problems.length };
    },
    async locations() {
      return S.locations.filter((l) => l.active).sort((a, b) => a.sort_order - b.sort_order || cmpTr(a.name, b.name))
        .map((l) => Object.assign({}, l, { plan_count: S.plans.filter((p) => p.location_id === l.id && p.active).length }));
    },
    async location_save(b) {
      needAdmin();
      const name = str(b.name, true, 'Mekan adı');
      if (b.id) Object.assign(byId('locations', b.id), { name, description: str(b.description), sort_order: +b.sort_order || 0 });
      else S.locations.push({ id: nid(), name, description: str(b.description), sort_order: +b.sort_order || 0, active: 1, created_at: nowStr() });
      save(); return {};
    },
    async location_delete(b) {
      needAdmin();
      const n = S.plans.filter((p) => p.location_id === +b.id && p.active).length;
      if (n) err(`Bu mekanda ${n} aktif iş ataması var. Önce atamaları kaldırın.`);
      byId('locations', b.id).active = 0; save(); return null;
    },
    async locations_order(b) { needAdmin(); (b.ids || []).forEach((id, i) => { byId('locations', id).sort_order = i; }); save(); return null; },
    async tasks() {
      needAdmin();
      return S.tasks.filter((t) => t.active).sort((a, b) => cmpTr(a.name, b.name))
        .map((t) => Object.assign({}, t, { plan_count: S.plans.filter((p) => p.task_id === t.id && p.active).length }));
    },
    async task_save(b) {
      needAdmin();
      const name = str(b.name, true, 'İş adı');
      if (b.id) Object.assign(byId('tasks', b.id), { name, description: str(b.description) });
      else S.tasks.push({ id: nid(), name, description: str(b.description), active: 1, created_at: nowStr() });
      save(); return {};
    },
    async task_delete(b) {
      needAdmin();
      const n = S.plans.filter((p) => p.task_id === +b.id && p.active).length;
      if (n) err(`Bu iş ${n} aktif atamada kullanılıyor. Önce atamaları kaldırın.`);
      byId('tasks', b.id).active = 0;
      S.package_items = S.package_items.filter((i) => i.task_id !== +b.id);
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
          freq_interval: it.freq_interval, weekdays: it.weekdays, month_day: it.month_day, due_time: it.due_time, start_date: start,
          end_date: null, note: null, active: 1, created_at: nowStr() });
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
      save(); return null;
    },
    async password(b) { if (!b.new || b.new.length < 6) err('Yeni şifre en az 6 karakter olmalı.'); return null; },
    async me() { return me(); },
  };

  /* ---------- dışa açılan demo arayüzü ---------- */
  const MODE = getMode() === 'staff' ? 'staff' : 'admin';
  const u0 = byId('users', MODE === 'admin' ? 1 : 2);
  window.BOOT = { user: { id: u0.id, name: u0.name, username: u0.username, role: u0.role, phone: u0.phone }, company: S.settings.company_name };

  window.DEMO = {
    mode: MODE,
    switchTo(m) { setMode(m); location.reload(); },
    reset() { store.clear(); location.reload(); },
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
