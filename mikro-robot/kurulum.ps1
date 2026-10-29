# ─── KEBO MİKRO ROBOTU — KURULUM ───────────────────────────────────────────────
# Dükkân bilgisayarında bir kez çalıştırılır (KURULUM.bat'a çift tıklayın).
#  1) Node.js var mı bakar, robotun paketini kurar
#  2) Mikro kullanıcı adı / parolasını sorar ve bu Windows kullanıcısına özel şifreleyip saklar
#     (oturum kapanırsa robot yeniden giriş yapabilsin diye)
#  3) Chrome'u açar: Mikro'ya ve Roket Adisyon'a birer kez giriş yaparsınız, oturumlar robotun profiline kaydedilir
#  4) Görev Zamanlayıcı'ya "Kebo Mikro Robotu" görevini ekler: 5 dakikada bir gizli kontrol
#     (panelden "Mikro'dan çek" istenince hemen; istenmezse her gün 11:00'den sonra bir kez)
#  5) Masaüstüne iki kısayol koyar: "Mikro robotu - şimdi çalıştır" ve "Mikro robotu - giriş"
$ErrorActionPreference = "Stop"
$Klasor = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Klasor
$Veri = Join-Path $env:LOCALAPPDATA "kebo-mikro-robot"
New-Item -ItemType Directory -Force -Path $Veri | Out-Null

function Baslik($m) { Write-Host ""; Write-Host "=== $m ===" -ForegroundColor Yellow }

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

Baslik "4/5 Gorev Zamanlayici"
# Robot 5 dakikada bir gizli pencerede kisa bir kontrol yapar (panelden "Mikro'dan cek" istendi mi?).
# Istek yoksa 11:00'den sonra gunde bir kez faturalari ceker. Is yoksa tarayici acmadan hemen kapanir.
$vbs = Join-Path $Klasor "gizli-calistir.vbs"
@(
  "' Kebo Mikro robotunu pencere acmadan calistirir (Gorev Zamanlayici bunu cagirir). KURULUM.bat olusturur.",
  'Set sh = CreateObject("WScript.Shell")',
  "sh.CurrentDirectory = `"$Klasor`"",
  "sh.Run `"`"`"$node`"`" `"`"$Klasor\robot.mjs`"`" --bekle`", 0, True"
) | Set-Content -Encoding ASCII $vbs
$eylem = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`"" -WorkingDirectory $Klasor
# Her gun 07:00'den gece yarisina kadar 5 dakikada bir
$tetik1 = New-ScheduledTaskTrigger -Daily -At 07:00
$tetik1.Repetition = (New-ScheduledTaskTrigger -Once -At 07:00 -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Hours 17)).Repetition
$tetik2 = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$tetik2.Delay = "PT3M"
$ayarlar = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "Kebo Mikro Robotu" -Action $eylem -Trigger @($tetik1, $tetik2) -Settings $ayarlar `
  -Description "Mikro faturalarini ve Roket paket raporunu Kebo Panel'e aktarir (panelden istenince hemen, yoksa her gun 11:00'den sonra)" -Force | Out-Null
Write-Host "Gorev eklendi: 5 dakikada bir kontrol; panelden istenince hemen, istenmezse her gun 11:00'den sonra bir kez." -ForegroundColor Green

Baslik "5/5 Masaustu kisayollari ve ilk calistirma"
$ws = New-Object -ComObject WScript.Shell
$masa = [Environment]::GetFolderPath("Desktop")
foreach ($k2 in @(@{ ad = "Mikro robotu - simdi calistir"; arg = "--zorla" }, @{ ad = "Mikro robotu - giris"; arg = "--kurulum" })) {
  $s = $ws.CreateShortcut((Join-Path $masa ($k2.ad + ".lnk")))
  $s.TargetPath = $node; $s.Arguments = "`"$Klasor\robot.mjs`" $($k2.arg)"; $s.WorkingDirectory = $Klasor; $s.Save()
}
& $node (Join-Path $Klasor "robot.mjs") --zorla
Write-Host ""
Write-Host "Kurulum tamam. Faturalar panelde Faturalar / Fiyat Listesi'nde, Roket verisi Kurye Kontrol'de gorunur." -ForegroundColor Green
Write-Host "Robot kaydi: $Veri\robot.log"
Read-Host "Kapatmak icin Enter"
