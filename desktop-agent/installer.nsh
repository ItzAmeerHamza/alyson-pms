; Custom NSIS installer script for Work Time
; Automatically closes running app before installation/update

!macro customInit
  ; Kill any running instances of the app before installation
  nsExec::ExecToLog 'taskkill /F /IM "Work Time.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Ebdaa Work Time.exe"'
  Sleep 2000

  ; Remove old per-machine installation if it exists (migration to per-user)
  IfFileExists "$PROGRAMFILES\Work Time\Uninstall Work Time.exe" 0 +3
    nsExec::ExecToLog '"$PROGRAMFILES\Work Time\Uninstall Work Time.exe" /S /allusers'
    Sleep 3000
!macroend

!macro customInstall
  ; Verify critical DLLs exist after installation
  ; ffmpeg.dll is required by Electron runtime
!macroend

!macro customUnInstall
  ; Kill any running instances before uninstallation
  nsExec::ExecToLog 'taskkill /F /IM "Work Time.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Ebdaa Work Time.exe"'
  Sleep 2000
!macroend

