@echo off
REM ============================================================
REM  TimeFlow Desktop Agent — Windows E2E Test Automation
REM  Launches the agent + runs quick-verify + full test suite
REM  Usage:  run-e2e-tests.bat [quick | full | both]
REM          Default: both
REM ============================================================
powershell -ExecutionPolicy Bypass -File "%~dp0run-e2e-tests.ps1" %*
