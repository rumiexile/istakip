<?php
declare(strict_types=1);

define('APP_ROOT', dirname(__DIR__));
define('APP_VERSION', '1.2.9');
// YÖKAK logosu (giriş, kurulum ve uygulama başlıklarında kullanılır)
define('LOGO_SVG', '<svg class="logo" viewBox="185 312 683 400" aria-hidden="true"><path class="l1" d="M191 550H300Q324 550 337 571L357 602L289 706Z"/><path class="l2" d="M314 706L483 444Q503 412 545 411H638L480 657Q450 704 390 706Z"/><path class="l3" d="M449 706Q485 702 503 672L706 352Q727 318 768 317H862L636 672Q614 705 576 706Z"/></svg>');
define('DATA_DIR', APP_ROOT . '/data');

mb_internal_encoding('UTF-8');

function app_config(): ?array
{
    static $cfg = false;
    if ($cfg === false) {
        $f = APP_ROOT . '/config.php';
        $cfg = is_file($f) ? require $f : null;
        if (is_array($cfg)) {
            date_default_timezone_set($cfg['timezone'] ?? 'Europe/Istanbul');
        }
    }
    return $cfg ?: null;
}

function db_connect(array $d): PDO
{
    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    if (($d['driver'] ?? 'mysql') === 'sqlite') {
        $path = $d['path'] ?? 'data/istakip.sqlite';
        if ($path[0] !== '/') {
            $path = APP_ROOT . '/' . $path;
        }
        $pdo = new PDO('sqlite:' . $path, null, null, $opts);
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        return $pdo;
    }
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $d['host'] ?? 'localhost',
        (int)($d['port'] ?? 3306),
        $d['name'] ?? ''
    );
    return new PDO($dsn, $d['user'] ?? '', $d['pass'] ?? '', $opts);
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = app_config();
        if (!$c) {
            throw new RuntimeException('Uygulama kurulmamış.');
        }
        $pdo = db_connect($c['db']);
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function now_str(): string
{
    return date('Y-m-d H:i:s');
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || ((int)($_SERVER['SERVER_PORT'] ?? 0) === 443);
}

function ensure_dir(string $dir): void
{
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    // Paylaşımlı hostinglerde varsayılan oturum klasörü sık temizlenir;
    // personelin telefonda oturumu açık kalsın diye kendi klasörümüzü kullanıyoruz.
    $dir = DATA_DIR . '/sessions';
    ensure_dir($dir);
    if (is_writable($dir)) {
        session_save_path($dir);
    }
    $life = 60 * 60 * 24 * 30;
    ini_set('session.gc_maxlifetime', (string)$life);
    ini_set('session.use_strict_mode', '1');
    $path = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/';
    session_name('ISTAKIP');
    session_set_cookie_params([
        'lifetime' => $life,
        'path' => $path,
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}

function csrf_token(): string
{
    return $_SESSION['csrf'] ?? '';
}

function current_user(): ?array
{
    static $u = false;
    if ($u !== false) {
        return $u;
    }
    $u = null;
    $id = (int)($_SESSION['uid'] ?? 0);
    if ($id > 0) {
        $row = q('SELECT id, name, username, role, phone FROM users WHERE id = ? AND active = 1', [$id])->fetch();
        $u = $row ?: null;
    }
    return $u;
}

function settings_all(): array
{
    static $s = null;
    if ($s === null) {
        $s = [
            'company_name' => 'İş Takip',
            'work_days' => '1,2,3,4,5',
            'holidays' => '',
        ];
        foreach (q('SELECT k, v FROM settings')->fetchAll() as $r) {
            $s[$r['k']] = (string)$r['v'];
        }
    }
    return $s;
}

function setting_set(string $k, string $v): void
{
    $exists = q('SELECT 1 FROM settings WHERE k = ?', [$k])->fetchColumn();
    if ($exists) {
        q('UPDATE settings SET v = ? WHERE k = ?', [$v, $k]);
    } else {
        q('INSERT INTO settings (k, v) VALUES (?, ?)', [$k, $v]);
    }
}

function e(?string $s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Eski kurulumlara yeni tabloları ekler (tablolar IF NOT EXISTS ile oluşturulur). */
function migrate_schema(): void
{
    require_once __DIR__ . '/schema.php';
    $s = settings_all();
    if ((int)($s['schema_version'] ?? 1) >= SCHEMA_VERSION) {
        return;
    }
    schema_upgrade(db(), app_config()['db']['driver'] ?? 'mysql', (int)($s['schema_version'] ?? 1));
    setting_set('schema_version', (string)SCHEMA_VERSION);
}

/* ---------- dış kullanıcı sorun bildirimi ---------- */

const REPORT_CATEGORIES = [
    'clean' => 'Temizlik gerekiyor',
    'supply' => 'Malzeme bitti',
    'broken' => 'Arıza / tamir',
    'climate' => 'Isıtma / soğutma',
    'other' => 'Diğer',
];

/** Karekodu olmayan mekanlara tahmin edilemeyen bir anahtar verir. */
function ensure_qr_tokens(): void
{
    foreach (q('SELECT id FROM locations WHERE qr_token IS NULL OR qr_token = \'\'')->fetchAll() as $r) {
        q('UPDATE locations SET qr_token = ? WHERE id = ?', [bin2hex(random_bytes(10)), $r['id']]);
    }
}

function location_by_token(string $t): ?array
{
    if (!preg_match('/^[a-f0-9]{20}$/', $t)) {
        return null;
    }
    $row = q('SELECT id, name, description FROM locations WHERE qr_token = ? AND active = 1', [$t])->fetch();
    return $row ?: null;
}

/** IP adresini saklamadan, kötüye kullanımı sınırlamak için tuzlanmış özet. */
function ip_hash(): string
{
    $salt = settings_all()['ip_salt'] ?? '';
    if ($salt === '') {
        $salt = bin2hex(random_bytes(16));
        setting_set('ip_salt', $salt);
    }
    return hash('sha256', $salt . '|' . ($_SERVER['REMOTE_ADDR'] ?? ''));
}
