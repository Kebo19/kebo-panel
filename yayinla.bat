@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === 1/5 Paketler kuruluyor (npm install) ===
call npm install
if errorlevel 1 goto hata
echo.
echo === 2/5 Testler calistiriliyor (npm test) ===
call npm test
if errorlevel 1 goto hata
echo.
echo === 3/5 Kod kontrol ediliyor (tsc) ===
call npx tsc --noEmit
if errorlevel 1 goto hata
echo.
echo === 4/5 Degisiklikler kaydediliyor (git commit) ===
git add -A
git commit -m "Panel guncellemesi %date% %time:~0,5%"
echo.
echo === 5/5 GitHuba gonderiliyor (git push) ===
git push
if errorlevel 1 goto hata
echo.
echo TAMAM: Kod gonderildi. Vercel siteyi birkac dakika icinde guncelleyecek.
pause
exit /b 0
:hata
echo.
echo HATA: Islem durdu. Yukaridaki mesaji Claudea gonderin.
pause
exit /b 1
