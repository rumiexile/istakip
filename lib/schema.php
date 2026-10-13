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
    return (bool)preg_match('/tuvalet ka[gğ]ı|havlu|sabun|sebil|ö[gğ]ütücü|\bpil\b/u', $n);
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
            ['Çay kazanının fişinin devreye alınması', 'daily', 1, null, null, '07:45'],
        ]],
        ['Tuvalet Temizliği', '#06b6d4', 'Her tuvalet için günlük temizlik ve sarf malzeme', [
            ['Tuvalet kontrolü', 'daily', 1, null, null, '09:00', '09:00,11:30,14:00,16:30'],
            ['Lavaboların temizliği', 'daily', 1, null, null, '10:00'],
            ['Ayna ve klozetlerin temizlenmesi', 'daily', 1, null, null, '10:00'],
            ['Klozet temizliği', 'daily', 1, null, null, '15:00'],
            ['Tuvalet çöplerinin alınması', 'daily', 1, null, null, '16:00'],
            ['Tuvalet kağıdı', 'daily', 1, null, null, '09:30'],
            ['Kağıt havlu', 'daily', 1, null, null, '09:30'],
            ['Sıvı sabun', 'daily', 1, null, null, '09:30'],
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
            ['Kağıt öğütücü haznesi', 'daily', 1, null, null, '16:00'],
            ['Çöp atılması (genel)', 'every_n_days', 3, null, null, '17:00'],
            ['Camların silinmesi', 'monthly', 1, null, 15, null],
        ]],
        ['Çay Ocağı ve Ortak Alan', '#10b981', 'Çay ocağı, ortak alanlar ve su sebili', [
            ['Çay ocağı ve ortak alan çöplerinin toplanması', 'daily', 1, null, null, '12:30'],
            ['Zemin temizliği', 'daily', 1, null, null, '13:00'],
            ['Su sebili', 'daily', 1, null, null, '09:00'],
        ]],
        ['Destek Hizmetleri', '#ec4899', 'Taşıma, arşiv, toplantı ve güvenlik kontrolleri', [
            ['Günlük yemek götürme', 'daily', 1, null, null, '12:00'],
            ['Evrak taşıma', 'daily', 1, null, null, null],
            ['Toplantı odasının hazırlanması (su, soda)', 'daily', 1, null, null, '08:30'],
            ['Arşivin düzenlenmesi', 'weekly', 1, '5', null, null],
            ['Yangın şaft dolaplarının kontrolü', 'weekly', 1, '1', null, null],
            ['Asansör temizliği', 'weekly', 2, '3', null, null],
            ['Pil geri dönüşüm kutusu', 'weekly', 1, '5', null, null],
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

    // Hangi mekanda hangi işler yapılır
    $tuvalet = ['Tuvalet kontrolü', 'Lavaboların temizliği', 'Ayna ve klozetlerin temizlenmesi', 'Klozet temizliği', 'Tuvalet çöplerinin alınması',
        'Tuvalet kağıdı', 'Kağıt havlu', 'Sıvı sabun', 'Zemin giderlerine çamaşır suyu doldurulması'];
    $ofis = ['Çöplerin toplanması', 'Süpürme', 'Paspas', 'Zemin temizliği', 'Halıların gezilmesi ve fırçalanması',
        'Halı kenarlarına paspas atılması', 'Çöp atılması (genel)', 'Camların silinmesi'];
    $map = [
        'Uzman Yardımcıları Koridoru' => $ofis,
        'Makam Koridoru' => array_merge($ofis, ['Toplantı odasının hazırlanması (su, soda)', 'Günlük yemek götürme']),
        'Tuvalet Erkek' => $tuvalet,
        'Tuvalet Kadın' => $tuvalet,
        'Ana Giriş (Bahçe)' => ['Kapıların açılması', 'Zemin temizliği', 'Paspas', 'Camların silinmesi', 'Pil geri dönüşüm kutusu'],
        'YÖK Girişi (Asansör)' => ['Asansör temizliği', 'Zemin temizliği', 'Paspas', 'Camların silinmesi'],
        'Fotokopi Alanı' => ['Kağıt öğütücü ve fotokopi makinesi çevresi temizliği', 'Kağıt öğütücü haznesi', 'Çöplerin toplanması'],
        'Arşiv' => ['Arşivin düzenlenmesi', 'Evrak taşıma', 'Yangın şaft dolaplarının kontrolü'],
        'Çay Ocağı' => ['Çay kazanının fişinin devreye alınması', 'Çay ocağı ve ortak alan çöplerinin toplanması', 'Su sebili', 'Zemin temizliği', 'Kağıt havlu'],
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
    ['Sabah Açılış', 'Ana Giriş (Bahçe)', 'mahmut.demirel', ['Kapıların açılması']],
    ['Sabah Açılış', 'Çay Ocağı', 'deniz.karabulut', ['Çay kazanının fişinin devreye alınması']],
    ['Destek Hizmetleri', 'Ana Giriş (Bahçe)', 'mahmut.demirel', ['Pil geri dönüşüm kutusu']],
    ['Ofis Genel Temizlik', 'Ana Giriş (Bahçe)', 'yalcin.bicakci', ['Zemin temizliği', 'Paspas']],
    ['Destek Hizmetleri', 'Arşiv', 'mahmut.demirel', ['Arşivin düzenlenmesi', 'Yangın şaft dolaplarının kontrolü']],
    ['Destek Hizmetleri', 'Arşiv', null, ['Evrak taşıma']],
    ['Tuvalet Temizliği', 'Tuvalet Erkek', 'aysel.akman', null],
    ['Tuvalet Temizliği', 'Tuvalet Kadın', 'gulnaz.yalcin', null],
    ['Ofis Genel Temizlik', 'Uzman Yardımcıları Koridoru', 'deniz.karabulut', ['Çöplerin toplanması', 'Süpürme', 'Paspas', 'Halı kenarlarına paspas atılması', 'Çöp atılması (genel)', 'Camların silinmesi']],
    ['Çay Ocağı ve Ortak Alan', 'Çay Ocağı', 'deniz.karabulut', ['Çay ocağı ve ortak alan çöplerinin toplanması', 'Su sebili', 'Zemin temizliği']],
    ['Tuvalet Temizliği', 'Çay Ocağı', 'deniz.karabulut', ['Kağıt havlu']],
    ['Ofis Genel Temizlik', 'Makam Koridoru', 'mumin.tekin', ['Çöplerin toplanması', 'Süpürme', 'Halıların gezilmesi ve fırçalanması']],
    ['Destek Hizmetleri', 'Makam Koridoru', null, ['Toplantı odasının hazırlanması (su, soda)', 'Günlük yemek götürme']],
    ['Destek Hizmetleri', 'YÖK Girişi (Asansör)', 'mumin.tekin', ['Asansör temizliği']],
    ['Ofis Genel Temizlik', 'YÖK Girişi (Asansör)', 'yalcin.bicakci', ['Zemin temizliği', 'Paspas']],
    ['Ofis Genel Temizlik', 'Fotokopi Alanı', 'yalcin.bicakci', ['Kağıt öğütücü ve fotokopi makinesi çevresi temizliği', 'Kağıt öğütücü haznesi', 'Çöplerin toplanması']],
];

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
    $ins = $pdo->prepare('INSERT INTO plans (task_id, location_id, user_id, package_id, freq_type, freq_interval, weekdays, month_day, due_time, times, start_date, active, created_at)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)');
    $created = 0;
    $pairs = [];
    foreach (DEMO_ASSIGNMENTS as [$pname, $lname, $username, $only]) {
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
                $it['freq_type'], $it['freq_interval'], $it['weekdays'], $it['month_day'], $it['due_time'], $it['times'], $today, $now]);
            $pairs[] = [$loc[$lname], (int)$it['task_id']];
            $created++;
        }
    }
    link_pairs($pdo, $pairs);
    return $created;
}
