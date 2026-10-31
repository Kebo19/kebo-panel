# Fotoğraflardan okunan reçeteleri (docs/receteler-okunan.json) SQL'e çevirir. Bir kez kullanıldı (31.10.2026).
S = {  # stok ürünü kısa adı -> id
 "doner":"045b1bce-044c-418d-873e-23cf4033c7e7","ekmek100":"f0e310d3-a94f-4f23-b5d7-860ffb3ed375","ekmek80":"ace6dc04-31f7-4126-b291-baee2cd7d476",
 "domsos":"b93adcd5-6fce-47f8-8157-31b9b883f6fa","tursu":"fa7f9066-08c9-45c9-b04a-d3e0877fe820","yogmay":"6cfd9b58-2103-4537-b3de-cb72b49dcc0e",
 "schnitzel":"33900a6a-caff-46f7-978a-6d0dacef6cc7","yummy":"ab0dbf7b-d337-45e3-81c9-4a787ce51860","bonfile":"f273c974-6ec4-4c9e-8153-0f330d0b75e2",
 "baget":"d1663f31-1b40-4379-b354-ca24a8fa8345","tepsi":"b1baf32e-48df-4d4d-8a64-d16aee80d706","kulah":"fd16aa26-43dc-4cd1-9be4-0cfc3d16352a",
 "havlu":"d162eec7-0de7-436f-87df-c38cf8653813","donukpat":"473ed07a-95d3-4e3f-b293-fd7fca620ad1","nugget":"1760316c-5875-4c90-a092-8b40967016c8",
 "halka":"65e59c34-22ec-4f8c-b68f-8a9f3160cde2","topu":"0494fb33-8776-4c50-ad5b-7e44aa938223","ketcap":"9b264966-7d29-406e-b20a-bddef6031bc3",
 "mayopp":"3b1db6a1-1b2d-476c-9b42-998166d7f40d","kase":"257cae54-14c0-4352-b1f5-635b146833cf","kapakli":"07fd2e1f-dfb4-4b65-b8a2-858d5563c913",
 "sumak":"51f0eb77-3cb4-45f6-ab7e-c9866f81a885","yaprak":"072bab66-ee23-4cc4-8d61-c29d27c4977a","kok":"e960fb1d-826d-4999-acb6-2d5040e3fa45",
 "shots":"f3d0cb38-6757-4845-b107-454270e08fa1","kova40":"2342ea5c-4c4d-42ba-9391-c8cc8043d955","kova75":"7828dc1b-f2d8-4550-b2bc-d407a2d61596",
 "kraft":"5b6d4406-3d49-4f86-a859-c18894572562","cnfkutu":"a25928ce-159f-40a8-87b1-f0e6f3ca7751","cnfkese":"cf1c32ae-6ee9-475e-9181-5c1cfb45419e",
 "pipet":"572dd370-0b3b-4dc2-a4f3-076bb3672360","cnfmendil":"6174403c-0108-4b05-94e4-c3370eb3d7fe",
}
urunler = []   # (ad, tur, verim_miktar, verim_birim, grup, notlar, sira)
satirlar = []  # (menu, etiket, stok|None, ara|None, malzeme|None, miktar, birim, notlar)
sira = 0
def urun(ad, grup, tur="menu", vm=1, vb="adet", notlar=None):
    global sira; sira += 10; urunler.append((ad, tur, vm, vb, grup, notlar, sira))
def st(menu, etiket, kod, m, b, notlar=None): satirlar.append((menu, etiket, S[kod], None, None, m, b, notlar))
def ara(menu, etiket, ad, m, b): satirlar.append((menu, etiket, None, ad, None, m, b, None))
def serbest(menu, etiket, m, b, notlar=None): satirlar.append((menu, etiket, None, None, etiket, m, b, notlar))

# ── Ara reçeteler (1 kg için) ──
urun("Yeşil Salata", "Ara reçete", "ara", 1, "kg", "Fotoğraftaki 'Green Salata' — 1 kg için")
for e, m in [("Iceberg",520),("Roka",100),("Dereotu",30),("Nane",75),("Maydanoz",125)]: serbest("Yeşil Salata", e, m, "g")
ara("Yeşil Salata", "Kırmızı lahana (hazır)", "Kırmızı Lahana", 150, "g")
urun("Soğan Zerzevatı", "Ara reçete", "ara", 1, "kg", "1 kg için")
for e, m in [("Soğan (kabuksuz)",480),("Maydanoz",200),("Nane",100),("Domates (kabuksuz)",180)]: serbest("Soğan Zerzevatı", e, m, "g")
st("Soğan Zerzevatı", "Sumak", "sumak", 40, "g")
urun("Kırmızı Lahana", "Ara reçete", "ara", 1, "kg", "1 kg için")
for e, m in [("Kırmızı lahana",700),("Elma sirkesi",140),("Şeker",4),("Tuz",16),("Limon",140)]: serbest("Kırmızı Lahana", e, m, "g")

