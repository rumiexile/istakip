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
        "CREATE TABLE IF NOT EXISTS settings (
            k VARCHAR(50) NOT NULL PRIMARY KEY,
            v TEXT NULL
        )",
    ];
    $out = array_map(fn($s) => $s . $tail, $tables);
    $out[] = 'CREATE INDEX idx_plans_active ON plans (active)';
    $out[] = 'CREATE INDEX idx_compl_date ON completions (occ_date)';
    $out[] = 'CREATE INDEX idx_pitems_pkg ON package_items (package_id)';
    return $out;
}

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
    foreach ($locations as $i => $l) {
        $st->execute([$l, $i, $now]);
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
    $insTask = $pdo->prepare('INSERT INTO tasks (name, active, created_at) VALUES (?, 1, ?)');
    $insPkg = $pdo->prepare('INSERT INTO packages (name, description, color, created_at) VALUES (?, ?, ?, ?)');
    $insItem = $pdo->prepare('INSERT INTO package_items (package_id, task_id, freq_type, freq_interval, weekdays, month_day, due_time, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    foreach ($packages as [$pname, $color, $desc, $items]) {
        $insPkg->execute([$pname, $desc, $color, $now]);
        $pid = (int)$pdo->lastInsertId();
        foreach ($items as $i => [$tname, $ft, $iv, $wd, $md, $dt]) {
            if (!isset($taskIds[$tname])) {
                $insTask->execute([$tname, $now]);
                $taskIds[$tname] = (int)$pdo->lastInsertId();
            }
            $insItem->execute([$pid, $taskIds[$tname], $ft, $iv, $wd, $md, $dt, $i]);
        }
    }
}
