# PowerShell Development Setup Script for TimeFlow
# This script sets up PowerShell development environment for Windows

[CmdletBinding()]
param(
    [switch]$InstallModules,
    [switch]$ConfigureMCP
)

Write-Host "Setting up PowerShell development environment..." -ForegroundColor Green

# Check PowerShell version
$psVersion = $PSVersionTable.PSVersion
Write-Host "PowerShell Version: $psVersion" -ForegroundColor Cyan

# Install useful PowerShell modules for development
if ($InstallModules) {
    Write-Host "Installing PowerShell development modules..." -ForegroundColor Yellow
    
    $modules = @(
        'PowerShellGet',
        'PSReadLine',
        'Pester',
        'PSScriptAnalyzer'
    )
    
    foreach ($module in $modules) {
        Write-Host "Installing $module..." -ForegroundColor Gray
        Install-Module -Name $module -Force -SkipPublisherCheck -AllowClobber
    }
}

# Configure MCP settings
if ($ConfigureMCP) {
    Write-Host "Configuring MCP for PowerShell development..." -ForegroundColor Yellow
    
    $mcpConfig = @{
        "mcpServers" = @{
            "supabase" = @{
                "command" = "npx"
                "args" = @(
                    "-y",
                    "@supabase/mcp-server-supabase@latest",
                    "--access-token",
                    "***ACCESS_TOKEN_REMOVED***"
                )
                "env" = @{
                    "SUPABASE_ACCESS_TOKEN" = "***ACCESS_TOKEN_REMOVED***"
                    "SUPABASE_PROJECT_REF" = "fkpiqcxkmrtaetvfgcli"
                    "SUPABASE_ORG_ID" = "nihorvtxvqbmhtmampys"
                }
            }
            "powershell" = @{
                "command" = "pwsh"
                "args" = @(
                    "-NoProfile",
                    "-Command",
                    "Get-Module -ListAvailable | Select-Object Name, Version"
                )
                "env" = @{
                    "PSModulePath" = $env:PSModulePath
                    "POWERSHELL_TELEMETRY_OPTOUT" = "1"
                }
            }
        }
    }
    
    $configPath = ".\.cursor\mcp-powershell-windows.json"
    $mcpConfig | ConvertTo-Json -Depth 10 | Set-Content -Path $configPath -Encoding UTF8
    Write-Host "MCP configuration saved to: $configPath" -ForegroundColor Green
}

Write-Host "PowerShell development environment setup complete!" -ForegroundColor Green
Write-Host "To use with the PowerShell extension, ensure you have ms-vscode.powershell installed in Cursor/VS Code" -ForegroundColor Cyan
# PowerShell Development Setup Script for TimeFlow
# This script sets up PowerShell development environment for Windows

[CmdletBinding()]
param(
    [switch]$InstallModules,
    [switch]$ConfigureMCP
)

Write-Host "Setting up PowerShell development environment..." -ForegroundColor Green

# Check PowerShell version
$psVersion = $PSVersionTable.PSVersion
Write-Host "PowerShell Version: $psVersion" -ForegroundColor Cyan

# Install useful PowerShell modules for development
if ($InstallModules) {
    Write-Host "Installing PowerShell development modules..." -ForegroundColor Yellow
    
    $modules = @(
        'PowerShellGet',
        'PSReadLine',
        'Pester',
        'PSScriptAnalyzer'
    )
    
    foreach ($module in $modules) {
        Write-Host "Installing $module..." -ForegroundColor Gray
        Install-Module -Name $module -Force -SkipPublisherCheck -AllowClobber
    }
}

# Configure MCP settings
if ($ConfigureMCP) {
    Write-Host "Configuring MCP for PowerShell development..." -ForegroundColor Yellow
    
    $mcpConfig = @{
        "mcpServers" = @{
            "supabase" = @{
                "command" = "npx"
                "args" = @(
                    "-y",
                    "@supabase/mcp-server-supabase@latest",
                    "--access-token",
                    "***ACCESS_TOKEN_REMOVED***"
                )
                "env" = @{
                    "SUPABASE_ACCESS_TOKEN" = "***ACCESS_TOKEN_REMOVED***"
                    "SUPABASE_PROJECT_REF" = "fkpiqcxkmrtaetvfgcli"
                    "SUPABASE_ORG_ID" = "nihorvtxvqbmhtmampys"
                }
            }
            "powershell" = @{
                "command" = "pwsh"
                "args" = @(
                    "-NoProfile",
                    "-Command",
                    "Get-Module -ListAvailable | Select-Object Name, Version"
                )
                "env" = @{
                    "PSModulePath" = $env:PSModulePath
                    "POWERSHELL_TELEMETRY_OPTOUT" = "1"
                }
            }
        }
    }
    
    $configPath = ".\.cursor\mcp-powershell-windows.json"
    $mcpConfig | ConvertTo-Json -Depth 10 | Set-Content -Path $configPath -Encoding UTF8
    Write-Host "MCP configuration saved to: $configPath" -ForegroundColor Green
}

Write-Host "PowerShell development environment setup complete!" -ForegroundColor Green
Write-Host "To use with the PowerShell extension, ensure you have ms-vscode.powershell installed in Cursor/VS Code" -ForegroundColor Cyan