# ── Kebo dürümler ──
TP = (67.5, "Taze patates (65–70 g)")
def durum(ad, gr, ekmek, sos_ekmek, sos, may_ekmek, may, patates=False, tursu=False, zerz=0, salata=0, bitmis=""):
    urun(ad, "Kebo dürüm", notlar=f"Bitmiş ürün {bitmis} g" if bitmis else None)
    st(ad, "Döner", "doner", gr, "g")
    st(ad, f"Ekmek {'100' if ekmek=='ekmek100' else '80'} gr", ekmek, 1, "adet")
    if sos_ekmek: st(ad, "Ekmek sosu", "domsos", sos_ekmek, "g")
    if may_ekmek: st(ad, "Ekmek mayonezi", "yogmay", may_ekmek, "g")
    if patates: serbest(ad, TP[1], TP[0], "g", "Stokta taze patates yok")
    if tursu: st(ad, "Turşu", "tursu", 15, "g")
    if zerz: ara(ad, "Soğan zerzevatı", "Soğan Zerzevatı", zerz, "g")
    if salata: ara(ad, "Yeşil salata", "Yeşil Salata", salata, "g")
    if may: st(ad, "Mayonez", "yogmay", may, "g")
    if sos: st(ad, "Sos", "domsos", sos, "g")
durum("KEBO (90 Gr)", 90, "ekmek100", 50, 40, 0, 40, patates=True, tursu=True, bitmis="400-420")
durum("KEBABİ (90 Gr)", 90, "ekmek100", 50, 40, 0, 0, zerz=50, bitmis="330-350")
durum("GREEN (90 Gr)", 90, "ekmek100", 0, 0, 10, 40, salata=50, bitmis="290-310")
durum("PATRON (90 Gr)", 90, "ekmek100", 0, 0, 10, 40, bitmis="240-260")
durum("ATOM (90 Gr)", 90, "ekmek100", 50, 40, 0, 40, patates=True, tursu=True, zerz=40, salata=40, bitmis="480-500")
durum("KEBO (60 Gr)", 60, "ekmek80", 45, 35, 0, 35, patates=True, tursu=True, bitmis="335-345")
durum("KEBABİ (60 Gr)", 60, "ekmek80", 45, 35, 0, 0, zerz=50, bitmis="270-280")
durum("GREEN (60 Gr)", 60, "ekmek80", 0, 0, 9, 35, salata=50, bitmis="234-244")
durum("PATRON (60 Gr)", 60, "ekmek80", 0, 0, 9, 35, bitmis="184-194")
durum("ATOM (60 Gr)", 60, "ekmek80", 45, 35, 0, 35, patates=True, tursu=True, zerz=40, salata=40, bitmis="415-425")
urun("YUMMY", "Kebo dürüm", notlar="Bitmiş ürün 365-385 g")
st("YUMMY","Schnitzel","schnitzel",1,"adet"); st("YUMMY","Ekmek 100 gr","ekmek100",1,"adet"); st("YUMMY","Ekmek sosu","domsos",50,"g")
serbest("YUMMY","Taze patates",30,"g","Stokta taze patates yok"); st("YUMMY","Turşu","tursu",15,"g"); ara("YUMMY","Yeşil salata","Yeşil Salata",30,"g")
st("YUMMY","Yummy sosu","yummy",40,"g")
urun("TENDERS DÜRÜM", "Kebo dürüm", notlar="Fotoğrafta 'Tender's Dürüm' — bitmiş ürün 335-355 g")
st("TENDERS DÜRÜM","Çıtır bonfile","bonfile",120,"g"); st("TENDERS DÜRÜM","Ekmek 100 gr","ekmek100",1,"adet"); st("TENDERS DÜRÜM","Ekmek mayonezi","yogmay",10,"g")
st("TENDERS DÜRÜM","Turşu","tursu",15,"g"); ara("TENDERS DÜRÜM","Yeşil salata","Yeşil Salata",50,"g"); st("TENDERS DÜRÜM","Mayonez","yogmay",40,"g")
urun("EKMEK ARASI", "Kebo dürüm")
st("EKMEK ARASI","Baget ekmek","baget",1,"adet"); st("EKMEK ARASI","Tavuk döner","doner",60,"g"); st("EKMEK ARASI","Yoğurtlu mayonez","yogmay",50,"g")
serbest("EKMEK ARASI","Domates",30,"g"); serbest("EKMEK ARASI","Iceberg",20,"g"); st("EKMEK ARASI","Turşu","tursu",18,"g")
st("EKMEK ARASI","Tepsi altlığı","tepsi",1,"adet"); st("EKMEK ARASI","Patates külahı","kulah",1,"adet"); st("EKMEK ARASI","Islak havlu","havlu",1,"adet")
serbest("EKMEK ARASI","Peçete",2,"adet"); serbest("EKMEK ARASI","Soğan (isteğe bağlı)",10,"g","İsteğe bağlı")

