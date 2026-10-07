<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/schedule.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out($data = null): void
{
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!app_config()) {
    fail('Uygulama henüz kurulmamış.', 503);
}

start_session();
migrate_schema();

const HISTORY_DAYS = 60;

$action = (string)($_GET['a'] ?? '');
$isPost = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
$in = [];
if ($isPost) {
    $ctype = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($ctype, 'application/json') !== false) {
        $in = json_decode((string)file_get_contents('php://input'), true) ?: [];
    } else {
        $in = $_POST;
    }
    $tok = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($in['_csrf'] ?? '');
    if (!is_string($tok) || !hash_equals(csrf_token(), $tok)) {
        fail('Oturum doğrulaması başarısız. Sayfayı yenileyin.', 419);
    }
}
$in = array_merge($_GET, $in);

/* ---------- girdi yardımcıları ---------- */

function s_in(string $k, int $max = 255, bool $req = false, string $label = ''): ?string
{
    global $in;
    $v = isset($in[$k]) && !is_array($in[$k]) ? trim((string)$in[$k]) : '';
    if ($v === '') {
        if ($req) {
            fail(($label ?: $k) . ' boş bırakılamaz.');
        }
        return null;
    }
    return mb_substr($v, 0, $max);
}

function i_in(string $k, ?int $def = null): ?int
{
    global $in;
    if (!isset($in[$k]) || $in[$k] === '' || $in[$k] === null) {
        return $def;
    }
    return (int)$in[$k];
}

function d_in(string $k, bool $req = false): ?string
{
    $v = s_in($k, 10);
    if ($v === null) {
        if ($req) {
            fail('Tarih gerekli.');
        }
        return null;
    }
    if (!Sched::validDate($v)) {
        fail('Geçersiz tarih: ' . $v);
    }
    return $v;
}

function need_user(): array
{
    $u = current_user();
    if (!$u) {
        fail('Oturum süresi doldu. Lütfen tekrar giriş yapın.', 401);
    }
    return $u;
}

function need_admin(): array
{
    $u = need_user();
    if ($u['role'] !== 'admin') {
        fail('Bu işlem için yönetici yetkisi gerekli.', 403);
    }
    return $u;
}

function need_post(): void
{
    global $isPost;
    if (!$isPost) {
        fail('POST gerekli.', 405);
    }
}

function today_ctx(): array
{
    return [Sched::dn(date('Y-m-d')), date('H:i')];
}

/** Sıklık alanlarını doğrular ve normalleştirir. */
function freq_from(array $src): array
{
    $type = (string)($src['freq_type'] ?? 'daily');
    if (!in_array($type, Sched::TYPES, true)) {
        fail('Geçersiz sıklık türü.');
    }
    $n = max(1, min(365, (int)($src['freq_interval'] ?? 1)));
    $wd = null;
    $md = null;
    if ($type === 'weekly') {
        $days = array_values(array_unique(array_filter(
            array_map('intval', is_array($src['weekdays'] ?? null) ? $src['weekdays'] : explode(',', (string)($src['weekdays'] ?? ''))),
            fn($d) => $d >= 1 && $d <= 7
        )));
        sort($days);
        if (!$days) {
            fail('Haftalık işler için en az bir gün seçin.');
        }
        $wd = implode(',', $days);
    }
    if ($type === 'monthly') {
        $md = max(1, min(31, (int)($src['month_day'] ?? 1)));
    }
    if ($type === 'daily') {
        $n = 1;
    }
    $t = trim((string)($src['due_time'] ?? ''));
    if ($t !== '' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t)) {
        fail('Saat SS:DD biçiminde olmalı.');
    }
    return [
        'freq_type' => $type,
        'freq_interval' => $n,
        'weekdays' => $wd,
        'month_day' => $md,
        'due_time' => $t !== '' ? $t : null,
    ];
}

/** İş tanımını id ya da adla bulur, yoksa oluşturur. */
/** Mekan ile iş arasında ilişki yoksa kurar. */
function link_task(int $locationId, int $taskId): void
{
    if (!q('SELECT 1 FROM location_tasks WHERE location_id = ? AND task_id = ?', [$locationId, $taskId])->fetchColumn()) {
        q('INSERT INTO location_tasks (location_id, task_id) VALUES (?, ?)', [$locationId, $taskId]);
    }
}

