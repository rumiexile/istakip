/* İş Takip — personel (mobil) ekranı */
(function () {
  'use strict';
  const { h, icon, $, $$ } = App;
  const me = BOOT.user;
  const root = document.getElementById('app');
  document.body.classList.add('role-staff');

  let data = null;
  let filter = 'todo';
  let celebrated = false;
  try { filter = localStorage.getItem('istakip.filter') || 'todo'; } catch (e) { /* yoksay */ }

  const ORDER = { overdue: 0, pending: 1, upcoming: 2, issue: 3, done: 4, missed: 5 };

  function shell() {
    root.innerHTML = `<div class="staff">
      <div class="s-top">${App.avatar(me.name)}
        <div class="who"><small>${h(App.greeting())},</small><b>${h(me.name)}</b></div>
        ${me.role === 'admin' ? `<a class="btn sm" href="index.php">${icon('home')}<span>Yönetim</span></a>` : ''}
        <button class="btn icon" data-refresh aria-label="Yenile">${icon('refresh')}</button>
        <button class="btn icon" data-menu aria-label="Menü">${icon('user')}</button>
      </div>
      <section class="glass hero" data-tilt="4"><div class="hero-ring"></div><div class="hero-text"></div></section>
      <div class="chips" role="tablist"></div>
      <div class="list-area"></div>
    </div>`;
    $('[data-refresh]', root).onclick = (e) => { const s = e.currentTarget.querySelector('svg'); s.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 600, easing: 'cubic-bezier(.22,1,.36,1)' }); load(); };
    $('[data-menu]', root).onclick = () => {
      const m = App.modal({
        title: me.name,
        body: `<div class="grid"><p class="muted">Kullanıcı adı: <b>${h(me.username)}</b></p>
          <button class="btn block" data-pw>${icon('key')}<span>Şifre değiştir</span></button>
          <button class="btn block danger" data-out>${icon('logout')}<span>Çıkış yap</span></button>
          <p class="muted small">İpucu: Tarayıcı menüsünden “Ana ekrana ekle” diyerek uygulama gibi kullanabilirsiniz.</p></div>`,
      });
      $('[data-pw]', m.body).onclick = () => { m.close(); App.changePassword(); };
      $('[data-out]', m.body).onclick = App.logout;
    };
  }

  function skeleton() {
    $('.list-area', root).innerHTML = '<div class="tasks">' + '<div class="skeleton" style="height:74px;border-radius:20px"></div>'.repeat(5) + '</div>';
  }

  async function load() {
    try {
      data = await App.api('my_day');
      render();
    } catch (e) { App.err(e); }
  }

  function counts() {
    const t = data.tally;
    return { todo: t.pending + t.overdue, all: t.total, done: t.done + t.issue, overdue: t.overdue };
  }

  function renderHero() {
    const t = data.tally;
    const closed = t.done + t.issue;
    const pct = t.total ? Math.round((closed * 100) / t.total) : 0;
    $('.hero-ring', root).innerHTML = App.ring(pct, 104, undefined, 'tamam');
    $('.hero-text', root).innerHTML = `<h1>${h(App.fmtDate(data.date))}</h1>
      <p>${h(App.dayName(data.date))} · <b>${closed}</b> / ${t.total} iş tamamlandı</p>
      <div class="mini">${t.overdue ? App.badge('overdue', t.overdue + ' gecikmiş') : ''}
        ${t.pending ? App.badge('pending', t.pending + ' bekliyor') : ''}
        ${t.issue ? App.badge('issue', t.issue + ' sorun') : ''}
        ${!t.overdue && !t.pending && t.total ? App.badge('done', 'Hepsi bitti') : ''}</div>`;
    App.animateRings($('.hero', root));
  }

  function renderChips() {
    const c = counts();
    const chip = (k, lbl) => `<button class="chip ${filter === k ? 'active' : ''}" data-f="${k}">${lbl}<span class="n">${c[k]}</span></button>`;
    $('.chips', root).innerHTML = chip('todo', 'Yapılacak') + chip('all', 'Tümü') + chip('done', 'Tamamlanan');
    $$('.chip', root).forEach((b) => (b.onclick = () => {
      filter = b.dataset.f;
      try { localStorage.setItem('istakip.filter', filter); } catch (e) { /* yoksay */ }
      renderChips(); renderList();
    }));
  }

  function visible(it) {
    if (filter === 'todo') return it.status === 'pending' || it.status === 'overdue';
    if (filter === 'done') return it.status === 'done' || it.status === 'issue';
    return true;
  }

  function taskCard(it) {
    const done = it.status === 'done' || it.status === 'issue';
    const carried = it.occ_date !== data.date;
    let sub = '';
    if (it.due_time) sub += `<span>${icon('clock')} ${h(it.due_time)}</span>`;
    sub += `<span>${h(it.freq)}</span>`;
    if (carried && !done) sub += `<span class="late">${App.relDay(it.occ_date) === 'Dün' ? 'Dünden kalan' : 'Kalan iş · ' + h(App.fmtDate(it.occ_date))}</span>`;
    else if (it.status === 'overdue') sub += '<span class="late">Saati geçti</span>';
    if (done && it.completion) sub += `<span>${h(it.completion.by || '')} · ${h(App.fmtTime(it.completion.at))}</span>`;
    if (!it.user_id) sub += '<span>Ortak</span>';
    const tickCls = it.status === 'done' ? 'on' : it.status === 'issue' ? 'issue' : it.status === 'overdue' ? 'overdue' : '';
    return `<div class="task glass is-${it.status}" data-key="${it.plan_id}|${it.occ_date}" style="${it.color ? '--c:' + h(it.color) : ''}">
      <span class="stripe"></span>
      <button class="tick ${tickCls}" aria-label="${done ? 'Tamamlandı' : 'Tamamla'}"><svg viewBox="0 0 24 24">${it.status === 'issue' ? '<path d="M12 6v7M12 17.5v.5"/>' : '<path d="M5 12.5l4.5 4.5L19 7.5"/>'}</svg><span class="burst"></span></button>
      <div class="t-body"><div class="t-title">${h(it.task)}</div><div class="t-sub">${sub}</div></div>
      <span class="chev">${icon('chev')}</span></div>`;
  }

  function renderList() {
    const area = $('.list-area', root);
    const items = data.items.filter(visible);
    if (!data.items.length) {
      area.innerHTML = `<div class="glass empty"><div class="big">${data.workday ? '☕' : '🌴'}</div>
        <b>${data.workday ? 'Bugün size atanmış iş yok' : 'Bugün iş günü değil'}</b><span>İyi dinlenmeler!</span></div>`;
      return;
    }
    if (!items.length) {
      const allDone = filter === 'todo';
      area.innerHTML = `<div class="glass done-banner"><div class="big">${allDone ? '🎉' : '🗒️'}</div>
        <b>${allDone ? 'Tebrikler! Bugünkü tüm işler tamam.' : 'Burada henüz bir şey yok.'}</b>
        <span class="muted">${allDone ? 'Emeğiniz için teşekkürler.' : ''}</span></div>`;
      return;
    }
    const groups = new Map();
    items.sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || String(a.due_time || '99').localeCompare(String(b.due_time || '99')) || a.task.localeCompare(b.task, 'tr'));
    items.forEach((it) => { if (!groups.has(it.location)) groups.set(it.location, []); groups.get(it.location).push(it); });
    let html = '';
    let gi = 0;
    for (const [loc, list] of groups) {
      const all = data.items.filter((i) => i.location === loc);
      const closed = all.filter((i) => i.status === 'done' || i.status === 'issue').length;
      html += `<section class="loc-group" style="animation-delay:${gi++ * 0.05}s"><div class="loc-head">${icon('pin')}<h3>${h(loc)}</h3><span class="cnt">${closed}/${all.length}</span></div>
        <div class="tasks stagger">${list.map(taskCard).join('')}</div></section>`;
    }
    area.innerHTML = html;
  }

  function render() {
    renderHero(); renderChips(); renderList();
    const t = data.tally;
    if (t.total && t.pending + t.overdue === 0 && !celebrated) {
      celebrated = true;
      setTimeout(() => App.confetti(innerWidth / 2, innerHeight / 3, 60), 300);
    }
  }

  function findItem(key) { return data.items.find((i) => i.plan_id + '|' + i.occ_date === key); }

  function recalc() {
    const t = { total: 0, done: 0, issue: 0, pending: 0, overdue: 0, missed: 0, upcoming: 0 };
    data.items.forEach((i) => { t.total++; t[i.status]++; });
    data.tally = t;
  }

  async function quickToggle(card, it) {
    const tick = card.querySelector('.tick');
    if (it.completion) {
      if (!App.canUndo(it)) { App.taskSheet(it, load); return; }
      if (!(await App.confirm('Bu işin tamamlandı işaretini geri almak istiyor musunuz?', { ok: 'Geri al', title: it.task }))) return;
      try { await App.uncompleteItem(it); App.toast('İşaret geri alındı', 'info'); load(); } catch (e) { App.err(e); }
      return;
    }
    // İyimser güncelleme: önce animasyon, sonra sunucu.
    const prev = { status: it.status };
    tick.classList.add('on');
    card.classList.add('is-done', 'just-done');
    const r = tick.getBoundingClientRect();
    App.confetti(r.left + r.width / 2, r.top + r.height / 2, 18);
    if (navigator.vibrate) navigator.vibrate(12);
    try {
      const res = await App.completeItem(it, 'done');
      Object.assign(it, res);
      recalc();
      renderHero(); renderChips();
      setTimeout(() => { renderList(); if (data.tally.pending + data.tally.overdue === 0) render(); }, filter === 'todo' ? 550 : 0);
      App.toast('Tamamlandı: ' + it.task, '', {
        action: 'Geri al',
        onAction: async () => { try { await App.uncompleteItem(it); celebrated = false; load(); } catch (e) { App.err(e); } },
      });
    } catch (e) {
      it.status = prev.status;
      tick.classList.remove('on'); card.classList.remove('is-done', 'just-done');
      App.err(e);
      if (/zaten/.test(e.message)) load();
    }
  }

  root.addEventListener('click', (e) => {
    const card = e.target.closest('.task');
    if (!card) return;
    const it = findItem(card.dataset.key);
    if (!it) return;
    if (e.target.closest('.tick')) quickToggle(card, it);
    else App.taskSheet(it, () => { celebrated = false; load(); });
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden && !document.querySelector('.modal-back')) load(); }, 120000);

  shell(); skeleton(); load();
})();
