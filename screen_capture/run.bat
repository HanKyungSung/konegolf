@echo off
cd /d "%~dp0"

REM Parse flags
set BACKGROUND=0
if "%~1"=="--background" set BACKGROUND=1

if %BACKGROUND%==0 (
    echo Starting Konegolf Score Capture...
    echo Logs: score_capture.log
    echo Press Ctrl+C to stop.
    echo.
)

REM Find Python
where python >nul 2>nul
if %errorlevel%==0 (
    set PYTHON=python
    goto :run_updater
)
where py >nul 2>nul
if %errorlevel%==0 (
    set PYTHON=py
    goto :run_updater
)
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python313\python.exe & goto :run_updater
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe & goto :run_updater
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python311\python.exe & goto :run_updater
if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" set PYTHON=%LOCALAPPDATA%\Programs\Python\Python310\python.exe & goto :run_updater

if %BACKGROUND%==1 exit /b 1
echo ERROR: Python not found!
pause
exit /b 1

:run_updater
if %BACKGROUND%==0 echo Using: %PYTHON%

REM Check for updates (updater.py exits 10 if update was applied)
if exist "updater.py" (
    if %BACKGROUND%==0 echo Checking for updates...
    %PYTHON% updater.py
    if %errorlevel%==10 (
        if %BACKGROUND%==0 echo Update applied! Restarting...
        REM Re-run setup.bat silently in case requirements changed
        if exist "setup.bat" call setup.bat --no-pause
        REM Restart this script
        start "" cmd /c "%~f0" %*
        exit /b 0
    )
    if %BACKGROUND%==0 echo.
)

:check_auth
if not exist "token.json" (
    if %BACKGROUND%==1 (
        REM Background mode: can't do interactive auth, exit silently
        exit /b 0
    )
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
if %BACKGROUND%==0 pause
