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
.demo-bar .tag-demo { font-weight: 800; letter-spacing: .08em; text-transform: uppercase; font-size: 11px; color: var(--accent); }
.demo-bar .desc { color: var(--muted); flex: 1; min-width: 180px; }
.demo-bar .seg span { padding: 6px 12px; }
.role-admin .side { height: auto; max-height: 100dvh; }
.role-admin .side .glass.nav-card { flex: none; }
.role-admin .side-foot { margin-top: 24px; }
@media (max-width: 900px) { .demo-bar .desc, .demo-bar .lg { display: none; } .demo-bar { margin: 8px 10px 0; flex-wrap: nowrap; justify-content: space-between; } }
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
  <span class="tag-demo">Demo</span>
  <span class="desc">Örnek verilerle çalışır; yaptığınız değişiklikler yalnızca bu tarayıcıda saklanır.</span>
  <div class="seg" role="radiogroup" aria-label="Görünüm">
    <label><input type="radio" name="demo-mode" id="demo-admin" value="admin"><span>Yönetici<span class="lg"> paneli</span></span></label>
    <label><input type="radio" name="demo-mode" id="demo-staff" value="staff"><span>Personel<span class="lg"> telefonu</span></span></label>
  </div>
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
