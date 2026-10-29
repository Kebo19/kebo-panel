// OTOMATİK ÜRETİLDİ: lib/roket.ts (+ lib/magicpay.ts) — elle düzenlemeyin. Yeniden üretmek: npx esbuild lib/roket.ts --bundle --format=esm --platform=node --outfile=mikro-robot/roket-oku.mjs

// lib/magicpay.ts
var sade = (s) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").trim();
var KANALLAR = [
  { kanal: "kebo_ys", ad: "Kebo \xB7 Yemeksepeti" },
  { kanal: "kebo_trendyol", ad: "Kebo \xB7 Trendyol" },
  { kanal: "kebo_migros", ad: "Kebo \xB7 Migros" },
  { kanal: "cnf_ys", ad: "CNF \xB7 Yemeksepeti" },
  { kanal: "cnf_trendyol", ad: "CNF \xB7 Trendyol" },
  { kanal: "cnf_migros", ad: "CNF \xB7 Migros Yemek" },
  { kanal: "kir_ys", ad: "K\u0131ralo\u011Flu \xB7 Yemeksepeti" },
  { kanal: "kir_trendyol", ad: "K\u0131ralo\u011Flu \xB7 Trendyol" },
  { kanal: "kir_migros", ad: "K\u0131ralo\u011Flu \xB7 Migros Yemek" },
  { kanal: "alo", ad: "Alo Paket (LOCAL)" }
];
function kanalBul(k) {
  const p = sade(k.platform);
  if (p === "local" || p === "restaurant") return "alo";
  const m = sade(k.marka || "");
  const marka = /chick|chikn|cnf/.test(m) ? "cnf" : /kiral|kirlog/.test(m) ? "kir" : "kebo";
  if (p.includes("yemeksepeti")) return `${marka}_ys`;
  if (p.includes("trendyol")) return `${marka}_trendyol`;
  if (p.includes("migros")) return `${marka}_migros`;
  return "diger";
}
var INDIRIM_ALANLARI = {
  kebo_ys: "os_kebo_ys_indirim",
  kebo_trendyol: "os_kebo_trendyol_indirim",
  kebo_migros: "os_kebo_migros_indirim",
  cnf_ys: "os_cnf_ys_indirim",
  cnf_trendyol: "os_cnf_trendyol_indirim",
  cnf_migros: "os_cnf_migros_yemek_indirim",
  kir_ys: "os_kir_ys_indirim",
  kir_trendyol: "os_kir_trendyol_indirim",
  kir_migros: "os_kir_migros_yemek_indirim",
  alo: "os_kebo_alo_indirim"
};
var INDIRIM_ALAN_ADLARI = Object.fromEntries(
  KANALLAR.map((k) => [INDIRIM_ALANLARI[k.kanal], `${k.ad} indirim`])
);