# ── Kebo çıtır ──
def citir(ad, pat=0, nug=0, halka=0, topu=0, bon=0, ket=0, may=0, ysos=0, kap="", notlar=None):
    urun(ad, "Kebo çıtır", notlar=notlar)
    if pat: st(ad,"Donuk patates","donukpat",pat,"g")
    if nug: st(ad,"Nugget","nugget",nug,"adet")
    if halka: st(ad,"Soğan halkası","halka",halka,"adet")
    if topu: st(ad,"Tavuk topu","topu",topu,"adet")
    if bon: st(ad,"Çıtır bonfile","bonfile",bon,"g")
    if ket: st(ad,"Ketçap","ketcap",ket,"adet")
    if may: st(ad,"Mayonez","mayopp",may,"adet")
    if ysos: st(ad,"Yummy sos","yummy",ysos,"g")
    if kap == "kase": st(ad,"Yuvarlak karton kase","kase",1,"adet")
    elif kap == "kapakli": st(ad,"Kapaklı karton kase","kapakli",1,"adet")
    elif kap == "kulah": st(ad,"Küçük boy külah","kulah",1,"adet")
CIZIK = "Fotoğrafta nugget / soğan halkası / tavuk topu kalemle çizilmiş — girilmedi"
citir("COMBO TABAK", pat=100, ket=1, may=1, kap="kase", notlar=CIZIK)
citir("COMBO TABAK XL", pat=100, nug=2, halka=4, topu=4, bon=60, ket=1, may=1, ysos=30, kap="kase")
citir("TRIO TABAK", pat=140, ket=2, may=2, kap="kase", notlar=CIZIK)
citir("TRIO TABAK XL", pat=140, nug=3, halka=6, topu=6, bon=60, ket=2, may=2, ysos=45, kap="kase")
citir("QUATTRO TABAK", pat=180, ket=3, may=3, kap="kapakli", notlar=CIZIK + " (MagicPay'de bu ürün yok)")
citir("QUATTRO TABAK XL", pat=180, nug=4, halka=8, topu=8, bon=60, ket=3, may=3, ysos=60, kap="kapakli")
citir("PATATES K.+4'LÜ SOĞAN H.", pat=60, halka=4, ket=1, may=1, kap="kulah", notlar="Fotoğrafta 'İkili Çıtır'")
citir("PATATES K.+2'Lİ NUGGET", pat=60, nug=2, ket=1, may=1, kap="kulah", notlar="İkili Çıtır'dan uyarlandı — kontrol edin")
citir("PATATES K.+4'LÜ TAVUK T.", pat=60, topu=4, ket=1, may=1, kap="kulah", notlar="İkili Çıtır'dan uyarlandı — kontrol edin")
citir("DÖRTLÜ ÇITIR", pat=60, nug=1, halka=2, topu=4, ket=1, may=1, kap="kulah")
citir("ÇITIR TENDERS", bon=120, ket=1, may=1, ysos=15, kap="kulah", notlar="MagicPay'de bu adla ürün yok")
citir("ÇITIR MİX", nug=4, halka=6, topu=6, bon=120, ket=2, may=2, ysos=30, kap="kase")
for n, ad in [(3,"3'LÜ NUGGET"),(6,"6'LI NUGGET"),(9,"9'LU NUGGET")]: citir(ad, nug=n, ket=1, may=1, kap="kulah")
for n, ad in [(6,"6'LI SOĞAN HALKASI"),(9,"9'LU SOĞAN HALKASI"),(12,"12'Lİ SOĞAN HALKASI")]: citir(ad, halka=n, ket=1, may=1, kap="kulah")
for n, ad in [(6,"6'LI TAVUK TOPU"),(8,"8'Lİ TAVUK TOPU"),(10,"10'LU TAVUK TOPU"),(12,"12'Lİ TAVUK TOPU")]: citir(ad, topu=n, ket=1, may=1, kap="kulah")
for g, ad in [(80,"PATATES KIZARTMASI (80 GR)"),(100,"PATATES KIZARTMASI (100 GR)"),(140,"JUMBO PATATES K. (140 GR)")]: citir(ad, pat=g, ket=1, may=1, kap="kulah")
citir("HEPSİ ÇITIR", pat=60, nug=1, halka=3, topu=3, bon=30, ket=1, may=1, ysos=15, kap="kase", notlar="MagicPay'de bu adla ürün yok")
citir("HEPSİ ÇITIR DOUBLE", pat=60, nug=2, halka=4, topu=4, bon=60, ket=1, may=1, ysos=15, kap="kase", notlar="MagicPay'de bu adla ürün yok")
for g, ys, kap in [(90,15,"kulah"),(120,15,"kulah"),(150,30,"kulah"),(180,30,"kase"),(210,30,"kase"),(300,45,"kapakli")]:
    citir(f"{g} GR ÇITIR BONFİLE", bon=g, ysos=ys, kap=kap)

