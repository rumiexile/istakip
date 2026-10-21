/* İş Takip — dış kullanıcı sorun bildirme sayfası (karekod) */
window.__runReport = function () {
  'use strict';
  const { h, icon, $, $$ } = App;
  const root = document.getElementById('report');
  const token = (window.BOOT && BOOT.token) || '';
  const EMOJI = { clean: '🧹', supply: '🧻', broken: '🔧', climate: '🌡️', other: '💬' };
  let info = null;

  const card = (inner) => `<section class="glass auth-card report-card">
    <div class="report-brand"><div class="brand-mark">${App.LOGO}</div><div><b>${h(info ? info.company : BOOT.company || '')}</b><small>Sorun bildirimi</small></div></div>${inner}</section>`;

  function fail(msg) {
    root.innerHTML = card(`<div class="report-msg"><div class="big">🔍</div><h1>Karekod bulunamadı</h1><p class="muted">${h(msg)}</p></div>`);
  }

  function form() {
    const cats = Object.entries(info.categories);
    root.innerHTML = card(`
      <div><h1>Bir sorun mu var?</h1><p class="muted">Bildiriminiz doğrudan destek hizmetleri sorumlusuna iletilir.</p></div>
      <div class="report-loc">${icon('pin')}<span>${h(info.location)}</span></div>
      <form class="form" autocomplete="off" novalidate>
        <div class="field"><span>Sorun türü</span>
          <div class="report-cats">${cats.map(([k, l], i) => `<label><input type="radio" name="category" value="${h(k)}" ${i === 0 ? 'checked' : ''}><span><i>${EMOJI[k] || '💬'}</i>${h(l)}</span></label>`).join('')}</div></div>
        <label class="field"><span>Açıklama</span><textarea name="description" maxlength="1000" rows="3" placeholder="Örn. lavabo tıkalı, kağıt havlu bitmiş"></textarea></label>
        <label class="photo-drop">${icon('camera')}<span>Fotoğraf ekle (isteğe bağlı)</span><input type="file" accept="image/*" capture="environment" hidden></label>
        <div class="grid2">
          <label class="field"><span>Adınız <small>(isteğe bağlı)</small></span><input name="name" maxlength="120" autocomplete="name"></label>
          <label class="field"><span>Telefon / e-posta <small>(isteğe bağlı)</small></span><input name="contact" maxlength="120" autocomplete="email"></label>
        </div>
        <label class="hp" aria-hidden="true">Web sitesi<input name="website" tabindex="-1" autocomplete="off"></label>
        <button class="btn primary block" type="submit">${icon('flag')}<span>Bildir</span></button>
      </form>`);
    const f = $('form', root);
    let photo = null;
    const drop = $('.photo-drop', root), input = $('input[type=file]', drop);
    input.onchange = async () => {
      if (!input.files[0]) return;
      photo = await App.shrinkImage(input.files[0]);
      drop.innerHTML = `<img src="${URL.createObjectURL(photo)}" alt=""><span>Değiştirmek için dokunun</span>`;
      drop.appendChild(input);
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const desc = f.description.value.trim();
      if (desc.length < 3) { App.toast('Lütfen sorunu kısaca yazın', 'bad'); f.description.focus(); return; }
      const btn = $('button[type=submit]', f);
      btn.classList.add('loading'); btn.disabled = true;
      const fd = new FormData();
      fd.append('t', token);
      fd.append('category', (f.querySelector('input[name=category]:checked') || {}).value || 'other');
      fd.append('description', desc);
      fd.append('name', f.name.value.trim());
      fd.append('contact', f.contact.value.trim());
      fd.append('website', f.website.value);
      if (photo) fd.append('photo', photo, photo.name || 'foto.jpg');
      try {
        await App.api('public_report', fd);
        done();
      } catch (err) { App.err(err); btn.classList.remove('loading'); btn.disabled = false; }
    };
  }

  function done() {
    root.innerHTML = card(`<div class="report-msg">
      <div class="report-ok"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h1>Teşekkürler!</h1>
      <p class="muted">Bildiriminiz <b>${h(info.location)}</b> için iletildi. En kısa sürede ilgilenilecek.</p>
      <button class="btn block" type="button" data-again>${icon('plus')}<span>Başka bir sorun bildir</span></button></div>`);
    const r = $('.report-ok', root).getBoundingClientRect();
    App.confetti(r.left + r.width / 2, r.top + r.height / 2, 34);
    $('[data-again]', root).onclick = form;
  }

  (async () => {
    root.innerHTML = card('<div class="skeleton" style="height:240px"></div>');
    try {
      info = await App.api('public_location', null, { t: token });
    } catch (e) { return fail(e.message); }
    if (!info.enabled) {
      root.innerHTML = card(`<div class="report-msg"><div class="big">⏸️</div><h1>Sorun bildirimi kapalı</h1><p class="muted">Lütfen görevlilere doğrudan haber verin.</p></div>`);
      return;
    }
    form();
  })();
};
if (!window.DEMO) window.__runReport();
