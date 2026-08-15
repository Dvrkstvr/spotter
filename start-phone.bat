@echo off
rem start-emulated with the phone on the USB cable as one of the two instances
rem (so only one emulator is booted). Works while the PC is tethered through
rem that phone. Usage: start-phone [N]  (N emulators, default 1; 0 for none)
cd /d "%~dp0"
node scripts\start-emulated.mjs --phone %*
pause
