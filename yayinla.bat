@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Kebo Panel yayinlaniyor ===
echo.
git add -A
git commit -m "Telegram: faturadan kalem eslestirme"
if errorlevel 1 echo (Yeni degisiklik yok ya da commit yapilamadi, push deneniyor...)
git push
if errorlevel 1 (
  echo.
  echo !!! Push basarisiz. Yukaridaki hatayi Claude'a gonderin.
) else (
  echo.
  echo Tamam! Vercel birkac dakika icinde yayina alir.
  echo Sonra Telegram'da /stokgiris yazip deneyin.
)
echo.
pause
