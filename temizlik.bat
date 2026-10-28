@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Kebo Panel temizligi: eski yapay zeka ciktilari, eski deneme klasoru ve kullanilmayan eski Mikro fonksiyonu silinecek.
echo (Bunlar siteye gitmiyor, sadece bilgisayarda yer kapliyor.)
echo.
if exist "repomix-output.txt" del /q "repomix-output.txt" && echo - repomix-output.txt silindi
if exist "repomix-output.xml" del /q "repomix-output.xml" && echo - repomix-output.xml silindi
if exist "_kebo_test" rmdir /s /q "_kebo_test" && echo - _kebo_test klasoru silindi
if exist "supabase\functions\mikro-fiyat-guncelle" rmdir /s /q "supabase\functions\mikro-fiyat-guncelle" && echo - eski Mikro fiyat fonksiyonu silindi, artik robot kullaniliyor
echo.
echo TAMAM. Simdi yayinla.bat ile yayinlayabilirsiniz. Bu dosyayi da silebilirsiniz.
pause
