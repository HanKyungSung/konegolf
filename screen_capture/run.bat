@echo off
cd /d "%~dp0"
echo Starting Konegolf Score Capture...
echo Logs: score_capture.log
echo Press Ctrl+C to stop.
echo.

REM Find Python
where python >nul 2>nul
if %errorlevel%==0 (
    set PYTHON=python
    goto :check_auth
)
where py >nul 2>nul
if %errorlevel%==0 (
    set PYTHON=py
    goto :check_auth
)
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python313\python.exe & goto :check_auth
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe & goto :check_auth
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python311\python.exe & goto :check_auth
if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python310\python.exe & goto :check_auth

echo ERROR: Python not found!
pause
exit /b 1

:check_auth
echo Using: %PYTHON%
if not exist "token.json" (
    echo.
    echo Google Drive authentication required. Opening browser...
    echo Please log in with the konegolf Google account.
    echo.
    %PYTHON% capture.py --auth
    if not exist "token.json" (
        echo ERROR: Authentication failed. Please try again.
        pause
        exit /b 1
    )
    echo.
)

%PYTHON% capture.py
pause
