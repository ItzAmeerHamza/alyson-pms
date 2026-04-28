# Simple PowerShell script to get active window information
# Uses .NET directly instead of Add-Type

Add-Type -AssemblyName UIAutomationClient

try {
    # Get foreground window
    $foregroundElement = [System.Windows.Automation.AutomationElement]::FocusedElement
    
    if ($foregroundElement) {
        $processId = $foregroundElement.Current.ProcessId
        $windowTitle = $foregroundElement.Current.Name
        
        # Get process info
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        $processName = if ($process) { $process.ProcessName } else { "Unknown" }
        $processDescription = "Unknown"
        if ($process) {
            try { $processDescription = $process.Description } catch {}
            if (-not $processDescription) { try { $processDescription = $process.MainModule.FileVersionInfo.FileDescription } catch {} }
        }
        
        # Get window bounds
        $bounds = $foregroundElement.Current.BoundingRectangle
        
        $result = @{
            ProcessId = $processId
            ProcessName = $processName
            ProcessDescription = $processDescription
            WindowTitle = $windowTitle
            Left = [int]$bounds.Left
            Top = [int]$bounds.Top
            Width = [int]$bounds.Width
            Height = [int]$bounds.Height
        }
        
        $result | ConvertTo-Json -Compress
    }
    else {
        Write-Output "{}"
    }
}
catch {
    Write-Output "{}"
}
