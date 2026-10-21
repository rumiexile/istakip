# İş Takip — Destek Personeli Günlük İş Takibi

Destek personelinin günlük, belirli günlerde tekrarlanan ve aylık işlerini takip etmek için hazırlanmış bir web uygulaması.
Yönetici işleri ve iş paketlerini (şablonları) tanımlar, bunları mekanlara ve personele atar. Personel telefonundan
siteyi açıp işleri işaretler. Yönetici de geciken ve yapılmayan işleri anlık olarak görür.

- **Saf PHP + MySQL**, framework veya derleme adımı yok. cPanel'li her paylaşımlı hostingde (WordPress sitenizin yanında) çalışır.
- PHP 8.0+ (8.1 veya üzeri önerilir), MySQL 5.7+ / MariaDB 10.3+ (veya küçük kurulumlar için SQLite).
- Mobil uyumlu, “Ana ekrana ekle” ile uygulama gibi açılır.

## Özellikler

| Ekran | Ne yapar |
|---|---|
| **Günlük Durum** | Seçilen günün tüm işleri: yapıldı / bekliyor / gecikti / sorun. Mekan ve personel bazında ilerleme, son 7 günde yapılmayanlar. Dakikada bir kendini yeniler. |
| **İş Atamaları** | Hangi iş, hangi mekanda, kim tarafından, hangi sıklıkta yapılacak. Toplu kaldırma ve başka personele devretme. |
| **İş Paketleri** | Şablonlar: “Tuvalet Temizliği” gibi bir paketi bir kerede birden çok mekana ve kişiye atama, paket kopyalama. |
| **Mekanlar ↔ İşler** | Her mekanda hangi işlerin yapılacağı tanımlanır: iş tanımlarken mekanları, mekan tanımlarken işleri seçin ya da **Mekan × İş tablosundan** hücreye tıklayarak eşleştirin. Her işin varsayılan sıklığı vardır; mekan listesindeki **İşleri ata** ile bir mekanın tüm işleri tek seferde bir personele atanır. |
| **Personel** | Personel silinirken üzerindeki işler başkasına devredilir. Her personel kartındaki **Tebliğ** butonu, kişinin aktif işlerini mekan mekan listeleyen **görev tebliğ belgesini** hazırlar: tarih, sayı, konu, antet, metin ve imza bilgileri düzenlenir, A4 önizlemesi görülür ve yazdırılır. Belgenin altında *Tebliğ eden* ve *Tebellüğ eden* imza alanları vardır. Hazır antetli kağıda basmak için antet kapatılabilir; antet, metin ve imza bilgileri sonraki belgeler için hatırlanabilir. |
| **Sarf malzemeleri** | Su/damacana, tuvalet kağıdı ve havlu kağıt, sabunluk, makam ikram tabağı, çay ocağı rulosu gibi işler “Sarf malzemesi” türündedir: personel bir kez dokununca **Kontrol edildi**, ikinci dokunuşta **Değiştirildi** kaydedilir. Raporlarda malzeme başına kontrol ve değişim sayıları ile en çok değişen mekanlar görünür. Tür, iş formundan değiştirilebilir. |
| **Yönetici kontrolü** | Yönetici tamamlanmış bir işi açıp **Kontrol ettim** dediğinde işin yanında küçük bir ⭐ belirir. Personel uygulamayı açınca “işiniz yönetici tarafından kontrol edildi” bildirimini alır ve kendi listesinde yıldızı görür. Kontrol edilmiş iş personel tarafından geri alınamaz. |
| **Karekodla sorun bildirimi** | Her mekanın kendine özel bir karekodu vardır (**Mekanlar → karekod simgesi** veya **Karekodları yazdır**; A4 afiş ya da sayfa başına 4 kapı etiketi). Karekodu okutan kurum çalışanı giriş yapmadan sorun türünü (temizlik, malzeme bitti, arıza, ısıtma/soğutma, diğer) seçer, açıklama ve isteğe bağlı fotoğraf ekler. Bildirimler **Gelen Bildirimler** ekranına düşer; menüde yeni bildirim sayısı görünür. Yönetici bildirimi *işleme alır*, *çözüldü* olarak işaretler ve yapılan işlemi not eder. Kötüye kullanıma karşı aynı tarayıcıdan 10 dakikada en fazla 5 bildirim alınır; karekod yenilenince eskisi çalışmaz; özellik Ayarlar'dan kapatılabilir. |
| **Raporlar** | Tarih aralığı, personel ve mekan filtresi. Günlük grafik, en çok aksayan işler, Excel'de açılan CSV dışa aktarma. |
| **Ayarlar** | Kurum adı, çalışma günleri, resmi tatiller. |
| **Personel ekranı (mobil)** | Bugünün işleri mekana göre gruplu. Tek dokunuşla tamamlama ve geri alma, “Sorun var” bildirimi, not ve fotoğraf ekleme. Son 14 günün şeridiyle geçmiş günlere bakma, “Bugün izinliyim” ve ileri tarihli izin bildirme. |
| **İzinler** | İzinli günlerde kişiye atanmış işler “yapılmadı” yerine **İzinli** sayılır ve başarı oranını düşürmez. Personel bugün ve sonrası için izin bildirir; yönetici geçmiş tarihler dahil herkes için izin girebilir. |

