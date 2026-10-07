<?php
declare(strict_types=1);

/**
 * İş planlarının hangi günlerde yapılması gerektiğini hesaplar.
 *
 * Tarihler içeride "gün numarası" (1970-01-01'den beri geçen gün) olarak tutulur.
 * Bir planın her "tekrarı" (occurrence) kendi tarihinden bir sonraki tekrarın
 * tarihine kadar açık kalır: bu sürede yapılmazsa "gecikmiş", bir sonraki tekrar
 * geldiğinde hâlâ yapılmamışsa "yapılmadı" sayılır.
 */
final class Sched
{
    public const TYPES = ['daily', 'every_n_days', 'weekly', 'monthly'];
    public const DAY_SHORT = [1 => 'Pzt', 2 => 'Sal', 3 => 'Çar', 4 => 'Per', 5 => 'Cum', 6 => 'Cmt', 7 => 'Paz'];

    /** @var array<int,bool> */
    private array $workDays = [];
    /** @var array<int,bool> */
    private array $holidays = [];

    public function __construct(array $workDays, array $holidayDates)
    {
        foreach ($workDays as $d) {
            $d = (int)$d;
            if ($d >= 1 && $d <= 7) {
                $this->workDays[$d] = true;
            }
        }
        if (!$this->workDays) {
            $this->workDays = [1 => true, 2 => true, 3 => true, 4 => true, 5 => true];
        }
        foreach ($holidayDates as $h) {
            $h = trim((string)$h);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $h)) {
                $this->holidays[self::dn($h)] = true;
            }
        }
    }

    public static function fromSettings(): self
    {
        $s = settings_all();
        return new self(explode(',', $s['work_days']), preg_split('/[\s,;]+/', $s['holidays']) ?: []);
    }

    public static function dn(string $ymd): int
    {
        [$y, $m, $d] = array_map('intval', explode('-', substr($ymd, 0, 10)));
        return intdiv(gmmktime(0, 0, 0, $m, $d, $y), 86400);
    }

    public static function ymd(int $dn): string
    {
        return gmdate('Y-m-d', $dn * 86400);
    }

    public static function iso(int $dn): int
    {
        return ((($dn + 3) % 7) + 7) % 7 + 1;
    }

    public static function validDate(?string $s): bool
    {
        if (!$s || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) {
            return false;
        }
        return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
    }

    public function isWorkday(int $dn): bool
    {
        return isset($this->workDays[self::iso($dn)]) && !isset($this->holidays[$dn]);
    }

    /** [a, b) aralığındaki iş günü sayısı. */
    public function workdaysBetween(int $a, int $b): int
    {
        if ($b <= $a) {
            return 0;
        }
        $full = intdiv($b - $a, 7);
        $c = $full * count($this->workDays);
        for ($d = $a + $full * 7; $d < $b; $d++) {
            if (isset($this->workDays[self::iso($d)])) {
                $c++;
            }
        }
        foreach ($this->holidays as $h => $_) {
            if ($h >= $a && $h < $b && isset($this->workDays[self::iso($h)])) {
                $c--;
            }
        }
        return $c;
    }

    /** Plan satırına hesaplamada kullanılan alanları ekler. */
    public function prep(array $p): array
    {
        $p['_start'] = self::dn($p['start_date']);
        $p['_end'] = !empty($p['end_date']) ? self::dn($p['end_date']) : null;
        $p['_n'] = max(1, (int)($p['freq_interval'] ?? 1));
        $p['_wd'] = [];
        foreach (explode(',', (string)($p['weekdays'] ?? '')) as $w) {
            $w = (int)$w;
            if ($w >= 1 && $w <= 7) {
                $p['_wd'][$w] = true;
            }
        }
        $p['_md'] = min(31, max(1, (int)($p['month_day'] ?? 1)));
        $first = $p['_start'];
        for ($i = 0; $i < 60 && !$this->isWorkday($first); $i++) {
            $first++;
        }
        $p['_first'] = $first;
        // Haftalık işlerde hafta sayımı, başlangıçtan sonraki ilk uygun günün haftasından başlar.
        $anchor = $p['_start'];
        for ($i = 0; $i < 7 && $p['_wd'] && !isset($p['_wd'][self::iso($anchor)]); $i++) {
            $anchor++;
        }
        $p['_wanchor'] = $anchor - (self::iso($anchor) - 1);
        $p['due_time'] = $p['due_time'] ?: null;
        return $p;
    }

    private function monthTarget(int $y, int $m, int $md): int
    {
        $dim = (int)gmdate('t', gmmktime(0, 0, 0, $m, 1, $y));
        $t = intdiv(gmmktime(0, 0, 0, $m, min($md, $dim), $y), 86400);
        for ($i = 0; $i < 15 && !$this->isWorkday($t); $i++) {
            $t++;
        }
        return $t;
    }

    public function isDue(array $p, int $dn): bool
    {
        if ($dn < $p['_start'] || ($p['_end'] !== null && $dn > $p['_end']) || !$this->isWorkday($dn)) {
            return false;
        }
        switch ($p['freq_type']) {
            case 'every_n_days':
                return $this->workdaysBetween($p['_first'], $dn) % $p['_n'] === 0;
            case 'weekly':
                $iso = self::iso($dn);
                if (!isset($p['_wd'][$iso])) {
                    return false;
                }
                $weeks = intdiv($dn - ($iso - 1) - $p['_wanchor'], 7);
                return $weeks >= 0 && $weeks % $p['_n'] === 0;
            case 'monthly':
                $y = (int)gmdate('Y', $dn * 86400);
                $m = (int)gmdate('n', $dn * 86400);
                $sy = (int)gmdate('Y', $p['_start'] * 86400);
                $sm = (int)gmdate('n', $p['_start'] * 86400);
                // Hedef gün tatile denk gelip bir sonraki aya kayabileceği için önceki ayı da kontrol et.
                foreach ([[$y, $m], $m === 1 ? [$y - 1, 12] : [$y, $m - 1]] as [$yy, $mm]) {
                    if ($this->monthTarget($yy, $mm, $p['_md']) === $dn) {
                        $since = ($yy * 12 + $mm) - ($sy * 12 + $sm);
                        if ($since >= 0 && $since % $p['_n'] === 0) {
                            return true;
                        }
                    }
                }
                return false;
            default: // daily
                return true;
        }
    }

    public function lookback(array $p): int
    {
        switch ($p['freq_type']) {
            case 'every_n_days':
                return $p['_n'] * 3 + 20;
            case 'weekly':
                return $p['_n'] * 7 + 20;
            case 'monthly':
                return $p['_n'] * 31 + 20;
            default:
                return 20;
        }
    }

    /** dn veya öncesindeki en son tekrar. */
    public function latest(array $p, int $dn): ?int
    {
        $min = max($p['_start'], $dn - $this->lookback($p));
        for ($d = $dn; $d >= $min; $d--) {
            if ($this->isDue($p, $d)) {
                return $d;
            }
        }
        return null;
    }

    /** from veya sonrasındaki ilk tekrar. */
    public function next(array $p, int $from): ?int
    {
        $max = $from + $this->lookback($p);
        if ($p['_end'] !== null) {
            $max = min($max, $p['_end']);
        }
        for ($d = max($from, $p['_start']); $d <= $max; $d++) {
            if ($this->isDue($p, $d)) {
                return $d;
            }
        }
        return null;
    }

    /** @return int[] */
    public function occurrences(array $p, int $from, int $to): array
    {
        $out = [];
        $from = max($from, $p['_start']);
        if ($p['_end'] !== null) {
            $to = min($to, $p['_end']);
        }
        for ($d = $from; $d <= $to; $d++) {
            if ($this->isDue($p, $d)) {
                $out[] = $d;
            }
        }
        return $out;
    }

    /**
     * done | issue | pending | overdue | missed | upcoming
     */
    public function status(array $p, int $occ, ?array $completion, int $today, string $nowHm): string
    {
        if ($completion) {
            return $completion['status'] === 'issue' ? 'issue' : 'done';
        }
        if ($occ > $today) {
            return 'upcoming';
        }
        $next = $this->next($p, $occ + 1);
        if ($next !== null && $next <= $today) {
            return 'missed';
        }
        if ($next === null && $p['_end'] !== null && $today > $p['_end']) {
            return 'missed';
        }
        if ($occ < $today) {
            return 'overdue';
        }
        if ($p['due_time'] && $nowHm > $p['due_time']) {
            return 'overdue';
        }
        return 'pending';
    }

    public static function label(array $p): string
    {
        $n = max(1, (int)($p['freq_interval'] ?? 1));
        switch ($p['freq_type']) {
            case 'every_n_days':
                return $n === 1 ? 'Her gün' : "$n günde 1";
            case 'weekly':
                $days = [];
                foreach (explode(',', (string)$p['weekdays']) as $w) {
                    if (isset(self::DAY_SHORT[(int)$w])) {
                        $days[] = self::DAY_SHORT[(int)$w];
                    }
                }
                $d = implode(', ', $days);
                return ($n === 1 ? 'Her hafta' : "$n haftada 1") . ($d ? " · $d" : '');
            case 'monthly':
                $md = (int)$p['month_day'];
                return ($n === 1 ? 'Her ay' : "$n ayda 1") . " · ayın $md. günü";
            default:
                return 'Her gün';
        }
    }
}
