@echo off
rem Newest _builds\*.apk -> the phone on the USB cable, then launch it.
cd /d "%~dp0"
call npm run install:apk
pause
