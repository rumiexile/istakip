<?php
declare(strict_types=1);

// Fotoğraflar data/ altında saklanır ve yalnızca giriş yapmış kullanıcılara gösterilir.
require __DIR__ . '/lib/bootstrap.php';

if (!app_config()) {
    http_response_code(404);
    exit;
}
start_session();
$u = current_user();
$id = (int)($_GET['id'] ?? 0);
$row = $u ? q('SELECT c.photo, c.user_id, p.user_id AS plan_user FROM completions c JOIN plans p ON p.id = c.plan_id WHERE c.id = ?', [$id])->fetch() : null;
if (!$row || !$row['photo'] || ($u['role'] !== 'admin' && (int)$row['user_id'] !== (int)$u['id'])) {
    http_response_code(404);
    exit;
}
$file = realpath(DATA_DIR . '/uploads/' . $row['photo']);
$base = realpath(DATA_DIR . '/uploads');
if (!$file || !$base || strpos($file, $base . DIRECTORY_SEPARATOR) !== 0) {
    http_response_code(404);
    exit;
}
$types = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
header('Content-Type: ' . ($types[pathinfo($file, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
header('Content-Length: ' . filesize($file));
header('Cache-Control: private, max-age=86400');
readfile($file);
