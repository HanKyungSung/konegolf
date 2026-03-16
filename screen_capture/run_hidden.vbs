' Konegolf Score Capture — Hidden Launcher
' Launches run.bat --background with no visible window.
' Used by Task Scheduler to auto-start on Windows login.

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Set working directory to the folder containing this script
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir

' Launch run.bat in background mode with hidden window (0 = hidden, False = don't wait)
shell.Run "cmd /c run.bat --background", 0, False
