<?php
declare(strict_types=1);

// Dış kullanıcılar için sorun bildirme sayfası: odalardaki karekodlar buraya yönlendirir (report.php?t=…).
require __DIR__ . '/lib/bootstrap.php';

if (!app_config()) {
    http_response_code(404);
    exit('Uygulama kurulmamış.');
}
start_session();
migrate_schema();
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
$company = settings_all()['company_name'] ?? '';
$v = APP_VERSION;
?><!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#eef0ff">
<meta name="csrf" content="<?= e(csrf_token()) ?>">
<title>Sorun bildir · <?= e($company) ?></title>
<link rel="icon" href="assets/icon.svg?v=<?= $v ?>" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/icon-180.png?v=<?= $v ?>" sizes="180x180">
<link rel="stylesheet" href="assets/app.css?v=<?= $v ?>">
</head>
<body class="auth-page public-report">
<div class="bg-scene" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<main class="auth-wrap"><div id="report"></div></main>
<script>window.BOOT = <?= json_encode(['token' => (string)($_GET['t'] ?? ''), 'company' => $company], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<script src="assets/core.js?v=<?= $v ?>"></script>
<script src="assets/report.js?v=<?= $v ?>"></script>
</body>
</html>
