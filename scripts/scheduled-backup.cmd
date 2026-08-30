@echo off
setlocal
cd /d C:\Users\merm\Documents\t3\gym-backend
call npm.cmd run release:preflight || exit /b 1
call npm.cmd run db:backup || exit /b 1
call npm.cmd run db:backup:verify || exit /b 1
exit /b 0
