@echo off
rem Kebo robotunu bu bilgisayara kurar: zipi Belgeler\kebo-robot klasorune acar ve KURULUM.bati calistirir.
cd /d "%~dp0"
if not exist "mikro-robot-kurulum.zip" (echo mikro-robot-kurulum.zip bulunamadi. & pause & exit /b 1)
set "HEDEF=%USERPROFILE%\Documents\kebo-robot"
powershell.exe -NoProfile -Command "Expand-Archive -Force -Path mikro-robot-kurulum.zip -DestinationPath $env:HEDEF"
call "%HEDEF%\kebo-mikro-robot\KURULUM.bat"