// lib/roket.ts
var ATAMA_ADI = { s1: "Sabit 1", s2: "Sabit 2", havuz: "Havuz" };
function atamaBul(g, k) {
  if (k.atama) return k.atama;
  if (!k.sabit) return "havuz";
  const sabitler = g.kuryeler.filter((x) => !x.atama && x.sabit);
  return sabitler.indexOf(k) === 0 ? "s1" : "s2";
}
function varsayilanAtama(kuryeler, oncekiSabit = {}) {
  const sonuc = kuryeler.map((k) => ({ ...k, atama: "havuz" }));
  for (const slot of ["s1", "s2"]) {
    const adlar = (oncekiSabit[slot] || []).map((a) => sade2(a).toLocaleLowerCase("tr-TR"));
    sonuc.forEach((k) => {
      if (k.atama === "havuz" && adlar.includes(sade2(k.ad).toLocaleLowerCase("tr-TR"))) k.atama = slot;
    });
  }
  for (const slot of ["s1", "s2"]) {
    if (sonuc.some((k) => k.atama === slot)) continue;
    const aday = sonuc.filter((k) => k.atama === "havuz").sort((a, b) => b.paket - a.paket)[0];
    if (aday) aday.atama = slot;
  }
  return sonuc;
}
var tl = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : 0;
};
var kurus = (x) => Math.round(x * 100) / 100;
var sade2 = (s) => s.replace(/\s+/g, " ").trim();
var sirala = (saat) => (saat && saat < "05:00" ? "2" : "1") + saat;
function isGunu(sipTarihi) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/.exec(String(sipTarihi ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (+m[4] < 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function roketKanali(yonlendiren) {
  const y = sade2(String(yonlendiren ?? ""));
  if (!y) return null;
  if (/^local/i.test(y)) return "alo";
  const [platform, ...marka] = y.split(" / ");
  if (!marka.length) return null;
  const k = kanalBul({ platform, marka: marka.join(" / ") });
  return k === "diger" ? null : k;
}
function roketExcelOku(satirlar) {
  const uyari = [];
  if (!satirlar.length) return { gunler: [], satir: 0, hatali: 0, uyari: ["Dosya bo\u015F."] };
  const baslik = satirlar[0].map((h) => sade2(String(h ?? "")).toLocaleLowerCase("tr-TR"));
  const sutun = (ad) => baslik.indexOf(ad.toLocaleLowerCase("tr-TR"));
  const iTarih = sutun("Sipari\u015F Tarihi"), iKurye = sutun("Kurye"), iDurum = sutun("Durum"), iTutar = sutun("Tutar"), iOdeme = sutun("\xD6deme Y\xF6ntemi"), iMesafe = sutun("Mesafe"), iYon = sutun("Y\xF6nlendiren");
  const iIsletme = sutun("\u0130\u015Fletme Ad\u0131");
  const iNo = ["Sipari\u015F No", "Sipari\u015F Numaras\u0131", "Sipari\u015F Kodu", "Fi\u015F No", "Adisyon No"].map(sutun).find((i) => i >= 0) ?? -1;
  if ([iTarih, iKurye, iDurum, iTutar, iOdeme].some((i) => i < 0)) {
    return { gunler: [], satir: 0, hatali: 0, uyari: ["Bu dosya Roket Paket Raporu'na benzemiyor (Sipari\u015F Tarihi / Kurye / Durum / Tutar / \xD6deme Y\xF6ntemi s\xFCtunlar\u0131 bulunamad\u0131)."] };
  }
  const gunler = /* @__PURE__ */ new Map();
  let satir = 0, hatali = 0;
  for (const r of satirlar.slice(1)) {
    const tarih = isGunu(r[iTarih]);
    if (!tarih) continue;
    satir++;
    const g = gunler.get(tarih) ?? { kurye: /* @__PURE__ */ new Map(), kanallar: {}, diger: 0, iptal: 0, digerler: [] };
    gunler.set(tarih, g);
    const durum = sade2(String(r[iDurum] ?? "")).toLocaleLowerCase("tr-TR");
    if (/iptal/.test(durum)) {
      g.iptal++;
      continue;
    }
    if (!/teslim/.test(durum)) continue;
    const ad = sade2(String(r[iKurye] ?? ""));
    if (!ad || /kurye (yok|planland)/i.test(ad.toLocaleLowerCase("tr-TR"))) {
      hatali++;
      continue;
    }
    const k = g.kurye.get(ad) ?? { ad, paket: 0, nakit: 0, pos: 0, paye: 0, yemek: 0, bilinmeyen: 0, km: 0, atama: "havuz" };
    g.kurye.set(ad, k);
    k.paket++;
    const km = tl(String(r[iMesafe] ?? "").replace(/km/i, "").replace(".", ","));
    k.km += km;
    const kanal = iYon >= 0 ? roketKanali(r[iYon]) : null;
    const tutar = tl(r[iTutar]);
    if (kanal) g.kanallar[kanal] = (g.kanallar[kanal] || 0) + 1;
    else {
      g.diger++;
      const no = iNo >= 0 ? sade2(String(r[iNo] ?? "")) : "";
      g.digerler.push({
        saat: /\s(\d{2}:\d{2})/.exec(String(r[iTarih] ?? ""))?.[1] || "",
        kurye: ad,
        tutar: kurus(tutar),
        odeme: sade2(String(r[iOdeme] ?? "")) || "\u2014",
        kaynak: (iYon >= 0 ? sade2(String(r[iYon] ?? "")) : "") || "Roket",
        ...iIsletme >= 0 && sade2(String(r[iIsletme] ?? "")) ? { isletme: sade2(String(r[iIsletme])) } : {},
        ...no ? { no } : {},
        ...km ? { km: kurus(km) } : {}
      });
    }
    const odeme = sade2(String(r[iOdeme] ?? "")).toLocaleLowerCase("tr-TR");
    if (/nakit/.test(odeme)) k.nakit += tutar;
    else if (/^pos|kredi|kart[ıi]? ?ile/.test(odeme)) k.pos += tutar;
    else if (/paye/.test(odeme)) k.paye += tutar;
    else if (/yemek/.test(odeme)) {
      if (kanal === "alo" || !kanal) k.yemek += tutar;
    } else if (/bilinmeyen/.test(odeme)) k.bilinmeyen += tutar;
  }
  const sonuc = [...gunler.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([tarih, g]) => {
    const kuryeler = [...g.kurye.values()].map((k) => ({
      ...k,
      nakit: kurus(k.nakit),
      pos: kurus(k.pos),
      paye: kurus(k.paye),
      yemek: kurus(k.yemek),
      bilinmeyen: kurus(k.bilinmeyen),
      km: kurus(k.km)
    })).sort((a, b) => b.paket - a.paket || a.ad.localeCompare(b.ad, "tr"));
    return {
      tarih,
      kuryeler: varsayilanAtama(kuryeler),
      kanallar: g.kanallar,
      digerPaket: g.diger,
      digerSiparisler: [...g.digerler].sort((a, b) => sirala(a.saat).localeCompare(sirala(b.saat))),
      iptal: g.iptal,
      toplamPaket: kuryeler.reduce((t, k) => t + k.paket, 0)
    };
  });
  if (hatali) uyari.push(`${hatali} teslim edilmi\u015F paketin kuryesi belli de\u011Fil (Kurye Yok / Planland\u0131); hesaba kat\u0131lmad\u0131.`);
  return { gunler: sonuc, satir, hatali, uyari };
}
var roketTahsilat = (k) => kurus(k.nakit + k.pos + k.paye + k.yemek + k.bilinmeyen);
function adEslesir(kasaAdi, roketAdi) {
  const k = sade2(kasaAdi).toLocaleLowerCase("tr-TR"), r = sade2(roketAdi).toLocaleLowerCase("tr-TR");
  if (!k || !r) return false;
  return r === k || r.split(" ")[0] === k.split(" ")[0];
}
var BOS_OZET = { paket: 0, nakit: 0, pos: 0, kart: 0, paye: 0, yemek: 0, bilinmeyen: 0 };
function slotToplami(g, slot) {
  const l = g.kuryeler.filter((k) => atamaBul(g, k) === slot);
  const t = l.reduce((a, k) => ({
    paket: a.paket + k.paket,
    nakit: kurus(a.nakit + k.nakit),
    pos: kurus(a.pos + k.pos),
    kart: kurus(a.kart + k.paye + k.yemek + k.bilinmeyen),
    paye: kurus(a.paye + k.paye),
    yemek: kurus(a.yemek + k.yemek),
    bilinmeyen: kurus(a.bilinmeyen + k.bilinmeyen)
  }), { ...BOS_OZET });
  return { ...t, adlar: l.map((k) => k.ad) };
}
function kuryeKarsilastir(gun, kasaKuryeleri) {
  const tam = (v) => parseInt(String(v ?? ""), 10) || 0;
  const kasaOzet = (l) => l.reduce((t, k) => ({
    paket: t.paket + tam(k.paketSayisi) + tam(k.uzakPaket) + tam(k.paket9km),
    nakit: kurus(t.nakit + tl(k.nakit)),
    pos: kurus(t.pos + tl(k.pos)),
    kart: kurus(t.kart + tl(k.tokenflex) + tl(k.paye))
  }), { paket: 0, nakit: 0, pos: 0, kart: 0 });
  const kasaSabit = (kasaKuryeleri || []).filter((k) => k.tip !== "havuz");
  const kasaHavuz = (kasaKuryeleri || []).filter((k) => k.tip === "havuz");
  const kullanilan = /* @__PURE__ */ new Set();
  const kasaIndeksi = { s1: -1, s2: -1 };
  for (const slot of ["s1", "s2"]) {
    const adlar = slotToplami(gun, slot).adlar;
    const j = kasaSabit.findIndex((k, idx) => !kullanilan.has(idx) && adlar.some((a) => adEslesir(k.isim || "", a)));
    if (j >= 0) {
      kasaIndeksi[slot] = j;
      kullanilan.add(j);
    }
  }
  for (const [i, slot] of ["s1", "s2"].entries()) {
    if (kasaIndeksi[slot] >= 0) continue;
    const j = [i, 0, 1].find((idx) => idx < kasaSabit.length && !kullanilan.has(idx));
    if (j !== void 0) {
      kasaIndeksi[slot] = j;
      kullanilan.add(j);
    }
  }
  return ["s1", "s2", "havuz"].map((slot) => {
    const r = slotToplami(gun, slot);
    const i = slot === "havuz" ? -1 : kasaIndeksi[slot];
    const kasaSatir = slot === "havuz" ? kasaHavuz : i >= 0 ? [kasaSabit[i]] : [];
    const roketVar = r.adlar.length > 0;
    return {
      ad: ATAMA_ADI[slot] + (slot !== "havuz" && i >= 0 && kasaSabit[i]?.isim ? ` (kasa: ${kasaSabit[i].isim})` : ""),
      kuryeler: r.adlar,
      sabit: slot !== "havuz",
      roket: roketVar ? { paket: r.paket, nakit: r.nakit, pos: r.pos, kart: r.kart } : null,
      kasa: kasaKuryeleri ? kasaOzet(kasaSatir) : null
    };
  }).filter((s) => s.roket || s.kasa && (s.kasa.paket || s.kasa.nakit || s.kasa.pos || s.kasa.kart));
}
function paketKontrolu(g, bizdeKanal) {
  const satirlar = KANALLAR.map((k) => ({ kanal: k.kanal, ad: k.ad, roket: g.kanallar[k.kanal] || 0, bizde: bizdeKanal[k.kanal] || 0 }));
  const bizde = satirlar.reduce((t, k) => t + k.bizde, 0);
  let kalan = g.digerPaket;
  const fisEslesme = [];
  for (const k of [...satirlar].filter((x) => x.bizde > x.roket).sort((a, b) => b.bizde - b.roket - (a.bizde - a.roket))) {
    const adet = Math.min(kalan, k.bizde - k.roket);
    if (adet <= 0) continue;
    fisEslesme.push({ kanal: k.kanal, ad: k.ad, adet });
    k.roket += adet;
    kalan -= adet;
  }
  return {
    roket: g.toplamPaket,
    bizde,
    kirMigros: bizdeKanal.kir_migros || 0,
    fark: g.toplamPaket - bizde,
    rokettenEk: g.digerPaket,
    fisEslesme,
    eslesmeyenFis: kalan,
    farkliKanallar: satirlar.filter((k) => k.roket !== k.bizde)
  };
}
export {
  ATAMA_ADI,
  adEslesir,
  atamaBul,
  isGunu,
  kuryeKarsilastir,
  paketKontrolu,
  roketExcelOku,
  roketKanali,
  roketTahsilat,
  slotToplami,
  varsayilanAtama
};
