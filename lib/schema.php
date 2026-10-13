<?php
declare(strict_types=1);

function schema_statements(string $driver): array
{
    $pk = $driver === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT AUTO_INCREMENT PRIMARY KEY';
    $tail = $driver === 'sqlite' ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    $tables = [
        "CREATE TABLE IF NOT EXISTS users (
            id $pk,
            name VARCHAR(120) NOT NULL,
            username VARCHAR(60) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(10) NOT NULL DEFAULT 'staff',
            phone VARCHAR(30) NULL,
            active INT NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS locations (
            id $pk,
            name VARCHAR(150) NOT NULL,
            description TEXT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            active INT NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS tasks (
            id $pk,
            name VARCHAR(200) NOT NULL,
            description TEXT NULL,
            freq_type VARCHAR(20) NOT NULL DEFAULT 'daily',
            freq_interval INT NOT NULL DEFAULT 1,
            weekdays VARCHAR(20) NULL,
            month_day INT NULL,
            due_time VARCHAR(5) NULL,
            times VARCHAR(120) NULL,
            kind VARCHAR(12) NOT NULL DEFAULT 'normal',
            active INT NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS packages (
            id $pk,
            name VARCHAR(150) NOT NULL,
            description TEXT NULL,
            color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
            created_at DATETIME NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS package_items (
            id $pk,
            package_id INT NOT NULL,
            task_id INT NOT NULL,
            freq_type VARCHAR(20) NOT NULL DEFAULT 'daily',
            freq_interval INT NOT NULL DEFAULT 1,
            weekdays VARCHAR(20) NULL,
            month_day INT NULL,
            due_time VARCHAR(5) NULL,
            times VARCHAR(120) NULL,
            sort_order INT NOT NULL DEFAULT 0
        )",
        "CREATE TABLE IF NOT EXISTS plans (
            id $pk,
            task_id INT NOT NULL,
            location_id INT NOT NULL,
            user_id INT NULL,
            package_id INT NULL,
            freq_type VARCHAR(20) NOT NULL DEFAULT 'daily',
            freq_interval INT NOT NULL DEFAULT 1,
            weekdays VARCHAR(20) NULL,
            month_day INT NULL,
            due_time VARCHAR(5) NULL,
            times VARCHAR(120) NULL,
            start_date DATE NOT NULL,
            end_date DATE NULL,
            note TEXT NULL,
            active INT NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS completions (
            id $pk,
            plan_id INT NOT NULL,
            occ_date DATE NOT NULL,
            slot INT NOT NULL DEFAULT 0,
            user_id INT NOT NULL,
            status VARCHAR(10) NOT NULL DEFAULT 'done',
            note TEXT NULL,
            photo VARCHAR(255) NULL,
            created_at DATETIME NOT NULL,
            UNIQUE (plan_id, occ_date, slot)
        )",
        "CREATE TABLE IF NOT EXISTS leaves (
            id $pk,
            user_id INT NOT NULL,
            leave_date DATE NOT NULL,
            note VARCHAR(255) NULL,
            created_by INT NULL,
            created_at DATETIME NOT NULL,
            UNIQUE (user_id, leave_date)
        )",
        "CREATE TABLE IF NOT EXISTS location_tasks (
            id $pk,
            location_id INT NOT NULL,
            task_id INT NOT NULL,
            UNIQUE (location_id, task_id)
        )",
        "CREATE TABLE IF NOT EXISTS settings (
            k VARCHAR(50) NOT NULL PRIMARY KEY,
            v TEXT NULL
        )",
    ];
    $out = array_map(fn($s) => $s . $tail, $tables);
    $out[] = 'CREATE INDEX idx_plans_active ON plans (active)';
    $out[] = 'CREATE INDEX idx_compl_date ON completions (occ_date)';
    $out[] = 'CREATE INDEX idx_pitems_pkg ON package_items (package_id)';
    $out[] = 'CREATE INDEX idx_leaves_date ON leaves (leave_date)';
    return $out;
}

const SCHEMA_VERSION = 5;

function schema_install(PDO $pdo, string $driver): void
{
    foreach (schema_statements($driver) as $sql) {
        try {
            $pdo->exec($sql);
        } catch (PDOException $e) {
            // İndeks zaten varsa yoksay.
            if (stripos($sql, 'CREATE INDEX') !== 0) {
                throw $e;
            }
        }
    }
}

