<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

if (!app_config()) {
    header('Location: install.php');
    exit;
}
start_session();
header('Cache-Control: no-store');
$user = current_user();
$settings = settings_all();
$company = $settings['company_name'];
$v = APP_VERSION;
?><!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#eef0ff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b1020" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="csrf" content="<?= e(csrf_token()) ?>">
<title><?= e($company) ?> · İş Takip</title>
<link rel="icon" href="assets/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/icon.svg">
<link rel="manifest" href="manifest.webmanifest">
<link rel="stylesheet" href="assets/app.css?v=<?= $v ?>">
</head>
<body class="<?= $user ? 'role-' . e($user['role']) : 'auth-page' ?>">
<div class="bg-scene" aria-hidden="true"><i></i><i></i><i></i><i></i></div>

<?php if (!$user): ?>
<main class="auth-wrap">
  <form class="glass auth-card" id="login-form" data-tilt>
    <div class="brand-mark big"><svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg></div>
    <h1><?= e($company) ?></h1>
    <p class="muted">Günlük iş takibi için giriş yapın</p>
    <label class="field"><span>Kullanıcı adı</span><input name="username" autocomplete="username" autocapitalize="none" required></label>
    <label class="field"><span>Şifre</span><input name="password" type="password" autocomplete="current-password" required></label>
    <div class="alert bad" hidden></div>
    <button class="btn primary block" type="submit"><span>Giriş yap</span></button>
  </form>
</main>
<script src="assets/core.js?v=<?= $v ?>"></script>
<script>App.initLogin();</script>
<?php else: ?>
<div id="app"></div>
<script>window.BOOT = <?= json_encode(['user' => $user, 'company' => $company], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<script src="assets/core.js?v=<?= $v ?>"></script>
<?php $staffView = $user['role'] !== 'admin' || ($_GET['view'] ?? '') === 'staff'; ?>
<script src="assets/<?= $staffView ? 'staff' : 'admin' ?>.js?v=<?= $v ?>"></script>
<?php endif; ?>
</body>
</html>
