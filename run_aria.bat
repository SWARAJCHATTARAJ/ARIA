@echo off
title ARIA - Autonomous Research Assistant
echo ===================================================
echo   ARIA Desktop Launcher - Preparing local environment
echo ===================================================

cd /d "%~dp0"

:: 1. Find Python
set "PYTHON_EXE=python"

:: Check if global python is a real installation (not Windows App Store alias)
python --version >nul 2>&1
if %errorlevel% equ 0 goto :python_check_ok

:: Fallback 1: Check UV-managed Python versions
for /d %%d in ("%APPDATA%\uv\python\cpython-*") do (
    if exist "%%d\python.exe" (
        set "PYTHON_EXE=%%d\python.exe"
        goto :python_check_ok
    )
)

:: Fallback 2: Check standard Windows installation paths
if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python314\python.exe" (
    set "PYTHON_EXE=%USERPROFILE%\AppData\Local\Programs\Python\Python314\python.exe"
    goto :python_check_ok
)
if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python313\python.exe" (
    set "PYTHON_EXE=%USERPROFILE%\AppData\Local\Programs\Python\Python313\python.exe"
    goto :python_check_ok
)
if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe" (
    set "PYTHON_EXE=%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe"
    goto :python_check_ok
)

echo [ERROR] Python is not installed or not in your PATH.
echo Please install Python 3.9+ from https://www.python.org/
pause
exit /b 1

:python_check_ok
echo [INFO] Using Python: "%PYTHON_EXE%"

:: 2. Check for Virtual Environment
if exist .venv goto :venv_exists
echo [INFO] Creating virtual environment (.venv)...
"%PYTHON_EXE%" -m venv .venv
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
)
:venv_exists

:: 3. Activate Virtual Environment and Install Dependencies
echo [INFO] Activating virtual environment...
call .venv\Scripts\activate.bat

python -c "import webview, uvicorn, fastapi" >nul 2>&1
if %errorlevel% equ 0 goto :dependencies_ok

echo [INFO] Installing python dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

:dependencies_ok

:: 4. Run Desktop App
echo [INFO] Starting ARIA locally as desktop app...
python desktop_app.py
if %errorlevel% neq 0 (
    echo [ERROR] Application exited with error.
    pause
    exit /b 1
)
