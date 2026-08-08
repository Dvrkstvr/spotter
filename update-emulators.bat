@echo off
rem Reload running emulators with the current sim-radio JS (fresh Metro).
cd /d "%~dp0"
call npm run update:emu
pause
