#!/usr/bin/env python3
"""Uygulamanın gerçek arayüz dosyalarını tarayıcıda çalışan sahte API ile tek bir demo HTML'de birleştirir."""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
read = lambda p: (root / p).read_text(encoding='utf-8')

css = read('assets/app.css')
# Görüntüleyicinin tema seçimini (data-theme) de dinlesin.
m = re.search(r'@media \(prefers-color-scheme: dark\) \{\n  :root \{\n(.*?)\n  \}\n\}', css, re.S)
dark = m.group(1)
css = css.replace(m.group(0),
    '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n' + dark + '\n  }\n}\n'
    ':root[data-theme="dark"] {\n' + dark + '\n}')
css = css.replace('@media (prefers-color-scheme: dark) { .alert.bad { color: #fca5a5; } }',
    '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .alert.bad { color: #fca5a5; } }\n:root[data-theme="dark"] .alert.bad { color: #fca5a5; }')

demo_css = """
.demo-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 10px 16px 0; padding: 8px 10px 8px 14px; border-radius: 20px; font-size: 13px; position: relative; z-index: 50; }
:root { --logo-1: #6BBDEB; --logo-2: #1A7EC1; --logo-3: #27568F; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --logo-3: #4F82C8; } }
:root[data-theme="dark"] { --logo-3: #4F82C8; }
.demo-bar .lg { font-style: normal; }
.demo-bar .seg span { white-space: nowrap; }
.demo-logo { display: inline-flex; align-items: center; flex: none; }
.demo-logo svg { height: 26px; width: auto; display: block; transition: transform .45s var(--spring); }
.demo-logo:hover svg { transform: translateY(-2px) rotate(-4deg) scale(1.06); }
.demo-logo .l1 { fill: var(--logo-1); } .demo-logo .l2 { fill: var(--logo-2); } .demo-logo .l3 { fill: var(--logo-3); }
.demo-logo .l1, .demo-logo .l2, .demo-logo .l3 { animation: logoIn .7s var(--spring) both; }
.demo-logo .l2 { animation-delay: .08s; } .demo-logo .l3 { animation-delay: .16s; }
@keyframes logoIn { from { opacity: 0; transform: translateY(14px); } }
.demo-bar .desc { color: var(--muted); flex: 1; min-width: 180px; }
.demo-bar .seg span { padding: 6px 12px; }
#demo-user { width: auto; min-height: 34px; padding: 4px 32px 4px 12px; font-size: 13px; font-weight: 600; border-radius: 999px; }
.role-admin .side { height: auto; max-height: 100dvh; }
.role-admin .side .glass.nav-card { flex: none; }
.role-admin .side-foot { margin-top: 24px; }
@media (max-width: 900px) { .demo-bar .desc, .demo-bar .lg { display: none; } .demo-bar { margin: 8px 10px 0; flex-wrap: wrap; justify-content: space-between; row-gap: 6px; } #demo-user { order: 5; flex: 1 0 100%; } }
"""

def wrap(js, name):
    return f'window.{name} = function () {{\n{js}\n}};'

html = f"""<title>İş Takip Demo</title>
<meta name="description" content="Destek personeli günlük iş takip uygulamasının etkileşimli demosu">
<style>
{css}
{demo_css}
</style>
<div class="bg-scene" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<div class="demo-bar glass" role="region" aria-label="Demo görünümü">
  <span class="demo-logo" role="img" aria-label="Demo" title="Demo"><svg viewBox="185 312 683 400" aria-hidden="true">
    <path class="l1" d="M191 550H300Q324 550 337 571L357 602L289 706Z"/><path class="l2" d="M314 706L483 444Q503 412 545 411H638L480 657Q450 704 390 706Z"/>
    <path class="l3" d="M449 706Q485 702 503 672L706 352Q727 318 768 317H862L636 672Q614 705 576 706Z"/></svg></span>
  <span class="desc">Örnek verilerle çalışır; yaptığınız değişiklikler yalnızca bu tarayıcıda saklanır.</span>
  <div class="seg" role="radiogroup" aria-label="Görünüm">
    <label><input type="radio" name="demo-mode" id="demo-admin" value="admin"><span>Yönetici<i class="lg"> paneli</i></span></label>
    <label><input type="radio" name="demo-mode" id="demo-staff" value="staff"><span>Personel<i class="lg"> telefonu</i></span></label>
  </div>
  <select id="demo-user" aria-label="Personel ekranında gösterilecek kişi" hidden></select>
  <button class="btn sm ghost" id="demo-reset" type="button" title="Örnek verileri baştan yükle">Sıfırla</button>
</div>
<div id="app"></div>
<script>
{read('demo/mock.js')}
</script>
<script>
{read('assets/core.js')}
</script>
<script>
{wrap(read('assets/admin.js'), '__runAdmin')}
{wrap(read('assets/staff.js'), '__runStaff')}
(function () {{
  App.api = DEMO.api;
  App.photoUrl = DEMO.photo;
  App.download = function () {{ App.toast('Demoda dosya indirilemez. Gerçek kurulumda rapor Excel’de açılan bir CSV olarak iner.', 'info', {{ duration: 5000 }}); }};
  App.logout = function () {{ App.toast('Demoda çıkış yok. Görünümü üstteki çubuktan değiştirebilirsiniz.', 'info'); }};
  document.addEventListener('click', function (e) {{
    var a = e.target.closest && e.target.closest('a[href^="index.php"]');
    if (!a) return;
    e.preventDefault();
    DEMO.switchTo(a.getAttribute('href').indexOf('view=staff') >= 0 ? 'staff' : 'admin');
  }}, true);
  document.getElementById('demo-' + DEMO.mode).checked = true;
  var who = document.getElementById('demo-user');
  who.innerHTML = DEMO.staff.map(function (u) {{
    return '<option value="' + App.h(u.username) + '"' + (u.username === DEMO.staffUser ? ' selected' : '') + '>' + App.h(u.name) + '</option>';
  }}).join('');
  who.hidden = DEMO.mode !== 'staff';
  who.onchange = function () {{ DEMO.switchStaff(who.value); }};
  document.querySelectorAll('input[name=demo-mode]').forEach(function (r) {{
    r.addEventListener('change', function () {{ DEMO.switchTo(r.value); }});
  }});
  document.getElementById('demo-reset').onclick = function () {{
    App.confirm('Tüm değişiklikler silinip örnek veriler yeniden yüklenecek.', {{ ok: 'Sıfırla', title: 'Demoyu sıfırla' }}).then(function (ok) {{ if (ok) DEMO.reset(); }});
  }};
  document.body.classList.add(DEMO.mode === 'admin' ? 'role-admin' : 'role-staff');
  if (DEMO.mode === 'admin') window.__runAdmin(); else window.__runStaff();
}})();
</script>
"""
out = root / 'demo' / 'istakip-demo.html'
out.write_text(html, encoding='utf-8')
print(out, len(html))