/** Eski sürümden yükseltme: yeni sütunlar ve mevcut verilerden çıkarılan ilişkiler. */
function schema_upgrade(PDO $pdo, string $driver, int $from): void
{
    schema_install($pdo, $driver);
    if ($from < 3) {
        foreach ([
            "freq_type VARCHAR(20) NOT NULL DEFAULT 'daily'",
            'freq_interval INT NOT NULL DEFAULT 1',
            'weekdays VARCHAR(20) NULL',
            'month_day INT NULL',
            'due_time VARCHAR(5) NULL',
        ] as $col) {
            try {
                $pdo->exec('ALTER TABLE tasks ADD COLUMN ' . $col);
            } catch (PDOException $e) {
                // Sütun zaten var.
            }
        }
        // İşlerin varsayılan sıklığı: ilk geçtiği paketteki sıklık.
        $upd = $pdo->prepare('UPDATE tasks SET freq_type = ?, freq_interval = ?, weekdays = ?, month_day = ?, due_time = ? WHERE id = ?');
        $seen = [];
        foreach ($pdo->query('SELECT * FROM package_items ORDER BY package_id, sort_order')->fetchAll() as $it) {
            if (!isset($seen[$it['task_id']])) {
                $seen[$it['task_id']] = true;
                $upd->execute([$it['freq_type'], $it['freq_interval'], $it['weekdays'], $it['month_day'], $it['due_time'], $it['task_id']]);
            }
        }
        // Mekan-iş ilişkileri: mevcut atamalardan.
        link_pairs($pdo, $pdo->query('SELECT DISTINCT location_id, task_id FROM plans')->fetchAll(PDO::FETCH_NUM));
    }
    if ($from < 4) {
        try {
            $pdo->exec("ALTER TABLE tasks ADD COLUMN kind VARCHAR(12) NOT NULL DEFAULT 'normal'");
        } catch (PDOException $e) {
            // Sütun zaten var.
        }
        // Adından sarf malzemesi olduğu anlaşılan işleri işaretle; yönetici iş formundan değiştirebilir.
        $upd = $pdo->prepare("UPDATE tasks SET kind = 'consumable' WHERE id = ?");
        foreach ($pdo->query('SELECT id, name FROM tasks')->fetchAll() as $t) {
            if (looks_consumable((string)$t['name'])) {
                $upd->execute([$t['id']]);
            }
        }
    }
    if ($from < 5) {
        // Günde birden çok kontrol: saat listesi ve kontrol sırası.
        foreach (['tasks', 'package_items', 'plans'] as $tbl) {
            try {
                $pdo->exec("ALTER TABLE $tbl ADD COLUMN times VARCHAR(120) NULL");
            } catch (PDOException $e) {
                // Sütun zaten var.
            }
        }
        $cols = $driver === 'sqlite'
            ? array_column($pdo->query('PRAGMA table_info(completions)')->fetchAll(), 'name')
            : array_column($pdo->query('SHOW COLUMNS FROM completions')->fetchAll(), 'Field');
        if (!in_array('slot', $cols, true)) {
            if ($driver === 'sqlite') {
                // SQLite'ta UNIQUE kısıtı değiştirilemediği için tablo yeniden kurulur.
                $pdo->beginTransaction();
                $pdo->exec('ALTER TABLE completions RENAME TO completions_old');
                foreach (schema_statements('sqlite') as $sql) {
                    if (str_contains($sql, 'TABLE IF NOT EXISTS completions ')) {
                        $pdo->exec($sql);
                    }
                }
                $pdo->exec('INSERT INTO completions (id, plan_id, occ_date, slot, user_id, status, note, photo, created_at)
                            SELECT id, plan_id, occ_date, 0, user_id, status, note, photo, created_at FROM completions_old');
                $pdo->exec('DROP TABLE completions_old');
                $pdo->commit();
                $pdo->exec('CREATE INDEX IF NOT EXISTS idx_compl_date ON completions (occ_date)');
            } else {
                $pdo->exec('ALTER TABLE completions ADD COLUMN slot INT NOT NULL DEFAULT 0 AFTER occ_date');
                foreach ($pdo->query("SHOW INDEX FROM completions WHERE Non_unique = 0 AND Key_name <> 'PRIMARY'")->fetchAll() as $ix) {
                    try {
                        $pdo->exec('ALTER TABLE completions DROP INDEX `' . $ix['Key_name'] . '`');
                    } catch (PDOException $e) {
                        // Aynı indeksin ikinci sütun satırı.
                    }
                }
                $pdo->exec('ALTER TABLE completions ADD UNIQUE KEY uq_compl_slot (plan_id, occ_date, slot)');
            }
        }
    }
}

function looks_consumable(string $name): bool
{
    $n = mb_strtolower(str_replace(['İ', 'I'], ['i', 'ı'], $name));
    if (str_contains($n, 'temizl')) {
        return false; // "… çevresi temizliği" gibi temizlik işleri sarf malzemesi değildir.
    }
    return (bool)preg_match('/tuvalet ka[gğ]ı|havlu|sabun|sebil|damacana|rulo|ikram taba[gğ]ı|ö[gğ]ütücü|\bpil\b/u', $n);
}

/** @param array<int,array{0:int,1:int}> $pairs [mekan, iş] */
function link_pairs(PDO $pdo, array $pairs): void
{
    $has = $pdo->prepare('SELECT 1 FROM location_tasks WHERE location_id = ? AND task_id = ?');
    $ins = $pdo->prepare('INSERT INTO location_tasks (location_id, task_id) VALUES (?, ?)');
    foreach ($pairs as [$l, $t]) {
        $has->execute([(int)$l, (int)$t]);
        if (!$has->fetchColumn()) {
            $ins->execute([(int)$l, (int)$t]);
        }
    }
}

/** Kurulumda eklenen ön tanımlı personel: [ad soyad, kullanıcı adı]. */
const DEFAULT_STAFF = [
    ['Aysel Akman', 'aysel.akman'],
    ['Deniz Karabulut', 'deniz.karabulut'],
    ['Gülnaz Yalçın', 'gulnaz.yalcin'],
    ['Mahmut Demirel', 'mahmut.demirel'],
    ['Mumin Tekin', 'mumin.tekin'],
    ['Yalçın Bıçakcı', 'yalcin.bicakci'],
];

/** Okunması kolay geçici şifre (karışan 0/O, 1/l harfleri yok). */
function temp_password(int $len = 8): string
{
    $chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    $out = '';
    for ($i = 0; $i < $len; $i++) {
        $out .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $out;
}

/**
 * Ön tanımlı personeli ekler, zaten var olan kullanıcı adlarını atlar.
 * @return array<int,array{0:string,1:string,2:string}> [ad, kullanıcı adı, geçici şifre]
 */
function schema_seed_staff(PDO $pdo): array
{
    $now = date('Y-m-d H:i:s');
    $exists = $pdo->prepare('SELECT 1 FROM users WHERE username = ?');
    $ins = $pdo->prepare("INSERT INTO users (name, username, password_hash, role, active, created_at) VALUES (?, ?, ?, 'staff', 1, ?)");
    $created = [];
    foreach (DEFAULT_STAFF as [$name, $username]) {
        $exists->execute([$username]);
        if ($exists->fetchColumn()) {
            continue;
        }
        $pw = temp_password();
        $ins->execute([$name, $username, password_hash($pw, PASSWORD_DEFAULT), $now]);
        $created[] = [$name, $username, $pw];
    }
    return $created;
}

/** Örnek mekan, iş tanımı ve iş paketi şablonları. */
function schema_seed(PDO $pdo): void
{
    $now = date('Y-m-d H:i:s');
    $locations = [
        'Uzman Yardımcıları Koridoru',
        'Makam Koridoru',
        'Tuvalet Erkek',
        'Tuvalet Kadın',
        'Ana Giriş (Bahçe)',
        'YÖK Girişi (Asansör)',
        'Fotokopi Alanı',
        'Arşiv',
        'Çay Ocağı',
        'Bahçe ve Otopark',
    ];
    $st = $pdo->prepare('INSERT INTO locations (name, sort_order, active, created_at) VALUES (?, ?, 1, ?)');
    $locIds = [];
    foreach ($locations as $i => $l) {
        $st->execute([$l, $i, $now]);
        $locIds[$l] = (int)$pdo->lastInsertId();
    }

    // [paket adı, renk, açıklama, [[iş, sıklık, aralık, günler, ayın günü, saat], ...]]
    $packages = [
        ['Çay Ocağı Ana Sorumluluk Paketi', '#b45309', 'Çay ocağı ana sorumlusunun günlük ve haftalık işleri', [
            ['Çay hazırlama', 'daily', 1, null, null, '08:30', '08:30,13:30'],
            ['Bulaşık Yıkama', 'daily', 1, null, null, '16:30'],
            ['Çay malzeme eksiklerinin tedarik edilmesi', 'weekly', 1, '1', null, '10:00'],
            ['Su/Damacana kontrolü', 'daily', 1, null, null, '09:00'],
            ['Çaydanlıkların detaylı temizliği', 'weekly', 1, '5', null, '15:00'],
            ['Kahve makinesi temizliği', 'daily', 1, null, null, '16:00'],
            ['Çay Ocağı Zemin Temizliği', 'daily', 1, null, null, '17:00'],
            ['Yemek görevi', 'daily', 1, null, null, '12:00'],
            ['Detaylı Çay Ocağı Temizliği', 'weekly', 1, '5', null, '16:00'],
            ['Makam ikram tabağı kontrolü', 'daily', 1, null, null, '09:30'],
            ['Çay ocağı rulosunun değiştirilmesi', 'daily', 1, null, null, '09:30'],
            ['Toplantıların ikramlarının hazırlanması ve sunumu', 'daily', 1, null, null, null],
        ]],
        ['Koridor İş Paketi', '#0f766e', 'Koridor sorumlusunun odalar, tuvaletler, çay servisi ve toplantı odası işleri', [
            ['Çay demleme', 'daily', 1, null, null, '08:15', '08:15,13:00'],
            ['Odalarda masa üstü, pencere önü temizliği ve düzeni', 'daily', 1, null, null, '09:00'],
            ['Tuvalet zemin temizliği', 'daily', 1, null, null, '10:00'],
            ['Tuvalet klozet temizliği', 'daily', 1, null, null, '10:00'],
            ['Tuvalet lavabo temizliği', 'daily', 1, null, null, '10:00'],
            ['Tuvalet ayna temizliği', 'daily', 1, null, null, '10:00'],
            ['Tuvalet kağıdı ve havlu kağıt kontrolü', 'daily', 1, null, null, '09:30'],
            ['Sabunluk kontrolü', 'daily', 1, null, null, '09:30'],
            ['Saatlik lavaboların yapılması', 'daily', 1, null, null, '09:00', '09:00,10:00,11:00,12:00,13:00,14:00,15:00,16:00,17:00'],
            ['Detaylı tuvalet temizliği', 'weekly', 1, '5', null, '15:00'],
            ['Koridor pencere küpeşte önü temizliği', 'weekly', 1, '2,4', null, '14:00'],
            ['Çay servis hizmetleri', 'daily', 1, null, null, null],
            ['Başkanlık yemek getirme', 'daily', 1, null, null, '12:00'],
            ['Toplantı odalarında temizlik ve düzen oluşturulması', 'daily', 1, null, null, '08:30'],
            ['Detaylı oda temizliği', 'weekly', 1, '3', null, '14:00'],
            ['Misafir alanı temizliği', 'every_n_days', 2, null, null, '11:00'],
        ]],
        ['Bahçe Sorumluluk Paketi', '#15803d', 'Bahçe, otopark ve giriş çevresi; çiçek bakımı, sulama ve depo işleri', [
            ['Girişin temizliği, halı temizliği', 'daily', 1, null, null, '08:00'],
            ['Bahçe çöplerinin toplanması', 'every_n_days', 2, null, null, '10:00'],
            ['Çiçeklerin bakımı, budama', 'weekly', 1, '3', null, '10:00'],
            ['Sulama', 'daily', 1, null, null, '08:30'],
            ['Yaprak temizliği', 'daily', 1, null, null, '11:00'],
            ['Ofis ve koridor saksı çiçeklerinin bakımı', 'weekly', 1, '1', null, '14:00'],
            ['Kar küreme ve tuzlama işlemleri', 'daily', 1, null, null, '07:30'],
            ['Bahçe ilaçlaması', 'monthly', 1, null, 5, '10:00'],
            ['Depo düzenlemesi', 'weekly', 1, '5', null, '14:00'],
        ]],
    ];

    $taskIds = [];
    $insTask = $pdo->prepare('INSERT INTO tasks (name, freq_type, freq_interval, weekdays, month_day, due_time, times, kind, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)');
    $insPkg = $pdo->prepare('INSERT INTO packages (name, description, color, created_at) VALUES (?, ?, ?, ?)');
    $insItem = $pdo->prepare('INSERT INTO package_items (package_id, task_id, freq_type, freq_interval, weekdays, month_day, due_time, times, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    foreach ($packages as [$pname, $color, $desc, $items]) {
        $insPkg->execute([$pname, $desc, $color, $now]);
        $pid = (int)$pdo->lastInsertId();
        foreach ($items as $i => $row) {
            [$tname, $ft, $iv, $wd, $md, $dt] = $row;
            $times = $row[6] ?? null;
            if (!isset($taskIds[$tname])) {
                $insTask->execute([$tname, $ft, $iv, $wd, $md, $dt, $times, looks_consumable($tname) ? 'consumable' : 'normal', $now]);
                $taskIds[$tname] = (int)$pdo->lastInsertId();
            }
            $insItem->execute([$pid, $taskIds[$tname], $ft, $iv, $wd, $md, $dt, $times, $i]);
        }
    }

    // İş açıklamaları
    $desc = $pdo->prepare('UPDATE tasks SET description = ? WHERE id = ?');
    if (isset($taskIds['Odalarda masa üstü, pencere önü temizliği ve düzeni'])) {
        $desc->execute(['Makam odası dahil.', $taskIds['Odalarda masa üstü, pencere önü temizliği ve düzeni']]);
    }

    if (isset($taskIds['Kar küreme ve tuzlama işlemleri'])) {
        $desc->execute(['Kış döneminde (1 Aralık – 15 Mart) her sabah: kar veya buzlanma varsa giriş, yürüyüş yolları ve otopark kürenir ve tuzlanır; yoksa kontrol edilip işaretlenir.', $taskIds['Kar küreme ve tuzlama işlemleri']]);
    }

    // Hangi mekanda hangi işler yapılır
    $map = [
        'Uzman Yardımcıları Koridoru' => ['Çay demleme', 'Odalarda masa üstü, pencere önü temizliği ve düzeni', 'Tuvalet zemin temizliği', 'Tuvalet klozet temizliği', 'Tuvalet lavabo temizliği', 'Tuvalet ayna temizliği', 'Tuvalet kağıdı ve havlu kağıt kontrolü', 'Sabunluk kontrolü', 'Saatlik lavaboların yapılması', 'Detaylı tuvalet temizliği', 'Koridor pencere küpeşte önü temizliği', 'Çay servis hizmetleri', 'Başkanlık yemek getirme', 'Toplantı odalarında temizlik ve düzen oluşturulması', 'Detaylı oda temizliği', 'Misafir alanı temizliği'],
        'Makam Koridoru' => ['Çay demleme', 'Odalarda masa üstü, pencere önü temizliği ve düzeni', 'Tuvalet zemin temizliği', 'Tuvalet klozet temizliği', 'Tuvalet lavabo temizliği', 'Tuvalet ayna temizliği', 'Tuvalet kağıdı ve havlu kağıt kontrolü', 'Sabunluk kontrolü', 'Saatlik lavaboların yapılması', 'Detaylı tuvalet temizliği', 'Koridor pencere küpeşte önü temizliği', 'Çay servis hizmetleri', 'Başkanlık yemek getirme', 'Toplantı odalarında temizlik ve düzen oluşturulması', 'Detaylı oda temizliği', 'Misafir alanı temizliği'],
        'Çay Ocağı' => ['Çay hazırlama', 'Bulaşık Yıkama', 'Çay malzeme eksiklerinin tedarik edilmesi', 'Su/Damacana kontrolü', 'Çaydanlıkların detaylı temizliği', 'Kahve makinesi temizliği', 'Çay Ocağı Zemin Temizliği', 'Yemek görevi', 'Detaylı Çay Ocağı Temizliği', 'Makam ikram tabağı kontrolü', 'Çay ocağı rulosunun değiştirilmesi', 'Toplantıların ikramlarının hazırlanması ve sunumu'],
        'Bahçe ve Otopark' => ['Girişin temizliği, halı temizliği', 'Bahçe çöplerinin toplanması', 'Çiçeklerin bakımı, budama', 'Sulama', 'Yaprak temizliği', 'Ofis ve koridor saksı çiçeklerinin bakımı', 'Kar küreme ve tuzlama işlemleri', 'Bahçe ilaçlaması', 'Depo düzenlemesi'],
    ];
    $pairs = [];
    foreach ($map as $loc => $tasks) {
        foreach ($tasks as $t) {
            if (isset($locIds[$loc], $taskIds[$t])) {
                $pairs[] = [$locIds[$loc], $taskIds[$t]];
            }
        }
    }
    link_pairs($pdo, $pairs);
}

/**
 * Demodaki iş dağılımı: [paket, mekan, personel kullanıcı adı (null = ortak), [işler] (null = paketin tamamı)].
 * demo/mock.js içindeki apply() çağrılarıyla aynıdır.
 */
const DEMO_ASSIGNMENTS = [
    ['Bahçe Sorumluluk Paketi', 'Bahçe ve Otopark', 'mahmut.demirel', ['Girişin temizliği, halı temizliği', 'Bahçe çöplerinin toplanması', 'Çiçeklerin bakımı, budama', 'Sulama', 'Yaprak temizliği', 'Ofis ve koridor saksı çiçeklerinin bakımı', 'Bahçe ilaçlaması', 'Depo düzenlemesi']],
    ['Bahçe Sorumluluk Paketi', 'Bahçe ve Otopark', 'mahmut.demirel', ['Kar küreme ve tuzlama işlemleri'], 'winter'],
    ['Koridor İş Paketi', 'Uzman Yardımcıları Koridoru', 'deniz.karabulut', null],
    ['Koridor İş Paketi', 'Makam Koridoru', 'gulnaz.yalcin', null],
    ['Çay Ocağı Ana Sorumluluk Paketi', 'Çay Ocağı', 'aysel.akman', null],
];

/** Kış dönemi: 1 Aralık – 15 Mart. Dönem içindeysek bugünden, değilsek ilk 1 Aralık'tan başlar. */
function winter_window(string $today): array
{
    $y = (int)substr($today, 0, 4);
    $md = substr($today, 5);
    if ($md >= '12-01') {
        return [$today, ($y + 1) . '-03-15'];
    }
    if ($md <= '03-15') {
        return [$today, $y . '-03-15'];
    }
    return [$y . '-12-01', ($y + 1) . '-03-15'];
}

/**
 * Örnek verilerin üzerine demodaki iş atamalarını kurar (paketteki sıklık ve saatlerle, bugünden başlayarak).
 * Personel ya da örnek veri eksikse ilgili satırlar atlanır.
 * @return int oluşturulan atama sayısı
 */
function schema_seed_assignments(PDO $pdo): int
{
    $now = date('Y-m-d H:i:s');
    $today = date('Y-m-d');
    $pkg = array_column($pdo->query('SELECT id, name FROM packages')->fetchAll(), 'id', 'name');
    $loc = array_column($pdo->query('SELECT id, name FROM locations WHERE active = 1')->fetchAll(), 'id', 'name');
    $usr = array_column($pdo->query('SELECT id, username FROM users WHERE active = 1')->fetchAll(), 'id', 'username');
    $items = $pdo->prepare('SELECT pi.*, t.name AS task_name FROM package_items pi JOIN tasks t ON t.id = pi.task_id WHERE pi.package_id = ? ORDER BY pi.sort_order');
    $dup = $pdo->prepare('SELECT 1 FROM plans WHERE active = 1 AND task_id = ? AND location_id = ?');
    $ins = $pdo->prepare('INSERT INTO plans (task_id, location_id, user_id, package_id, freq_type, freq_interval, weekdays, month_day, due_time, times, start_date, end_date, active, created_at)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)');
    $created = 0;
    $pairs = [];
    foreach (DEMO_ASSIGNMENTS as $row) {
        [$pname, $lname, $username, $only] = $row;
        [$start, $end] = ($row[4] ?? null) === 'winter' ? winter_window($today) : [$today, null];
        if (!isset($pkg[$pname], $loc[$lname]) || ($username !== null && !isset($usr[$username]))) {
            continue;
        }
        $items->execute([$pkg[$pname]]);
        foreach ($items->fetchAll() as $it) {
            if ($only !== null && !in_array($it['task_name'], $only, true)) {
                continue;
            }
            $dup->execute([$it['task_id'], $loc[$lname]]);
            if ($dup->fetchColumn()) {
                continue;
            }
            $ins->execute([$it['task_id'], $loc[$lname], $username === null ? null : $usr[$username], $pkg[$pname],
                $it['freq_type'], $it['freq_interval'], $it['weekdays'], $it['month_day'], $it['due_time'], $it['times'], $start, $end, $now]);
            $pairs[] = [$loc[$lname], (int)$it['task_id']];
            $created++;
        }
    }
    link_pairs($pdo, $pairs);
    return $created;
}
