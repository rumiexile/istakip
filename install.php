<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/schema.php';

date_default_timezone_set('Europe/Istanbul');

$installed = is_file(APP_ROOT . '/config.php');
$error = null;
$done = false;
$staffCreated = [];
$v = fn(string $k, string $def = '') => e((string)($_POST[$k] ?? $def));

if (!$installed && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    try {
        $driver = ($_POST['driver'] ?? 'mysql') === 'sqlite' ? 'sqlite' : 'mysql';
        $dbc = ['driver' => $driver];
        if ($driver === 'mysql') {
            $dbc += [
                'host' => trim($_POST['db_host'] ?? 'localhost') ?: 'localhost',
                'port' => (int)($_POST['db_port'] ?? 3306) ?: 3306,
                'name' => trim($_POST['db_name'] ?? ''),
                'user' => trim($_POST['db_user'] ?? ''),
                'pass' => (string)($_POST['db_pass'] ?? ''),
            ];
            if ($dbc['name'] === '' || $dbc['user'] === '') {
                throw new RuntimeException('Veritabanı adı ve kullanıcısı gerekli.');
            }
        } else {
            $dbc['path'] = 'data/istakip-' . bin2hex(random_bytes(6)) . '.sqlite';
        }
        $company = trim($_POST['company'] ?? '') ?: 'İş Takip';
        $adminName = trim($_POST['admin_name'] ?? '');
        $adminUser = mb_strtolower(trim($_POST['admin_user'] ?? ''));
        $adminPass = (string)($_POST['admin_pass'] ?? '');
        if ($adminName === '' || !preg_match('/^[a-z0-9._-]{3,60}$/', $adminUser)) {
            throw new RuntimeException('Yönetici adı ve geçerli bir kullanıcı adı girin (küçük harf, rakam, nokta, tire; en az 3 karakter).');
        }
        if (mb_strlen($adminPass) < 8) {
            throw new RuntimeException('Yönetici şifresi en az 8 karakter olmalı.');
        }
        foreach (['', '/sessions', '/uploads'] as $sub) {
            ensure_dir(DATA_DIR . $sub);
        }
        if (!is_writable(DATA_DIR)) {
            throw new RuntimeException('data/ klasörü yazılabilir değil. cPanel Dosya Yöneticisi\'nden izinlerini 755 yapın.');
        }
        if (!is_writable(APP_ROOT)) {
            throw new RuntimeException('Uygulama klasörüne config.php yazılamıyor. Klasör izinlerini kontrol edin.');
        }

        $pdo = db_connect($dbc);
        schema_install($pdo, $driver);
        $hasUsers = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
        if ($hasUsers) {
            throw new RuntimeException('Bu veritabanında zaten kullanıcılar var. Boş bir veritabanı kullanın ya da mevcut config.php dosyanızı geri yükleyin.');
        }
        $now = date('Y-m-d H:i:s');
        $pdo->prepare('INSERT INTO users (name, username, password_hash, role, active, created_at) VALUES (?, ?, ?, \'admin\', 1, ?)')
            ->execute([$adminName, $adminUser, password_hash($adminPass, PASSWORD_DEFAULT), $now]);
        $ins = $pdo->prepare('INSERT INTO settings (k, v) VALUES (?, ?)');
        $ins->execute(['company_name', $company]);
        $ins->execute(['work_days', '1,2,3,4,5']);
        $ins->execute(['holidays', '']);
        $ins->execute(['schema_version', (string)SCHEMA_VERSION]);
        if (!empty($_POST['staff'])) {
            $staffCreated = schema_seed_staff($pdo);
        }
        if (!empty($_POST['seed'])) {
            schema_seed($pdo);
        }

        $config = [
            'db' => $dbc,
            'timezone' => 'Europe/Istanbul',
            'installed_at' => $now,
        ];
        $php = "<?php\n// İş Takip yapılandırması — kurulum sihirbazı tarafından oluşturuldu.\nreturn " . var_export($config, true) . ";\n";
        if (file_put_contents(APP_ROOT . '/config.php', $php, LOCK_EX) === false) {
            throw new RuntimeException('config.php yazılamadı.');
        }
        @chmod(APP_ROOT . '/config.php', 0640);
        $done = true;
    } catch (PDOException $ex) {
        $error = 'Veritabanına bağlanılamadı: ' . $ex->getMessage();
    } catch (Throwable $ex) {
        $error = $ex->getMessage();
    }
}
$driver = $_POST['driver'] ?? 'mysql';
?><!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Kurulum · İş Takip</title>
<link rel="icon" href="assets/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/app.css?v=<?= APP_VERSION ?>">
</head>
<body class="auth-page">
<div class="bg-scene" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<main class="auth-wrap">
  <section class="glass auth-card install-card">
    <div class="brand-mark big"><svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg></div>
