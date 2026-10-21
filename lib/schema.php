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
            qr_token VARCHAR(40) NULL,
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
            inspected_by INT NULL,
            inspected_at DATETIME NULL,
            inspect_seen INT NOT NULL DEFAULT 0,
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
        "CREATE TABLE IF NOT EXISTS reports (
            id $pk,
            location_id INT NOT NULL,
            category VARCHAR(30) NOT NULL DEFAULT 'other',
            description TEXT NOT NULL,
            photo VARCHAR(255) NULL,
            reporter_name VARCHAR(120) NULL,
            reporter_contact VARCHAR(120) NULL,
            status VARCHAR(12) NOT NULL DEFAULT 'new',
            admin_note TEXT NULL,
            handled_by INT NULL,
            handled_at DATETIME NULL,
            ip_hash VARCHAR(64) NULL,
            created_at DATETIME NOT NULL
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
    $out[] = 'CREATE INDEX idx_reports_status ON reports (status)';
    $out[] = 'CREATE INDEX idx_reports_created ON reports (created_at)';
    return $out;
}

const SCHEMA_VERSION = 17;

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
    if ($from < 13) {
        schema_meal_rotation($pdo);
    }
    if ($from < 14) {
        schema_meal_to_general($pdo);
    }
    if ($from < 15) {
        schema_retire_tasks($pdo, ['Başkanlık yemek getirme']);
    }
    if ($from < 16) {
        schema_add_routine($pdo, 'Makam Odaları Çay İkram Hizmetleri', 'Çay Ocağı Ana Sorumluluk Paketi', 'Çay Ocağı', 'aysel.akman');
    }
    if ($from < 17) {
        schema_make_on_demand($pdo, ['Çay malzeme eksiklerinin tedarik edilmesi'], 'on_demand', ['weekly']);
    }
    if ($from < 12) {
        // "Su/Damacana kontrolü" → "Su/Damacana Değişimi", ihtiyaç olduğunda
        $has = $pdo->query("SELECT COUNT(*) FROM tasks WHERE name = 'Su/Damacana Değişimi' AND active = 1")->fetchColumn();
        if (!$has) {
            $pdo->exec("UPDATE tasks SET name = 'Su/Damacana Değişimi' WHERE name = 'Su/Damacana kontrolü' AND active = 1");
        }
        schema_make_on_demand($pdo, ['Su/Damacana Değişimi']);
    }
    if ($from < 11) {
        schema_make_on_demand($pdo, ['Çay ocağı rulosunun değiştirilmesi']);
    }
    if ($from < 10) {
        schema_make_on_demand($pdo, ['Çay hazırlama', 'Bulaşık Yıkama'], 'routine');
    }
    if ($from < 9) {
        schema_make_on_demand($pdo, ['Toplantıların ikramlarının hazırlanması ve sunumu']);
    }
    if ($from < 8) {
        schema_merge_toilet_check($pdo);
    }
    if ($from < 7) {
        // Dış kullanıcı sorun bildirimi: her mekanın karekod anahtarı (reports tablosu yukarıda kurulur).
        try {
            $pdo->exec('ALTER TABLE locations ADD COLUMN qr_token VARCHAR(40) NULL');
        } catch (PDOException $e) {
            // Sütun zaten var.
        }
    }
    if ($from < 6) {
        // Yönetici denetimi: işi kim, ne zaman kontrol etti; personel bildirimi gördü mü.
        foreach (['inspected_by INT NULL', 'inspected_at DATETIME NULL', 'inspect_seen INT NOT NULL DEFAULT 0'] as $col) {
            try {
                $pdo->exec('ALTER TABLE completions ADD COLUMN ' . $col);
            } catch (PDOException $e) {
                // Sütun zaten var.
            }
        }
    }
}

/**
 * v8: "Tuvalet kağıdı ve havlu kağıt kontrolü" ile "Saatlik lavaboların yapılması" tek işte birleşir:
 * "Tuvalet Genel Kontrol", her gün 10:00, 11:00, 12:00, 14:00, 15:00, 16:00, 17:00.
 * Eski atamalar dün itibarıyla kapanır (geçmiş kayıtlar korunur), aynı mekan/kişi için yenisi bugün başlar.
 * Yönetici bu birleştirmeyi zaten yaptıysa ya da eski işler yoksa hiçbir şey değişmez.
 */
