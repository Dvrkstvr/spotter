@echo off
rem Buddy testing in one go: boots emulator(s), opens the relay window, runs
rem Metro with the sim radio. Usage: start-emulated [N]  (N emulators, default 2)
cd /d "%~dp0"
node scripts\start-emulated.mjs %*
pause
