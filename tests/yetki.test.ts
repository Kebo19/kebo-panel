import { describe, it, expect } from "vitest";
import { izinVar, sayfaIzni, sayfaErisimi, anaSayfaBul, rolCoz, yetkilerCoz, yeniKullaniciDogrula,YETKILER, YETKI_SABLONLARI, YETKI_ANAHTARLARI, raporOnaycisiMi } from "@/lib/yetki";

describe("rolCoz / yetkilerCoz", () => {
  it("rolleri tanır", () => {
    expect(rolCoz(" Tam Yetkili ")).toBe("Tam Yetkili");
    expect(rolCoz("Müdür")).toBe("Müdür");
    expect(rolCoz("Pasif")).toBe("Pasif");
    expect(rolCoz("admin")).toBeNull();
    expect(rolCoz(undefined)).toBeNull();
  });
  it("geçersiz anahtarları ayıklar", () => {
    expect(yetkilerCoz(["stok", "yok", 3, "stok"])).toEqual(["stok"]);
    expect(yetkilerCoz(null)).toEqual([]);
  });
});

describe("izinVar", () => {
  it("Tam Yetkili her şeye erişir", () => {
    expect(izinVar("Tam Yetkili", [], "kasa")).toBe(true);
  });
  it("Müdür listeye göre", () => {
    expect(izinVar("Müdür", ["stok"], "stok")).toBe(true);
    expect(izinVar("Müdür", ["stok"], "kasa")).toBe(false);
  });
  it("Pasif ve rolsüz hiçbir şeye erişemez", () => {
    expect(izinVar("Pasif", ["stok"], "stok")).toBe(false);
    expect(izinVar(null, ["stok"], "stok")).toBe(false);
  });
});

describe("sayfaIzni", () => {
  it("en uzun önek eşleşmesi", () => {
    expect(sayfaIzni("/")).toBe("anasayfa");
    expect(sayfaIzni("/stok")).toBe("stok");
    expect(sayfaIzni("/stok/abc-123")).toBe("stok");
    expect(sayfaIzni("/stok/recete")).toBe("recete");
    expect(sayfaIzni("/cariler")).toBe("cari");
    expect(sayfaIzni("/faturalar")).toBe("cari");
    expect(sayfaIzni("/personel/5")).toBe("personel");
    expect(sayfaIzni("/ayarlar/gecmis")).toBe("yonetim");
    expect(sayfaIzni("/ayarlar/yetkiler")).toBe("tam_yetkili");
  });
  it("ortak sayfalar herkese açık", () => {
    expect(sayfaIzni("/ayarlar")).toBeNull();
    expect(sayfaIzni("/profil")).toBeNull();
    expect(sayfaIzni("/yenilikler")).toBeNull();
    expect(sayfaIzni("/stoklar")).toBeNull();
  });
});

describe("sayfaErisimi", () => {
  it("rol ve yetkiye göre", () => {
    expect(sayfaErisimi("Müdür", ["stok"], "/stok")).toBe(true);
    expect(sayfaErisimi("Müdür", ["stok"], "/stok/recete")).toBe(false);
    expect(sayfaErisimi("Müdür", ["yonetim"], "/ayarlar/yetkiler")).toBe(false);
    expect(sayfaErisimi("Tam Yetkili", [], "/ayarlar/yetkiler")).toBe(true);
    expect(sayfaErisimi("Pasif", [], "/profil")).toBe(false);
    expect(sayfaErisimi("Müdür", [], "/profil")).toBe(true);
  });
});

describe("anaSayfaBul", () => {
  it("anasayfa izni varsa /", () => {
    expect(anaSayfaBul("Tam Yetkili", [])).toBe("/");
    expect(anaSayfaBul("Müdür", ["anasayfa", "stok"])).toBe("/");
  });
  it("yoksa ilk izinli sayfa", () => {
    expect(anaSayfaBul("Müdür", ["stok", "rapor_gir"])).toBe("/raporlar");
    expect(anaSayfaBul("Müdür", ["puantaj_duzenle", "puantaj"])).toBe("/puantaj");
  });
  it("hiç yoksa /profil", () => {
    expect(anaSayfaBul("Müdür", [])).toBe("/profil");
    expect(anaSayfaBul("Müdür", ["rapor_duzenle"])).toBe("/profil");
    expect(anaSayfaBul("Pasif", ["stok"])).toBe("/profil");
  });
});

describe("yeniKullaniciDogrula", () => {
  const temel = { adSoyad: "Bekir Yılmaz", email: " Bekir@Kebo.com ", sifre: "12345678", rol: "Müdür", yetkiler: ["stok", "stok", "rapor_gir"] };
  it("geçerli girdiyi temizler", () => {
    const s = yeniKullaniciDogrula(temel);
    expect(s.ok).toBe(true);
    if (s.ok) {
      expect(s.veri.email).toBe("bekir@kebo.com");
      expect(s.veri.yetkiler).toEqual(["stok", "rapor_gir"]);
    }
  });
  it("Tam Yetkili/Pasif için yetki listesi boş", () => {
    const s = yeniKullaniciDogrula({ ...temel, rol: "Tam Yetkili" });
    expect(s.ok && s.veri.yetkiler).toEqual([]);
  });
  it("hatalı girdileri reddeder", () => {
    expect(yeniKullaniciDogrula({ ...temel, email: "bekir" }).ok).toBe(false);
    expect(yeniKullaniciDogrula({ ...temel, sifre: "1234567" }).ok).toBe(false);
    expect(yeniKullaniciDogrula({ ...temel, rol: "admin" }).ok).toBe(false);
    expect(yeniKullaniciDogrula({ ...temel, yetkiler: ["kasa", "hepsi"] }).ok).toBe(false);
    expect(yeniKullaniciDogrula({ ...temel, adSoyad: " " }).ok).toBe(false);
    expect(yeniKullaniciDogrula(null).ok).toBe(false);
  });
});

describe("tanımlar", () => {
  it("şablonlar sadece geçerli anahtar içerir", () => {
    for (const s of YETKI_SABLONLARI) for (const y of s.yetkiler) expect(YETKI_ANAHTARLARI).toContain(y);
  });
  it("anahtarlar tekil", () => {
    expect(new Set(YETKILER.map(y => y.anahtar)).size).toBe(YETKILER.length);
  });
});

describe("rapor onaycıları", () => {
  it("sadece Murat ve Bülent", () => {
    expect(raporOnaycisiMi("c4d199e9-e0b7-4d33-8ad8-556f7d488bac")).toBe(true);
    expect(raporOnaycisiMi("e75d458f-1c36-405a-bd56-3c590c28cd54")).toBe(true);
    expect(raporOnaycisiMi("08e2388a-f033-4255-aebc-f976d6eac338")).toBe(false); // Bekir (rapor_duzenle var)
    expect(raporOnaycisiMi(null)).toBe(false);
  });
});
