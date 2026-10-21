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
  // Bu oturumda "kontrol edildi" yapılan sarf malzemeleri, ikinci dokunuş için "Yapılacak" listesinde kalır.
  const recentChecked = new Set();
  // Bu ekranda işaretlenen işler, filtre değişene kadar listede yerinde kalır (alta kaymaz, kaybolmaz).
  const keepHere = new Set();
  // Kartların giriş animasyonu yalnızca ilk çizimde ve filtre/gün değişince oynar; işaretleme sonrası yeniden çizimde oynamaz.
  let animateNext = true;
  const SWAP_PATH = '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>';
  try { filter = localStorage.getItem('istakip.filter') || 'todo'; } catch (e) { /* yoksay */ }

  const isPast = () => data && data.date !== data.today;

  function shell() {
    root.innerHTML = `<div class="staff">
      <div class="s-top"><div class="brand-mark">${App.LOGO}</div>${App.avatar(me.name)}
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
      notifyInspections(d.inspections || []);
    } catch (e) { App.err(e); }
  }

  function goDay(d) {
    day = !d || d === (data && data.today) ? null : d;
    keepHere.clear(); animateNext = true;
    celebrated = true; // geçmişe bakarken konfeti patlamasın
    skeleton();
    load().then(() => { if (!day) celebrated = data.tally.pending + data.tally.overdue + data.tally.upcoming === 0; });
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
      keepHere.clear(); animateNext = true;
      try { if (!isPast()) localStorage.setItem('istakip.filter', filter); } catch (e) { /* yoksay */ }
      renderChips(); renderList();
    }));
  }

  function visible(it) {
    const f = activeFilter();
    if (f === 'todo') return it.status === 'pending' || it.status === 'overdue' || it.status === 'upcoming' || (data.on_leave && it.status === 'leave')
      || keepHere.has(App.itemKey(it)) || (recentChecked.has(App.itemKey(it)) && it.completion && it.completion.status === 'done');
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
    else if (it.status === 'upcoming' && it.opens_at) sub += `<span class="soon">Açılış: ${h(it.opens_at)}</span>`;
    else if (it.status === 'leave') sub += '<span class="lv">İzinli</span>';
    else if (carried && !done) sub += `<span class="late">${App.relDay(it.occ_date) === 'Dün' ? 'Dünden kalan' : 'Kalan iş · ' + h(App.fmtDate(it.occ_date))}</span>`;
    else if (it.status === 'overdue') sub += `<span class="late">${isPast() ? 'Hâlâ yapılabilir' : 'Saati geçti'}</span>`;
    const cons = it.kind === 'consumable';
    const cs = it.completion && it.completion.status;
    if (cons && cs === 'done') sub += App.canUndo(it) ? '<span class="cons-hint">Kontrol edildi · değiştirdiyseniz tekrar dokunun</span>' : '<span class="cons-ok">Kontrol edildi</span>';
    else if (cons && cs === 'replaced') sub += '<span class="cons-rep">Değiştirildi</span>';
    else if (cons && !it.completion) sub += '<span class="cons">Sarf malzemesi</span>';
    if (done && it.completion) sub += `<span>${h(it.completion.by || '')} · ${h(App.fmtTime(it.completion.at))}${it.completion.late ? ' · geç' : ''}</span>`;
    if (it.completion && it.completion.inspected) sub += '<span class="insp">Yönetici kontrol etti</span>';
    if (!it.user_id) sub += '<span>Ortak</span>';
    const tickCls = cs === 'replaced' ? 'replaced' : it.status === 'done' ? 'on' : it.status === 'issue' ? 'issue' : it.status === 'overdue' ? 'overdue' : it.status === 'missed' ? 'missed' : '';
    return `<div class="task glass is-${it.status}${cons && cs === 'done' && App.canUndo(it) ? ' is-cons-checked' : ''}" data-key="${App.itemKey(it)}" style="${it.color ? '--c:' + h(it.color) : ''}">
      <span class="stripe"></span>
      <button class="tick ${tickCls}" aria-label="${done ? 'Tamamlandı' : 'Tamamla'}"><svg viewBox="0 0 24 24">${cs === 'replaced' ? SWAP_PATH : it.status === 'issue' ? '<path d="M12 6v7M12 17.5v.5"/>' : it.status === 'missed' ? '<path d="M7 7l10 10M17 7L7 17"/>' : '<path d="M5 12.5l4.5 4.5L19 7.5"/>'}</svg><span class="burst"></span>${App.star(it)}</button>
      <div class="t-body"><div class="t-title">${h(it.task)}${it.slot_count > 1 ? ` <span class="slot-pill">${h(App.slotLabel(it))}</span>` : ''}</div><div class="t-sub">${sub}</div></div>
      <span class="chev">${icon('chev')}</span></div>`;
  }

  /* ---------- ihtiyaç olduğunda yapılan işler ---------- */
  const odList = () => data.on_demand || [];
  const canAddOd = () => !isPast() || me.role === 'admin';

  function odCard(it) {
    const last = it.entries[it.entries.length - 1];
    const day = isPast() ? 'Bu gün' : 'Bugün';
    const sub = `<span class="od-tag">${icon('refresh')} İhtiyaç olduğunda</span>`
      + (it.count ? `<span class="od-count">${day} ${it.count} kez · son ${h(App.fmtTime(last.at))}</span>` : `<span>${day} henüz yapılmadı</span>`)
      + (!it.user_id ? '<span>Ortak</span>' : '');
    return `<div class="task glass od${it.count ? ' has' : ''}" data-od="${it.plan_id}" style="${it.color ? '--c:' + h(it.color) : ''}">
      <span class="stripe"></span>
      <span class="od-num" aria-label="${it.count} kez">${it.count}</span>
      <div class="t-body"><div class="t-title">${h(it.task)}</div><div class="t-sub">${sub}</div></div>
      ${canAddOd() ? `<button class="btn sm od-add" type="button" data-odadd aria-label="Yapıldı olarak kaydet">${icon('plus')}<span>Yapıldı</span></button>` : `<span class="chev">${icon('chev')}</span>`}</div>`;
  }

  function odSection() {
    const f = activeFilter();
    if (f === 'open') return '';
    const list = odList().filter((it) => f !== 'done' || it.count);
    if (!list.length) return '';
    const groups = new Map();
    list.forEach((it) => { if (!groups.has(it.location)) groups.set(it.location, []); groups.get(it.location).push(it); });
    return `<section class="loc-group od-group"><div class="loc-head">${icon('refresh')}<h3>İhtiyaç olduğunda</h3><span class="cnt">${list.reduce((n, i) => n + i.count, 0)} kayıt</span></div>
      <p class="muted small od-hint">Düzenli değil; iş çıktıkça (ör. toplantı oldukça) <b>Yapıldı</b>’ya dokunun. İşaretlenmeyen gün eksik sayılmaz.</p>
      <div class="tasks${animateNext ? ' stagger' : ''}">${list.map(odCard).join('')}</div></section>`;
  }

  /* ---------- sürekli görevler (takip edilmez) ---------- */
  function routineSection() {
    const f = activeFilter();
    const list = data.routine || [];
    if (!list.length || f === 'open' || f === 'done') return '';
    return `<section class="loc-group rt-group"><div class="loc-head"><span class="rt-ico" aria-hidden="true">∞</span><h3>Sürekli görevler</h3><span class="cnt">${list.length}</span></div>
      <p class="muted small od-hint">Gün boyu zaten yaptığınız işler; işaretlemenize gerek yok.</p>
      <div class="rt-list">${list.map((it, i) => `<button type="button" class="rt-item glass" data-rt="${i}" style="${it.color ? '--c:' + h(it.color) : ''}">
        <span class="rt-dot"></span><span class="rt-text"><b>${h(it.task)}</b><small>${h(it.location)}</small></span></button>`).join('')}</div></section>`;
  }

  async function odAdd(card, it, btn) {
    btn.classList.add('loading'); btn.disabled = true;
    try {
      const res = await App.completeItem(it, 'done');
      Object.assign(it, res);
      const r = btn.getBoundingClientRect();
      App.confetti(r.left + r.width / 2, r.top + r.height / 2, 16);
      if (navigator.vibrate) navigator.vibrate(12);
      renderList(); renderChips();
      const fresh = $(`.task[data-od="${it.plan_id}"]`, root);
      if (fresh) { fresh.classList.add('just-done'); }
      const e = it.entries[it.entries.length - 1];
      App.toast(`Kaydedildi: ${it.task} (${isPast() ? 'bu gün' : 'bugün'} ${it.count}. kez)`, '', {
        action: 'Geri al',
        onAction: async () => { try { await App.uncompleteItem({ plan_id: it.plan_id, occ_date: e.occ_date, slot: e.slot }); load(); } catch (er) { App.err(er); } },
      });
    } catch (er) { App.err(er); btn.classList.remove('loading'); btn.disabled = false; }
  }

  function odSheet(it) {
    const mine = (e) => App.canUndo({ completion: e });
    const entries = it.entries.slice().reverse().map((e) => `<div class="row od-entry">
      <span class="dot" style="background:${e.status === 'issue' ? 'var(--issue)' : 'var(--ok)'}"></span>
      <div><div class="title">${h(App.fmtTime(e.at))} · ${h(e.by || '')}${e.inspected ? ' ' + App.star({ completion: e }) : ''}</div>
        ${e.note ? `<div class="sub"><span>${h(e.note)}</span></div>` : ''}${e.photo ? `<img class="photo-thumb" src="${h(App.photoUrl(e))}" alt="Fotoğraf" loading="lazy">` : ''}</div>
      ${mine(e) ? `<div class="actions"><button type="button" class="btn sm ghost danger" data-undo="${e.slot}">Geri al</button></div>` : '<span></span>'}</div>`).join('');
    const body = `<div class="sheet-task">
      <div class="meta"><span class="badge plain upcoming">İhtiyaç olduğunda</span><span class="tag">${icon('pin')}${h(it.location)}</span>${it.user ? `<span class="tag">${icon('user')}${h(it.user)}</span>` : ''}</div>
      ${it.task_desc ? `<p class="muted">${h(it.task_desc)}</p>` : ''}
      ${it.note ? `<div class="alert info">${h(it.note)}</div>` : ''}
      ${canAddOd() ? `<label class="field"><span>Not (isteğe bağlı)</span><textarea name="note" placeholder="Örn. Kurul toplantısı, 12 kişi"></textarea></label>
        <label class="photo-drop">${icon('camera')}<span>Fotoğraf ekle (isteğe bağlı)</span><input type="file" accept="image/*" capture="environment" hidden></label>
        <div class="big-actions"><button class="btn warn" data-act="issue">${icon('flag')}<span>Sorun var</span></button>
          <button class="btn success" data-act="done">${icon('plus')}<span>Yapıldı</span></button></div>` : ''}
      <div class="field"><span>${isPast() ? 'Bu günün kayıtları' : 'Bugünkü kayıtlar'} (${it.count})</span>
        ${entries ? `<div class="list">${entries}</div>` : '<p class="muted small">Henüz kayıt yok.</p>'}</div></div>`;
    const m = App.modal({ title: it.task, body });
    let photo = null;
    const drop = $('.photo-drop', m.body);
    if (drop) {
      const input = drop.querySelector('input');
      input.onchange = async () => {
        if (!input.files[0]) return;
        photo = await App.shrinkImage(input.files[0]);
        drop.innerHTML = `<img src="${URL.createObjectURL(photo)}" alt=""><span>Değiştirmek için dokunun</span>`;
        drop.appendChild(input);
      };
    }
    $$('[data-act]', m.body).forEach((b) => (b.onclick = async () => {
      const st = b.dataset.act, note = $('textarea', m.body).value.trim();
      if (st === 'issue' && !note) { App.toast('Lütfen sorunu kısaca yazın', 'bad'); return; }
      b.classList.add('loading');
      try {
        Object.assign(it, await App.completeItem(it, st, note, photo));
        if (st === 'done') { const r = b.getBoundingClientRect(); App.confetti(r.left + r.width / 2, r.top, 26); }
        App.toast(st === 'issue' ? 'Sorun bildirildi' : `Kaydedildi (${it.count}. kez)`, st === 'issue' ? 'info' : '');
        m.close(); renderList();
      } catch (er) { App.err(er); b.classList.remove('loading'); }
    }));
    $$('[data-undo]', m.body).forEach((b) => (b.onclick = async () => {
      try { await App.uncompleteItem({ plan_id: it.plan_id, occ_date: data.date, slot: +b.dataset.undo }); App.toast('Kayıt geri alındı', 'info'); m.close(); load(); } catch (er) { App.err(er); }
    }));
  }

  function renderList() {
    const area = $('.list-area', root);
    const items = data.items.filter(visible);
    const past = isPast();
    const od = odSection() + routineSection();
    const leaveNote = data.on_leave && data.items.length
      ? `<div class="alert leave">${icon('calendar')}<span>${past ? 'Bu gün izinliydiniz' : 'Bugün izinli olarak işaretlisiniz'}. Yapılmayan işleriniz <b>yapılmadı</b> sayılmaz.</span></div>` : '';
    if (!data.items.length && od) {
      area.innerHTML = od;
      animateNext = false;
      return;
    }
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
        <span class="muted">${allDone && !past ? 'Emeğiniz için teşekkürler.' : ''}</span></div>` + od;
      animateNext = false;
      return;
    }
    const groups = new Map();
    // Sıra yalnızca saate bağlı: bir iş tamamlandığında yeri değişmez.
    items.sort((a, b) => String(a.due_time || '99').localeCompare(String(b.due_time || '99')) || a.task.localeCompare(b.task, 'tr') || (a.slot || 0) - (b.slot || 0));
    items.forEach((it) => { if (!groups.has(it.location)) groups.set(it.location, []); groups.get(it.location).push(it); });
    let html = leaveNote;
    let gi = 0;
    for (const [loc, list] of groups) {
      const all = data.items.filter((i) => i.location === loc);
      const closed = all.filter((i) => i.status === 'done' || i.status === 'issue').length;
      html += `<section class="loc-group" style="animation-delay:${gi++ * 0.05}s"><div class="loc-head">${icon('pin')}<h3>${h(loc)}</h3><span class="cnt">${closed}/${all.length}</span></div>
        <div class="tasks${animateNext ? ' stagger' : ''}">${list.map(taskCard).join('')}</div></section>`;
    }
    area.innerHTML = html + od;
    animateNext = false;
  }

  /** Yöneticinin kontrol ettiği işler için bir kez gösterilen kutlama */
  const shownInspections = new Set();
  function notifyInspections(list) {
    list = list.filter((x) => !shownInspections.has(x.id));
    if (!list.length || document.querySelector('.celebrate-back')) return;
    list.forEach((x) => shownInspections.add(x.id));
    const one = list[0];
    const rows = list.slice(0, 3).map((x) => `<div class="cel-row"><span class="star">${icon('star')}</span>
      <div><b>${h(x.task)}</b><small>${h(x.location)} · ${h(App.fmtDate(String(x.occ_date).slice(0, 10)))}</small></div></div>`).join('')
      + (list.length > 3 ? `<p class="muted small cel-more">ve ${list.length - 3} iş daha</p>` : '');
    const by = one.inspected_name ? one.inspected_name + ' kontrol etti' : 'Yönetici kontrol etti';
    App.celebrate({
      title: list.length === 1 ? 'Harika iş!' : `Harika iş! ${list.length} işiniz kontrol edildi`,
      text: list.length === 1 ? `İşiniz yönetici tarafından kontrol edildi.` : 'Yaptığınız işler yönetici tarafından kontrol edildi.',
      html: `<div class="cel-list">${rows}</div><p class="cel-by">${h(by)} · ${h(App.relDay(one.inspected_at))} ${h(App.fmtTime(one.inspected_at))}</p>`,
      button: 'Teşekkürler',
    });
    App.api('inspections_seen', {}).catch(() => {});
  }

  function render() {
    renderHero(); renderStrip(); renderChips(); renderList();
    const t = data.tally;
    if (!isPast() && !data.on_leave && t.total && t.pending + t.overdue + t.upcoming === 0 && !celebrated) {
      celebrated = true;
      setTimeout(() => App.confetti(innerWidth / 2, innerHeight / 3, 60), 300);
    }
  }

  function findItem(key) { return data.items.find((i) => App.itemKey(i) === key); }

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
    if (it.status === 'upcoming') { App.toast(it.opens_at ? `Bu kontrol ${it.opens_at} sonrasında işaretlenebilir` : 'Bu işin zamanı henüz gelmedi', 'info'); return; }
    const key = App.itemKey(it);
    if (it.completion && it.kind === 'consumable' && it.completion.status === 'done' && App.canUndo(it)) {
      // Sarf malzemesi, ikinci dokunuş: "Değiştirildi"
      tick.classList.add('replaced');
      tick.querySelector('svg').innerHTML = SWAP_PATH;
      card.classList.remove('just-done'); void card.offsetWidth; card.classList.add('just-done');
      const r = tick.getBoundingClientRect();
      App.confetti(r.left + r.width / 2, r.top + r.height / 2, 14);
      if (navigator.vibrate) navigator.vibrate([10, 40, 10]);
      try {
        Object.assign(it, await App.replaceItem(it));
        recentChecked.delete(key);
        keepHere.add(key);
        setTimeout(() => renderList(), 450);
        App.toast('Değiştirildi: ' + it.task, '', {
          action: 'Geri al',
          onAction: async () => { try { Object.assign(it, await App.replaceItem(it, true)); recentChecked.add(key); renderList(); } catch (e) { App.err(e); } },
        });
      } catch (e) { App.err(e); load(); }
      return;
    }
    if (it.completion) {
      if (!App.canUndo(it)) { App.taskSheet(it, load); return; }
      const msg = it.kind === 'consumable' ? 'Bu malzemenin “Değiştirildi” işaretini kaldırıp yeniden açık hale getirmek istiyor musunuz?' : 'Bu işin tamamlandı işaretini geri almak istiyor musunuz?';
      if (!(await App.confirm(msg, { ok: 'Geri al', title: it.task }))) return;
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
      const cons = it.kind === 'consumable';
      if (cons) recentChecked.add(key);
      keepHere.add(key);
      recalc();
      renderHero(); renderChips();
      setTimeout(() => { renderList(); if (data.tally.pending + data.tally.overdue + data.tally.upcoming === 0) render(); }, 450);
      App.api('my_history').then((hh) => { history = hh; renderStrip(); }).catch(() => {});
      App.toast(cons ? 'Kontrol edildi: ' + it.task + ' · değiştirdiyseniz tekrar dokunun' : 'Tamamlandı: ' + it.task, '', {
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
    const rt = e.target.closest('[data-rt]');
    if (rt) {
      const it = (data.routine || [])[+rt.dataset.rt];
      if (it) App.modal({ title: it.task, body: `<div class="sheet-task"><div class="meta"><span class="badge plain upcoming">Sürekli görev</span><span class="tag">${icon('pin')}${h(it.location)}</span></div>
        ${it.task_desc ? `<p class="muted">${h(it.task_desc)}</p>` : ''}${it.note ? `<div class="alert info">${h(it.note)}</div>` : ''}
        <p>Bu görev gün boyu zaten yapılan işlerdendir; günlük işaretleme ya da takip gerekmez.</p></div>`, actions: [{ label: 'Tamam', cls: 'primary' }] });
      return;
    }
    const card = e.target.closest('.task');
    if (!card) return;
    if (card.dataset.od) {
      const it = odList().find((i) => String(i.plan_id) === card.dataset.od);
      if (!it) return;
      const add = e.target.closest('[data-odadd]');
      if (add) odAdd(card, it, add); else odSheet(it);
      return;
    }
    const it = findItem(card.dataset.key);
    if (!it) return;
    if (e.target.closest('.tick')) quickToggle(card, it);
    else App.taskSheet(it, () => { celebrated = false; keepHere.add(App.itemKey(it)); load(); });
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden && !document.querySelector('.modal-back')) load(); }, 120000);

  shell(); skeleton(); load();
})();
