/* İş Takip — yönetici paneli */
(function () {
  'use strict';
  const { h, icon, $, $$, api } = App;
  const me = BOOT.user;
  const root = document.getElementById('app');

  const ROUTES = [
    { id: 'panel', label: 'Günlük Durum', short: 'Durum', icon: 'home', view: viewDashboard },
    { id: 'atamalar', label: 'İş Atamaları', short: 'Atamalar', icon: 'list', view: viewPlans },
    { id: 'paketler', label: 'İş Paketleri', short: 'Paketler', icon: 'layers', view: viewPackages },
    { id: 'isler', label: 'İş Tanımları', short: 'İşler', icon: 'check', view: viewTasks },
    { id: 'mekanlar', label: 'Mekanlar', short: 'Mekanlar', icon: 'pin', view: viewLocations },
    { id: 'personel', label: 'Personel', short: 'Personel', icon: 'users', view: viewUsers },
    { id: 'raporlar', label: 'Raporlar', short: 'Rapor', icon: 'chart', view: viewReports },
    { id: 'ayarlar', label: 'Ayarlar', short: 'Ayarlar', icon: 'gear', view: viewSettings },
  ];

  let timer = null;
  const cache = {};
  async function get(name, force) {
    if (force || !cache[name]) cache[name] = await api(name);
    return cache[name];
  }
  function invalidate(...names) { names.forEach((n) => delete cache[n]); }

  /* ---------- iskelet ---------- */
  root.innerHTML = `<div class="shell">
    <aside class="side"><div class="glass nav-card">
      <div class="brand"><div class="brand-mark"><svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg></div>
        <div><b>${h(BOOT.company)}</b><small>Yönetim paneli</small></div></div>
      <nav class="nav"><span class="pill"></span>${ROUTES.map((r) => `<a href="#/${r.id}" data-r="${r.id}">${icon(r.icon)}<span>${r.label}</span></a>`).join('')}</nav>
      <div class="side-foot">
        <a class="btn sm block" href="index.php?view=staff">${icon('phone')}<span>Personel ekranı</span></a>
        <div class="me">${App.avatar(me.name)}<div style="flex:1;min-width:0"><b>${h(me.name)}</b><small>Yönetici</small></div>
          <button class="btn icon sm ghost" data-pw title="Şifre değiştir">${icon('key')}</button>
          <button class="btn icon sm ghost" data-out title="Çıkış">${icon('logout')}</button></div>
      </div></div></aside>
    <main class="main">
      <div class="topbar glass"><div class="brand-mark"><svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg></div>
        <b>${h(BOOT.company)}</b>
        <a class="btn icon sm" href="index.php?view=staff" title="Personel ekranı">${icon('phone')}</a>
        <button class="btn icon sm" data-out title="Çıkış">${icon('logout')}</button></div>
      <div id="view"></div>
    </main>
    <nav class="tabbar glass">${ROUTES.map((r) => `<a href="#/${r.id}" data-r="${r.id}">${icon(r.icon)}<span>${r.short}</span></a>`).join('')}</nav>
  </div>`;
  $$('[data-out]').forEach((b) => (b.onclick = App.logout));
  $('[data-pw]').onclick = App.changePassword;
  const viewEl = $('#view');

  function setActive(id) {
    $$('[data-r]').forEach((a) => a.classList.toggle('active', a.dataset.r === id));
    const a = $(`.nav a[data-r="${id}"]`);
    const pill = $('.nav .pill');
    if (a && pill) { pill.style.transform = `translateY(${a.offsetTop}px)`; pill.style.height = a.offsetHeight + 'px'; }
    const t = $(`.tabbar a[data-r="${id}"]`);
    if (t) t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  async function route() {
    clearInterval(timer);
    const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1] || 'panel';
    const r = ROUTES.find((x) => x.id === id) || ROUTES[0];
    setActive(r.id);
    document.title = r.label + ' · ' + BOOT.company;
    viewEl.innerHTML = '';
    const v = document.createElement('div');
    v.className = 'view';
    viewEl.appendChild(v);
    try { await r.view(v); } catch (e) { App.err(e); }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => setActive((location.hash.match(/^#\/([\w-]+)/) || [])[1] || 'panel'));

  const head = (title, sub, tools) => `<div class="page-head"><div><h2>${h(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div><div class="toolbar">${tools || ''}</div></div>`;
  const emptyBox = (emoji, title, text, btn) => `<div class="empty"><div class="big">${emoji}</div><b>${h(title)}</b><span>${h(text || '')}</span>${btn || ''}</div>`;
  const skel = (n, hgt) => `<div class="grid">${`<div class="skeleton" style="height:${hgt || 56}px"></div>`.repeat(n || 4)}</div>`;
  const staffOptions = (users, sel, allLabel) => `<option value="">${h(allLabel || 'Ortak (tüm personel)')}</option>` +
    users.map((u) => `<option value="${u.id}" ${String(sel) === String(u.id) ? 'selected' : ''}>${h(u.name)}${u.role === 'admin' ? ' (yönetici)' : ''}</option>`).join('');
  const locOptions = (locs, sel, allLabel) => (allLabel !== undefined ? `<option value="">${h(allLabel)}</option>` : '') +
    locs.map((l) => `<option value="${l.id}" ${String(sel) === String(l.id) ? 'selected' : ''}>${h(l.name)}</option>`).join('');
  const taskDatalist = (tasks, id) => `<datalist id="${id}">${tasks.map((t) => `<option value="${h(t.name)}">`).join('')}</datalist>`;

  /* =========================================================
     Günlük durum paneli
     ========================================================= */
  async function viewDashboard(v) {
    let date = sessionStorage.getItem('istakip.dash') || App.today();
    if (date > App.today()) date = App.today();
    let filter = 'all';
    let q = '';
    let data = null;

    v.innerHTML = head('Günlük Durum', '', `
      <button class="btn icon" data-prev title="Önceki gün">${icon('chev', '')}</button>
      <input type="date" data-date value="${date}" max="${App.today()}">
      <button class="btn icon" data-next title="Sonraki gün">${icon('chev')}</button>
      <button class="btn" data-today>Bugün</button>
      <button class="btn icon" data-refresh title="Yenile">${icon('refresh')}</button>`) +
      `<div class="stats stagger" data-stats>${'<div class="skeleton" style="height:118px;border-radius:22px"></div>'.repeat(6)}</div>
      <div class="dash-grid"><div class="glass card" data-list>${skel(6)}</div><div class="grid" data-side></div></div>`;
    $('[data-prev] svg', v).style.transform = 'rotate(180deg)';
    const sub = $('.page-head p', v) || App.el('<p></p>');
    if (!$('.page-head p', v)) $('.page-head > div', v).appendChild(sub);

    const setDate = (d) => { if (d > App.today()) d = App.today(); date = d; sessionStorage.setItem('istakip.dash', d); $('[data-date]', v).value = d; load(); };
    $('[data-prev]', v).onclick = () => setDate(App.addDays(date, -1));
    $('[data-next]', v).onclick = () => setDate(App.addDays(date, 1));
    $('[data-today]', v).onclick = () => setDate(App.today());
    $('[data-date]', v).onchange = (e) => e.target.value && setDate(e.target.value);
    $('[data-refresh]', v).onclick = () => load();

    async function load() {
      try {
        data = await api('dashboard', null, { date });
        render();
      } catch (e) { App.err(e); }
    }

    function render() {
      const t = data.tally;
      const isToday = data.date === data.today;
      sub.innerHTML = `${h(App.fmtDate(data.date, true))}${isToday ? ` · saat ${h(data.now)}` : ''}${data.workday ? '' : ' · <b>iş günü değil</b>'}`;
      const stat = (key, lbl, n, c, ic) => `<div class="glass stat lift clickable" data-filter="${key}" style="--c:${c}">
        <div class="top"><span class="lbl">${lbl}</span><span class="icon">${icon(ic)}</span></div>
        <div class="num" data-n="${n}">0</div><span class="spark"></span></div>`;
      $('[data-stats]', v).innerHTML =
        stat('all', 'Toplam iş', t.total, '#6366f1', 'list') +
        stat('closed', 'Tamamlanan', t.done + t.issue, '#10b981', 'check') +
        stat('pending', 'Bekleyen', t.pending, '#64748b', 'clock') +
        stat('overdue', 'Geciken', t.overdue, '#f59e0b', 'alert') +
        stat('issue', 'Sorun bildirilen', t.issue, '#8b5cf6', 'flag') +
        stat('missed', 'Yapılmayan (7 gün)', data.missed_count, '#ef4444', 'x');
      $$('[data-n]', v).forEach((n) => App.countUp(n, +n.dataset.n));
      $$('[data-filter]', v).forEach((s) => (s.onclick = () => {
        if (s.dataset.filter === 'missed') { $('[data-missed]', v)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        filter = s.dataset.filter; renderList(); $('[data-list]', v).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
      renderList();
      renderSide();
    }

    function renderList() {
      const box = $('[data-list]', v);
      const f = (it) => filter === 'all' ? true : filter === 'closed' ? (it.status === 'done' || it.status === 'issue') : it.status === filter;
      const qq = q.toLocaleLowerCase('tr');
      const items = data.items.filter(f).filter((it) => !qq || (it.task + ' ' + it.location + ' ' + (it.user || '')).toLocaleLowerCase('tr').includes(qq));
      const chip = (k, l, n) => `<button class="chip ${filter === k ? 'active' : ''}" data-chip="${k}">${l}<span class="n">${n}</span></button>`;
      const t = data.tally;
      let html = `<div class="card-head"><h3>İş listesi</h3><input type="search" placeholder="Ara: iş, mekan, kişi" value="${h(q)}" data-q style="max-width:240px;min-height:38px"></div>
        <div class="chips" style="margin-bottom:8px">${chip('all', 'Tümü', t.total)}${chip('overdue', 'Geciken', t.overdue)}${chip('pending', 'Bekleyen', t.pending)}${chip('closed', 'Tamamlanan', t.done + t.issue)}${chip('issue', 'Sorunlu', t.issue)}</div>`;
      if (!data.items.length) {
        html += emptyBox(data.workday ? '🗂️' : '🌴', data.workday ? 'Bu gün için planlanmış iş yok' : 'Bu gün iş günü değil',
          data.workday ? 'İş paketlerinden atama yaparak başlayın.' : 'Çalışma günlerini Ayarlar’dan değiştirebilirsiniz.',
          data.workday ? `<a class="btn primary" href="#/paketler">${icon('layers')}<span>Paketlerden ata</span></a>` : '');
      } else if (!items.length) {
        html += emptyBox('🔍', 'Bu filtrede iş yok', '');
      } else {
        const groups = new Map();
        items.forEach((it) => { if (!groups.has(it.location)) groups.set(it.location, []); groups.get(it.location).push(it); });
        html += '<div class="table-wrap"><table><thead><tr><th>İş</th><th>Sorumlu</th><th>Saat</th><th>Durum</th><th>Kim / ne zaman</th></tr></thead><tbody>';
        for (const [loc, list] of groups) {
          html += `<tr class="group"><td colspan="5">${icon('pin')} ${h(loc)} <span class="muted">· ${list.length}</span></td></tr>`;
          html += list.map((it) => `<tr data-key="${it.plan_id}|${it.occ_date}" style="cursor:pointer">
            <td><b>${h(it.task)}</b><div class="muted small">${h(it.freq)}${it.occ_date !== data.date ? ' · ' + h(App.fmtDate(it.occ_date)) + ' tarihli' : ''}</div></td>
            <td class="nowrap">${it.user ? h(it.user) : '<span class="muted">Ortak</span>'}</td>
            <td class="nowrap">${h(it.due_time || '—')}</td>
            <td>${App.badge(it.status)}${it.completion && it.completion.late ? ' <span class="badge overdue plain">geç</span>' : ''}</td>
            <td class="nowrap small">${it.completion ? `${h(it.completion.by || '')} · ${h(App.fmtTime(it.completion.at))}${it.completion.photo ? ' ' + icon('camera') : ''}${it.completion.note ? ' 💬' : ''}` : '<span class="muted">—</span>'}</td></tr>`).join('');
        }
        html += '</tbody></table></div>';
      }
      box.innerHTML = html;
      $$('[data-chip]', box).forEach((c) => (c.onclick = () => { filter = c.dataset.chip; renderList(); }));
      const qi = $('[data-q]', box);
      qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; renderList(); const n = $('[data-q]', box); n.focus(); n.setSelectionRange(pos, pos); };
      $$('tr[data-key]', box).forEach((tr) => (tr.onclick = () => {
        const it = data.items.find((i) => i.plan_id + '|' + i.occ_date === tr.dataset.key);
        App.taskSheet(it, load);
      }));
    }

    function bars(list, emptyText) {
      if (!list.length) return `<p class="muted small">${h(emptyText)}</p>`;
      return '<div class="bars">' + list.map((g) => {
        const w = (n) => (g.total ? (n * 100) / g.total : 0).toFixed(1);
        return `<div class="bar-row" title="${g.done} yapıldı · ${g.issue} sorun · ${g.overdue} gecikmiş · ${g.pending} bekliyor">
          <div class="meta"><b>${h(g.name)}</b><span>${g.done + g.issue}/${g.total} · %${g.rate}</span></div>
          <div class="track-h"><i class="ok" data-w="${w(g.done)}"></i><i class="issue" data-w="${w(g.issue)}"></i><i class="warn" data-w="${w(g.overdue)}"></i><i class="bad" data-w="${w(g.missed)}"></i></div></div>`;
      }).join('') + '</div>';
    }

    function renderSide() {
      const t = data.tally;
      const side = $('[data-side]', v);
      side.innerHTML = `
        <div class="glass card" style="display:flex;gap:18px;align-items:center" data-tilt="4">
          ${App.ring(t.rate, 120, undefined, 'tamamlandı')}
          <div class="grid" style="gap:6px"><h3>Genel ilerleme</h3>
            <p class="muted small">${t.done + t.issue} / ${t.total} iş kapandı</p>
            <div class="legend"><span><i style="background:var(--ok)"></i>Yapıldı</span><span><i style="background:var(--issue)"></i>Sorun</span><span><i style="background:var(--warn)"></i>Gecikti</span></div>
            <p class="muted small">${data.staff_count} aktif personel</p></div></div>
        <div class="glass card"><div class="card-head"><h3>Mekanlara göre</h3></div>${bars(data.by_location, 'Veri yok')}</div>
        <div class="glass card"><div class="card-head"><h3>Personele göre</h3></div>${bars(data.by_user, 'Veri yok')}</div>
        <div class="glass card" data-missed><div class="card-head"><h3>Son 7 günde yapılmayanlar</h3><span class="badge missed">${data.missed_count}</span></div>
          ${data.missed.length ? '<div class="list">' + data.missed.slice(0, 30).map((m) => `<div class="row">
            <span class="dot" style="background:var(--bad)"></span>
            <div><div class="title">${h(m.task)}</div><div class="sub"><span>${h(m.location)}</span><span>${h(m.user || 'Ortak')}</span></div></div>
            <span class="small muted nowrap">${h(App.relDay(m.occ_date))}</span></div>`).join('') + '</div>' +
            (data.missed.length > 30 ? `<a class="btn sm block" href="#/raporlar" style="margin-top:10px">Tümünü raporda gör</a>` : '')
            : '<p class="muted small">Harika! Yapılmayan iş yok. ✨</p>'}</div>`;
      App.animateRings(side); App.animateBars(side);
    }

    await load();
    timer = setInterval(() => { if (date === App.today() && !document.hidden && !document.querySelector('.modal-back')) load(); }, 60000);
  }

  /* =========================================================
     İş atamaları
     ========================================================= */
  async function viewPlans(v) {
    v.innerHTML = head('İş Atamaları', 'Hangi işin, hangi mekanda, kim tarafından, ne sıklıkla yapılacağı', `
      <button class="btn" data-add>${icon('plus')}<span>Tek iş ekle</span></button>
      <button class="btn primary" data-apply>${icon('layers')}<span>Paketten ata</span></button>`) +
      `<div class="glass card" data-box>${skel(6)}</div>`;
    const [plans, locs, users] = await Promise.all([api('plans'), get('locations', true), get('users', true)]);
    let fLoc = sessionStorage.getItem('istakip.pl') || '';
    let fUser = sessionStorage.getItem('istakip.pu') || '';
    let q = '';
    const sel = new Set();
    $('[data-add]', v).onclick = () => planModal(null, () => route());
    $('[data-apply]', v).onclick = () => applyModal(null, () => route());

    function render() {
      const box = $('[data-box]', v);
      const qq = q.toLocaleLowerCase('tr');
      const list = plans.filter((p) => (!fLoc || String(p.location_id) === fLoc) &&
        (!fUser || (fUser === 'none' ? !p.user_id : String(p.user_id) === fUser)) &&
        (!qq || (p.task_name + ' ' + p.location_name).toLocaleLowerCase('tr').includes(qq)));
      let html = `<div class="toolbar" style="margin-bottom:12px">
        <select data-floc>${locOptions(locs, fLoc, 'Tüm mekanlar')}</select>
        <select data-fuser><option value="">Tüm personel</option><option value="none" ${fUser === 'none' ? 'selected' : ''}>Ortak işler</option>${users.map((u) => `<option value="${u.id}" ${fUser === String(u.id) ? 'selected' : ''}>${h(u.name)}</option>`).join('')}</select>
        <input type="search" placeholder="İş ara" data-q value="${h(q)}" style="max-width:220px">
        <span class="muted small">${list.length} atama</span>
        <span style="flex:1"></span>
        <span data-bulk ${sel.size ? '' : 'hidden'} class="toolbar"><b class="small">${sel.size} seçili</b>
          <button class="btn sm" data-reassign>${icon('swap')}<span>Devret</span></button>
          <button class="btn sm danger" data-bdel>${icon('trash')}<span>Kaldır</span></button></span></div>`;
      if (!plans.length) {
        html += emptyBox('🧭', 'Henüz iş ataması yok', 'Hazır bir iş paketini bir mekana ve personele atayarak hızlıca başlayabilirsiniz.',
          `<button class="btn primary" data-apply2>${icon('layers')}<span>Paketten ata</span></button>`);
      } else if (!list.length) {
        html += emptyBox('🔍', 'Filtreye uyan atama yok', '');
      } else {
        const groups = new Map();
        list.forEach((p) => { if (!groups.has(p.location_name)) groups.set(p.location_name, []); groups.get(p.location_name).push(p); });
        html += '<div class="table-wrap"><table><thead><tr><th style="width:30px"><label class="check"><input type="checkbox" data-all><span></span></label></th><th>İş</th><th>Sıklık</th><th>Saat</th><th>Sorumlu</th><th>Başlangıç</th><th></th></tr></thead><tbody>';
        for (const [loc, ps] of groups) {
          html += `<tr class="group"><td colspan="7">${icon('pin')} ${h(loc)} <span class="muted">· ${ps.length}</span></td></tr>`;
          html += ps.map((p) => `<tr>
            <td><label class="check"><input type="checkbox" data-sel="${p.id}" ${sel.has(p.id) ? 'checked' : ''}><span></span></label></td>
            <td><b>${h(p.task_name)}</b>${p.package_name ? `<div class="small" style="color:${h(p.package_color)}">● ${h(p.package_name)}</div>` : ''}${p.note ? `<div class="muted small">${h(p.note)}</div>` : ''}</td>
            <td class="nowrap">${h(p.freq)}</td><td>${h(p.due_time || '—')}</td>
            <td class="nowrap">${p.user_name ? App.avatar(p.user_name, 24) + ' ' + h(p.user_name) : '<span class="muted">Ortak</span>'}</td>
            <td class="nowrap small">${h(App.fmtDate(p.start_date))}${p.end_date ? ' → ' + h(App.fmtDate(p.end_date)) : ''}</td>
            <td class="nowrap"><button class="btn icon sm ghost" data-edit="${p.id}" title="Düzenle">${icon('edit')}</button>
              <button class="btn icon sm ghost danger" data-del="${p.id}" title="Kaldır">${icon('trash')}</button></td></tr>`).join('');
        }
        html += '</tbody></table></div>';
      }
      box.innerHTML = html;
      $('[data-floc]', box).onchange = (e) => { fLoc = e.target.value; sessionStorage.setItem('istakip.pl', fLoc); render(); };
      $('[data-fuser]', box).onchange = (e) => { fUser = e.target.value; sessionStorage.setItem('istakip.pu', fUser); render(); };
      const qi = $('[data-q]', box);
      qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; render(); const n = $('[data-q]', box); n.focus(); n.setSelectionRange(pos, pos); };
      const a2 = $('[data-apply2]', box); if (a2) a2.onclick = () => applyModal(null, () => route());
      $$('[data-edit]', box).forEach((b) => (b.onclick = () => planModal(plans.find((p) => p.id == b.dataset.edit), () => route())));
      $$('[data-del]', box).forEach((b) => (b.onclick = async () => {
        if (!(await App.confirm('Bu atama bugünden itibaren kaldırılacak. Geçmiş kayıtlar raporlarda kalır.', { ok: 'Kaldır' }))) return;
        try { await api('plan_delete', { id: b.dataset.del }); App.toast('Atama kaldırıldı'); route(); } catch (e) { App.err(e); }
      }));
      $$('[data-sel]', box).forEach((c) => (c.onchange = () => { c.checked ? sel.add(+c.dataset.sel) : sel.delete(+c.dataset.sel); render(); }));
      const all = $('[data-all]', box);
      if (all) {
        all.checked = list.length && list.every((p) => sel.has(p.id));
        all.onchange = () => { list.forEach((p) => (all.checked ? sel.add(p.id) : sel.delete(p.id))); render(); };
      }
      const bd = $('[data-bdel]', box);
      if (bd) bd.onclick = async () => {
        if (!(await App.confirm(sel.size + ' atama bugünden itibaren kaldırılacak.', { ok: 'Kaldır' }))) return;
        try { await api('plan_delete', { ids: [...sel] }); App.toast(sel.size + ' atama kaldırıldı'); route(); } catch (e) { App.err(e); }
      };
      const ra = $('[data-reassign]', box);
      if (ra) ra.onclick = () => App.modal({
        title: 'Seçili işleri devret',
        body: `<label class="field"><span>Yeni sorumlu</span><select name="u">${staffOptions(users, '')}</select></label>`,
        actions: [{ label: 'Vazgeç', cls: 'ghost' }, { label: 'Devret', cls: 'primary', onClick: async (m) => {
          await api('plans_reassign', { ids: [...sel], user_id: $('select', m.body).value });
          App.toast(sel.size + ' iş devredildi'); route();
        } }],
      });
    }
    render();
  }

  async function planModal(p, done) {
    const [locs, users, tasks] = await Promise.all([get('locations'), get('users'), get('tasks', true)]);
    if (!locs.length) { App.toast('Önce en az bir mekan ekleyin', 'bad'); location.hash = '#/mekanlar'; return; }
    p = p || {};
    App.modal({
      title: p.id ? 'Atamayı düzenle' : 'Yeni iş ataması',
      wide: true,
      body: `<form class="form">${taskDatalist(tasks, 'dl-tasks')}
        <label class="field"><span>İş</span><input name="task_name" list="dl-tasks" value="${h(p.task_name || '')}" placeholder="Listeden seçin ya da yeni bir iş yazın" required></label>
        <div class="grid2">
          <label class="field"><span>Mekan</span><select name="location_id">${locOptions(locs, p.location_id)}</select></label>
          <label class="field"><span>Sorumlu</span><select name="user_id">${staffOptions(users, p.user_id)}</select></label>
        </div>
        <fieldset><legend>Sıklık</legend>${App.freqFields(p, 'pf')}</fieldset>
        <div class="grid2">
          <label class="field"><span>Başlangıç</span><input type="date" name="start_date" value="${h((p.start_date || App.today()).slice(0, 10))}"></label>
          <label class="field"><span>Bitiş (isteğe bağlı)</span><input type="date" name="end_date" value="${h((p.end_date || '').slice(0, 10))}"></label>
        </div>
        <label class="field"><span>Personele not (isteğe bağlı)</span><input name="note" value="${h(p.note || '')}" placeholder="Örn. Çamaşır suyu depodaki mavi dolapta"></label>
        ${p.id ? '<p class="muted small">Not: Sıklık, mekan veya sorumlu değişirse geçmiş kayıtlar korunur; değişiklik bugünden itibaren geçerli olur.</p>' : ''}
      </form>`,
      onOpen: (m) => App.bindFreq(m.body),
      actions: [{ label: 'Vazgeç', cls: 'ghost' }, { label: 'Kaydet', cls: 'primary', icon: 'check', onClick: async (m) => {
        const f = $('form', m.body);
        const d = Object.assign(App.formData(f), App.readFreq($('[data-freq]', f)));
        if (p.id) d.id = p.id;
        await api('plan_save', d);
        invalidate('tasks');
        App.toast(p.id ? 'Atama güncellendi' : 'İş atandı');
        done && done();
      } }],
    });
  }

  async function applyModal(pkgId, done) {
    const [pkgs, locs, users] = await Promise.all([api('packages'), get('locations'), get('users')]);
    if (!pkgs.length) { App.toast('Önce bir iş paketi oluşturun', 'bad'); location.hash = '#/paketler'; return; }
    if (!locs.length) { App.toast('Önce en az bir mekan ekleyin', 'bad'); location.hash = '#/mekanlar'; return; }
    const m = App.modal({
      title: 'İş paketini ata',
      wide: true,
      body: `<form class="form">
        <label class="field"><span>İş paketi</span><select name="package_id">${pkgs.map((p) => `<option value="${p.id}" ${p.id == pkgId ? 'selected' : ''}>${h(p.name)} (${p.items.length} iş)</option>`).join('')}</select></label>
        <div class="glass" style="padding:12px 14px;border-radius:16px" data-preview></div>
        <div class="field"><span>Mekanlar <small>(birden fazla seçebilirsiniz)</small></span>
          <div class="days" style="gap:8px">${locs.map((l) => `<label><input type="checkbox" name="location_ids[]" value="${l.id}"><span style="width:auto;padding:0 12px">${h(l.name)}</span></label>`).join('')}</div></div>
        <div class="grid2">
          <label class="field"><span>Sorumlu personel</span><select name="user_id">${staffOptions(users, '')}</select></label>
          <label class="field"><span>Başlangıç tarihi</span><input type="date" name="start_date" value="${App.today()}"></label>
        </div>
        <p class="muted small" data-count></p></form>`,
      actions: [{ label: 'Vazgeç', cls: 'ghost' }, { label: 'Ata', cls: 'primary', icon: 'check', onClick: async (m) => {
        const d = App.formData($('form', m.body));
        if (!d.location_ids || !d.location_ids.length) throw new Error('En az bir mekan seçin.');
        const r = await api('package_apply', d);
        App.toast(`${r.created} iş atandı${r.skipped ? `, ${r.skipped} zaten vardı` : ''}`);
        const rect = m.root.querySelector('.modal').getBoundingClientRect();
        App.confetti(rect.left + rect.width / 2, rect.top + 40, 40);
        done && done();
      } }],
    });
    const f = $('form', m.body);
    const upd = () => {
      const p = pkgs.find((x) => x.id == f.package_id.value);
      $('[data-preview]', m.body).innerHTML = `<div class="small" style="display:flex;flex-wrap:wrap;gap:6px">${p.items.map((i) => `<span class="badge plain" style="--c:${h(p.color)}">${h(i.task_name)} · ${h(i.freq)}</span>`).join('')}</div>`;
      const n = $$('input[name="location_ids[]"]:checked', f).length;
      $('[data-count]', m.body).textContent = n ? `${p.items.length} iş × ${n} mekan = ${p.items.length * n} atama oluşturulacak.` : 'Mekan seçin.';
    };
    f.addEventListener('change', upd); upd();
  }

  /* =========================================================
     İş paketleri (şablonlar)
     ========================================================= */
  async function viewPackages(v) {
    v.innerHTML = head('İş Paketleri', 'Sık kullanılan iş gruplarını şablon olarak saklayın, tek seferde mekanlara atayın', `
      <button class="btn primary" data-new>${icon('plus')}<span>Yeni paket</span></button>`) + `<div data-box>${skel(3, 200)}</div>`;
    $('[data-new]', v).onclick = () => packageModal(null, () => route());
    const pkgs = await api('packages');
    const box = $('[data-box]', v);
    if (!pkgs.length) {
      box.innerHTML = `<div class="glass">${emptyBox('📦', 'Henüz iş paketi yok', 'Örn. “Tuvalet Temizliği” paketi oluşturup tüm katlara atayabilirsiniz.')}</div>`;
      return;
    }
    box.innerHTML = '<div class="pkg-grid stagger">' + pkgs.map((p) => `<div class="glass pkg lift" style="--c:${h(p.color)}" data-tilt="5">
      <div class="head"><span class="swatch">${icon('layers')}</span><div style="flex:1;min-width:0"><h3>${h(p.name)}</h3>
        <div class="muted small">${p.items.length} iş · ${p.plan_count} aktif atama</div></div></div>
      ${p.description ? `<p class="muted small">${h(p.description)}</p>` : ''}
      <ul>${p.items.map((i) => `<li><span>${h(i.task_name)}</span><span>${h(i.freq)}${i.due_time ? ' · ' + h(i.due_time) : ''}</span></li>`).join('')}</ul>
      <div class="foot">
        <button class="btn icon sm ghost" data-copy="${p.id}" title="Kopyala"><svg class="ico" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button>
        <button class="btn sm ghost" data-edit="${p.id}">${icon('edit')}<span>Düzenle</span></button>
        <button class="btn icon sm ghost danger" data-del="${p.id}" title="Sil">${icon('trash')}</button>
        <button class="btn sm primary" data-apply="${p.id}">${icon('play')}<span>Ata</span></button></div></div>`).join('') + '</div>';
    const find = (id) => pkgs.find((p) => p.id == id);
    $$('[data-apply]', box).forEach((b) => (b.onclick = () => applyModal(b.dataset.apply, () => { location.hash = '#/atamalar'; })));
    $$('[data-edit]', box).forEach((b) => (b.onclick = () => packageModal(find(b.dataset.edit), () => route())));
    $$('[data-copy]', box).forEach((b) => (b.onclick = () => {
      const p = find(b.dataset.copy);
      packageModal(Object.assign({}, p, { id: null, name: p.name + ' (kopya)' }), () => route());
    }));
    $$('[data-del]', box).forEach((b) => (b.onclick = async () => {
      if (!(await App.confirm('Paket şablonu silinecek. Bu paketten yapılmış atamalar etkilenmez.', { ok: 'Sil' }))) return;
      try { await api('package_delete', { id: b.dataset.del }); App.toast('Paket silindi'); route(); } catch (e) { App.err(e); }
    }));
  }

  async function packageModal(p, done) {
    const tasks = await get('tasks', true);
    p = p || { color: '#6366f1', items: [] };
    const row = (it) => `<div class="item-row">
      <input name="task_name" list="dl-ptasks" value="${h(it.task_name || '')}" placeholder="İş adı (listeden seçin ya da yazın)">
      <button type="button" class="btn icon sm ghost danger" data-rm title="Çıkar">${icon('x')}</button>
      <div class="freq-fields">${App.freqFields(it)}</div></div>`;
    const m = App.modal({
      title: p.id ? 'Paketi düzenle' : 'Yeni iş paketi',
      wide: true,
      body: `<form class="form">${taskDatalist(tasks, 'dl-ptasks')}
        <div style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:end">
          <label class="field"><span>Renk</span><input type="color" name="color" value="${h(p.color)}"></label>
          <label class="field"><span>Paket adı</span><input name="name" value="${h(p.name || '')}" placeholder="Örn. Tuvalet Temizliği"></label></div>
        <label class="field"><span>Açıklama</span><input name="description" value="${h(p.description || '')}"></label>
        <fieldset><legend>Paketteki işler</legend><div class="items-editor">${(p.items.length ? p.items : [{}]).map(row).join('')}</div>
          <button type="button" class="btn" data-addrow>${icon('plus')}<span>İş ekle</span></button></fieldset></form>`,
      onOpen: (m) => App.bindFreq(m.body),
      actions: [{ label: 'Vazgeç', cls: 'ghost' }, { label: 'Kaydet', cls: 'primary', icon: 'check', onClick: async (m) => {
        const f = $('form', m.body);
        const items = $$('.item-row', f).map((r) => Object.assign({ task_name: $('input[name=task_name]', r).value.trim() }, App.readFreq($('[data-freq]', r))))
          .filter((i) => i.task_name);
        await api('package_save', { id: p.id || null, name: f.name.value, description: f.description.value, color: f.color.value, items });
        invalidate('tasks');
        App.toast('Paket kaydedildi');
        done && done();
      } }],
    });
    const ed = $('.items-editor', m.body);
    $('[data-addrow]', m.body).onclick = () => {
      const r = App.el(row({}));
      ed.appendChild(r); App.bindFreq(r); $('input', r).focus();
      r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    ed.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]');
      if (b) { const r = b.closest('.item-row'); r.style.transition = 'all .25s'; r.style.opacity = 0; r.style.transform = 'scale(.95)'; setTimeout(() => r.remove(), 220); }
    });
  }

  /* =========================================================
     İş tanımları
     ========================================================= */
  async function viewTasks(v) {
    v.innerHTML = head('İş Tanımları', 'Yapılacak işlerin listesi. Açıklama, personelin görevi doğru yapması için gösterilir.', `
      <button class="btn primary" data-new>${icon('plus')}<span>Yeni iş</span></button>`) + `<div class="glass card" data-box>${skel(6)}</div>`;
    const tasks = await get('tasks', true);
    const edit = (t) => App.modal({
      title: t ? 'İşi düzenle' : 'Yeni iş',
      body: `<form class="form"><label class="field"><span>İş adı</span><input name="name" value="${h(t ? t.name : '')}" placeholder="Örn. Sabun değişimi"></label>
        <label class="field"><span>Açıklama / talimat</span><textarea name="description" placeholder="Nasıl yapılacağına dair kısa talimat">${h(t ? t.description || '' : '')}</textarea></label></form>`,
      actions: [{ label: 'Vazgeç', cls: 'ghost' }, { label: 'Kaydet', cls: 'primary', onClick: async (m) => {
        await api('task_save', Object.assign(App.formData($('form', m.body)), { id: t ? t.id : null }));
        invalidate('tasks'); App.toast('Kaydedildi'); route();
      } }],
    });
    $('[data-new]', v).onclick = () => edit(null);
    const box = $('[data-box]', v);
    if (!tasks.length) { box.innerHTML = emptyBox('📝', 'Henüz iş tanımı yok', 'İş paketi oluştururken yazdığınız işler buraya otomatik eklenir.'); return; }
    box.innerHTML = `<input type="search" placeholder="Ara" data-q style="max-width:260px;margin-bottom:8px"><div class="list">` + tasks.map((t) => `<div class="row" data-name="${h(t.name.toLocaleLowerCase('tr'))}">
      <span class="avatar" style="--c1:#6366f1;--c2:#06b6d4;width:32px;height:32px">${icon('check')}</span>
      <div><div class="title">${h(t.name)}</div><div class="sub">${t.description ? `<span>${h(t.description)}</span>` : ''}<span>${t.plan_count} aktif atama</span></div></div>
      <div class="actions"><button class="btn icon sm ghost" data-edit="${t.id}">${icon('edit')}</button>
        <button class="btn icon sm ghost danger" data-del="${t.id}">${icon('trash')}</button></div></div>`).join('') + '</div>';
    $('[data-q]', box).oninput = (e) => { const q = e.target.value.toLocaleLowerCase('tr'); $$('.row', box).forEach((r) => (r.hidden = !r.dataset.name.includes(q))); };
    $$('[data-edit]', box).forEach((b) => (b.onclick = () => edit(tasks.find((t) => t.id == b.dataset.edit))));
    $$('[data-del]', box).forEach((b) => (b.onclick = async () => {
      if (!(await App.confirm('İş tanımı silinecek ve paketlerden çıkarılacak.', { ok: 'Sil' }))) return;
      try { await api('task_delete', { id: b.dataset.del }); invalidate('tasks'); App.toast('Silindi'); route(); } catch (e) { App.err(e); }
    }));
  }

  /* =========================================================
     Mekanlar
     ========================================================= */
  async function viewLocations(v) {
    v.innerHTML = head('Mekanlar', 'İşlerin yapıldığı yerler (kat, oda, tuvalet, çay ocağı…)', `
      <button class="btn primary" data-new>${icon('plus')}<span>Yeni mekan</span></button>`) + `<div class="glass card" data-box>${skel(6)}</div>`;
    const locs = await get('locations', true);
    const edit = (l) => App.modal({
      title: l ? 'Mekanı düzenle' : 'Yeni mekan',
      body: `<form class="form"><label class="field"><span>Mekan adı</span><input name="name" value="${h(l ? l.name : '')}" placeholder="Örn. Kat 3 - Erkek Tuvaleti"></label>
        <label class="field"><span>Açıklama</span><input name="description" value="${h(l ? l.description || '' : '')}" placeholder="Örn. B blok, asansör yanı"></label></form>`,
      actions: [{ label: 'Vazgeç', cls: 'ghost' }, { label: 'Kaydet', cls: 'primary', onClick: async (m) => {
        await api('location_save', Object.assign(App.formData($('form', m.body)), { id: l ? l.id : null, sort_order: l ? l.sort_order : locs.length }));
        invalidate('locations'); App.toast('Kaydedildi'); route();
      } }],
    });
    $('[data-new]', v).onclick = () => edit(null);
    const box = $('[data-box]', v);
    if (!locs.length) { box.innerHTML = emptyBox('📍', 'Henüz mekan yok', 'İşlerin yapılacağı yerleri ekleyin.'); return; }
    box.innerHTML = '<div class="list">' + locs.map((l, i) => `<div class="row">
      <span class="avatar" style="--c1:#ec4899;--c2:#f59e0b;width:32px;height:32px">${icon('pin')}</span>
      <div><div class="title">${h(l.name)}</div><div class="sub">${l.description ? `<span>${h(l.description)}</span>` : ''}<span>${l.plan_count} aktif iş</span></div></div>
      <div class="actions">
        <button class="btn icon sm ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''} title="Yukarı"><svg class="ico" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>
        <button class="btn icon sm ghost" data-down="${i}" ${i === locs.length - 1 ? 'disabled' : ''} title="Aşağı"><svg class="ico" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
        <button class="btn icon sm ghost" data-edit="${l.id}">${icon('edit')}</button>
        <button class="btn icon sm ghost danger" data-del="${l.id}">${icon('trash')}</button></div></div>`).join('') + '</div>';
    const move = async (i, d) => {
      const ids = locs.map((l) => l.id);
      [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
      try { await api('locations_order', { ids }); invalidate('locations'); route(); } catch (e) { App.err(e); }
    };
    $$('[data-up]', box).forEach((b) => (b.onclick = () => move(+b.dataset.up, -1)));
    $$('[data-down]', box).forEach((b) => (b.onclick = () => move(+b.dataset.down, 1)));
    $$('[data-edit]', box).forEach((b) => (b.onclick = () => edit(locs.find((l) => l.id == b.dataset.edit))));
    $$('[data-del]', box).forEach((b) => (b.onclick = async () => {
      if (!(await App.confirm('Mekan silinecek.', { ok: 'Sil' }))) return;
      try { await api('location_delete', { id: b.dataset.del }); invalidate('locations'); App.toast('Silindi'); route(); } catch (e) { App.err(e); }
    }));
  }

  /* =========================================================
     Personel
     ========================================================= */
  async function viewUsers(v) {
    v.innerHTML = head('Personel', 'Personel telefonundan bu sitenin adresini açıp kendi kullanıcı adıyla giriş yapar', `
      <button class="btn" data-link>${icon('phone')}<span>Giriş adresini kopyala</span></button>
      <button class="btn primary" data-new>${icon('plus')}<span>Yeni personel</span></button>`) + `<div data-box>${skel(4, 80)}</div>`;
    const users = await get('users', true);
    const appUrl = location.href.split('#')[0].split('?')[0];
    $('[data-link]', v).onclick = async () => {
      try { await navigator.clipboard.writeText(appUrl); App.toast('Adres kopyalandı: ' + appUrl); } catch (e) { App.toast(appUrl, 'info', { duration: 8000 }); }
    };
    const edit = (u) => App.modal({
      title: u ? 'Personeli düzenle' : 'Yeni personel',
      body: `<form class="form" autocomplete="off">
        <label class="field"><span>Ad soyad</span><input name="name" value="${h(u ? u.name : '')}"></label>
        <div class="grid2"><label class="field"><span>Kullanıcı adı</span><input name="username" autocapitalize="none" value="${h(u ? u.username : '')}" placeholder="ornek: ahmet.y"></label>
        <label class="field"><span>Telefon</span><input name="phone" type="tel" value="${h(u ? u.phone || '' : '')}"></label></div>
        <div class="grid2"><label class="field"><span>${u ? 'Yeni şifre (değişmeyecekse boş bırakın)' : 'Şifre'}</span><input name="password" type="text" autocomplete="new-password" placeholder="en az 6 karakter"></label>
        <label class="field"><span>Rol</span><select name="role"><option value="staff">Personel</option><option value="admin" ${u && u.role === 'admin' ? 'selected' : ''}>Yönetici</option></select></label></div>
        </form>`,
      actions: [{ label: 'Vazgeç', cls: 'ghost' }, { label: 'Kaydet', cls: 'primary', onClick: async (m) => {
        await api('user_save', Object.assign(App.formData($('form', m.body)), { id: u ? u.id : null }));
        invalidate('users'); App.toast('Kaydedildi'); route();
      } }],
    });
    $('[data-new]', v).onclick = () => edit(null);
    const box = $('[data-box]', v);
    box.innerHTML = '<div class="pkg-grid stagger">' + users.map((u) => `<div class="glass pkg lift" data-tilt="5">
      <div class="head">${App.avatar(u.name, 46)}<div style="flex:1;min-width:0"><h3>${h(u.name)}</h3>
        <div class="muted small">@${h(u.username)} · ${u.role === 'admin' ? 'Yönetici' : 'Personel'}</div></div></div>
      <div class="small muted" style="display:flex;gap:12px;flex-wrap:wrap">${u.phone ? `<span>${icon('phone')} ${h(u.phone)}</span>` : ''}<span>${icon('list')} ${u.plan_count} aktif iş</span></div>
      <div class="foot">
        <a class="btn sm ghost" href="#/atamalar" data-plans="${u.id}">${icon('list')}<span>İşleri</span></a>
        <button class="btn sm ghost" data-edit="${u.id}">${icon('edit')}<span>Düzenle</span></button>
        ${u.id !== me.id ? `<button class="btn sm ghost danger" data-del="${u.id}">${icon('trash')}</button>` : ''}</div></div>`).join('') + '</div>';
    $$('[data-plans]', box).forEach((a) => (a.onclick = () => { sessionStorage.setItem('istakip.pu', a.dataset.plans); sessionStorage.removeItem('istakip.pl'); }));
    $$('[data-edit]', box).forEach((b) => (b.onclick = () => edit(users.find((u) => u.id == b.dataset.edit))));
    $$('[data-del]', box).forEach((b) => (b.onclick = async () => {
      const u = users.find((x) => x.id == b.dataset.del);
      if (u.plan_count) {
        App.modal({
          title: u.name + ' — işleri devret',
          body: `<p>Bu kişiye atanmış <b>${u.plan_count}</b> aktif iş var. Silmeden önce işleri kime devredelim?</p><br>
            <label class="field"><span>Yeni sorumlu</span><select name="u">${staffOptions(users.filter((x) => x.id !== u.id), '')}</select></label>`,
          actions: [{ label: 'Vazgeç', cls: 'ghost' }, { label: 'Devret ve sil', cls: 'warn', onClick: async (m) => {
            const plans = (await api('plans')).filter((p) => p.user_id == u.id).map((p) => p.id);
            await api('plans_reassign', { ids: plans, user_id: $('select', m.body).value });
            await api('user_delete', { id: u.id });
            invalidate('users'); App.toast(u.name + ' silindi, işleri devredildi'); route();
          } }],
        });
        return;
      }
      if (!(await App.confirm(u.name + ' silinecek. Geçmiş kayıtları raporlarda kalır.', { ok: 'Sil' }))) return;
      try { await api('user_delete', { id: u.id }); invalidate('users'); App.toast('Silindi'); route(); } catch (e) { App.err(e); }
    }));
  }

  /* =========================================================
     Raporlar
     ========================================================= */
  async function viewReports(v) {
    const t = App.today();
    const d = App.parseDate(t);
    const monday = App.addDays(t, -((d.getDay() + 6) % 7));
    const monthStart = t.slice(0, 8) + '01';
    const prevMonthEnd = App.addDays(monthStart, -1);
    const prevMonthStart = prevMonthEnd.slice(0, 8) + '01';
    const ranges = { 'Bu hafta': [monday, t], 'Son 7 gün': [App.addDays(t, -6), t], 'Bu ay': [monthStart, t], 'Geçen ay': [prevMonthStart, prevMonthEnd], 'Son 30 gün': [App.addDays(t, -29), t] };
    let [from, to] = ranges['Son 7 gün'];
    let fUser = '', fLoc = '';
    const [locs, users] = await Promise.all([get('locations', true), get('users', true)]);

    v.innerHTML = head('Raporlar', 'Seçilen dönemde işlerin yapılma durumu', `
      <button class="btn" data-csv>${icon('download')}<span>Excel (CSV)</span></button>`) +
      `<div class="glass card" style="margin-bottom:16px"><div class="toolbar">
        <div class="chips" style="padding:0">${Object.keys(ranges).map((k) => `<button class="chip ${k === 'Son 7 gün' ? 'active' : ''}" data-range="${h(k)}">${h(k)}</button>`).join('')}</div>
        <input type="date" data-from value="${from}" max="${t}"> <span class="muted">→</span> <input type="date" data-to value="${to}" max="${t}">
        <select data-loc>${locOptions(locs, '', 'Tüm mekanlar')}</select>
        <select data-user><option value="">Tüm personel</option>${users.map((u) => `<option value="${u.id}">${h(u.name)}</option>`).join('')}</select>
      </div></div><div data-out>${skel(4, 120)}</div>`;

    const load = async () => {
      $('[data-out]', v).style.opacity = .5;
      try { render(await api('report', null, { from, to, user_id: fUser, location_id: fLoc })); } catch (e) { App.err(e); }
      $('[data-out]', v).style.opacity = 1;
    };
    $$('[data-range]', v).forEach((b) => (b.onclick = () => {
      [from, to] = ranges[b.dataset.range];
      $('[data-from]', v).value = from; $('[data-to]', v).value = to;
      $$('[data-range]', v).forEach((x) => x.classList.toggle('active', x === b)); load();
    }));
    $('[data-from]', v).onchange = (e) => { from = e.target.value; $$('[data-range]', v).forEach((x) => x.classList.remove('active')); load(); };
    $('[data-to]', v).onchange = (e) => { to = e.target.value; $$('[data-range]', v).forEach((x) => x.classList.remove('active')); load(); };
    $('[data-loc]', v).onchange = (e) => { fLoc = e.target.value; load(); };
    $('[data-user]', v).onchange = (e) => { fUser = e.target.value; load(); };
    $('[data-csv]', v).onclick = () => {
      App.download(`api.php?a=report_csv&from=${from}&to=${to}&user_id=${fUser}&location_id=${fLoc}`);
    };

    function table(list, title, col) {
      return `<div class="glass card"><div class="card-head"><h3>${h(title)}</h3></div><div class="table-wrap"><table>
        <thead><tr><th>${h(col)}</th><th>Toplam</th><th>Yapıldı</th><th>Sorun</th><th>Yapılmadı</th><th>Oran</th></tr></thead><tbody>
        ${list.map((g) => `<tr><td><b>${h(g.name)}</b></td><td>${g.total}</td><td>${g.done}</td><td>${g.issue}</td><td>${g.missed ? `<b style="color:var(--bad)">${g.missed}</b>` : 0}</td>
          <td style="min-width:120px"><div class="track-h"><i class="ok" data-w="${g.rate}"></i></div><small class="muted">%${g.rate}</small></td></tr>`).join('')}
        </tbody></table></div></div>`;
    }

    function render(r) {
      const s = r.summary;
      const out = $('[data-out]', v);
      const max = Math.max(1, ...r.daily.map((d) => d.total));
      const stat = (lbl, n, c, ic) => `<div class="glass stat lift" style="--c:${c}"><div class="top"><span class="lbl">${lbl}</span><span class="icon">${icon(ic)}</span></div><div class="num" data-n="${n}">0</div><span class="spark"></span></div>`;
      out.innerHTML = `<div class="stats stagger">
          ${stat('Planlanan iş', s.total, '#6366f1', 'list')}${stat('Yapıldı', s.done, '#10b981', 'check')}
          ${stat('Sorun bildirildi', s.issue, '#8b5cf6', 'flag')}${stat('Yapılmadı', s.missed, '#ef4444', 'x')}
          ${stat('Geç yapıldı', s.late_done, '#f59e0b', 'clock')}
          <div class="glass stat lift" style="--c:#06b6d4;place-items:center">${App.ring(s.rate, 92, undefined, 'başarı')}</div></div>
        <div class="glass card" style="margin-bottom:16px"><div class="card-head"><h3>Günlük dağılım</h3>
          <div class="legend"><span><i style="background:var(--ok)"></i>Yapıldı</span><span><i style="background:var(--issue)"></i>Sorun</span><span><i style="background:var(--bad)"></i>Yapılmadı</span><span><i style="background:var(--line)"></i>Açık</span></div></div>
          <div class="colchart">${r.daily.map((d, i) => `<div class="col">
            <span class="tip">${h(App.fmtDate(d.date))}: ${d.done} yapıldı, ${d.issue} sorun, ${d.missed} yapılmadı${d.open ? ', ' + d.open + ' açık' : ''}</span>
            ${['done:ok', 'issue:issue', 'missed:bad', 'open:open'].map((k) => { const [f, c] = k.split(':'); return d[f] ? `<i class="${c}" style="height:${(d[f] * 100) / max}%;animation-delay:${i * 0.02}s"></i>` : ''; }).join('')}</div>`).join('')}</div>
          <div class="axis">${r.daily.map((d, i) => `<span>${r.daily.length <= 16 || i % Math.ceil(r.daily.length / 12) === 0 ? h(App.fmtShort(d.date)) : ''}</span>`).join('')}</div></div>
        <div class="grid cols-2" style="margin-bottom:16px">${table(r.by_user, 'Personele göre', 'Personel')}${table(r.by_location, 'Mekanlara göre', 'Mekan')}</div>
        <div class="grid cols-2">${table(r.by_task.slice(0, 15), 'En çok aksayan işler', 'İş')}
          <div class="glass card"><div class="card-head"><h3>Aksayan kayıtlar</h3><span class="badge missed">${r.problem_count}</span></div>
          ${r.problems.length ? '<div class="list" style="max-height:520px;overflow:auto">' + r.problems.map((p) => `<div class="row">
            ${App.badge(p.status)}<div><div class="title">${h(p.task)}</div><div class="sub"><span>${h(p.location)}</span><span>${h(p.user || 'Ortak')}</span>
            ${p.completion && p.completion.note ? `<span>💬 ${h(p.completion.note)}</span>` : ''}</div></div>
            <span class="small muted nowrap">${h(App.fmtDate(p.occ_date))}</span></div>`).join('') + '</div>' : '<p class="muted small">Bu dönemde aksayan iş yok. 👏</p>'}</div></div>`;
      $$('[data-n]', out).forEach((n) => App.countUp(n, +n.dataset.n));
      App.animateRings(out); App.animateBars(out);
    }
    load();
  }

  /* =========================================================
     Ayarlar
     ========================================================= */
  async function viewSettings(v) {
    const s = await api('settings');
    const wd = s.work_days.split(',');
    v.innerHTML = head('Ayarlar', '') + `<div class="grid cols-2">
      <form class="glass card form" data-form>
        <div class="card-head"><h3>Genel</h3></div>
        <label class="field"><span>Kurum adı</span><input name="company_name" value="${h(s.company_name)}"></label>
        <div class="field"><span>Çalışma günleri</span><div class="days">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<label><input type="checkbox" name="work_days[]" value="${d}" ${wd.includes(String(d)) ? 'checked' : ''}><span>${App.DAY_SHORT[d]}</span></label>`).join('')}</div>
          <small>İşler yalnızca çalışma günlerinde planlanır. “X günde 1” işler iş günü üzerinden sayılır.</small></div>
        <label class="field"><span>Resmi tatiller / kapalı günler</span><textarea name="holidays" placeholder="Her satıra bir tarih: 2026-10-29">${h(s.holidays)}</textarea>
          <small>Bu günlerde iş planlanmaz. Biçim: YYYY-AA-GG</small></label>
        <div><button class="btn primary" type="submit">${icon('check')}<span>Kaydet</span></button></div>
      </form>
      <div class="grid" style="align-content:start">
        <div class="glass card"><div class="card-head"><h3>Hesabım</h3></div>
          <div class="me">${App.avatar(me.name, 44)}<div><b>${h(me.name)}</b><small>@${h(me.username)}</small></div></div><br>
          <button class="btn" data-pw>${icon('key')}<span>Şifre değiştir</span></button></div>
        <div class="glass card"><div class="card-head"><h3>Nasıl çalışır?</h3></div>
          <ol class="muted small" style="margin:0;padding-left:18px;display:grid;gap:6px">
            <li><b>Mekanlar</b> ve <b>Personel</b> ekleyin.</li>
            <li><b>İş Paketleri</b>nde işleri sıklıklarıyla şablon olarak tanımlayın.</li>
            <li>Paketi “Ata” ile bir veya daha fazla mekana ve bir personele atayın.</li>
            <li>Personel telefonundan giriş yapıp işleri işaretler; isterse not/fotoğraf ekler.</li>
            <li><b>Günlük Durum</b> ekranından geciken ve yapılmayan işleri takip edin.</li></ol>
          <p class="muted small" style="margin-top:10px">Bir işin tekrarı, bir sonraki tekrarına kadar açık kalır. Saati geçen iş “gecikti”, bir sonraki tekrar geldiğinde hâlâ yapılmamışsa “yapılmadı” sayılır.</p></div>
        <p class="muted small">Sürüm ${h('1.0.0')}</p>
      </div></div>`;
    $('[data-pw]', v).onclick = App.changePassword;
    $('[data-form]', v).onsubmit = async (e) => {
      e.preventDefault();
      const b = $('button[type=submit]', e.target);
      b.classList.add('loading');
      try { await api('settings_save', App.formData(e.target)); App.toast('Ayarlar kaydedildi'); } catch (err) { App.err(err); }
      b.classList.remove('loading');
    };
  }

  route();
})();
