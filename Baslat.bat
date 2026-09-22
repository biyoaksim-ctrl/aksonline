@echo off
setlocal
cd /d "%~dp0"
title Aks Online

echo ============================================
echo   AKS ONLINE - tek tikla baslat
echo ============================================
echo.

rem --- 1) Node.js var mi?
where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi.
  echo.
  echo Once Node.js LTS surumunu kurun: https://nodejs.org
  echo Kurduktan sonra bu dosyaya tekrar cift tiklayin.
  echo.
  pause
  exit /b 1
)

rem --- 2) Baglantilar yoksa kur
if not exist node_modules (
  echo [1/3] Baglantilar kuruluyor, bu birkac dakika surebilir...
  call npm install
  if errorlevel 1 goto :fail
)

rem --- 3) Arayuzu derle
echo [2/3] Arayuz derleniyor...
call npm run build
if errorlevel 1 goto :fail

rem --- 4) Sunucuyu ac ve tarayiciyi baslat
echo [3/3] Sunucu basliyor: http://localhost:8787
start "" "http://localhost:8787"
call node src/server/index.js

echo.
echo Sunucu durdu. Kapatmak icin pencereyi kapatin.
pause
exit /b 0

:fail
echo.
echo [HATA] Baslatma basarisiz. Yukaridaki mesaji okuyun.
pause
exit /b 1
