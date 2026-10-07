# İş Takip — Destek Personeli Günlük İş Takibi

Destek personelinin günlük, belirli günlerde tekrarlanan ve aylık işlerini takip etmek için hazırlanmış bir web uygulaması.
Yönetici işleri ve iş paketlerini (şablonları) tanımlar, bunları mekanlara ve personele atar. Personel telefonundan
siteyi açıp işleri işaretler. Yönetici de geciken ve yapılmayan işleri anlık olarak görür.

- **Saf PHP + MySQL**, framework veya derleme adımı yok. cPanel'li her paylaşımlı hostingde (WordPress sitenizin yanında) çalışır.
- PHP 7.4+ (8.x önerilir), MySQL 5.7+ / MariaDB 10.3+ (veya küçük kurulumlar için SQLite).
- Mobil uyumlu, “Ana ekrana ekle” ile uygulama gibi açılır.

## Özellikler

| Ekran | Ne yapar |
|---|---|
| **Günlük Durum** | Seçilen günün tüm işleri: yapıldı / bekliyor / gecikti / sorun. Mekan ve personel bazında ilerleme, son 7 günde yapılmayanlar. Dakikada bir kendini yeniler. |
| **İş Atamaları** | Hangi iş, hangi mekanda, kim tarafından, hangi sıklıkta yapılacak. Toplu kaldırma ve başka personele devretme. |
| **İş Paketleri** | Şablonlar: “Tuvalet Temizliği” gibi bir paketi bir kerede birden çok mekana ve kişiye atama, paket kopyalama. |
| **İş Tanımları / Mekanlar / Personel** | Temel tanımlar. Personel silinirken üzerindeki işler başkasına devredilir. |
| **Raporlar** | Tarih aralığı, personel ve mekan filtresi. Günlük grafik, en çok aksayan işler, Excel'de açılan CSV dışa aktarma. |
| **Ayarlar** | Kurum adı, çalışma günleri, resmi tatiller. |
| **Personel ekranı (mobil)** | Bugünün işleri mekana göre gruplu. Tek dokunuşla tamamlama ve geri alma, “Sorun var” bildirimi, not ve fotoğraf ekleme. |

### Sıklık seçenekleri

- **Her gün**: her çalışma günü
- **X günde 1**: örn. 2 günde 1 halı kenarı paspası, 3 günde 1 çöp. Çalışma günü üzerinden sayılır.
- **Haftalık / X haftada 1**: belirli günler, örn. 2 haftada bir Çarşamba asansör temizliği
- **Aylık / X ayda 1**: ayın belirli günü, örn. ayda 1 cam silme. Gün tatile denk gelirse bir sonraki iş gününe kayar.
- İsteğe bağlı **hedef saat**: saat geçince iş “gecikti” olarak görünür.

**Gecikme kuralı:** Bir işin her tekrarı, bir sonraki tekrarına kadar açık kalır. Örneğin “3 günde 1” bir iş
zamanında yapılmazsa personelin listesinde “kalan iş” olarak durmaya devam eder. Bir sonraki tekrar geldiğinde
hâlâ yapılmamışsa o tekrar **yapılmadı** olarak kaydedilir ve raporlara düşer.

## cPanel'e kurulum

1. **Veritabanı oluşturun:** cPanel → *MySQL® Databases*
   - Yeni bir veritabanı oluşturun (örn. `kullanici_istakip`).
   - Yeni bir kullanıcı oluşturup veritabanına **ALL PRIVILEGES** yetkisiyle ekleyin.
2. **Dosyaları yükleyin:** cPanel → *File Manager*
   - `public_html` altında bir klasör açın (örn. `public_html/istakip`). WordPress'e dokunmanıza gerek yok.
   - Bu repodaki tüm dosyaları zip olarak yükleyip klasörün içinde *Extract* edin.
   - Alternatif olarak bir alt alan adı (örn. `istakip.siteniz.com`) açıp kök klasörünü bu klasör olarak gösterebilirsiniz.
3. **Kurulum sihirbazı:** Tarayıcıda `https://siteniz.com/istakip/install.php` adresini açın.
   Veritabanı bilgilerini, kurum adını ve yönetici hesabını girin. “Örnek verileri yükle” seçeneği,
   sizin listenizdeki işleri 5 hazır paket halinde getirir.
4. **Güvenlik:** Kurulumdan sonra `install.php` dosyasını silin. Sitede **SSL (https)** açık olsun
   (cPanel → *SSL/TLS Status* → AutoSSL).
5. **Personeli ekleyin:** Yönetici paneli → *Personel*. “Giriş adresini kopyala” butonuyla adresi personele gönderin.

> PHP sürümü: cPanel → *Select PHP Version* veya *MultiPHP Manager* ekranından 8.1 veya üzerini seçin.
> Gerekli `pdo_mysql` ve `mbstring` eklentileri genelde varsayılan olarak açıktır.

### Klasör yapısı

```
index.php          Giriş + uygulama kabuğu (rol'e göre yönetici veya personel ekranı)
api.php            JSON API (tüm işlemler)
install.php        Kurulum sihirbazı (kurulumdan sonra silin)
photo.php          Fotoğrafları yalnızca giriş yapmış kullanıcılara sunar
lib/               PHP kodu (web'den erişime kapalı)
  schedule.php     Sıklık / gecikme hesaplama motoru
  schema.php       Veritabanı tabloları + örnek veriler
assets/            CSS ve JavaScript (liquid glass arayüz)
data/              Oturumlar, fotoğraflar, SQLite dosyası (web'den erişime kapalı, yazılabilir olmalı)
config.php         Kurulumda oluşturulur (git'e eklenmez)
```

### Güncelleme ve yedekleme

- Güncellerken `config.php` ve `data/` klasörüne dokunmadan diğer dosyaların üzerine yazmanız yeterli.
- Yedek için cPanel → *Backup* bölümünden veritabanını ve `data/uploads` klasörünü yedekleyin.

## Güvenlik notları

- Şifreler `password_hash` (bcrypt) ile saklanır. Tüm yazma işlemleri CSRF belirteci ile korunur ve tüm sorgular hazırlanmış ifadelerle (prepared statement) çalışır.
- Personel yalnızca kendisine atanmış ve ortak işleri görür. Kendi işaretini yalnızca aynı gün içinde geri alabilir.
- `lib/`, `data/` ve `config.php` dosyalarına `.htaccess` ile web erişimi kapatılmıştır (Apache/LiteSpeed).
- Fotoğraflar `data/uploads` altında saklanır ve yalnızca `photo.php` üzerinden, yetki kontrolüyle gösterilir.

## Yerelde deneme

```bash
php -S 127.0.0.1:8000
# http://127.0.0.1:8000/install.php → "SQLite" seçeneğiyle kurun
```

## Etkileşimli demo

`demo/` klasörü, sunucu gerektirmeden tarayıcıda çalışan bir demo içerir: `demo/mock.js` sunucudaki `api.php`'nin
JavaScript karşılığıdır ve örnek verilerle çalışır. `python3 demo/build.py` komutu, gerçek arayüz dosyalarıyla bu
katmanı birleştirip `demo/istakip-demo.html` dosyasını üretir. Canlı sunucuya yüklerken `demo/` klasörünü atlayabilirsiniz.
