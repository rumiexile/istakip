/* İş Takip — personel (mobil) ekranı */
(function () {
  'use strict';
  const { h, icon, $, $$ } = App;
  const me = BOOT.user;
  const root = document.getElementById('app');
  document.body.classList.add('role-staff');

  let data = null;
  let history = [];
  let day = null; // null = bugün
  let filter = 'todo';
  let celebrated = false;
  try { filter = localStorage.getItem('istakip.filter') || 'todo'; } catch (e) { /* yoksay */ }

  const ORDER = { overdue: 0, pending: 1, upcoming: 2, issue: 3, done: 4, missed: 5, leave: 6 };
  const isPast = () => data && data.date !== data.today;

  function shell() {
    root.innerHTML = `<div class="staff">
      <div class="s-top">${App.avatar(me.name)}
        <div class="who"><small>${h(App.greeting())},</small><b>${h(me.name)}</b></div>
        ${me.role === 'admin' ? `<a class="btn sm" href="index.php">${icon('home')}<span>Yönetim</span></a>` : ''}
        <button class="btn icon" data-refresh aria-label="Yenile">${icon('refresh')}</button>
        <button class="btn icon" data-menu aria-label="Menü">${icon('user')}</button>
      </div>
      <section class="glass hero" data-tilt="4"><div class="hero-ring"></div><div class="hero-text"></div></section>
      <div class="daystrip" role="tablist" aria-label="Son günler"></div>
      <div class="chips" role="tablist"></div>
      <div class="list-area"></div>
    </div>`;
    $('[data-refresh]', root).onclick = (e) => { const s = e.currentTarget.querySelector('svg'); s.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 600, easing: 'cubic-bezier(.22,1,.36,1)' }); load(); };
    $('[data-menu]', root).onclick = () => {
      const m = App.modal({
        title: me.name,
        body: `<div class="grid"><p class="muted">Kullanıcı adı: <b>${h(me.username)}</b></p>
          <button class="btn block" data-leave>${icon('calendar')}<span>İzin bildir / izinlerim</span></button>
          <button class="btn block" data-pw>${icon('key')}<span>Şifre değiştir</span></button>
          <button class="btn block danger" data-out>${icon('logout')}<span>Çıkış yap</span></button>
          <p class="muted small">İpucu: Tarayıcı menüsünden “Ana ekrana ekle” diyerek uygulama gibi kullanabilirsiniz.</p></div>`,
      });
      $('[data-leave]', m.body).onclick = () => { m.close(); leaveModal(); };
      $('[data-pw]', m.body).onclick = () => { m.close(); App.changePassword(); };
      $('[data-out]', m.body).onclick = App.logout;
    };
  }

  function skeleton() {
    $('.list-area', root).innerHTML = '<div class="tasks">' + '<div class="skeleton" style="height:74px;border-radius:20px"></div>'.repeat(5) + '</div>';
  }

  async function load() {
    try {
      const [d, hist] = await Promise.all([App.api('my_day', null, { date: day }), App.api('my_history')]);
      data = d; history = hist;
      render();
    } catch (e) { App.err(e); }
  }

  function goDay(d) {
    day = !d || d === (data && data.today) ? null : d;
    celebrated = true; // geçmişe bakarken konfeti patlamasın
    skeleton();
    load().then(() => { if (!day) celebrated = data.tally.pending + data.tally.overdue === 0; });
  }

  /* ---------- izin ---------- */
  async function setLeave(date, to, note) {
    await App.api('leave_set', { date, to: to || date, note: note || '' });
    App.toast(date === to || !to ? 'İzin kaydedildi' : 'İzin günleri kaydedildi');
    load();
  }
  async function cancelLeave(date) {
    await App.api('leave_delete', { date });
    App.toast('İzin kaldırıldı', 'info');
    load();
  }

  function quickLeave() {
    App.modal({
      title: 'Bugün izinliyim',
      body: `<form class="form"><p class="muted">Bugünkü işleriniz yöneticinize <b>İzinli</b> olarak görünür ve “yapılmadı” sayılmaz.</p>
        <label class="field"><span>Açıklama (isteğe bağlı)</span><input name="note" placeholder="Örn. Yıllık izin, rapor, mazeret"></label></form>`,
      actions: [{ label: 'Vazgeç', cls: 'ghost' }, { label: 'İzinli olarak işaretle', cls: 'primary', icon: 'calendar', onClick: async (m) => {
        await setLeave(data.today, data.today, $('input[name=note]', m.body).value);
      } }],
    });
  }

  async function leaveModal() {
    const today = (data && data.today) || App.today();
    const m = App.modal({
      title: 'İzin bildir',
      body: `<form class="form">
        <div class="grid2"><label class="field"><span>Başlangıç</span><input type="date" name="date" min="${today}" value="${today}"></label>
        <label class="field"><span>Bitiş</span><input type="date" name="to" min="${today}" value="${today}"></label></div>
        <label class="field"><span>Açıklama (isteğe bağlı)</span><input name="note" placeholder="Örn. Yıllık izin"></label>
        <div class="field"><span>Kayıtlı izinlerim</span><div data-list class="list"><div class="skeleton" style="height:40px"></div></div></div></form>`,
      actions: [{ label: 'Kapat', cls: 'ghost' }, { label: 'İzni kaydet', cls: 'primary', icon: 'check', onClick: async (mm) => {
        const f = $('form', mm.body);
        if (f.to.value < f.date.value) throw new Error('Bitiş tarihi başlangıçtan önce olamaz.');
        await setLeave(f.date.value, f.to.value, f.note.value);
      } }],
    });
    const f = $('form', m.body);
    f.date.onchange = () => { if (f.to.value < f.date.value) f.to.value = f.date.value; };
    const list = $('[data-list]', m.body);
    const draw = async () => {
      try {
        const rows = await App.api('leaves');
        list.innerHTML = rows.length ? rows.map((r) => `<div class="row"><span class="dot" style="background:var(--leave)"></span>
          <div><div class="title">${h(App.fmtDate(r.leave_date, true))}</div>${r.note ? `<div class="sub"><span>${h(r.note)}</span></div>` : ''}</div>
          <div class="actions"><button type="button" class="btn sm ghost danger" data-del="${r.leave_date}">İptal</button></div></div>`).join('')
          : '<p class="muted small">Bugünden sonra kayıtlı izniniz yok.</p>';
        $$('[data-del]', list).forEach((b) => (b.onclick = async () => {
          try { await cancelLeave(b.dataset.del); draw(); } catch (e) { App.err(e); }
        }));
      } catch (e) { list.innerHTML = ''; App.err(e); }
    };
    draw();
  }

  /* ---------- çizim ---------- */
  function counts() {
    const t = data.tally;
    return { todo: t.pending + t.overdue, all: t.total, done: t.done + t.issue, open: t.pending + t.overdue + t.missed };
  }

  function renderHero() {
    const t = data.tally;
    const closed = t.done + t.issue;
    const past = isPast();
    $('.hero-ring', root).innerHTML = App.ring(t.rate, 104, undefined, 'tamam');
    let actions = '';
    if (past) actions = `<button class="btn sm" data-back>${icon('chev')}<span>Bugüne dön</span></button>`;
    if (data.on_leave && !past) actions += `<button class="btn sm ghost" data-unleave>İzni iptal et</button>`;
    if (!data.on_leave && !past && data.workday) actions += `<button class="btn sm" data-leave>${icon('calendar')}<span>Bugün izinliyim</span></button>`;
    $('.hero-text', root).innerHTML = `<h1>${past ? '' : 'Bugün · '}${h(App.fmtDate(data.date))}</h1>
      <p>${h(App.dayName(data.date))} · <b>${closed}</b> / ${t.total} iş tamamlandı</p>
      <div class="mini">${data.on_leave ? App.badge('leave', 'İzinli' + (data.leave_note ? ' · ' + data.leave_note : '')) : ''}
        ${t.overdue ? App.badge('overdue', t.overdue + ' gecikmiş') : ''}
        ${t.pending ? App.badge('pending', t.pending + ' bekliyor') : ''}
        ${t.missed ? App.badge('missed', t.missed + ' yapılmadı') : ''}
        ${t.issue ? App.badge('issue', t.issue + ' sorun') : ''}
        ${!data.on_leave && !t.overdue && !t.pending && !t.missed && t.total ? App.badge('done', 'Hepsi bitti') : ''}</div>
      ${actions ? `<div class="hero-actions">${actions}</div>` : ''}`;
    const back = $('[data-back]', root); if (back) { back.querySelector('svg').style.transform = 'rotate(180deg)'; back.onclick = () => goDay(null); }
    const lv = $('[data-leave]', root); if (lv) lv.onclick = quickLeave;
    const ul = $('[data-unleave]', root); if (ul) ul.onclick = async () => {
      if (await App.confirm('Bugünkü izin kaydınız silinecek ve işleriniz yeniden “bekliyor” olarak görünecek.', { ok: 'İzni iptal et', danger: false, title: 'İzni iptal et' })) {
        try { await cancelLeave(data.today); } catch (e) { App.err(e); }
      }
    };
    App.animateRings($('.hero', root));
  }

  function renderStrip() {
    const strip = $('.daystrip', root);
    strip.innerHTML = history.map((d) => {
      const t = d.tally;
      let cls = 'off', title = 'İş yok';
      if (d.on_leave) { cls = 'leave'; title = 'İzinli'; } else if (!d.workday && !t.total) { cls = 'off'; title = 'İş günü değil'; } else if (t.total) {
        const open = t.pending + t.overdue;
        cls = t.missed ? 'bad' : open ? (d.date === data.today ? 'live' : 'warn') : 'ok';
        title = `${t.done + t.issue}/${t.total} tamam${t.missed ? ', ' + t.missed + ' yapılmadı' : ''}`;
      }
      const isToday = d.date === data.today;
      return `<button class="day ${cls} ${d.date === data.date ? 'active' : ''}" data-day="${d.date}" title="${h(title)}" role="tab" aria-selected="${d.date === data.date}">
        <small>${isToday ? 'Bugün' : h(App.DAY_SHORT[((App.parseDate(d.date).getDay() + 6) % 7) + 1])}</small>
        <b>${App.parseDate(d.date).getDate()}</b>
        <i style="--p:${t.total - t.leave > 0 ? t.rate : 0}%"></i></button>`;
    }).join('');
    $$('[data-day]', strip).forEach((b) => (b.onclick = () => goDay(b.dataset.day)));
    const act = $('.day.active', strip);
    if (act) requestAnimationFrame(() => { strip.scrollLeft = act.offsetLeft - strip.clientWidth / 2 + act.clientWidth / 2; });
  }

  function chipDefs() {
    return isPast() ? [['all', 'Tümü'], ['done', 'Tamamlanan'], ['open', 'Yapılmayan']] : [['todo', 'Yapılacak'], ['all', 'Tümü'], ['done', 'Tamamlanan']];
  }
  function activeFilter() {
    const keys = chipDefs().map((c) => c[0]);
    return keys.includes(filter) ? filter : keys[0];
  }

  function renderChips() {
    const c = counts();
    const f = activeFilter();
    $('.chips', root).innerHTML = chipDefs().map(([k, l]) => `<button class="chip ${f === k ? 'active' : ''}" data-f="${k}">${l}<span class="n">${c[k]}</span></button>`).join('');
    $$('.chip', root).forEach((b) => (b.onclick = () => {
      filter = b.dataset.f;
      try { if (!isPast()) localStorage.setItem('istakip.filter', filter); } catch (e) { /* yoksay */ }
      renderChips(); renderList();
    }));
  }

  function visible(it) {
    const f = activeFilter();
    if (f === 'todo') return it.status === 'pending' || it.status === 'overdue' || (data.on_leave && it.status === 'leave');
    if (f === 'done') return it.status === 'done' || it.status === 'issue';
    if (f === 'open') return ['pending', 'overdue', 'missed'].includes(it.status);
    return true;
  }

  function taskCard(it) {
    const done = it.status === 'done' || it.status === 'issue';
    const carried = it.occ_date !== data.date;
    let sub = '';
    if (it.due_time) sub += `<span>${icon('clock')} ${h(it.due_time)}</span>`;
    sub += `<span>${h(it.freq)}</span>`;
    if (it.status === 'missed') sub += '<span class="miss">Yapılmadı</span>';
    else if (it.status === 'leave') sub += '<span class="lv">İzinli</span>';
    else if (carried && !done) sub += `<span class="late">${App.relDay(it.occ_date) === 'Dün' ? 'Dünden kalan' : 'Kalan iş · ' + h(App.fmtDate(it.occ_date))}</span>`;
    else if (it.status === 'overdue') sub += `<span class="late">${isPast() ? 'Hâlâ yapılabilir' : 'Saati geçti'}</span>`;
    if (done && it.completion) sub += `<span>${h(it.completion.by || '')} · ${h(App.fmtTime(it.completion.at))}${it.completion.late ? ' · geç' : ''}</span>`;
    if (!it.user_id) sub += '<span>Ortak</span>';
    const tickCls = it.status === 'done' ? 'on' : it.status === 'issue' ? 'issue' : it.status === 'overdue' ? 'overdue' : it.status === 'missed' ? 'missed' : '';
    return `<div class="task glass is-${it.status}" data-key="${it.plan_id}|${it.occ_date}" style="${it.color ? '--c:' + h(it.color) : ''}">
      <span class="stripe"></span>
      <button class="tick ${tickCls}" aria-label="${done ? 'Tamamlandı' : 'Tamamla'}"><svg viewBox="0 0 24 24">${it.status === 'issue' ? '<path d="M12 6v7M12 17.5v.5"/>' : it.status === 'missed' ? '<path d="M7 7l10 10M17 7L7 17"/>' : '<path d="M5 12.5l4.5 4.5L19 7.5"/>'}</svg><span class="burst"></span></button>
      <div class="t-body"><div class="t-title">${h(it.task)}</div><div class="t-sub">${sub}</div></div>
      <span class="chev">${icon('chev')}</span></div>`;
  }

  function renderList() {
    const area = $('.list-area', root);
    const items = data.items.filter(visible);
    const past = isPast();
    const leaveNote = data.on_leave && data.items.length
      ? `<div class="alert leave">${icon('calendar')}<span>${past ? 'Bu gün izinliydiniz' : 'Bugün izinli olarak işaretlisiniz'}. Yapılmayan işleriniz <b>yapılmadı</b> sayılmaz.</span></div>` : '';
    if (!data.items.length) {
      area.innerHTML = `<div class="glass empty"><div class="big">${data.on_leave ? '🏖️' : data.workday ? '☕' : '🌴'}</div>
        <b>${data.on_leave ? 'İzinli' : data.workday ? (past ? 'Bu gün size atanmış iş yoktu' : 'Bugün size atanmış iş yok') : (past ? 'İş günü değildi' : 'Bugün iş günü değil')}</b>
        <span>${past ? '' : 'İyi dinlenmeler!'}</span></div>`;
      return;
    }
    if (!items.length) {
      const allDone = activeFilter() === 'todo' || (past && activeFilter() === 'open');
      area.innerHTML = leaveNote + `<div class="glass done-banner"><div class="big">${allDone ? '🎉' : '🗒️'}</div>
        <b>${allDone ? (past ? 'Bu günün tüm işleri tamamlanmış.' : 'Tebrikler! Bugünkü tüm işler tamam.') : 'Burada bir şey yok.'}</b>
        <span class="muted">${allDone && !past ? 'Emeğiniz için teşekkürler.' : ''}</span></div>`;
      return;
    }
    const groups = new Map();
    items.sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || String(a.due_time || '99').localeCompare(String(b.due_time || '99')) || a.task.localeCompare(b.task, 'tr'));
    items.forEach((it) => { if (!groups.has(it.location)) groups.set(it.location, []); groups.get(it.location).push(it); });
    let html = leaveNote;
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
    renderHero(); renderStrip(); renderChips(); renderList();
    const t = data.tally;
    if (!isPast() && !data.on_leave && t.total && t.pending + t.overdue === 0 && !celebrated) {
      celebrated = true;
      setTimeout(() => App.confetti(innerWidth / 2, innerHeight / 3, 60), 300);
    }
  }

  function findItem(key) { return data.items.find((i) => i.plan_id + '|' + i.occ_date === key); }

  function recalc() {
    const t = { total: 0, done: 0, issue: 0, pending: 0, overdue: 0, missed: 0, upcoming: 0, leave: 0 };
    data.items.forEach((i) => { t.total++; t[i.status]++; });
    const base = t.total - t.leave;
    t.rate = base > 0 ? Math.round(((t.done + t.issue) * 100) / base) : (t.total ? 100 : 0);
    data.tally = t;
  }

  async function quickToggle(card, it) {
    const tick = card.querySelector('.tick');
    if (it.status === 'missed') { App.taskSheet(it, load); return; }
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
      setTimeout(() => { renderList(); if (data.tally.pending + data.tally.overdue === 0) render(); }, activeFilter() === 'todo' ? 550 : 0);
      App.api('my_history').then((hh) => { history = hh; renderStrip(); }).catch(() => {});
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
