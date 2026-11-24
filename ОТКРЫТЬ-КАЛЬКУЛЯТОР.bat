@echo off
chcp 65001 >nul
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  start "Валютный калькулятор" /min py -m http.server 4173 --bind 127.0.0.1
) else (
  start "Валютный калькулятор" /min python -m http.server 4173 --bind 127.0.0.1
)

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173/"
