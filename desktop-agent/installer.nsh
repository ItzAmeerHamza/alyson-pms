; Custom NSIS installer script for Tavilo Time.
; Closes the running app before install so silent /S can replace files.
;
; Rebrand note: employees updating from "Alyson PM.exe" must not be relaunched
; until Tavilo Time.exe AND ffmpeg.dll are on disk. Launching the new .exe from
; a half-written install dir is the "ffmpeg.dll was not found" System Error.

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

  ; Wait until Chromium DLLs land. A too-early launch of Tavilo Time.exe shows
  ; "ffmpeg.dll was not found" after the product rename / silent update.
  StrCpy $0 0
  tavilo_wait_ffmpeg:
    IntOp $0 $0 + 1
    IfFileExists "$INSTDIR\Tavilo Time.exe" 0 tavilo_ffmpeg_retry
    IfFileExists "$INSTDIR\ffmpeg.dll" tavilo_ffmpeg_ready tavilo_ffmpeg_retry
  tavilo_ffmpeg_retry:
    Sleep 1000
    IntCmp $0 45 tavilo_ffmpeg_giveup 0 tavilo_wait_ffmpeg
  tavilo_ffmpeg_giveup:
    DetailPrint "WARNING: ffmpeg.dll missing after install — not launching (reinstall required)"
    Goto tavilo_time_skip_silent_relaunch
  tavilo_ffmpeg_ready:

  ; Only remove the legacy exe after the new binary + DLLs are present.
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