# ── Chick'N ──
urun("CNF 1 Kişilik Ortak Paket", "Ara reçete", "ara", 1, "adet", "Chick'N 1 kişilik menülerin ortak malzemesi")
serbest("CNF 1 Kişilik Ortak Paket","Kutu içecek",1,"adet"); st("CNF 1 Kişilik Ortak Paket","Stick ketçap","ketcap",2,"adet")
st("CNF 1 Kişilik Ortak Paket","Stick mayonez","mayopp",2,"adet"); st("CNF 1 Kişilik Ortak Paket","Pipet","pipet",1,"adet")
st("CNF 1 Kişilik Ortak Paket","Islak mendil","cnfmendil",1,"adet"); serbest("CNF 1 Kişilik Ortak Paket","Peçete",2,"adet")
urun("CNF 2 Kişilik Ortak Paket", "Ara reçete", "ara", 1, "adet", "Chick'N 2 kişilik menülerin ortak malzemesi")
serbest("CNF 2 Kişilik Ortak Paket","Litrelik içecek",1,"adet"); st("CNF 2 Kişilik Ortak Paket","Stick ketçap","ketcap",3,"adet")
st("CNF 2 Kişilik Ortak Paket","Stick mayonez","mayopp",3,"adet"); st("CNF 2 Kişilik Ortak Paket","Islak mendil","cnfmendil",2,"adet")
serbest("CNF 2 Kişilik Ortak Paket","Peçete",4,"adet")
urun("CNF Tavuk Döner Dürüm", "Ara reçete", "ara", 1, "adet", "Gramlı reçete yok. Soslu çıtır lavaş; 90 g tavuk döner, baharatlı domates sosu, sarımsaklı mayonez, patates kızartması, turşu, isteğe bağlı acı biber")
urun("CNF Çıtır Tavuk Dürüm", "Ara reçete", "ara", 1, "adet", "Gramlı reçete yok. Mayonezli çıtır lavaş; 7 adet hot shots, sarımsaklı mayonez, turşu, yeşil salata, isteğe bağlı acı biber")
def cnf(ad, kisi, yaprak=0, kok=0, tenders=0, shots=0, nug=0, halka=0, pat=0, kova="", canta="kraft", donerd=0, citird=0, kutu=False):
    urun(ad, "Chick'N menü", notlar="MagicPay'de Chick'N ürünleri yok; adı fotoğraftaki gibi")
    if donerd: ara(ad,"Tavuk Döner Dürüm","CNF Tavuk Döner Dürüm",donerd,"adet")
    if citird: ara(ad,"Çıtır Tavuk Dürüm","CNF Çıtır Tavuk Dürüm",citird,"adet")
    if yaprak: st(ad,"Kanat yaprak","yaprak",yaprak,"adet")
    if kok: st(ad,"Kanat kök","kok",kok,"adet")
    if tenders: serbest(ad,"Tenders",tenders,"adet","Hangi stok ürünü olduğu belli değil")
    if shots: st(ad,"Hot Shots","shots",shots,"adet")
    if nug: st(ad,"Nugget","nugget",nug,"adet")
    if halka: st(ad,"Soğan halkası","halka",halka,"adet")
    if pat: st(ad,"Patates","donukpat",pat,"g")
    if kutu: st(ad,"Patates kutusu","cnfkutu",1,"adet")
    if kova == "k": st(ad,"Küçük kova","kova40",1,"adet")
    if kova == "b": st(ad,"Büyük kova","kova75",1,"adet")
    if canta == "kraft": st(ad,"Kraft çanta","kraft",1,"adet")
    else: st(ad,"Kese kağıdı","cnfkese",1,"adet")
    ara(ad, "Ortak paket", f"CNF {kisi} Kişilik Ortak Paket", 1, "adet")
