; Custom NSIS installer script for Alyson PM
; Closes running app before installation/update so silent /S can replace files.

!macro customInit
  ; Kill current and legacy process names (file locks break silent updates)
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
  ; Interactive installs use runAfterFinish. Silent /S (in-app update) skips the
  ; finish page, so we must relaunch ourselves or Windows stays closed.
  IfSilent 0 alyson_pm_skip_silent_relaunch
    Sleep 1500
    Exec '"$INSTDIR\Alyson PM.exe"'
  alyson_pm_skip_silent_relaunch:
!macroend

!macro customUnInstall
  ; Kill any running instances before uninstallation
  nsExec::ExecToLog 'taskkill /F /IM "Alyson PM.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Alyson Work Time.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Work Time.exe"'
  Sleep 2000
!macroend
