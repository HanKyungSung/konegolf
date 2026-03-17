@echo off

REM Parse flags
set NO_PAUSE=0
if "%~1"=="--no-pause" set NO_PAUSE=1

echo ==========================================
echo  Konegolf Score Capture - Setup
echo ==========================================
echo.

REM Try to find Python automatically
where python >nul 2>nul
if %errorlevel%==0 (
    set PYTHON=python
    goto :found
)
where py >nul 2>nul
if %errorlevel%==0 (
    set PYTHON=py
    goto :found
)

REM Common Python install locations
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python313\python.exe & goto :found
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe & goto :found
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python311\python.exe & goto :found
if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python310\python.exe & goto :found
if exist "C:\Python313\python.exe" set PYTHON=C:\Python313\python.exe & goto :found
if exist "C:\Python312\python.exe" set PYTHON=C:\Python312\python.exe & goto :found

echo ERROR: Python not found!
echo Please install Python 3.12 or 3.13 and check "Add Python to PATH"
echo Or edit this file and set PYTHON= to your python.exe path
if %NO_PAUSE%==0 pause
exit /b 1

:found
echo Found Python: %PYTHON%
echo.

echo [1/5] Upgrading pip...
%PYTHON% -m pip install --upgrade pip --quiet

echo [2/5] Installing dependencies...
%PYTHON% -m pip install -r requirements.txt --quiet

echo [3/5] Creating captures folder...
if not exist "captures" mkdir captures

echo [4/5] Creating config from template...
if not exist "config.json" (
    if exist "config.json.example" (
        copy config.json.example config.json >nul
        echo   Created config.json from template. Edit it with your bay number.
    )
)

echo [5/5] Registering autostart with Task Scheduler...
set "VBS_PATH=%~dp0run_hidden.vbs"
REM Remove any trailing backslash issues and verify file exists
if not exist "%VBS_PATH%" (
    echo   WARNING: run_hidden.vbs not found at %VBS_PATH%. Skipping autostart registration.
    goto :done
)
echo   VBS path: %VBS_PATH%
schtasks /create /tn "KonegolfScoreCapture" /tr "wscript.exe \"%VBS_PATH%\"" /sc onlogon /rl highest /f
if %errorlevel%==0 (
    echo   Registered: KonegolfScoreCapture (runs on login)
) else (
    echo   WARNING: Could not register Task Scheduler entry.
    echo   You may need to run setup.bat as Administrator.
    echo   Or register manually:
    echo     schtasks /create /tn "KonegolfScoreCapture" /tr "wscript.exe \"%VBS_PATH%\"" /sc onlogon /rl highest /f
)

:done
echo.
echo ==========================================
echo  Setup complete!
echo  Next steps:
echo    1. Edit config.json with your bay number
echo       and Google Drive folder ID
echo    2. Run: run.bat
echo  After first auth, the script will auto-start
echo  on login. No shortcut needed.
echo ==========================================
if %NO_PAUSE%==0 pause