<?php if ($installed && !$done): ?>
    <h1>Kurulum tamamlanmış</h1>
    <p class="muted">Uygulama zaten kurulu. Yeniden kurmak için sunucudaki <code>config.php</code> dosyasını silin.</p>
    <a class="btn primary block" href="index.php">Uygulamaya git</a>
<?php elseif ($done): ?>
    <h1>Kurulum tamamlandı 🎉</h1>
    <p class="muted">Yönetici hesabınızla giriş yapabilirsiniz. Güvenlik için <code>install.php</code> dosyasını sunucudan silmeniz önerilir.</p>
    <?php if ($staffCreated): ?>
    <div class="alert info"><b>Personel giriş bilgileri.</b> Bu şifreler yalnızca şimdi gösterilir; not alıp personele iletin.
      Unutulan şifreyi yönetici panelinde <b>Personel → Düzenle</b> ekranından yenileyebilirsiniz.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Ad soyad</th><th>Kullanıcı adı</th><th>Geçici şifre</th></tr></thead>
      <tbody><?php foreach ($staffCreated as [$n, $un, $pw]): ?>
        <tr><td><?= e($n) ?></td><td><code><?= e($un) ?></code></td><td><code><?= e($pw) ?></code></td></tr>
      <?php endforeach; ?></tbody></table></div>
    <?php endif; ?>
    <a class="btn primary block" href="index.php">Giriş yap</a>
<?php else: ?>
    <h1>İş Takip Kurulumu</h1>
    <p class="muted">cPanel'de <b>MySQL Veritabanları</b> bölümünden bir veritabanı ve kullanıcı oluşturup bilgilerini aşağıya girin.</p>
    <?php if ($error): ?><div class="alert bad"><?= e($error) ?></div><?php endif; ?>
    <form method="post" class="form" autocomplete="off">
      <fieldset>
        <legend>Veritabanı</legend>
        <div class="seg" role="radiogroup">
          <label><input type="radio" name="driver" value="mysql" <?= $driver !== 'sqlite' ? 'checked' : '' ?>><span>MySQL / MariaDB</span></label>
          <label><input type="radio" name="driver" value="sqlite" <?= $driver === 'sqlite' ? 'checked' : '' ?>><span>SQLite (dosya)</span></label>
        </div>
        <div class="mysql-only grid2">
          <label class="field"><span>Sunucu</span><input name="db_host" value="<?= $v('db_host', 'localhost') ?>"></label>
          <label class="field"><span>Port</span><input name="db_port" inputmode="numeric" value="<?= $v('db_port', '3306') ?>"></label>
          <label class="field"><span>Veritabanı adı</span><input name="db_name" value="<?= $v('db_name') ?>" placeholder="cpanelkullanici_istakip"></label>
          <label class="field"><span>Veritabanı kullanıcısı</span><input name="db_user" value="<?= $v('db_user') ?>"></label>
          <label class="field span2"><span>Veritabanı şifresi</span><input type="password" name="db_pass" value=""></label>
        </div>
        <p class="sqlite-only muted small">SQLite için ek ayar gerekmez; veriler <code>data/</code> klasöründe saklanır. Küçük ekipler için uygundur.</p>
      </fieldset>
      <fieldset>
        <legend>Kurum ve yönetici</legend>
        <div class="grid2">
          <label class="field span2"><span>Kurum adı</span><input name="company" value="<?= $v('company') ?>" placeholder="Örn. Merkez Bina Destek Hizmetleri"></label>
          <label class="field span2"><span>Yönetici ad soyad</span><input name="admin_name" value="<?= $v('admin_name') ?>" required></label>
          <label class="field"><span>Kullanıcı adı</span><input name="admin_user" value="<?= $v('admin_user', 'yonetici') ?>" required autocapitalize="none"></label>
          <label class="field"><span>Şifre (en az 8)</span><input type="password" name="admin_pass" required minlength="8"></label>
        </div>
        <label class="check"><input type="checkbox" name="staff" value="1" <?= ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !empty($_POST['staff']) ? 'checked' : '' ?>><span></span>Ön tanımlı personeli ekle: <?= e(implode(', ', array_column(DEFAULT_STAFF, 0))) ?></label>
        <label class="check"><input type="checkbox" name="seed" value="1" <?= ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !empty($_POST['seed']) ? 'checked' : '' ?>><span></span>Örnek mekanları, işleri ve iş paketi şablonlarını yükle</label>
      </fieldset>
      <button class="btn primary block" type="submit">Kurulumu başlat</button>
    </form>
<?php endif; ?>
  </section>
</main>
<script>
  (function () {
    var f = document.querySelector('form'); if (!f) return;
    function sync() {
      var sqlite = f.querySelector('input[name=driver]:checked').value === 'sqlite';
      f.querySelector('.mysql-only').style.display = sqlite ? 'none' : '';
      f.querySelector('.sqlite-only').style.display = sqlite ? '' : 'none';
    }
    f.addEventListener('change', sync); sync();
  })();
</script>
</body>
</html>
