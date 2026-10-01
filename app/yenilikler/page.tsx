import { Sparkles } from "lucide-react";

// Statik değişiklik günlüğü — en yeni sürüm en üstte. Yeni sürümde listenin
// başına bir öğe eklemek yeterli.
const SURUMLER: { tarih: string; baslik: string; maddeler: string[] }[] = [
  {
    tarih: "01.10.2026",
    baslik: "Yeni koyu tasarım ve kurye tahsilatı",
    maddeler: [
      "Bütün panel yeni koyu temaya geçti: altın vurgular, KEBO logosu, her sayfada aynı simge dili.",
      "Ctrl + K ile her yerden sayfa araması (mobilde üstteki büyüteç).",
      "Anasayfa yenilendi: eğilim çizgili özet kartları, kadro ve bu ay panelleri, hızlı erişim.",
      "Sayfa geçişleri, menü ve kartlarda yumuşak hareketler.",
      "Kurye 1 ve Kurye 2 kapıda topladığı nakit ve POS'u gün sonu kasaya teslim eder; kasa beklentisine girer.",
      "Havuz kuryelerinin kapıda tahsilatı ciroya eklenir ama kasada beklenmez; Roadrunner borcundan düşülür.",
      "Roadrunner mutabakatında POS komisyonu yalnızca Roadrunner'ın POS'uyla çekilen tutara uygulanır.",
    ],
  },
  {
    tarih: "29.09.2026",
    baslik: "Personel, maliyet ve finans",
    maddeler: [
      "Yetkilendirme: Ayarlar > Yetkilendirme'den kullanıcı ekleme ve kişi bazında erişim",
      "Puantaj: günlük raporda o gün çalışanlar işaretlenir; aylık puantaj tablosu eklendi.",
      "Kâr / Zarar sayfası: dönemin gelir, gider ve kârı tek ekranda.",
      "Sabit giderler: kira, fatura gibi düzenli giderler tanımlanabiliyor.",
      "Banka ekstresi içe aktarma: ekstre dosyası yüklenip kasa hareketlerine işlenebiliyor.",
      "POS ve yemek kartı mutabakatı: bankaya yatan tutarlar raporlarla karşılaştırılıyor.",
      "Vade takvimi, cari ekstre ve KDV özeti eklendi.",
      "İrsaliyeden faturaya tek giriş: irsaliye kalemleri faturaya doğrudan aktarılıyor.",
      "Reçete & maliyet: menü ürünlerinin stok maliyeti hesaplanıyor.",
      "Rapor Analizi sadeleşti.",
      "Sağ alttaki “?” düğmesiyle her sayfadan sorun bildirilebiliyor.",
      "İşlem geçmişi: kim, neyi, ne zaman değiştirdi görülebiliyor.",
      "Personel kimlik numarası ve IBAN bilgisi sadece yetkili kullanıcılara açık.",
    ],
  },
  {
    tarih: "25–28.09.2026",
    baslik: "Günlük kasa raporu ve stok",
    maddeler: [
      "Yeni tek sayfa kağıt kasa formu.",
      "Kağıt formun fotoğrafından rapor otomatik dolduruluyor (fişten tarama).",
      "Paket sayıları uyuşmazsa rapor kaydedilmiyor.",
      "Kurye için 30 paket garantisi.",
      "Nakit kasa takibi ve kasa sayımı.",
      "Yemek kartları (Edenred, Metropol, Setcard, Pluxee, Paye) ayrı ayrı giriliyor.",
      "28.09'dan itibaren kendi POS kuralı uygulanıyor.",
      "Stok modülü ve irsaliye girişi eklendi.",
    ],
  },
];

export default function YeniliklerPage() {
  return (
    <main className="min-h-screen bg-zemin text-yazi p-4 sm:p-5">
      <div className="pt-5 mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <Sparkles size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black">Yenilikler</h1>
          <p className="text-[13px] text-gray-500">Panele eklenen özellikler</p>
        </div>
      </div>

      <div className="max-w-2xl space-y-4">
        {SURUMLER.map((s, i) => (
          <section key={s.tarih} className="bg-kart border border-cizgi rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/25">
                {s.tarih}
              </span>
              <h2 className="text-[15px] font-bold">{s.baslik}</h2>
              {i === 0 && <span className="ml-auto text-[11px] font-semibold text-green-300">En yeni</span>}
            </div>
            <ul className="space-y-2">
              {s.maddeler.map(m => (
                <li key={m} className="flex gap-2 text-[14px] text-gray-700">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
