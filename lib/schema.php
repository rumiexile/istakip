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
            user_id INT NOT NULL,
            status VARCHAR(10) NOT NULL DEFAULT 'done',
            note TEXT NULL,
            photo VARCHAR(255) NULL,
            created_at DATETIME NOT NULL,
            UNIQUE (plan_id, occ_date)
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

const SCHEMA_VERSION = 3;

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
        'Ana Giriş', 'Kazan Dairesi', 'Kat 1 - Ofisler', 'Kat 1 - Tuvaletler',
        'Kat 2 - Ofisler', 'Kat 2 - Tuvaletler', 'Çay Ocağı', 'Toplantı Odası',
        'Arşiv', 'Asansör', 'Fotokopi Alanı', 'Yemekhane',
    ];
    $st = $pdo->prepare('INSERT INTO locations (name, sort_order, active, created_at) VALUES (?, ?, 1, ?)');
    $locIds = [];
    foreach ($locations as $i => $l) {
        $st->execute([$l, $i, $now]);
        $locIds[$l] = (int)$pdo->lastInsertId();
    }

    // [paket adı, renk, açıklama, [[iş, sıklık, aralık, günler, ayın günü, saat], ...]]
    $packages = [
        ['Sabah Açılış', '#f59e0b', 'Mesai başlangıcında yapılacak işler', [
            ['Kapıların açılması', 'daily', 1, null, null, '07:45'],
            ['Kazanın fişinin devreye alınması', 'daily', 1, null, null, '07:45'],
        ]],
        ['Tuvalet Temizliği', '#06b6d4', 'Her tuvalet için günlük temizlik ve sarf malzeme', [
            ['Lavaboların temizliği', 'daily', 1, null, null, '10:00'],
            ['Ayna ve klozetlerin temizlenmesi', 'daily', 1, null, null, '10:00'],
            ['Klozet temizliği', 'daily', 1, null, null, '15:00'],
            ['Tuvalet çöplerinin alınması', 'daily', 1, null, null, '16:00'],
            ['Tuvalet kağıdı ve kurulama havlularının değişimi', 'daily', 1, null, null, '09:30'],
            ['Sabun değişimi', 'daily', 1, null, null, '09:30'],
            ['Zemin giderlerine çamaşır suyu doldurulması', 'daily', 1, null, null, '17:00'],
        ]],
        ['Ofis Genel Temizlik', '#6366f1', 'Ofis katları için rutin temizlik', [
            ['Çöplerin toplanması', 'daily', 1, null, null, '09:00'],
            ['Süpürme', 'daily', 1, null, null, '11:00'],
            ['Paspas', 'daily', 1, null, null, '11:30'],
            ['Zemin temizliği', 'daily', 1, null, null, '14:00'],
            ['Halıların gezilmesi ve fırçalanması', 'daily', 1, null, null, '14:00'],
            ['Halı kenarlarına paspas atılması', 'every_n_days', 2, null, null, '15:00'],
            ['Kağıt öğütücü ve fotokopi makinesi çevresi temizliği', 'daily', 1, null, null, '16:00'],
            ['Çöp atılması (genel)', 'every_n_days', 3, null, null, '17:00'],
            ['Camların silinmesi', 'monthly', 1, null, 15, null],
        ]],
        ['Çay Ocağı ve Ortak Alan', '#10b981', 'Çay ocağı, ortak alanlar ve su sebili', [
            ['Çay ocağı ve ortak alan çöplerinin toplanması', 'daily', 1, null, null, '12:30'],
            ['Zemin temizliği', 'daily', 1, null, null, '13:00'],
            ['Su sebilinin kontrolü', 'daily', 1, null, null, '09:00'],
        ]],
        ['Destek Hizmetleri', '#ec4899', 'Taşıma, arşiv, toplantı ve güvenlik kontrolleri', [
            ['Günlük yemek götürme', 'daily', 1, null, null, '12:00'],
            ['Evrak taşıma', 'daily', 1, null, null, null],
            ['Toplantı odasının hazırlanması (su, soda)', 'daily', 1, null, null, '08:30'],
            ['Arşivin düzenlenmesi', 'weekly', 1, '5', null, null],
            ['Yangın şaft dolaplarının kontrolü', 'weekly', 1, '1', null, null],
            ['Asansör temizliği', 'weekly', 2, '3', null, null],
        ]],
    ];

    $taskIds = [];
    $insTask = $pdo->prepare('INSERT INTO tasks (name, freq_type, freq_interval, weekdays, month_day, due_time, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)');
    $insPkg = $pdo->prepare('INSERT INTO packages (name, description, color, created_at) VALUES (?, ?, ?, ?)');
    $insItem = $pdo->prepare('INSERT INTO package_items (package_id, task_id, freq_type, freq_interval, weekdays, month_day, due_time, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    foreach ($packages as [$pname, $color, $desc, $items]) {
        $insPkg->execute([$pname, $desc, $color, $now]);
        $pid = (int)$pdo->lastInsertId();
        foreach ($items as $i => [$tname, $ft, $iv, $wd, $md, $dt]) {
            if (!isset($taskIds[$tname])) {
                $insTask->execute([$tname, $ft, $iv, $wd, $md, $dt, $now]);
                $taskIds[$tname] = (int)$pdo->lastInsertId();
            }
            $insItem->execute([$pid, $taskIds[$tname], $ft, $iv, $wd, $md, $dt, $i]);
        }
    }

    // Hangi mekanda hangi işler yapılır
    $tuvalet = ['Lavaboların temizliği', 'Ayna ve klozetlerin temizlenmesi', 'Klozet temizliği', 'Tuvalet çöplerinin alınması',
        'Tuvalet kağıdı ve kurulama havlularının değişimi', 'Sabun değişimi', 'Zemin giderlerine çamaşır suyu doldurulması'];
    $ofis = ['Çöplerin toplanması', 'Süpürme', 'Paspas', 'Zemin temizliği', 'Halıların gezilmesi ve fırçalanması',
        'Halı kenarlarına paspas atılması', 'Çöp atılması (genel)', 'Camların silinmesi'];
    $map = [
        'Ana Giriş' => ['Kapıların açılması', 'Zemin temizliği', 'Paspas', 'Camların silinmesi'],
        'Kazan Dairesi' => ['Kazanın fişinin devreye alınması'],
        'Kat 1 - Ofisler' => $ofis,
        'Kat 1 - Tuvaletler' => $tuvalet,
        'Kat 2 - Ofisler' => $ofis,
        'Kat 2 - Tuvaletler' => $tuvalet,
        'Çay Ocağı' => ['Çay ocağı ve ortak alan çöplerinin toplanması', 'Zemin temizliği', 'Su sebilinin kontrolü'],
        'Toplantı Odası' => ['Toplantı odasının hazırlanması (su, soda)', 'Süpürme', 'Camların silinmesi'],
        'Arşiv' => ['Arşivin düzenlenmesi', 'Evrak taşıma', 'Yangın şaft dolaplarının kontrolü'],
        'Asansör' => ['Asansör temizliği'],
        'Fotokopi Alanı' => ['Kağıt öğütücü ve fotokopi makinesi çevresi temizliği', 'Çöplerin toplanması'],
        'Yemekhane' => ['Günlük yemek götürme', 'Zemin temizliği', 'Çöplerin toplanması'],
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
