# ─── KEBO ROBOTU — KURULUM ─────────────────────────────────────────────────────
# Her bilgisayarda bir kez çalıştırılır (KURULUM.bat'a çift tıklayın).
#  Dükkân bilgisayarı: Mikro faturaları + Roket. Ev / başka bilgisayar: sadece Roket ("Roket'ten çek").
#  1) Node.js var mı bakar, robotun paketini kurar
#  2) (Dükkân) Mikro kullanıcı adı / parolasını sorar, bu Windows kullanıcısına özel şifreleyip saklar
#  3) Chrome'u açar: Mikro'ya (dükkân) ve Roket Adisyon'a birer kez giriş yaparsınız
#  4) Görev Zamanlayıcı: "Kebo Roket Dinleyici" (oturum açılınca başlar, panelde "Roket'ten çek"e basılınca
#     10 sn içinde çeker) ve dükkânda "Kebo Mikro Robotu" (5 dakikada bir gizli kontrol)
#  5) Masaüstü kısayolları
$ErrorActionPreference = "Stop"
$Klasor = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Klasor
$Veri = Join-Path $env:LOCALAPPDATA "kebo-mikro-robot"
New-Item -ItemType Directory -Force -Path $Veri | Out-Null

function Baslik($m) { Write-Host ""; Write-Host "=== $m ===" -ForegroundColor Yellow }

Write-Host ""
Write-Host "Bu bilgisayar hangisi?" -ForegroundColor Yellow
Write-Host "  1 = Dukkan bilgisayari (Mikro faturalari + Roket)"
Write-Host "  2 = Ev / baska bilgisayar (sadece Roket'ten cek)"
$secim = Read-Host "1 ya da 2 yazip Enter"
$Dukkan = ($secim.Trim() -ne "2")

Baslik "1/5 Node.js ve robot paketi"
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host "Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kurup bu dosyayi tekrar calistirin." -ForegroundColor Red
  Start-Process "https://nodejs.org/tr/download"
  Read-Host "Kapatmak icin Enter"; exit 1
}
if (-not (Test-Path (Join-Path $Klasor "ayar.json"))) {
  Write-Host "ayar.json bulunamadi. Bu klasoru panelden gelen haliyle (ayar.json dahil) kopyalayin." -ForegroundColor Red
  Read-Host "Kapatmak icin Enter"; exit 1
}
& npm.cmd install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Write-Host "Paket kurulamadi." -ForegroundColor Red; Read-Host "Enter"; exit 1 }

if ($Dukkan) {
  Baslik "2/5 Mikro kullanici bilgisi"
  Write-Host "Acilan pencereye Mikro e-Portal e-posta adresinizi ve parolanizi girin."
  Write-Host "Bilgiler sadece bu bilgisayarda, bu Windows kullanicisina ozel sifreli olarak saklanir."
  $k = Get-Credential -Message "Mikro e-Portal girisi (e-posta / parola)"
  if ($k) {
    @{ eposta = $k.UserName; parola = ($k.Password | ConvertFrom-SecureString) } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $Veri "mikro-kimlik.txt")
    Write-Host "Kaydedildi." -ForegroundColor Green
  } else { Write-Host "Atlandi (oturum kapanirsa robot kendisi giris yapamaz, kisayolla giris yaparsiniz)." }

  Baslik "3/5 Mikro'ya ve Roket'e bir kez giris"
  Write-Host "Chrome acilacak. Once Mikro'ya giris yapin (Gelen e-Faturalar sayfasi acilinca devam eder)."
  Write-Host "Sonra ayni pencerede Roket Adisyon acilir: Roket'e giris yapin; Kontrol Paneli acilinca pencere kendiliginden kapanir."
  & $node (Join-Path $Klasor "robot.mjs") --kurulum
  $GirisArg = "--kurulum"
} else {
  Baslik "2/5 (Mikro bu bilgisayarda kullanilmayacak)"
  Baslik "3/5 Roket'e bir kez giris"
  Write-Host "Tarayici acilacak: Roket Adisyon'a giris yapin; Kontrol Paneli acilinca pencere kendiliginden kapanir."
  & $node (Join-Path $Klasor "robot.mjs") --kurulum --sadece-roket
  $GirisArg = "--kurulum --sadece-roket"
}

