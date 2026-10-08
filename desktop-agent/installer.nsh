; Custom NSIS installer script for Tavilo Time.
; Closes the running app before install so silent /S can replace files.
; The build already on employee PCs relaunches "Alyson PM.exe" after Setup.
; Remove that old file and start "Tavilo Time.exe" here instead.

!macro customInit
  ; Kill current and legacy process names (file locks break silent updates)
  nsExec::ExecToLog 'taskkill /F /IM "Tavilo Time.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Alyson PM.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Alyson Work Time.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Work Time.exe"'
  Sleep 2500

  ; Remove old per-machine installation if it exists (migration to per-user)
  IfFileExists "$PROGRAMFILES\Work Time\Uninstall Work Time.exe" 0 +3
    nsExec::ExecToLog '"$PROGRAMFILES\Work Time\Uninstall Work Time.exe" /S /allusers'
    Sleep 3000
  IfFileExists "$PROGRAMFILES\Alyson PM\Uninstall Alyson PM.exe" 0 +3
    nsExec::ExecToLog '"$PROGRAMFILES\Alyson PM\Uninstall Alyson PM.exe" /S /allusers'
    Sleep 3000
!macroend

!macro customInstall
  ; Drop the pre-rebrand shortcuts. electron-builder creates "Tavilo Time" ones.
  Delete "$DESKTOP\Alyson PM.lnk"
  Delete "$SMPROGRAMS\Alyson PM.lnk"
  ; Old updater starts this path after Setup exits. Remove it so that launch
  ; cannot bring the previous binary back.
  Delete "$INSTDIR\Alyson PM.exe"

  ; Interactive installs use runAfterFinish. Silent /S (in-app update) skips the
  ; finish page, so we must relaunch ourselves or Windows stays closed.
  IfSilent 0 tavilo_time_skip_silent_relaunch
    Sleep 1500
    Exec '"$INSTDIR\Tavilo Time.exe"'
  tavilo_time_skip_silent_relaunch:
!macroend

!macro customUnInstall
  ; Kill any running instances before uninstallation
  nsExec::ExecToLog 'taskkill /F /IM "Tavilo Time.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Alyson PM.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Alyson Work Time.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Work Time.exe"'
  Sleep 2000

  ; Remove login auto-start Run keys (current name and the pre-rebrand name)
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Tavilo Time"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Alyson PM"
!macroend
