@echo off
rem kanpan - short-term trading dashboard (auto-restart on crash)
cd /d %~dp0
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  call npm run install:all
)
if not exist web\dist\index.html (
  echo Building frontend...
  call npm run build
)
start "kanpan-server" cmd /c ":restart
node server/src/index.js
echo server exited, restarting in 3s...
timeout /t 3 >nul
goto restart"
timeout /t 2 >nul
start "" http://127.0.0.1:8000/
echo kanpan is running at http://127.0.0.1:8000
