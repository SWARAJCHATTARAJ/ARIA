@echo off
title ARIA - Autonomous Research Assistant
echo ===================================================
echo   ARIA Desktop Launcher - Preparing local environment
echo ===================================================

cd /d "%~dp0"

:: Check for Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python 3.9+ from https://www.python.org/
    pause
    exit /b 1
)

:: Check for Virtual Environment
if not exist .venv (
    echo [INFO] Creating virtual environment (.venv)...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

:: Activate Virtual Environment and Install Dependencies
echo [INFO] Activating virtual environment...
call .venv\Scripts\activate.bat

python -c "import webview, uvicorn, fastapi" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing python dependencies...
    pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

:: Run Desktop App
echo [INFO] Starting ARIA locally as desktop app...
python desktop_app.py

pause
