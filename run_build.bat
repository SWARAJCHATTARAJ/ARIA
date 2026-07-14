@echo off
echo ====================================================
echo  ARIA TWA Android APK Build Utility
echo ====================================================
echo.

:: Prompt the user for the password securely on their local machine
set /p KEY_PASS="Enter Keystore Password: "

if "%KEY_PASS%"=="" (
    echo Error: Password cannot be empty.
    pause
    exit /b 1
)

:: Set environment variables for the current session only
set BUBBLEWRAP_KEYSTORE_PASSWORD=%KEY_PASS%
set BUBBLEWRAP_KEY_PASSWORD=%KEY_PASS%

echo.
echo Running Bubblewrap build...
npx @bubblewrap/cli build

:: Clear variables from memory
set BUBBLEWRAP_KEYSTORE_PASSWORD=
set BUBBLEWRAP_KEY_PASSWORD=
set KEY_PASS=

echo.
echo Build process completed.
pause
