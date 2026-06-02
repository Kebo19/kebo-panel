// Türkiye resmi tatilleri (sabit tarihler)
const SABIT_TATILLER = (yil: number) => [
  `${yil}-01-01`, // Yılbaşı
  `${yil}-04-23`, // Ulusal Egemenlik
  `${yil}-05-01`, // İşçi Bayramı
  `${yil}-05-19`, // Atatürk'ü Anma
  `${yil}-07-15`, // Demokrasi Bayramı
  `${yil}-08-30`, // Zafer Bayramı
  `${yil}-10-29`, // Cumhuriyet Bayramı
];

// Ramazan ve Kurban Bayramı (yaklaşık - 2024-2030)
const DINI_TATILLER: string[] = [
  // Ramazan 2024: 10-11-12 Nisan
  "2024-04-10", "2024-04-11", "2024-04-12",
  // Kurban 2024: 16-17-18-19 Haziran
  "2024-06-16", "2024-06-17", "2024-06-18", "2024-06-19",
  // Ramazan 2025: 30-31 Mart, 1 Nisan
  "2025-03-30", "2025-03-31", "2025-04-01",
  // Kurban 2025: 6-7-8-9 Haziran
  "2025-06-06", "2025-06-07", "2025-06-08", "2025-06-09",
  // Ramazan 2026: 19-20-21 Mart
  "2026-03-19", "2026-03-20", "2026-03-21",
  // Kurban 2026: 26-27-28-29 Mayıs
  "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29",
];

export function isTatilGunu(tarih: Date): boolean {
  const yil = tarih.getFullYear();
  const gun = tarih.getDay(); // 0=Pazar, 6=Cumartesi
  if (gun === 0 || gun === 6) return true;

  const tarihStr = tarih.toISOString().split("T")[0];
  if (SABIT_TATILLER(yil).includes(tarihStr)) return true;
  if (DINI_TATILLER.includes(tarihStr)) return true;
  return false;
}

export function ilkIşGunu(tarih: Date): Date {
  const d = new Date(tarih);
  while (isTatilGunu(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// Fatura tarihine göre hangi ödeme dönemine düştüğünü bul
// Dönem: her ayın 16'sı - sonraki ayın 15'i
// Ödeme tarihi: dönem bitişinden sonraki ayın 25'i
export function odemeDonemi(faturaTarihi: string): {
  donemBaslangic: string;
  donemBitis: string;
  odemeVadesi: Date;
  odemeVadesiStr: string;
} {
  const tarih = new Date(faturaTarihi);
  const gun = tarih.getDate();
  const ay = tarih.getMonth(); // 0-11
  const yil = tarih.getFullYear();

  let donemBasAy: number, donemBasYil: number;
  let donemBitAy: number, donemBitYil: number;
  let odemeAy: number, odemeYil: number;

  if (gun >= 16) {
    // 16-31 arası → bu ayın 16 - sonraki ayın 15
    donemBasAy = ay;
    donemBasYil = yil;
    donemBitAy = ay + 1 > 11 ? 0 : ay + 1;
    donemBitYil = ay + 1 > 11 ? yil + 1 : yil;
    odemeAy = donemBitAy + 1 > 11 ? 0 : donemBitAy + 1;
    odemeYil = donemBitAy + 1 > 11 ? donemBitYil + 1 : donemBitYil;
  } else {
    // 1-15 arası → geçen ayın 16 - bu ayın 15
    donemBasAy = ay - 1 < 0 ? 11 : ay - 1;
    donemBasYil = ay - 1 < 0 ? yil - 1 : yil;
    donemBitAy = ay;
    donemBitYil = yil;
    odemeAy = ay + 1 > 11 ? 0 : ay + 1;
    odemeYil = ay + 1 > 11 ? yil + 1 : yil;
  }

  const pad = (n: number) => String(n + 1).padStart(2, "0");
  const donemBaslangic = `${donemBasYil}-${pad(donemBasAy)}-16`;
  const donemBitis = `${donemBitYil}-${pad(donemBitAy)}-15`;

  const vadeTarihi = new Date(odemeYil, odemeAy, 25);
  const odemeVadesi = ilkIşGunu(vadeTarihi);
  const odemeVadesiStr = odemeVadesi.toISOString().split("T")[0];

  return { donemBaslangic, donemBitis, odemeVadesi, odemeVadesiStr };
}

// Tüm bekleyen faturaları dönemlere göre grupla
export function faturaları­Dönemlere­Grupla(faturalar: { fatura_tarihi: string; toplam_tutar: number; fatura_no: string; id: string; durum: string }[]) {
  const donemMap = new Map<string, {
    odemeVadesiStr: string;
    odemeVadesi: Date;
    donemBaslangic: string;
    donemBitis: string;
    faturalar: typeof faturalar;
    toplamTutar: number;
  }>();

  faturalar.filter(f => f.durum !== "odendi").forEach(f => {
    if (!f.fatura_tarihi) return;
    const donem = odemeDonemi(f.fatura_tarihi);
    const key = donem.odemeVadesiStr;

    if (!donemMap.has(key)) {
      donemMap.set(key, {
        odemeVadesiStr: donem.odemeVadesiStr,
        odemeVadesi: donem.odemeVadesi,
        donemBaslangic: donem.donemBaslangic,
        donemBitis: donem.donemBitis,
        faturalar: [],
        toplamTutar: 0,
      });
    }
    const d = donemMap.get(key)!;
    d.faturalar.push(f);
    d.toplamTutar += f.toplam_tutar || 0;
  });

  return Array.from(donemMap.values()).sort((a, b) => a.odemeVadesiStr.localeCompare(b.odemeVadesiStr));
}