### Sıklık seçenekleri

- **Her gün**: her çalışma günü
- **X günde 1**: örn. 2 günde 1 halı kenarı paspası, 3 günde 1 çöp. Çalışma günü üzerinden sayılır.
- **Haftalık / X haftada 1**: belirli günler, örn. 2 haftada bir Çarşamba asansör temizliği
- **Aylık / X ayda 1**: ayın belirli günü, örn. ayda 1 cam silme. Gün tatile denk gelirse bir sonraki iş gününe kayar.
- **İhtiyaç olduğunda**: toplantı ikramı gibi düzenli olmayan işler. Takvime bağlı değildir; personel iş çıktıkça
  “Yapıldı”ya dokunur (gün içinde istediği kadar, not ve fotoğrafla). İşaretlenmeyen gün “yapılmadı” sayılmaz, başarı
  oranını etkilemez; Günlük Durum ve Raporlar'da kaç kez yapıldığı ayrıca görünür.
- **Sürekli görev (takip yok)**: bulaşık yıkama, çay hazırlama gibi zaten fiilen yapılan işler. Personel ekranında
  “Sürekli görevler” bölümünde bilgi olarak görünür, işaretlenmez; hiçbir sayıma ve orana girmez. Görev tebliğ belgesinde yer alır.
- İsteğe bağlı **hedef saat**: saat geçince iş “gecikti” olarak görünür.
- **Günde birden çok kez**: sıklık editöründe “Saat ekle” ile birden fazla saat girilir (ör. Tuvalet Genel Kontrol 10:00, 11:00, 12:00, 14:00, 15:00, 16:00, 17:00).
  Personel her saat için ayrı bir kontrol işaretler (1/4, 2/4…). Her kontrol bir önceki kontrolün saatinde açılır; bir sonraki
  kontrolün saati geldiğinde hâlâ yapılmamışsa “yapılmadı” sayılır. Böylece kontroller sonradan topluca işaretlenemez.

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
   11 mekanı (son mekan “Genel”: belirli bir yere bağlı olmayan görevler) ve beş iş paketini getirir: **Çay Ocağı Ana Sorumluluk Paketi** (12 iş), **Koridor İş Paketi** (15 iş), **Bahçe Sorumluluk Paketi** (9 iş), **Fotokopi Alanı Paketi** (1 iş) ve **Yemek Görevi Nöbeti** (1 iş).
   “Ön tanımlı personeli ekle” seçeneği şu kişileri ekler: Aysel Akman, Deniz Karabulut, Gülnaz Yalçın,
   Mahmut Demirel, Mumin Tekin, Yalçın Bıçakcı. Kullanıcı adları `ad.soyad` biçimindedir (örn. `aysel.akman`).
   Geçici şifreler kurulum bitince **bir kez** gösterilir. Not alıp personele iletin.
   Uygulama daha önce kurulduysa aynı kişileri yönetici panelinde **Personel → Ön tanımlı personeli ekle** butonuyla ekleyebilirsiniz.
   “Demodaki iş dağılımını da yükle” seçeneği (personel ve örnek veri seçiliyken) demodaki atamaların aynısını
   kurulum gününden başlayarak oluşturur: Koridor İş Paketi Uzman Yardımcıları Koridoru'nda Deniz Karabulut'a,
   Makam Koridoru'nda Gülnaz Yalçın'a; Çay Ocağı Ana Sorumluluk Paketi Çay Ocağı'nda Aysel Akman'a; Bahçe Sorumluluk Paketi
   Bahçe ve Otopark'ta Mahmut Demirel'e; Fotokopi Alanı Paketi Fotokopi Alanı'nda Deniz Karabulut'a atanır (kar küreme yalnızca kış döneminde, 1 Aralık – 15 Mart).
   Yemek görevi Genel mekanında, 12:00'de nöbetle yapılır: Pazartesi Aysel Akman, Salı Deniz Karabulut, Çarşamba Gülnaz Yalçın, Perşembe Yalçın Bıçakcı, Cuma Mumin Tekin.
   Dağılım sonradan **İş Atamaları** ekranından değiştirilebilir.
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
report.php         Karekodla açılan, girişsiz sorun bildirme sayfası
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