function schema_merge_toilet_check(PDO $pdo): void
{
    $name = 'Tuvalet Genel Kontrol';
    $times = '10:00,11:00,12:00,14:00,15:00,16:00,17:00';
    $find = $pdo->prepare('SELECT id FROM tasks WHERE name = ? AND active = 1');
    $old = [];
    foreach (['Saatlik lavaboların yapılması', 'Tuvalet kağıdı ve havlu kağıt kontrolü'] as $n) {
        $find->execute([$n]);
        if ($id = $find->fetchColumn()) {
            $old[] = (int)$id;
        }
    }
    $find->execute([$name]);
    if (!$old || $find->fetchColumn()) {
        return;
    }
    $now = date('Y-m-d H:i:s');
    $today = date('Y-m-d');
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $in = implode(',', $old);
    $pdo->beginTransaction();
    try {
        $pdo->prepare("INSERT INTO tasks (name, freq_type, freq_interval, weekdays, month_day, due_time, times, kind, active, created_at)
                       VALUES (?, 'daily', 1, NULL, NULL, '10:00', ?, 'consumable', 1, ?)")->execute([$name, $times, $now]);
        $new = (int)$pdo->lastInsertId();

        // Paketler: eski işlerin yerine tek satır (ilk eski işin sırasında)
        foreach ($pdo->query("SELECT package_id, MIN(sort_order) AS so FROM package_items WHERE task_id IN ($in) GROUP BY package_id")->fetchAll() as $r) {
            $pdo->prepare("DELETE FROM package_items WHERE package_id = ? AND task_id IN ($in)")->execute([$r['package_id']]);
            $pdo->prepare("INSERT INTO package_items (package_id, task_id, freq_type, freq_interval, weekdays, month_day, due_time, times, sort_order)
                           VALUES (?, ?, 'daily', 1, NULL, NULL, '10:00', ?, ?)")->execute([$r['package_id'], $new, $times, (int)$r['so']]);
        }

        // Mekan ↔ iş bağlantıları
        $locs = $pdo->query("SELECT DISTINCT location_id FROM location_tasks WHERE task_id IN ($in)")->fetchAll(PDO::FETCH_COLUMN);
        $pdo->exec("DELETE FROM location_tasks WHERE task_id IN ($in)");
        link_pairs($pdo, array_map(fn($l) => [(int)$l, $new], $locs));

        // Atamalar: her mekan + kişi + paket için bir yeni atama
        $groups = [];
        foreach ($pdo->query("SELECT * FROM plans WHERE active = 1 AND task_id IN ($in) ORDER BY id")->fetchAll() as $p) {
            $key = $p['location_id'] . '|' . ($p['user_id'] ?? '') . '|' . ($p['package_id'] ?? '');
            $groups[$key] = $groups[$key] ?? $p;
            $pdo->prepare('UPDATE plans SET active = 0, end_date = ? WHERE id = ?')->execute([$yesterday, $p['id']]);
        }
        $ins = $pdo->prepare("INSERT INTO plans (task_id, location_id, user_id, package_id, freq_type, freq_interval, weekdays, month_day, due_time, times, start_date, end_date, note, active, created_at)
                              VALUES (?, ?, ?, ?, 'daily', 1, NULL, NULL, '10:00', ?, ?, NULL, NULL, 1, ?)");
        foreach ($groups as $p) {
            $ins->execute([$new, $p['location_id'], $p['user_id'], $p['package_id'], $times, max($today, substr((string)$p['start_date'], 0, 10)), $now]);
        }
        $pdo->exec("UPDATE tasks SET active = 0 WHERE id IN ($in)");
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * v9/v10: Takvime bağlı olmayan işleri "İhtiyaç olduğunda" (on_demand) ya da "Sürekli görev" (routine) türüne çevirir. Her gün planlı eski atama dün itibarıyla
 * kapanır (geçmiş korunur), aynı mekan/kişi için "ihtiyaç olduğunda" ataması bugün başlar.
 * Yalnızca hâlâ "Her gün" olan işlere dokunur; yönetici sıklığı değiştirdiyse olduğu gibi kalır.
 */
function schema_make_on_demand(PDO $pdo, array $names, string $type = 'on_demand', array $fromTypes = ['daily']): void
{
    $today = date('Y-m-d');
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $now = date('Y-m-d H:i:s');
    $in = implode(',', array_map(fn($t) => $pdo->quote($t), $fromTypes));
    $find = $pdo->prepare("SELECT id FROM tasks WHERE name = ? AND active = 1 AND freq_type IN ($in)");
    $od = "freq_type = '$type', freq_interval = 1, weekdays = NULL, month_day = NULL, due_time = NULL, times = NULL";
    foreach ($names as $n) {
        $find->execute([$n]);
        $tid = (int)$find->fetchColumn();
        if (!$tid) {
            continue;
        }
        $pdo->beginTransaction();
        try {
            $pdo->prepare("UPDATE tasks SET $od WHERE id = ?")->execute([$tid]);
            $pdo->prepare("UPDATE package_items SET $od WHERE task_id = ? AND freq_type IN ($in)")->execute([$tid]);
            $plans = $pdo->prepare("SELECT * FROM plans WHERE task_id = ? AND active = 1 AND freq_type IN ($in)");
            $plans->execute([$tid]);
            foreach ($plans->fetchAll() as $p) {
                $pdo->prepare('UPDATE plans SET active = 0, end_date = ? WHERE id = ?')->execute([$yesterday, $p['id']]);
                $pdo->prepare("INSERT INTO plans (task_id, location_id, user_id, package_id, freq_type, freq_interval, weekdays, month_day, due_time, times, start_date, end_date, note, active, created_at)
                               VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, NULL, NULL, ?, ?, ?, 1, ?)")
                    ->execute([$tid, $p['location_id'], $p['user_id'], $p['package_id'], $type, max($today, substr((string)$p['start_date'], 0, 10)), $p['end_date'] ?: null, $p['note'], $now]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}

/**
 * v13: "Yemek görevi" her gün tek kişide değil, haftalık nöbetle yapılır (12:00):
 * Pazartesi Aysel Akman, Salı Deniz Karabulut, Çarşamba Gülnaz Yalçın, Perşembe Yalçın Bıçakcı, Cuma Mumin Tekin.
 * Her gün planlı eski atama dün itibarıyla kapanır (geçmiş korunur). Yönetici sıklığı değiştirdiyse dokunulmaz.
 */
function schema_meal_rotation(PDO $pdo): void
{
    $tid = (int)$pdo->query("SELECT id FROM tasks WHERE name = 'Yemek görevi' AND active = 1")->fetchColumn();
    if (!$tid) {
        return;
    }
    $old = $pdo->prepare("SELECT * FROM plans WHERE task_id = ? AND active = 1 AND freq_type = 'daily' ORDER BY id");
    $old->execute([$tid]);
    $plans = $old->fetchAll();
    if (!$plans) {
        return;
    }
    $rota = [1 => 'aysel.akman', 2 => 'deniz.karabulut', 3 => 'gulnaz.yalcin', 4 => 'yalcin.bicakci', 5 => 'mumin.tekin'];
    $uid = $pdo->prepare('SELECT id FROM users WHERE username = ? AND active = 1');
    $today = date('Y-m-d');
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $now = date('Y-m-d H:i:s');
    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE package_items SET freq_type = 'weekly', freq_interval = 1, weekdays = '1', month_day = NULL, times = NULL
                       WHERE task_id = ? AND freq_type = 'daily'")->execute([$tid]);
        $ins = $pdo->prepare("INSERT INTO plans (task_id, location_id, user_id, package_id, freq_type, freq_interval, weekdays, month_day, due_time, times, start_date, end_date, note, active, created_at)
                              VALUES (?, ?, ?, ?, 'weekly', 1, ?, NULL, ?, NULL, ?, NULL, ?, 1, ?)");
        foreach ($plans as $p) {
            $pdo->prepare('UPDATE plans SET active = 0, end_date = ? WHERE id = ?')->execute([$yesterday, $p['id']]);
            foreach ($rota as $day => $username) {
                $uid->execute([$username]);
                $u = $uid->fetchColumn();
                $ins->execute([$tid, $p['location_id'], $u ?: $p['user_id'], $p['package_id'], (string)$day, $p['due_time'] ?: '12:00',
                    max($today, substr((string)$p['start_date'], 0, 10)), $p['note'], $now]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * v14: Yemek görevi "Genel" mekanında görünür ve kendi paketinde ("Yemek Görevi Nöbeti") durur.
 * Bugünden önce başlamış atamalar dün itibarıyla kapanıp Genel'de yeniden başlar (geçmiş Çay Ocağı'nda kalır).
 */
function schema_meal_to_general(PDO $pdo): void
{
    $tid = (int)$pdo->query("SELECT id FROM tasks WHERE name = 'Yemek görevi' AND active = 1")->fetchColumn();
    if (!$tid) {
        return;
    }
    $now = date('Y-m-d H:i:s');
    $today = date('Y-m-d');
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $pdo->beginTransaction();
    try {
        $gen = (int)$pdo->query("SELECT id FROM locations WHERE name = 'Genel' AND active = 1")->fetchColumn();
        if (!$gen) {
            $sort = (int)$pdo->query('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM locations')->fetchColumn();
            $pdo->prepare('INSERT INTO locations (name, sort_order, active, created_at) VALUES (?, ?, 1, ?)')->execute(['Genel', $sort, $now]);
            $gen = (int)$pdo->lastInsertId();
        }
        $pkg = (int)$pdo->query("SELECT id FROM packages WHERE name = 'Yemek Görevi Nöbeti'")->fetchColumn();
        if (!$pkg) {
            $pdo->prepare('INSERT INTO packages (name, description, color, created_at) VALUES (?, ?, ?, ?)')
                ->execute(['Yemek Görevi Nöbeti', 'Mekana bağlı olmayan, her gün farklı personelin yaptığı yemek görevi', '#0369a1', $now]);
            $pkg = (int)$pdo->lastInsertId();
        }
        // Paket satırı yeni pakete taşınır (Çay Ocağı paketinden çıkar)
        $item = $pdo->prepare('SELECT id FROM package_items WHERE task_id = ? ORDER BY id LIMIT 1');
        $item->execute([$tid]);
        if ($iid = $item->fetchColumn()) {
            $pdo->prepare('UPDATE package_items SET package_id = ?, sort_order = 0 WHERE id = ?')->execute([$pkg, $iid]);
            $pdo->prepare('DELETE FROM package_items WHERE task_id = ? AND id <> ?')->execute([$tid, $iid]);
        }
        $plans = $pdo->prepare('SELECT * FROM plans WHERE task_id = ? AND active = 1 AND location_id <> ?');
        $plans->execute([$tid, $gen]);
        $ins = $pdo->prepare('INSERT INTO plans (task_id, location_id, user_id, package_id, freq_type, freq_interval, weekdays, month_day, due_time, times, start_date, end_date, note, active, created_at)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)');
        foreach ($plans->fetchAll() as $p) {
            if (substr((string)$p['start_date'], 0, 10) >= $today) {
                $pdo->prepare('UPDATE plans SET location_id = ?, package_id = ? WHERE id = ?')->execute([$gen, $pkg, $p['id']]);
                continue;
            }
            $pdo->prepare('UPDATE plans SET active = 0, end_date = ? WHERE id = ?')->execute([$yesterday, $p['id']]);
            $ins->execute([$tid, $gen, $p['user_id'], $pkg, $p['freq_type'], $p['freq_interval'], $p['weekdays'], $p['month_day'], $p['due_time'], $p['times'],
                $today, $p['end_date'] ?: null, $p['note'], $now]);
        }
        $pdo->prepare('DELETE FROM location_tasks WHERE task_id = ? AND location_id <> ?')->execute([$tid, $gen]);
        link_pairs($pdo, [[$gen, $tid]]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * v15: Artık yapılmayan işleri kaldırır: atamalar dün itibarıyla kapanır (geçmiş kayıtlar raporlarda kalır),
 * iş paketlerden ve mekan bağlantılarından çıkar, iş tanımı pasif olur.
 */
function schema_retire_tasks(PDO $pdo, array $names): void
{
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $today = date('Y-m-d');
    $find = $pdo->prepare('SELECT id FROM tasks WHERE name = ? AND active = 1');
    foreach ($names as $n) {
        $find->execute([$n]);
        $tid = (int)$find->fetchColumn();
        if (!$tid) {
            continue;
        }
        $pdo->prepare('UPDATE plans SET active = 0, end_date = ? WHERE task_id = ? AND active = 1 AND start_date < ?')->execute([$yesterday, $tid, $today]);
        $pdo->prepare('DELETE FROM plans WHERE task_id = ? AND active = 1 AND start_date >= ? AND id NOT IN (SELECT plan_id FROM completions)')->execute([$tid, $today]);
        $pdo->prepare('UPDATE plans SET active = 0, end_date = ? WHERE task_id = ? AND active = 1')->execute([$yesterday, $tid]);
        $pdo->prepare('DELETE FROM package_items WHERE task_id = ?')->execute([$tid]);
        $pdo->prepare('DELETE FROM location_tasks WHERE task_id = ?')->execute([$tid]);
        $pdo->prepare('UPDATE tasks SET active = 0 WHERE id = ?')->execute([$tid]);
    }
}

/** v16: Mevcut kuruluma yeni bir sürekli görev ekler (iş, paket satırı, mekan bağlantısı ve kişiye atama). Varsa dokunmaz. */
function schema_add_routine(PDO $pdo, string $name, string $package, string $location, string $username): void
{
    $q = fn(string $sql, array $p = []) => (function ($st) use ($p) { $st->execute($p); return $st->fetchColumn(); })($pdo->prepare($sql));
    if ($q('SELECT 1 FROM tasks WHERE name = ? AND active = 1', [$name])) {
        return;
    }
    $now = date('Y-m-d H:i:s');
    $lid = (int)$q('SELECT id FROM locations WHERE name = ? AND active = 1', [$location]);
    $pid = (int)$q('SELECT id FROM packages WHERE name = ?', [$package]);
    $uid = (int)$q('SELECT id FROM users WHERE username = ? AND active = 1', [$username]);
    $pdo->prepare("INSERT INTO tasks (name, freq_type, freq_interval, kind, active, created_at) VALUES (?, 'routine', 1, 'normal', 1, ?)")->execute([$name, $now]);
    $tid = (int)$pdo->lastInsertId();
    if ($pid) {
        $so = (int)$q('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM package_items WHERE package_id = ?', [$pid]);
        $pdo->prepare("INSERT INTO package_items (package_id, task_id, freq_type, freq_interval, sort_order) VALUES (?, ?, 'routine', 1, ?)")->execute([$pid, $tid, $so]);
    }
    if ($lid) {
        link_pairs($pdo, [[$lid, $tid]]);
        if ($uid) {
            $pdo->prepare("INSERT INTO plans (task_id, location_id, user_id, package_id, freq_type, freq_interval, start_date, active, created_at)
                           VALUES (?, ?, ?, ?, 'routine', 1, ?, 1, ?)")->execute([$tid, $lid, $uid, $pid ?: null, date('Y-m-d'), $now]);
        }
    }
}

function looks_consumable(string $name): bool
{
    $n = mb_strtolower(str_replace(['İ', 'I'], ['i', 'ı'], $name));
    if (str_contains($n, 'temizl')) {
        return false; // "… çevresi temizliği" gibi temizlik işleri sarf malzemesi değildir.
    }
    return (bool)preg_match('/genel kontrol|tuvalet ka[gğ]ı|havlu|sabun|sebil|damacana|rulo|ikram taba[gğ]ı|ö[gğ]ütücü|\bpil\b/u', $n);
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
        'Genel',
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
            ['Çay hazırlama', 'routine', 1, null, null, null],
            ['Bulaşık Yıkama', 'routine', 1, null, null, null],
            ['Makam Odaları Çay İkram Hizmetleri', 'routine', 1, null, null, null],
            ['Çay malzeme eksiklerinin tedarik edilmesi', 'on_demand', 1, null, null, null],
            ['Su/Damacana Değişimi', 'on_demand', 1, null, null, null],
            ['Çaydanlıkların detaylı temizliği', 'weekly', 1, '5', null, '15:00'],
            ['Kahve makinesi temizliği', 'daily', 1, null, null, '16:00'],
            ['Çay Ocağı Zemin Temizliği', 'daily', 1, null, null, '17:00'],
            ['Detaylı Çay Ocağı Temizliği', 'weekly', 1, '5', null, '16:00'],
            ['Makam ikram tabağı kontrolü', 'daily', 1, null, null, '09:30'],
            ['Çay ocağı rulosunun değiştirilmesi', 'on_demand', 1, null, null, null],
            ['Toplantıların ikramlarının hazırlanması ve sunumu', 'on_demand', 1, null, null, null],
        ]],
        ['Koridor İş Paketi', '#0f766e', 'Koridor sorumlusunun odalar, tuvaletler, çay servisi ve toplantı odası işleri', [
            ['Çay demleme', 'daily', 1, null, null, '08:15', '08:15,13:00'],
            ['Odalarda masa üstü, pencere önü temizliği ve düzeni', 'daily', 1, null, null, '09:00'],
            ['Tuvalet zemin temizliği', 'daily', 1, null, null, '10:00'],
            ['Tuvalet klozet temizliği', 'daily', 1, null, null, '10:00'],
            ['Tuvalet lavabo temizliği', 'daily', 1, null, null, '10:00'],
            ['Tuvalet ayna temizliği', 'daily', 1, null, null, '10:00'],
            ['Sabunluk kontrolü', 'daily', 1, null, null, '09:30'],
            ['Tuvalet Genel Kontrol', 'daily', 1, null, null, '10:00', '10:00,11:00,12:00,14:00,15:00,16:00,17:00'],
            ['Detaylı tuvalet temizliği', 'weekly', 1, '5', null, '15:00'],
            ['Koridor pencere küpeşte önü temizliği', 'weekly', 1, '2,4', null, '14:00'],
            ['Çay servis hizmetleri', 'daily', 1, null, null, null],
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
        ['Fotokopi Alanı Paketi', '#7c3aed', 'Fotokopi alanı ve makine çevresinin düzenli temizliği', [
            ['Fotokopi makinesinin çevre temizliği', 'weekly', 1, '1,4', null, '15:00'],
        ]],
        ['Yemek Görevi Nöbeti', '#0369a1', 'Mekana bağlı olmayan, her gün farklı personelin yaptığı yemek görevi', [
            ['Yemek görevi', 'weekly', 1, '1', null, '12:00'],
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
        'Uzman Yardımcıları Koridoru' => ['Çay demleme', 'Odalarda masa üstü, pencere önü temizliği ve düzeni', 'Tuvalet zemin temizliği', 'Tuvalet klozet temizliği', 'Tuvalet lavabo temizliği', 'Tuvalet ayna temizliği', 'Sabunluk kontrolü', 'Tuvalet Genel Kontrol', 'Detaylı tuvalet temizliği', 'Koridor pencere küpeşte önü temizliği', 'Çay servis hizmetleri', 'Toplantı odalarında temizlik ve düzen oluşturulması', 'Detaylı oda temizliği', 'Misafir alanı temizliği'],
        'Makam Koridoru' => ['Çay demleme', 'Odalarda masa üstü, pencere önü temizliği ve düzeni', 'Tuvalet zemin temizliği', 'Tuvalet klozet temizliği', 'Tuvalet lavabo temizliği', 'Tuvalet ayna temizliği', 'Sabunluk kontrolü', 'Tuvalet Genel Kontrol', 'Detaylı tuvalet temizliği', 'Koridor pencere küpeşte önü temizliği', 'Çay servis hizmetleri', 'Toplantı odalarında temizlik ve düzen oluşturulması', 'Detaylı oda temizliği', 'Misafir alanı temizliği'],
        'Çay Ocağı' => ['Çay hazırlama', 'Bulaşık Yıkama', 'Makam Odaları Çay İkram Hizmetleri', 'Çay malzeme eksiklerinin tedarik edilmesi', 'Su/Damacana Değişimi', 'Çaydanlıkların detaylı temizliği', 'Kahve makinesi temizliği', 'Çay Ocağı Zemin Temizliği', 'Detaylı Çay Ocağı Temizliği', 'Makam ikram tabağı kontrolü', 'Çay ocağı rulosunun değiştirilmesi', 'Toplantıların ikramlarının hazırlanması ve sunumu'],
        'Bahçe ve Otopark' => ['Girişin temizliği, halı temizliği', 'Bahçe çöplerinin toplanması', 'Çiçeklerin bakımı, budama', 'Sulama', 'Yaprak temizliği', 'Ofis ve koridor saksı çiçeklerinin bakımı', 'Kar küreme ve tuzlama işlemleri', 'Bahçe ilaçlaması', 'Depo düzenlemesi'],
        'Fotokopi Alanı' => ['Fotokopi makinesinin çevre temizliği'],
        'Genel' => ['Yemek görevi'],
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
    ['Fotokopi Alanı Paketi', 'Fotokopi Alanı', 'deniz.karabulut', null],
    ['Bahçe Sorumluluk Paketi', 'Bahçe ve Otopark', 'mahmut.demirel', ['Girişin temizliği, halı temizliği', 'Bahçe çöplerinin toplanması', 'Çiçeklerin bakımı, budama', 'Sulama', 'Yaprak temizliği', 'Ofis ve koridor saksı çiçeklerinin bakımı', 'Bahçe ilaçlaması', 'Depo düzenlemesi']],
    ['Bahçe Sorumluluk Paketi', 'Bahçe ve Otopark', 'mahmut.demirel', ['Kar küreme ve tuzlama işlemleri'], 'winter'],
    ['Koridor İş Paketi', 'Uzman Yardımcıları Koridoru', 'deniz.karabulut', null],
    ['Koridor İş Paketi', 'Makam Koridoru', 'gulnaz.yalcin', null],
    ['Çay Ocağı Ana Sorumluluk Paketi', 'Çay Ocağı', 'aysel.akman', null],
    // Yemek görevi nöbeti (Genel, 12:00): Pazartesi Aysel, Salı Deniz, Çarşamba Gülnaz, Perşembe Yalçın, Cuma Mumin
    ['Yemek Görevi Nöbeti', 'Genel', 'aysel.akman', null, null, '1'],
    ['Yemek Görevi Nöbeti', 'Genel', 'deniz.karabulut', null, null, '2'],
    ['Yemek Görevi Nöbeti', 'Genel', 'gulnaz.yalcin', null, null, '3'],
    ['Yemek Görevi Nöbeti', 'Genel', 'yalcin.bicakci', null, null, '4'],
    ['Yemek Görevi Nöbeti', 'Genel', 'mumin.tekin', null, null, '5'],
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
    $dup = $pdo->prepare("SELECT 1 FROM plans WHERE active = 1 AND task_id = ? AND location_id = ? AND COALESCE(weekdays, '') = ?");
    $ins = $pdo->prepare('INSERT INTO plans (task_id, location_id, user_id, package_id, freq_type, freq_interval, weekdays, month_day, due_time, times, start_date, end_date, active, created_at)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)');
    $created = 0;
    $pairs = [];
    foreach (DEMO_ASSIGNMENTS as $row) {
        [$pname, $lname, $username, $only] = $row;
        [$start, $end] = ($row[4] ?? null) === 'winter' ? winter_window($today) : [$today, null];
        $days = $row[5] ?? null; // haftalık nöbet: paketteki gün yerine bu gün(ler)
        if (!isset($pkg[$pname], $loc[$lname]) || ($username !== null && !isset($usr[$username]))) {
            continue;
        }
        $items->execute([$pkg[$pname]]);
        foreach ($items->fetchAll() as $it) {
            if ($only !== null && !in_array($it['task_name'], $only, true)) {
                continue;
            }
            $wd = $days ?? $it['weekdays'];
            $dup->execute([$it['task_id'], $loc[$lname], (string)$wd]);
            if ($dup->fetchColumn()) {
                continue;
            }
            $ins->execute([$it['task_id'], $loc[$lname], $username === null ? null : $usr[$username], $pkg[$pname],
                $days ? 'weekly' : $it['freq_type'], $days ? 1 : $it['freq_interval'], $wd, $it['month_day'], $it['due_time'], $it['times'], $start, $end, $now]);
            $pairs[] = [$loc[$lname], (int)$it['task_id']];
            $created++;
        }
    }
    link_pairs($pdo, $pairs);
    return $created;
}
