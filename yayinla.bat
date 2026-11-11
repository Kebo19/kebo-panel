@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Kebo Panel yayinlaniyor ===
echo.
echo Kod kontrol ediliyor (1-2 dakika surebilir)...
call npx tsc --noEmit
if errorlevel 1 (
  echo.
  echo !!! Kod kontrolunde hata var, YAYINLANMADI. Yukaridaki hatayi Claude'a gonderin.
  echo.
  pause
  exit /b 1
)
git add -A
git commit -m "Fiyat uyarisinda gecmis alis fiyatlari (11.11)"
if errorlevel 1 echo (Yeni degisiklik yok ya da commit yapilamadi, push deneniyor...)
git push
if errorlevel 1 (
  echo.
  echo !!! Push basarisiz. Yukaridaki hatayi Claude'a gonderin.
) else (
  echo.
  echo Tamam! Vercel 2-3 dakika icinde yayina alir.
)
echo.
pause