Baslik "4/5 Gorev Zamanlayici"
# Pencere acmadan calistiran kucuk betikler (yol Turkce harf icerebilir: Unicode kaydedilir)
function GizliBetik($ad, $arg) {
  $yol = Join-Path $Klasor $ad
  @(
    "' Kebo robotunu pencere acmadan calistirir (Gorev Zamanlayici bunu cagirir). KURULUM.bat olusturur.",
    'Set sh = CreateObject("WScript.Shell")',
    "sh.CurrentDirectory = `"$Klasor`"",
    "sh.Run `"`"`"$node`"`" `"`"$Klasor\robot.mjs`"`" $arg`", 0, True"
  ) | Set-Content -Encoding Unicode $yol
  return $yol
}
$kullanici = "$env:USERDOMAIN\$env:USERNAME"

# Roket dinleyicisi: oturum acilinca baslar, hep acik kalir; kapanirsa 5 dakika icinde yeniden baslar
$vbsD = GizliBetik "gizli-dinle.vbs" "--dinle"
$eylemD = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsD`"" -WorkingDirectory $Klasor
$tD1 = New-ScheduledTaskTrigger -AtLogOn -User $kullanici
$tD1.Delay = "PT1M"
$tD2 = New-ScheduledTaskTrigger -Daily -At 00:00
$tD2.Repetition = (New-ScheduledTaskTrigger -Once -At 00:00 -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Hours 23 -Minutes 55)).Repetition
$ayarD = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "Kebo Roket Dinleyici" -Action $eylemD -Trigger @($tD1, $tD2) -Settings $ayarD `
  -Description "Kebo Panel'de Kasa Raporu'ndaki 'Roket'ten cek' istegini bekler; gelince o gunun Roket paket raporunu ceker" -Force | Out-Null
Start-ScheduledTask -TaskName "Kebo Roket Dinleyici"
Write-Host "Roket dinleyicisi eklendi ve baslatildi." -ForegroundColor Green

if ($Dukkan) {
  # Mikro robotu 5 dakikada bir gizli pencerede kisa bir kontrol yapar (panelden "Mikro'dan cek" istendi mi?).
  $vbs = GizliBetik "gizli-calistir.vbs" "--bekle"
  $eylem = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`"" -WorkingDirectory $Klasor
  $tetik1 = New-ScheduledTaskTrigger -Daily -At 07:00
  $tetik1.Repetition = (New-ScheduledTaskTrigger -Once -At 07:00 -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Hours 17)).Repetition
  $tetik2 = New-ScheduledTaskTrigger -AtLogOn -User $kullanici
  $tetik2.Delay = "PT3M"
  $ayarlar = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName "Kebo Mikro Robotu" -Action $eylem -Trigger @($tetik1, $tetik2) -Settings $ayarlar `
    -Description "Mikro faturalarini ve Roket paket raporunu Kebo Panel'e aktarir (panelden istenince hemen, yoksa her gun 11:00'den sonra)" -Force | Out-Null
  Write-Host "Mikro gorevi eklendi: 5 dakikada bir kontrol; panelden istenince hemen, istenmezse her gun 11:00'den sonra bir kez." -ForegroundColor Green
}

Baslik "5/5 Masaustu kisayollari"
$ws = New-Object -ComObject WScript.Shell
$masa = [Environment]::GetFolderPath("Desktop")
$kisayollar = @(@{ ad = "Kebo robotu - giris"; arg = $GirisArg })
if ($Dukkan) { $kisayollar += @{ ad = "Kebo robotu - simdi calistir"; arg = "--zorla" } }
foreach ($k2 in $kisayollar) {
  $s = $ws.CreateShortcut((Join-Path $masa ($k2.ad + ".lnk")))
  $s.TargetPath = $node; $s.Arguments = "`"$Klasor\robot.mjs`" $($k2.arg)"; $s.WorkingDirectory = $Klasor; $s.Save()
}
foreach ($eski in @("Mikro robotu - giris", "Mikro robotu - simdi calistir")) {
  $y = Join-Path $masa ($eski + ".lnk"); if (Test-Path $y) { Remove-Item $y }
}
if ($Dukkan) {
  Write-Host "Ilk aktarim yapiliyor (Mikro + Roket son 7 gun)..."
  & $node (Join-Path $Klasor "robot.mjs") --zorla
}
Write-Host ""
Write-Host "Kurulum tamam. Panelde Kasa Raporu > Kurye adiminda 'Roket'ten cek' dugmesini deneyebilirsiniz." -ForegroundColor Green
Write-Host "Robot kaydi: $Veri\robot.log"
Read-Host "Kapatmak icin Enter"