/** "id" => [ilişkili id'ler] */
function link_index(string $key, string $val): array
{
    $out = [];
    foreach (q("SELECT lt.$key AS k, lt.$val AS v FROM location_tasks lt
                JOIN locations l ON l.id = lt.location_id AND l.active = 1
                JOIN tasks t ON t.id = lt.task_id AND t.active = 1")->fetchAll() as $r) {
        $out[(int)$r['k']][] = (int)$r['v'];
    }
    return $out;
}

function ids_in(string $k): array
{
    global $in;
    return array_values(array_unique(array_filter(array_map('intval', (array)($in[$k] ?? [])))));
}

function resolve_task(array $src): int
{
    $id = (int)($src['task_id'] ?? 0);
    if ($id > 0 && q('SELECT 1 FROM tasks WHERE id = ?', [$id])->fetchColumn()) {
        return $id;
    }
    $name = trim((string)($src['task_name'] ?? ''));
    if ($name === '') {
        fail('İş adı gerekli.');
    }
    $name = mb_substr($name, 0, 200);
    foreach (q('SELECT id, name, active FROM tasks')->fetchAll() as $t) {
        if (mb_strtolower($t['name']) === mb_strtolower($name)) {
            if (!(int)$t['active']) {
                q('UPDATE tasks SET active = 1 WHERE id = ?', [$t['id']]);
            }
            return (int)$t['id'];
        }
    }
    q('INSERT INTO tasks (name, active, created_at) VALUES (?, 1, ?)', [$name, now_str()]);
    return (int)db()->lastInsertId();
}

function plans_query(string $where = '1=1', array $params = []): array
{
    return q("SELECT p.*, t.name AS task_name, t.description AS task_desc, l.name AS location_name,
                     l.sort_order AS location_sort, u.name AS user_name, pk.name AS package_name, pk.color AS package_color
              FROM plans p
              JOIN tasks t ON t.id = p.task_id
              JOIN locations l ON l.id = p.location_id
              LEFT JOIN users u ON u.id = p.user_id
              LEFT JOIN packages pk ON pk.id = p.package_id
              WHERE $where
              ORDER BY l.sort_order, l.name, p.due_time, t.name", $params)->fetchAll();
}

function completions_map(string $from, string $to): array
{
    $map = [];
    $rows = q('SELECT c.id, c.plan_id, c.occ_date, c.user_id, c.status, c.note, c.photo, c.created_at, u.name AS by_name
               FROM completions c LEFT JOIN users u ON u.id = c.user_id
               WHERE c.occ_date BETWEEN ? AND ?', [$from, $to])->fetchAll();
    foreach ($rows as $r) {
        $map[$r['plan_id'] . '|' . substr((string)$r['occ_date'], 0, 10)] = $r;
    }
    return $map;
}

/** "kullanıcı|tarih" => izin kaydı */
function leaves_map(string $from, string $to): array
{
    $map = [];
    foreach (q('SELECT user_id, leave_date, note FROM leaves WHERE leave_date BETWEEN ? AND ?', [$from, $to])->fetchAll() as $r) {
        $map[$r['user_id'] . '|' . substr((string)$r['leave_date'], 0, 10)] = $r;
    }
    return $map;
}

/** Sched::status + izin: sorumlu kişi o gün izinliyse ve iş yapılmamışsa "leave". */
function occ_status(Sched $S, array $p, int $occ, ?array $c, int $today, string $nowHm, array $leaves): string
{
    if (!$c && $p['user_id'] !== null && isset($leaves[$p['user_id'] . '|' . Sched::ymd($occ)])) {
        return 'leave';
    }
    return $S->status($p, $occ, $c, $today, $nowHm);
}

function item_out(array $p, int $occ, ?array $c, string $status): array
{
    $occYmd = Sched::ymd($occ);
    $late = false;
    if ($c) {
        $deadline = $occYmd . ' ' . ($p['due_time'] ?: '23:59') . ':59';
        $late = substr((string)$c['created_at'], 0, 10) > $occYmd || (string)$c['created_at'] > $deadline;
    }
    return [
        'plan_id' => (int)$p['id'],
        'occ_date' => $occYmd,
        'task' => $p['task_name'],
        'task_desc' => $p['task_desc'],
        'location' => $p['location_name'],
        'location_id' => (int)$p['location_id'],
        'user' => $p['user_name'],
        'user_id' => $p['user_id'] !== null ? (int)$p['user_id'] : null,
        'package' => $p['package_name'],
        'color' => $p['package_color'] ?: null,
        'due_time' => $p['due_time'],
        'freq' => Sched::label($p),
        'note' => $p['note'],
        'status' => $status,
        'completion' => $c ? [
            'id' => (int)$c['id'],
            'by' => $c['by_name'],
            'by_id' => (int)$c['user_id'],
            'at' => $c['created_at'],
            'status' => $c['status'],
            'note' => $c['note'],
            'photo' => (bool)$c['photo'],
            'late' => $late,
        ] : null,
    ];
}

/**
 * Belirli bir gün için listelenecek işler: o gün yapılması gerekenler ve
 * daha önceki tekrarlardan kalıp hâlâ açık olanlar.
 */
function day_items(Sched $S, array $plans, int $day): array
{
    [$today, $nowHm] = today_ctx();
    $maxLb = 20;
    $prepped = [];
    foreach ($plans as $p) {
        $p = $S->prep($p);
        $maxLb = max($maxLb, $S->lookback($p));
        $prepped[] = $p;
    }
    $cmap = completions_map(Sched::ymd($day - $maxLb), Sched::ymd($day));
    $leaves = leaves_map(Sched::ymd($day - $maxLb), Sched::ymd($day));
    $items = [];
    foreach ($prepped as $p) {
        $occ = $S->latest($p, $day);
        if ($occ === null) {
            continue;
        }
        $c = $cmap[$p['id'] . '|' . Sched::ymd($occ)] ?? null;
        if ($occ < $day) {
            // Önceki tekrardan devreden iş: yalnızca o gün hâlâ açıksa göster.
            if ($c && substr((string)$c['created_at'], 0, 10) < Sched::ymd($day)) {
                continue;
            }
        }
        $st = occ_status($S, $p, $occ, $c, $today, $nowHm, $leaves);
        if (($st === 'missed' || $st === 'leave') && $occ < $day) {
            continue;
        }
        $items[] = item_out($p, $occ, $c, $st);
    }
    return $items;
}

function tally(array $items): array
{
    $t = ['total' => 0, 'done' => 0, 'issue' => 0, 'pending' => 0, 'overdue' => 0, 'missed' => 0, 'upcoming' => 0, 'leave' => 0];
    foreach ($items as $i) {
        $t['total']++;
        $t[$i['status']]++;
    }
    // İzinli günlerdeki işler başarı oranını etkilemez.
    $closed = $t['done'] + $t['issue'];
    $base = $t['total'] - $t['leave'];
    $t['rate'] = $base > 0 ? round($closed * 100 / $base) : ($t['total'] ? 100 : 0);
    return $t;
}

function group_tally(array $items, string $key, string $empty): array
{
    $g = [];
    foreach ($items as $i) {
        $name = $i[$key] ?? null;
        $name = $name ?: $empty;
        $g[$name][] = $i;
    }
    $out = [];
    foreach ($g as $name => $list) {
        $out[] = ['name' => $name] + tally($list);
    }
    usort($out, fn($a, $b) => $a['rate'] <=> $b['rate'] ?: strcmp($a['name'], $b['name']));
    return $out;
}

function handle_upload(): ?string
{
    if (empty($_FILES['photo']) || ($_FILES['photo']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    $f = $_FILES['photo'];
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
        fail('Fotoğraf yüklenemedi.');
    }
    if ($f['size'] > 8 * 1024 * 1024) {
        fail('Fotoğraf 8 MB\'tan büyük olamaz.');
    }
    $info = @getimagesize($f['tmp_name']);
    $ext = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'][$info[2] ?? 0] ?? null;
    if (!$ext) {
        fail('Yalnızca JPG, PNG veya WEBP fotoğraf yüklenebilir.');
    }
    $rel = date('Y/m') . '/' . bin2hex(random_bytes(12)) . '.' . $ext;
    $dir = DATA_DIR . '/uploads/' . dirname($rel);
    ensure_dir($dir);
    if (!move_uploaded_file($f['tmp_name'], DATA_DIR . '/uploads/' . $rel)) {
        fail('Fotoğraf kaydedilemedi. data/uploads klasörünün yazma iznini kontrol edin.');
    }
    return $rel;
}

/* ---------- işlemler ---------- */

try {
    switch ($action) {

        case 'login': {
            need_post();
            $username = s_in('username', 60, true, 'Kullanıcı adı');
            $password = (string)($in['password'] ?? '');
            $_SESSION['fails'] = (int)($_SESSION['fails'] ?? 0);
            if ($_SESSION['fails'] >= 5) {
                sleep(2);
            }
            $u = q('SELECT * FROM users WHERE username = ? AND active = 1', [mb_strtolower($username)])->fetch();
            if (!$u || !password_verify($password, $u['password_hash'])) {
                $_SESSION['fails']++;
                usleep(400000);
                fail('Kullanıcı adı veya şifre hatalı.', 401);
            }
            session_regenerate_id(true);
            $_SESSION['uid'] = (int)$u['id'];
            $_SESSION['fails'] = 0;
            out(['role' => $u['role']]);
        }

        case 'logout': {
            need_post();
            $_SESSION = [];
            session_destroy();
            out();
        }

        case 'me':
            out(need_user());

        case 'password': {
            need_post();
            $u = need_user();
            $cur = (string)($in['current'] ?? '');
            $new = (string)($in['new'] ?? '');
            $row = q('SELECT password_hash FROM users WHERE id = ?', [$u['id']])->fetch();
            if (!password_verify($cur, $row['password_hash'])) {
                fail('Mevcut şifre hatalı.');
            }
            if (mb_strlen($new) < 6) {
                fail('Yeni şifre en az 6 karakter olmalı.');
            }
            q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $u['id']]);
            out();
        }

        /* ----- personel ekranı ----- */

        case 'my_day': {
            $u = need_user();
            $S = Sched::fromSettings();
            [$today] = today_ctx();
            $day = Sched::dn(d_in('date') ?? Sched::ymd($today));
            $day = max($today - HISTORY_DAYS, min($day, $today));
            $plans = plans_query('p.active = 1 AND (p.user_id = ? OR p.user_id IS NULL)', [$u['id']]);
            if ($day < $today) {
                // Geçmiş günlerde, sonradan kaldırılmış atamalar da görünsün.
                $plans = plans_query('p.start_date <= ? AND (p.end_date IS NULL OR p.end_date >= ?) AND (p.user_id = ? OR p.user_id IS NULL)',
                    [Sched::ymd($day), Sched::ymd($day), $u['id']]);
            }
            $items = day_items($S, $plans, $day);
            $leave = q('SELECT note FROM leaves WHERE user_id = ? AND leave_date = ?', [$u['id'], Sched::ymd($day)])->fetch();
            out([
                'date' => Sched::ymd($day),
                'today' => Sched::ymd($today),
                'workday' => $S->isWorkday($day),
                'on_leave' => (bool)$leave,
                'leave_note' => $leave['note'] ?? null,
                'items' => $items,
                'tally' => tally($items),
            ]);
        }

        case 'my_history': {
            // Son günlerin özet durumu (personel ekranındaki gün şeridi için).
            $u = need_user();
            $S = Sched::fromSettings();
            [$today, $nowHm] = today_ctx();
            $from = $today - 13;
            $cmap = completions_map(Sched::ymd($from), Sched::ymd($today));
            $leaves = leaves_map(Sched::ymd($from), Sched::ymd($today));
            $days = [];
            for ($d = $from; $d <= $today; $d++) {
                $days[$d] = ['date' => Sched::ymd($d), 'workday' => $S->isWorkday($d), 'on_leave' => isset($leaves[$u['id'] . '|' . Sched::ymd($d)]), 'items' => []];
            }
            $plans = plans_query('p.start_date <= ? AND (p.end_date IS NULL OR p.end_date >= ?) AND (p.user_id = ? OR p.user_id IS NULL)',
                [Sched::ymd($today), Sched::ymd($from), $u['id']]);
            foreach ($plans as $p) {
                $p = $S->prep($p);
                foreach ($S->occurrences($p, $from, $today) as $o) {
                    $c = $cmap[$p['id'] . '|' . Sched::ymd($o)] ?? null;
                    $days[$o]['items'][] = ['status' => occ_status($S, $p, $o, $c, $today, $nowHm, $leaves)];
                }
            }
            out(array_values(array_map(function ($d) {
                $t = tally($d['items']);
                unset($d['items']);
                return $d + ['tally' => $t];
            }, $days)));
        }

        case 'leave_set': case 'leave_delete': {
            need_post();
            $u = need_user();
            $uid = (int)$u['id'];
            if ($u['role'] === 'admin' && i_in('user_id')) {
                $uid = (int)i_in('user_id');
            }
            $date = d_in('date', true);
            [$today] = today_ctx();
            if ($u['role'] !== 'admin' && Sched::dn($date) < $today) {
                fail('Geçmiş günler için izin yalnızca yönetici tarafından girilebilir.');
            }
            if (Sched::dn($date) > $today + 365) {
                fail('En fazla bir yıl sonrası için izin girilebilir.');
            }
            if ($action === 'leave_delete') {
                q('DELETE FROM leaves WHERE user_id = ? AND leave_date = ?', [$uid, $date]);
                out();
            }
            $to = d_in('to') ?? $date;
            if ($to < $date || Sched::dn($to) - Sched::dn($date) > 60) {
                fail('İzin aralığı en fazla 61 gün olabilir.');
            }
            $note = s_in('note', 255);
            $n = 0;
            for ($d = Sched::dn($date); $d <= Sched::dn($to); $d++) {
                if (!q('SELECT 1 FROM leaves WHERE user_id = ? AND leave_date = ?', [$uid, Sched::ymd($d)])->fetchColumn()) {
                    q('INSERT INTO leaves (user_id, leave_date, note, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
                        [$uid, Sched::ymd($d), $note, $u['id'], now_str()]);
                    $n++;
                }
            }
            out(['count' => $n]);
        }

        case 'leaves': {
            // Personel kendi izinlerini, yönetici herkesin (veya seçilen kişinin) bugünden sonraki izinlerini görür.
            $u = need_user();
            $uid = $u['role'] === 'admin' ? i_in('user_id') : (int)$u['id'];
            $from = d_in('from') ?? date('Y-m-d');
            $rows = q('SELECT l.user_id, l.leave_date, l.note, u.name FROM leaves l JOIN users u ON u.id = l.user_id
                       WHERE l.leave_date >= ?' . ($uid ? ' AND l.user_id = ?' : '') . ' ORDER BY l.leave_date, u.name LIMIT 300',
                $uid ? [$from, $uid] : [$from])->fetchAll();
            foreach ($rows as &$r) {
                $r['leave_date'] = substr((string)$r['leave_date'], 0, 10);
                $r['user_id'] = (int)$r['user_id'];
            }
            out($rows);
        }

        case 'complete': {
            need_post();
            $u = need_user();
            $planId = i_in('plan_id', 0);
            $occ = d_in('occ_date', true);
            $status = ($in['status'] ?? 'done') === 'issue' ? 'issue' : 'done';
            $note = s_in('note', 1000);
            $p = plans_query('p.id = ? AND p.active = 1', [$planId])[0] ?? null;
            if (!$p) {
                fail('İş bulunamadı.', 404);
            }
            if ($u['role'] !== 'admin' && $p['user_id'] !== null && (int)$p['user_id'] !== (int)$u['id']) {
                fail('Bu iş size atanmamış.', 403);
            }
            $S = Sched::fromSettings();
            $pp = $S->prep($p);
            [$today, $nowHm] = today_ctx();
            $o = Sched::dn($occ);
            if (!$S->isDue($pp, $o) || $o > $today) {
                fail('Bu tarih için böyle bir iş yok.');
            }
            if ($u['role'] !== 'admin' && $S->status($pp, $o, null, $today, $nowHm) === 'missed') {
                fail('Bu işin süresi geçti; artık işaretlenemez.');
            }
            if ($status === 'issue' && !$note) {
                fail('Sorun bildirirken kısa bir açıklama yazın.');
            }
            if (q('SELECT 1 FROM completions WHERE plan_id = ? AND occ_date = ?', [$planId, $occ])->fetchColumn()) {
                fail('Bu iş zaten işaretlenmiş.', 409);
            }
            $photo = handle_upload();
            q('INSERT INTO completions (plan_id, occ_date, user_id, status, note, photo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$planId, $occ, $u['id'], $status, $note, $photo, now_str()]);
            $c = completions_map($occ, $occ)[$planId . '|' . $occ];
            out(item_out($pp, $o, $c, $S->status($pp, $o, $c, $today, $nowHm)));
        }

        case 'uncomplete': {
            need_post();
            $u = need_user();
            $planId = i_in('plan_id', 0);
            $occ = d_in('occ_date', true);
            $c = q('SELECT * FROM completions WHERE plan_id = ? AND occ_date = ?', [$planId, $occ])->fetch();
            if (!$c) {
                fail('Kayıt bulunamadı.', 404);
            }
            if ($u['role'] !== 'admin') {
                if ((int)$c['user_id'] !== (int)$u['id']) {
                    fail('Yalnızca kendi işaretlediğiniz işleri geri alabilirsiniz.', 403);
                }
                if (substr((string)$c['created_at'], 0, 10) !== date('Y-m-d')) {
                    fail('Geçmiş günlerdeki kayıtlar geri alınamaz.', 403);
                }
            }
            q('DELETE FROM completions WHERE id = ?', [$c['id']]);
            if ($c['photo']) {
                @unlink(DATA_DIR . '/uploads/' . $c['photo']);
            }
            out();
        }

        /* ----- yönetici paneli ----- */

        case 'dashboard': {
            need_admin();
            $S = Sched::fromSettings();
            [$today, $nowHm] = today_ctx();
            $date = d_in('date') ?? Sched::ymd($today);
            $day = min(Sched::dn($date), $today);
            $plans = plans_query('p.active = 1');
            $items = day_items($S, $plans, $day);

            // Son 7 günde yapılmayan işler
            $missed = [];
            $from = $day - 7;
            $cmap = completions_map(Sched::ymd($from), Sched::ymd($day));
            $leaves = leaves_map(Sched::ymd($from), Sched::ymd($day));
            foreach (plans_query('p.start_date <= ?', [Sched::ymd($day)]) as $p) {
                $p = $S->prep($p);
                foreach ($S->occurrences($p, $from, $day - 1) as $o) {
                    $c = $cmap[$p['id'] . '|' . Sched::ymd($o)] ?? null;
                    if (!$c && occ_status($S, $p, $o, null, $today, $nowHm, $leaves) === 'missed') {
                        $missed[] = item_out($p, $o, null, 'missed');
                    }
                }
            }
            usort($missed, fn($a, $b) => strcmp($b['occ_date'], $a['occ_date']));

            out([
                'date' => Sched::ymd($day),
                'today' => Sched::ymd($today),
                'now' => $nowHm,
                'workday' => $S->isWorkday($day),
                'items' => $items,
                'tally' => tally($items),
                'by_location' => group_tally($items, 'location', '-'),
                'by_user' => group_tally($items, 'user', 'Ortak (herkes)'),
                'missed' => array_slice($missed, 0, 200),
                'missed_count' => count($missed),
                'staff_count' => (int)q("SELECT COUNT(*) FROM users WHERE active = 1 AND role = 'staff'")->fetchColumn(),
                'on_leave' => q('SELECT u.id, u.name, l.note FROM leaves l JOIN users u ON u.id = l.user_id WHERE l.leave_date = ? AND u.active = 1 ORDER BY u.name',
                    [Sched::ymd($day)])->fetchAll(),
            ]);
        }

        case 'report': case 'report_csv': {
            need_admin();
            $S = Sched::fromSettings();
            [$today, $nowHm] = today_ctx();
            $to = min(Sched::dn(d_in('to') ?? Sched::ymd($today)), $today);
            $from = Sched::dn(d_in('from') ?? Sched::ymd($to - 6));
            if ($from > $to) {
                [$from, $to] = [$to, $from];
            }
            if ($to - $from > 92) {
                fail('Rapor aralığı en fazla 93 gün olabilir.');
            }
            $userF = i_in('user_id');
            $locF = i_in('location_id');
            $cmap = completions_map(Sched::ymd($from), Sched::ymd($to));
            $leaves = leaves_map(Sched::ymd($from), Sched::ymd($to));
            $items = [];
            foreach (plans_query('p.start_date <= ?', [Sched::ymd($to)]) as $p) {
                if ($userF && (int)$p['user_id'] !== $userF) {
                    continue;
                }
                if ($locF && (int)$p['location_id'] !== $locF) {
                    continue;
                }
                $p = $S->prep($p);
                foreach ($S->occurrences($p, $from, $to) as $o) {
                    $c = $cmap[$p['id'] . '|' . Sched::ymd($o)] ?? null;
                    $items[] = item_out($p, $o, $c, occ_status($S, $p, $o, $c, $today, $nowHm, $leaves));
                }
            }
            usort($items, fn($a, $b) => strcmp($a['occ_date'], $b['occ_date']) ?: strcmp($a['location'], $b['location']));

            if ($action === 'report_csv') {
                $labels = ['done' => 'Yapıldı', 'issue' => 'Sorun bildirildi', 'pending' => 'Bekliyor',
                    'overdue' => 'Gecikti', 'missed' => 'Yapılmadı', 'upcoming' => 'Planlandı', 'leave' => 'İzinli'];
                header('Content-Type: text/csv; charset=utf-8');
                header('Content-Disposition: attachment; filename="is-raporu-' . Sched::ymd($from) . '_' . Sched::ymd($to) . '.csv"');
                $fh = fopen('php://output', 'w');
                fwrite($fh, "\xEF\xBB\xBF");
                fputcsv($fh, ['Tarih', 'Mekan', 'İş', 'Sıklık', 'Hedef saat', 'Sorumlu', 'Durum', 'İşaretleyen', 'İşaretlenme zamanı', 'Geç', 'Not'], ';');
                foreach ($items as $i) {
                    $c = $i['completion'];
                    fputcsv($fh, [
                        $i['occ_date'], $i['location'], $i['task'], $i['freq'], $i['due_time'] ?? '',
                        $i['user'] ?? 'Ortak', $labels[$i['status']] ?? $i['status'],
                        $c['by'] ?? '', $c['at'] ?? '', ($c['late'] ?? false) ? 'Evet' : '', $c['note'] ?? '',
                    ], ';');
                }
                fclose($fh);
                exit;
            }

            $daily = [];
            for ($d = $from; $d <= $to; $d++) {
                $daily[Sched::ymd($d)] = ['date' => Sched::ymd($d), 'total' => 0, 'done' => 0, 'issue' => 0, 'missed' => 0, 'leave' => 0, 'open' => 0];
            }
            $lateDone = 0;
            foreach ($items as $i) {
                $r = &$daily[$i['occ_date']];
                $r['total']++;
                if (in_array($i['status'], ['done', 'issue', 'missed', 'leave'], true)) {
                    $r[$i['status']]++;
                } else {
                    $r['open']++;
                }
                unset($r);
                if ($i['completion'] && $i['completion']['late']) {
                    $lateDone++;
                }
            }
            $problems = array_values(array_filter($items, fn($i) => in_array($i['status'], ['missed', 'issue', 'overdue'], true)));
            usort($problems, fn($a, $b) => strcmp($b['occ_date'], $a['occ_date']));
            out([
                'from' => Sched::ymd($from),
                'to' => Sched::ymd($to),
                'summary' => tally($items) + ['late_done' => $lateDone],
                'by_user' => group_tally($items, 'user', 'Ortak (herkes)'),
                'by_location' => group_tally($items, 'location', '-'),
                'by_task' => group_tally($items, 'task', '-'),
                'daily' => array_values($daily),
                'problems' => array_slice($problems, 0, 300),
                'problem_count' => count($problems),
            ]);
        }

        /* ----- mekanlar ----- */

        case 'locations': {
            need_user();
            $rows = q('SELECT l.*, (SELECT COUNT(*) FROM plans p WHERE p.location_id = l.id AND p.active = 1) AS plan_count
                       FROM locations l WHERE l.active = 1 ORDER BY l.sort_order, l.name')->fetchAll();
            $links = link_index('location_id', 'task_id');
            foreach ($rows as &$r) {
                $r['task_ids'] = $links[(int)$r['id']] ?? [];
            }
            out($rows);
        }

        case 'location_save': {
            need_post();
            need_admin();
            $id = i_in('id', 0);
            $name = s_in('name', 150, true, 'Mekan adı');
            $desc = s_in('description', 1000);
            $sort = i_in('sort_order', 0);
            if ($id) {
                q('UPDATE locations SET name = ?, description = ?, sort_order = ? WHERE id = ?', [$name, $desc, $sort, $id]);
            } else {
                q('INSERT INTO locations (name, description, sort_order, active, created_at) VALUES (?, ?, ?, 1, ?)', [$name, $desc, $sort, now_str()]);
                $id = (int)db()->lastInsertId();
            }
            if (array_key_exists('task_ids', $in)) {
                q('DELETE FROM location_tasks WHERE location_id = ?', [$id]);
                foreach (ids_in('task_ids') as $tid) {
                    link_task($id, $tid);
                }
            }
            // Mekan formunda yeni yazılan işler
            foreach ((array)($in['new_tasks'] ?? []) as $nt) {
                if (trim((string)$nt) !== '') {
                    link_task($id, resolve_task(['task_name' => $nt]));
                }
            }
            out(['id' => $id]);
        }

        case 'location_delete': {
            need_post();
            need_admin();
            $id = i_in('id', 0);
            $n = (int)q('SELECT COUNT(*) FROM plans WHERE location_id = ? AND active = 1', [$id])->fetchColumn();
            if ($n) {
                fail("Bu mekanda $n aktif iş ataması var. Önce atamaları kaldırın.");
            }
            q('UPDATE locations SET active = 0 WHERE id = ?', [$id]);
            q('DELETE FROM location_tasks WHERE location_id = ?', [$id]);
            out();
        }

        case 'locations_order': {
            need_post();
            need_admin();
            foreach ((array)($in['ids'] ?? []) as $i => $id) {
                q('UPDATE locations SET sort_order = ? WHERE id = ?', [$i, (int)$id]);
            }
            out();
        }

        /* ----- iş tanımları ----- */

        case 'tasks': {
            need_admin();
            $rows = q('SELECT t.*, (SELECT COUNT(*) FROM plans p WHERE p.task_id = t.id AND p.active = 1) AS plan_count
                       FROM tasks t WHERE t.active = 1 ORDER BY t.name')->fetchAll();
            $links = link_index('task_id', 'location_id');
            foreach ($rows as &$r) {
                $r['location_ids'] = $links[(int)$r['id']] ?? [];
                $r['freq'] = Sched::label($r);
            }
            out($rows);
        }

        case 'task_save': {
            need_post();
            need_admin();
            $id = i_in('id', 0);
            $name = s_in('name', 200, true, 'İş adı');
            $desc = s_in('description', 2000);
            $f = freq_from($in);
            $fv = [$f['freq_type'], $f['freq_interval'], $f['weekdays'], $f['month_day'], $f['due_time']];
            if ($id) {
                q('UPDATE tasks SET name = ?, description = ?, freq_type = ?, freq_interval = ?, weekdays = ?, month_day = ?, due_time = ? WHERE id = ?',
                    array_merge([$name, $desc], $fv, [$id]));
            } else {
                q('INSERT INTO tasks (name, description, freq_type, freq_interval, weekdays, month_day, due_time, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
                    array_merge([$name, $desc], $fv, [now_str()]));
                $id = (int)db()->lastInsertId();
            }
            if (array_key_exists('location_ids', $in)) {
                q('DELETE FROM location_tasks WHERE task_id = ?', [$id]);
                foreach (ids_in('location_ids') as $lid) {
                    link_task($lid, $id);
                }
            }
            out(['id' => $id]);
        }

        case 'location_task_toggle': {
            need_post();
            need_admin();
            $lid = i_in('location_id', 0);
            $tid = i_in('task_id', 0);
            if (!empty($in['on'])) {
                link_task($lid, $tid);
            } else {
                q('DELETE FROM location_tasks WHERE location_id = ? AND task_id = ?', [$lid, $tid]);
            }
            out();
        }

        case 'location_assign': {
            // Bir mekanın işlerini (varsayılan sıklıklarıyla) bir personele atar.
            need_post();
            need_admin();
            $lid = i_in('location_id', 0);
            if (!q('SELECT 1 FROM locations WHERE id = ? AND active = 1', [$lid])->fetchColumn()) {
                fail('Mekan bulunamadı.');
            }
            $userId = i_in('user_id') ?: null;
            $start = d_in('start_date') ?? date('Y-m-d');
            $tids = ids_in('task_ids');
            if (!$tids) {
                fail('En az bir iş seçin.');
            }
            $created = 0;
            $skipped = 0;
            db()->beginTransaction();
            foreach ($tids as $tid) {
                $t = q('SELECT * FROM tasks WHERE id = ? AND active = 1', [$tid])->fetch();
                if (!$t) {
                    continue;
                }
                $dup = q('SELECT 1 FROM plans WHERE active = 1 AND task_id = ? AND location_id = ?', [$tid, $lid])->fetchColumn();
                if ($dup) {
                    $skipped++;
                    continue;
                }
                q('INSERT INTO plans (task_id, location_id, user_id, freq_type, freq_interval, weekdays, month_day, due_time, start_date, active, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                    [$tid, $lid, $userId, $t['freq_type'], $t['freq_interval'], $t['weekdays'], $t['month_day'], $t['due_time'], $start, now_str()]);
                link_task($lid, $tid);
                $created++;
            }
            db()->commit();
            out(['created' => $created, 'skipped' => $skipped]);
        }

        case 'task_delete': {
            need_post();
            need_admin();
            $id = i_in('id', 0);
            $n = (int)q('SELECT COUNT(*) FROM plans WHERE task_id = ? AND active = 1', [$id])->fetchColumn();
            if ($n) {
                fail("Bu iş $n aktif atamada kullanılıyor. Önce atamaları kaldırın.");
            }
            q('UPDATE tasks SET active = 0 WHERE id = ?', [$id]);
            q('DELETE FROM package_items WHERE task_id = ?', [$id]);
            q('DELETE FROM location_tasks WHERE task_id = ?', [$id]);
            out();
        }

        /* ----- iş paketleri (şablonlar) ----- */

        case 'packages': {
            need_admin();
            $pk = q('SELECT * FROM packages ORDER BY name')->fetchAll();
            $items = q('SELECT pi.*, t.name AS task_name FROM package_items pi JOIN tasks t ON t.id = pi.task_id ORDER BY pi.sort_order, pi.id')->fetchAll();
            $by = [];
            foreach ($items as $it) {
                $it['freq'] = Sched::label($it);
                $by[$it['package_id']][] = $it;
            }
            foreach ($pk as &$p) {
                $p['items'] = $by[$p['id']] ?? [];
                $p['plan_count'] = (int)q('SELECT COUNT(*) FROM plans WHERE package_id = ? AND active = 1', [$p['id']])->fetchColumn();
            }
            out($pk);
        }

        case 'package_save': {
            need_post();
            need_admin();
            $id = i_in('id', 0);
            $name = s_in('name', 150, true, 'Paket adı');
            $desc = s_in('description', 1000);
            $color = s_in('color', 20) ?? '#6366f1';
            if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
                $color = '#6366f1';
            }
            $items = is_array($in['items'] ?? null) ? $in['items'] : [];
            if (!$items) {
                fail('Pakete en az bir iş ekleyin.');
            }
            db()->beginTransaction();
            if ($id) {
                q('UPDATE packages SET name = ?, description = ?, color = ? WHERE id = ?', [$name, $desc, $color, $id]);
                q('DELETE FROM package_items WHERE package_id = ?', [$id]);
            } else {
                q('INSERT INTO packages (name, description, color, created_at) VALUES (?, ?, ?, ?)', [$name, $desc, $color, now_str()]);
                $id = (int)db()->lastInsertId();
            }
            foreach (array_values($items) as $i => $it) {
                $tid = resolve_task($it);
                $f = freq_from($it);
                q('INSERT INTO package_items (package_id, task_id, freq_type, freq_interval, weekdays, month_day, due_time, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [$id, $tid, $f['freq_type'], $f['freq_interval'], $f['weekdays'], $f['month_day'], $f['due_time'], $i]);
            }
            db()->commit();
            out(['id' => $id]);
        }

        case 'package_delete': {
            need_post();
            need_admin();
            $id = i_in('id', 0);
            q('DELETE FROM package_items WHERE package_id = ?', [$id]);
            q('DELETE FROM packages WHERE id = ?', [$id]);
            q('UPDATE plans SET package_id = NULL WHERE package_id = ?', [$id]);
            out();
        }

        case 'package_apply': {
            need_post();
            need_admin();
            $pid = i_in('package_id', 0);
            $locIds = array_filter(array_map('intval', (array)($in['location_ids'] ?? [])));
            $userId = i_in('user_id') ?: null;
            $start = d_in('start_date') ?? date('Y-m-d');
            if (!$locIds) {
                fail('En az bir mekan seçin.');
            }
            $items = q('SELECT * FROM package_items WHERE package_id = ? ORDER BY sort_order', [$pid])->fetchAll();
            if (!$items) {
                fail('Paket bulunamadı ya da boş.');
            }
            $created = 0;
            $skipped = 0;
            db()->beginTransaction();
            foreach ($locIds as $lid) {
                foreach ($items as $it) {
                    $dup = q('SELECT 1 FROM plans WHERE active = 1 AND task_id = ? AND location_id = ? AND ' .
                        ($userId ? 'user_id = ?' : 'user_id IS NULL'),
                        $userId ? [$it['task_id'], $lid, $userId] : [$it['task_id'], $lid])->fetchColumn();
                    if ($dup) {
                        $skipped++;
                        continue;
                    }
                    q('INSERT INTO plans (task_id, location_id, user_id, package_id, freq_type, freq_interval, weekdays, month_day, due_time, start_date, active, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                        [$it['task_id'], $lid, $userId, $pid, $it['freq_type'], $it['freq_interval'], $it['weekdays'], $it['month_day'], $it['due_time'], $start, now_str()]);
                    link_task((int)$lid, (int)$it['task_id']);
                    $created++;
                }
            }
            db()->commit();
            out(['created' => $created, 'skipped' => $skipped]);
        }

        /* ----- atamalar (planlar) ----- */

        case 'plans': {
            need_admin();
            $rows = plans_query('p.active = 1');
            foreach ($rows as &$r) {
                $r['freq'] = Sched::label($r);
            }
            out($rows);
        }

        case 'plan_save': {
            need_post();
            need_admin();
            $id = i_in('id', 0);
            $lid = i_in('location_id', 0);
            if (!q('SELECT 1 FROM locations WHERE id = ? AND active = 1', [$lid])->fetchColumn()) {
                fail('Mekan seçin.');
            }
            $userId = i_in('user_id') ?: null;
            $start = d_in('start_date') ?? date('Y-m-d');
            $end = d_in('end_date');
            if ($end && $end < $start) {
                fail('Bitiş tarihi başlangıçtan önce olamaz.');
            }
            $note = s_in('note', 1000);
            db()->beginTransaction();
            $tid = resolve_task($in);
            $f = freq_from($in);
            $vals = [$tid, $lid, $userId, $f['freq_type'], $f['freq_interval'], $f['weekdays'], $f['month_day'], $f['due_time']];
            link_task($lid, $tid);
            if ($id) {
                $old = q('SELECT * FROM plans WHERE id = ? AND active = 1', [$id])->fetch();
                if (!$old) {
                    fail('Atama bulunamadı.', 404);
                }
                $oldVals = [(int)$old['task_id'], (int)$old['location_id'], $old['user_id'] !== null ? (int)$old['user_id'] : null,
                    $old['freq_type'], (int)$old['freq_interval'], $old['weekdays'], $old['month_day'] !== null ? (int)$old['month_day'] : null, $old['due_time']];
                $today = date('Y-m-d');
                $oldStart = substr((string)$old['start_date'], 0, 10);
                if ($vals != $oldVals && $oldStart < $today) {
                    // Geçmiş kayıtlar bozulmasın diye eski atamayı dün itibarıyla kapatıp yenisini başlat.
                    $yesterday = date('Y-m-d', strtotime('-1 day'));
                    q('UPDATE plans SET active = 0, end_date = ? WHERE id = ?', [$yesterday, $id]);
                    q('INSERT INTO plans (task_id, location_id, user_id, package_id, freq_type, freq_interval, weekdays, month_day, due_time, start_date, end_date, note, active, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                        array_merge(array_slice($vals, 0, 3), [$old['package_id']], array_slice($vals, 3), [max($start, $today), $end, $note, now_str()]));
                    $newId = (int)db()->lastInsertId();
                    q('UPDATE completions SET plan_id = ? WHERE plan_id = ? AND occ_date >= ?', [$newId, $id, $today]);
                    $id = $newId;
                } else {
                    q('UPDATE plans SET task_id = ?, location_id = ?, user_id = ?, freq_type = ?, freq_interval = ?, weekdays = ?, month_day = ?, due_time = ?, start_date = ?, end_date = ?, note = ? WHERE id = ?',
                        array_merge($vals, [$vals != $oldVals ? $start : $oldStart, $end, $note, $id]));
                }
            } else {
                q('INSERT INTO plans (task_id, location_id, user_id, freq_type, freq_interval, weekdays, month_day, due_time, start_date, end_date, note, active, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)', array_merge($vals, [$start, $end, $note, now_str()]));
                $id = (int)db()->lastInsertId();
            }
            db()->commit();
            out(['id' => $id]);
        }

        case 'plan_delete': {
            need_post();
            need_admin();
            $ids = array_filter(array_map('intval', (array)($in['ids'] ?? [$in['id'] ?? 0])));
            $today = date('Y-m-d');
            $yesterday = date('Y-m-d', strtotime('-1 day'));
            foreach ($ids as $id) {
                $p = q('SELECT start_date FROM plans WHERE id = ?', [$id])->fetch();
                if (!$p) {
                    continue;
                }
                $hasHistory = (int)q('SELECT COUNT(*) FROM completions WHERE plan_id = ?', [$id])->fetchColumn();
                if (substr((string)$p['start_date'], 0, 10) >= $today && !$hasHistory) {
                    q('DELETE FROM plans WHERE id = ?', [$id]);
                } else {
                    // Geçmiş raporlarda görünmeye devam etsin.
                    q('UPDATE plans SET active = 0, end_date = ? WHERE id = ?', [$yesterday, $id]);
                    q('DELETE FROM completions WHERE plan_id = ? AND occ_date >= ?', [$id, $today]);
                }
            }
            out(['count' => count($ids)]);
        }

        /* ----- personel / kullanıcılar ----- */

        case 'users': {
            need_admin();
            out(q("SELECT u.id, u.name, u.username, u.role, u.phone, u.created_at,
                          (SELECT COUNT(*) FROM plans p WHERE p.user_id = u.id AND p.active = 1) AS plan_count,
                          (SELECT COUNT(*) FROM leaves l WHERE l.user_id = u.id AND l.leave_date = ?) AS on_leave
                   FROM users u WHERE u.active = 1 ORDER BY u.role, u.name", [date('Y-m-d')])->fetchAll());
        }

        case 'user_save': {
            need_post();
            $me = need_admin();
            $id = i_in('id', 0);
            $name = s_in('name', 120, true, 'Ad soyad');
            $username = mb_strtolower((string)s_in('username', 60, true, 'Kullanıcı adı'));
            if (!preg_match('/^[a-z0-9._-]{3,60}$/', $username)) {
                fail('Kullanıcı adı en az 3 karakter olmalı; yalnızca küçük harf (Türkçe karakter olmadan), rakam, nokta, tire içerebilir.');
            }
            $role = ($in['role'] ?? 'staff') === 'admin' ? 'admin' : 'staff';
            $phone = s_in('phone', 30);
            $pw = (string)($in['password'] ?? '');
            if ($pw !== '' && mb_strlen($pw) < 6) {
                fail('Şifre en az 6 karakter olmalı.');
            }
            $taken = q('SELECT id FROM users WHERE username = ? AND id <> ?', [$username, $id])->fetchColumn();
            if ($taken) {
                fail('Bu kullanıcı adı kullanılıyor.');
            }
            if ($id) {
                if ($id === (int)$me['id'] && $role !== 'admin') {
                    fail('Kendi yönetici yetkinizi kaldıramazsınız.');
                }
                q('UPDATE users SET name = ?, username = ?, role = ?, phone = ?, active = 1 WHERE id = ?', [$name, $username, $role, $phone, $id]);
                if ($pw !== '') {
                    q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $id]);
                }
            } else {
                if ($pw === '') {
                    fail('Yeni kullanıcı için şifre belirleyin.');
                }
                q('INSERT INTO users (name, username, password_hash, role, phone, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
                    [$name, $username, password_hash($pw, PASSWORD_DEFAULT), $role, $phone, now_str()]);
                $id = (int)db()->lastInsertId();
            }
            out(['id' => $id]);
        }

        case 'user_delete': {
            need_post();
            $me = need_admin();
            $id = i_in('id', 0);
            if ($id === (int)$me['id']) {
                fail('Kendi hesabınızı silemezsiniz.');
            }
            $n = (int)q('SELECT COUNT(*) FROM plans WHERE user_id = ? AND active = 1', [$id])->fetchColumn();
            if ($n && empty($in['force'])) {
                fail("Bu kişiye atanmış $n aktif iş var. Önce atamaları başka birine devredin.");
            }
            q('UPDATE users SET active = 0 WHERE id = ?', [$id]);
            out();
        }

        case 'default_staff': {
            // Ön tanımlı personelden henüz eklenmemiş olanlar.
            need_admin();
            require_once __DIR__ . '/lib/schema.php';
            $have = array_column(q('SELECT username FROM users')->fetchAll(), 'username');
            out(array_values(array_map(fn($s) => $s[0], array_filter(DEFAULT_STAFF, fn($s) => !in_array($s[1], $have, true)))));
        }

        case 'default_staff_add': {
            need_post();
            need_admin();
            require_once __DIR__ . '/lib/schema.php';
            out(array_map(fn($r) => ['name' => $r[0], 'username' => $r[1], 'password' => $r[2]], schema_seed_staff(db())));
        }

        case 'plans_reassign': {
            need_post();
            need_admin();
            $ids = array_filter(array_map('intval', (array)($in['ids'] ?? [])));
            $userId = i_in('user_id') ?: null;
            foreach ($ids as $id) {
                q('UPDATE plans SET user_id = ? WHERE id = ? AND active = 1', [$userId, $id]);
            }
            out(['count' => count($ids)]);
        }

        /* ----- ayarlar ----- */

        case 'settings': {
            need_user();
            out(settings_all());
        }

        case 'settings_save': {
            need_post();
            need_admin();
            $name = s_in('company_name', 120, true, 'Kurum adı');
            $wd = array_values(array_unique(array_filter(array_map('intval', (array)($in['work_days'] ?? [])), fn($d) => $d >= 1 && $d <= 7)));
            sort($wd);
            if (!$wd) {
                fail('En az bir çalışma günü seçin.');
            }
            $hol = [];
            foreach (preg_split('/[\s,;]+/', (string)($in['holidays'] ?? '')) as $h) {
                if ($h === '') {
                    continue;
                }
                if (!Sched::validDate($h)) {
                    fail("Tatil tarihi YYYY-AA-GG biçiminde olmalı: $h");
                }
                $hol[] = $h;
            }
            sort($hol);
            setting_set('company_name', $name);
            setting_set('work_days', implode(',', $wd));
            setting_set('holidays', implode("\n", array_unique($hol)));
            out();
        }

        default:
            fail('Bilinmeyen işlem.', 404);
    }
} catch (PDOException $e) {
    if (db()->inTransaction()) {
        db()->rollBack();
    }
    error_log('[istakip] ' . $e->getMessage());
    fail('Veritabanı hatası oluştu.', 500);
}