cnf("CNF Kanat Menü (1 Kişilik)",1,yaprak=2,kok=2,pat=150,kova="k")
cnf("CNF Tenders Menü (1 Kişilik)",1,tenders=3,pat=150,kova="k")
cnf("CNF Tavuk Döner Menü (1 Kişilik)",1,donerd=1,shots=3,pat=120,kova="k")
cnf("CNF Çıtır Tavuk Dürüm Menü (1 Kişilik)",1,citird=1,halka=4,kutu=True,canta="kese")
cnf("CNF Crispy Menü (1 Kişilik)",1,yaprak=1,kok=1,nug=4,pat=150,kova="k")
cnf("CNF Tavuk Döner Dürüm Menü (2 Kişilik)",2,donerd=2,pat=150,kutu=True,canta="kese")
cnf("CNF Kanat & Tenders Menü (2 Kişilik)",2,yaprak=2,kok=2,tenders=4,pat=150,kova="b")
cnf("CNF Kanat & Nugget Menü (2 Kişilik)",2,yaprak=3,kok=3,nug=10,pat=150,kova="b")
cnf("CNF Mega Kanat & Nugget Menü (2 Kişilik)",2,yaprak=4,kok=4,nug=12,pat=200,kova="b")
cnf("CNF Kanat & Patates K. Menü (2 Kişilik)",2,yaprak=4,kok=4,pat=200,kova="b")
cnf("CNF Tenders & Hot Shots Menü (2 Kişilik)",2,tenders=6,shots=8,pat=150,kova="b")

q = lambda v: "null" if v is None else ("'" + str(v).replace("'", "''") + "'" if isinstance(v, str) else str(v))
out = ["-- Fotoğraflardan okunan reçeteler (31.10.2026). Eski hatalı 'Kebo 90 Gr' reçetesi silinir.",
       "delete from receteler where menu_urun = 'Kebo 90 Gr';"]
out.append("insert into recete_urunleri (ad, tur, verim_miktar, verim_birim, grup, notlar, sira) values\n" +
           ",\n".join(f"  ({q(a)}, {q(t)}, {vm}, {q(vb)}, {q(g)}, {q(n)}, {s})" for a,t,vm,vb,g,n,s in urunler) +
           "\non conflict (ad) do nothing;")
out.append("insert into receteler (menu_urun, etiket, stok_urun_id, ara_recete, malzeme_adi, miktar, birim, notlar, sira) values\n" +
           ",\n".join(f"  ({q(m)}, {q(e)}, {q(s) + '::uuid' if s else 'null'}, {q(a)}, {q(z)}, {mk}, {q(b)}, {q(n)}, {i})"
                      for i,(m,e,s,a,z,mk,b,n) in enumerate(satirlar)) + ";")
out.append("-- 1 adet kaç gram (MagicPay reçetelerinde kullanılan değer; değiştirilebilir)\n"
           "update stok_urunler set adet_gram = 2.5 where id in ('b1baf32e-48df-4d4d-8a64-d16aee80d706','fd16aa26-43dc-4cd1-9be4-0cfc3d16352a') and adet_gram is null;")
print("\n\n".join(out))
import sys; print(f"-- {len(urunler)} ürün, {len(satirlar)} satır", file=sys.stderr)

# Kısa sürüm (Supabase'e uygulamak için): kod -> uuid eşlemesi CTE ile
if "--kisa" in sys.argv:
    ters = {v: k for k, v in S.items()}
    rows = ",".join(f"({q(m)},{q(e)},{q(ters[s]) if s else 'null'},{q(a)},{q(z)},{mk},{q(b)},{q(n)},{i})" for i,(m,e,s,a,z,mk,b,n) in enumerate(satirlar))
    kod = ",".join(f"('{k}','{v}')" for k, v in S.items())
    print(out[1]); print(out[2])
    print(f"with k(kod,id) as (values {kod}), r(m,e,kod,a,z,mk,b,n,s) as (values {rows}) "
          "insert into receteler (menu_urun,etiket,stok_urun_id,ara_recete,malzeme_adi,miktar,birim,notlar,sira) "
          "select r.m,r.e,k.id::uuid,r.a,r.z,r.mk,r.b,r.n,r.s from r left join k on k.kod=r.kod;")
    print(out[4])
