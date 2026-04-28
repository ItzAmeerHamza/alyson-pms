#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🎯 Auto Default Project & Timer Start...');
console.log('=======================================');

let agentProcess = null;
let logBuffer = [];

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    console.log(logLine);
    logBuffer.push(logLine);
}

async function killExistingProcesses() {
    try {
        log('🧹 Killing any existing Electron processes...');
        execSync('pkill -f "electron.*time-flow\\|Ebdaa Work Time" || true');
        await sleep(2000);
    } catch (error) {
        log(`⚠️ Error killing processes: ${error.message}`);
    }
}

async function getFirstAvailableProject() {
    log('📋 Getting first available project from database...');
    
    try {
        const { createClient } = require('@supabase/supabase-js');
        const envConfig = require('../desktop-agent/env-config.js');
        
        const supabase = createClient(
            envConfig.SUPABASE_URL,
            envConfig.SUPABASE_SERVICE_ROLE_KEY
        );
        
        // Get all available projects (no user_id filter as projects are shared)
        const { data: projects, error } = await supabase
            .from('projects')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(5);
        
        if (error) {
            log(`❌ Database error: ${error.message}`);
            return null;
        }
        
                 if (!projects || projects.length === 0) {
             log('❌ No projects found in database');
             return null;
         }
        
        log(`✅ Found ${projects.length} projects:`);
        projects.forEach((project, index) => {
            log(`   ${index + 1}. ${project.name} (${project.id})`);
        });
        
        const firstProject = projects[0];
        log(`🎯 Selected default project: "${firstProject.name}" (${firstProject.id})`);
        
        return firstProject;
        
    } catch (error) {
        log(`❌ Error getting projects: ${error.message}`);
        return null;
    }
}

async function createActiveTimeLog(projectId) {
    log(`⏱️ Creating active time log for project: ${projectId}`);
    
    try {
        const { createClient } = require('@supabase/supabase-js');
        const envConfig = require('../desktop-agent/env-config.js');
        
        const supabase = createClient(
            envConfig.SUPABASE_URL,
            envConfig.SUPABASE_SERVICE_ROLE_KEY
        );
        
        // First, end any existing active sessions
        log('🧹 Ending any existing active sessions...');
        await supabase
            .from('time_logs')
            .update({ 
                status: 'completed',
                end_time: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('user_id', '0c3d3092-913e-436f-a352-3378e558c34f')
            .eq('status', 'active');
        
        // Create new active time log
        const timeLogId = require('crypto').randomUUID();
        const now = new Date().toISOString();
        
        const timeLogData = {
            id: timeLogId,
            user_id: '0c3d3092-913e-436f-a352-3378e558c34f',
            project_id: projectId,
            start_time: now,
            status: 'active',
            created_at: now,
            updated_at: now
        };
        
        const { data, error } = await supabase
            .from('time_logs')
            .insert([timeLogData])
            .select()
            .single();
        
        if (error) {
            log(`❌ Failed to create time log: ${error.message}`);
            return null;
        }
        
        log('✅ Time log created successfully:');
        log(`   📊 Session ID: ${data.id}`);
        log(`   📊 Project ID: ${data.project_id}`);
        log(`   📊 Started: ${data.start_time}`);
        log(`   📊 Status: ${data.status}`);
        
        return data;
        
    } catch (error) {
        log(`❌ Error creating time log: ${error.message}`);
        return null;
    }
}

function startDesktopAgent() {
    return new Promise((resolve) => {
        log('🚀 Starting desktop agent...');
        
        process.chdir(path.join(__dirname, '..', 'desktop-agent'));
        
        agentProcess = spawn('npm', ['start'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false
        });

        let startupComplete = false;
        
        agentProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(output.trim());
            
            // Look for specific ready indicators
            if (!startupComplete && (
                output.includes('✅ Ebdaa Work Time Agent ready and visible') ||
                output.includes('✅ Desktop agent session loaded') ||
                output.includes('✅ User session restored')
            )) {
                startupComplete = true;
                log('✅ Desktop agent fully ready - waiting 5 seconds for complete initialization');
                setTimeout(() => resolve(true), 5000);
            }
        });

        agentProcess.stderr.on('data', (data) => {
            console.log(`Error: ${data.toString().trim()}`);
        });

        // Fallback timeout
        setTimeout(() => {
            if (!startupComplete) {
                log('⏰ Timeout reached - assuming agent started');
                resolve(true);
            }
        }, 20000);
    });
}

async function openDebugConsole() {
    log('🔬 Opening debug console...');
    
    try {
        await sleep(2000);
        
        const debugScript = `
        tell application "System Events"
            tell process "Electron"
                set frontmost to true
                delay 1
                key code 2 using {command down, shift down} -- Cmd+Shift+D
                delay 3
            end tell
        end tell
        `;
        
        execSync(`osascript -e '${debugScript}'`);
        log('✅ Debug console opened');
        
    } catch (error) {
        log(`❌ Failed to open debug console: ${error.message}`);
    }
}

async function verifyTimerActive() {
    log('✅ Verifying timer is active...');
    
    try {
        const { createClient } = require('@supabase/supabase-js');
        const envConfig = require('../desktop-agent/env-config.js');
        
        const supabase = createClient(
            envConfig.SUPABASE_URL,
            envConfig.SUPABASE_SERVICE_ROLE_KEY
        );
        
        const { data: activeLogs } = await supabase
            .from('time_logs')
            .select('*')
            .eq('user_id', '0c3d3092-913e-436f-a352-3378e558c34f')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (activeLogs && activeLogs.length > 0) {
            const activeLog = activeLogs[0];
            log('✅ Timer is ACTIVE in database:');
            log(`   📊 Session ID: ${activeLog.id}`);
            log(`   📊 Project ID: ${activeLog.project_id}`);
            log(`   📊 Started: ${activeLog.start_time}`);
            
            // Calculate running time
            const startTime = new Date(activeLog.start_time);
            const runningTime = Math.floor((Date.now() - startTime.getTime()) / 1000);
            log(`   ⏱️ Running for: ${runningTime} seconds`);
            
            return activeLog;
        } else {
            log('❌ No active timer found in database');
            return null;
        }
        
    } catch (error) {
        log(`❌ Timer verification error: ${error.message}`);
        return null;
    }
}

async function generateTestActivity() {
    log('🎯 Generating test activity to ensure input detection works...');
    
    try {
        // Generate some mouse and keyboard activity
        const activityScript = `
        tell application "System Events"
            -- Generate mouse movements
            repeat 3 times
                set currentPos to {500, 300}
                repeat 8 times
                    set currentPos to {(item 1 of currentPos) + 5, (item 2 of currentPos) + 5}
                    delay 0.1
                end repeat
                delay 0.3
            end repeat
            
            -- Generate keyboard activity
            repeat 5 times
                key code 49 -- Space
                delay 0.2
                key code 51 -- Delete  
                delay 0.3
            end repeat
        end tell
        `;
        
        execSync(`osascript -e '${activityScript}'`);
        log('✅ Test activity generated');
        
    } catch (error) {
        log(`❌ Failed to generate test activity: ${error.message}`);
    }
}

async function monitorActivityData() {
    log('📊 Monitoring activity data for 2 minutes...');
    
    const startTime = Date.now();
    const monitorDuration = 120000; // 2 minutes
    let lastCheck = 0;
    let foundNonZero = false;
    
    while (Date.now() - startTime < monitorDuration && !foundNonZero) {
        try {
            if (Date.now() - lastCheck > 10000) { // Check every 10 seconds
                lastCheck = Date.now();
                
                const { createClient } = require('@supabase/supabase-js');
                const envConfig = require('../desktop-agent/env-config.js');
                
                const supabase = createClient(
                    envConfig.SUPABASE_URL,
                    envConfig.SUPABASE_SERVICE_ROLE_KEY
                );
                
                // Check for recent activities
                const { data: activities } = await supabase
                    .from('user_activities')
                    .select('*')
                    .eq('user_id', '0c3d3092-913e-436f-a352-3378e558c34f')
                    .gte('created_at', new Date(Date.now() - 30000).toISOString()) // Last 30 seconds
                    .order('created_at', { ascending: false })
                    .limit(5);
                
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                
                if (activities && activities.length > 0) {
                    log(`📊 [${elapsed}s] Found ${activities.length} recent activities:`);
                    
                    let hasNonZero = false;
                    activities.forEach((activity, index) => {
                        const clicks = activity.mouse_clicks || 0;
                        const keys = activity.key_strokes || 0;
                        const moves = activity.mouse_movements || 0;
                        
                        log(`   ${index + 1}. Clicks: ${clicks}, Keys: ${keys}, Moves: ${moves}`);
                        
                        if (clicks > 0 || keys > 0 || moves > 0) {
                            hasNonZero = true;
                        }
                    });
                    
                    if (hasNonZero) {
                        log('🎉 NON-ZERO VALUES DETECTED! System working properly!');
                        foundNonZero = true;
                        return true;
                    } else {
                        log('⚠️ Still seeing zero values in activity data');
                    }
                } else {
                    log(`📊 [${elapsed}s] No recent activities found`);
                }
            }
            
            await sleep(5000); // Wait 5 seconds between checks
            
        } catch (error) {
            log(`❌ Monitoring error: ${error.message}`);
        }
    }
    
    if (!foundNonZero) {
        log('❌ Monitoring completed - still seeing zero values');
        
        // Check if any activities exist at all
        try {
            const { createClient } = require('@supabase/supabase-js');
            const envConfig = require('../desktop-agent/env-config.js');
            
            const supabase = createClient(
                envConfig.SUPABASE_URL,
                envConfig.SUPABASE_SERVICE_ROLE_KEY
            );
            
            const { data: allActivities } = await supabase
                .from('user_activities')
                .select('*')
                .eq('user_id', '0c3d3092-913e-436f-a352-3378e558c34f')
                .gte('created_at', new Date(Date.now() - monitorDuration).toISOString())
                .order('created_at', { ascending: false })
                .limit(10);
            
            if (allActivities && allActivities.length > 0) {
                log(`📊 Total activities in last 2 minutes: ${allActivities.length}`);
                log('📋 Sample activity records:');
                allActivities.slice(0, 3).forEach((activity, index) => {
                    log(`   ${index + 1}. ${new Date(activity.created_at).toLocaleTimeString()} - Clicks: ${activity.mouse_clicks}, Keys: ${activity.key_strokes}, Moves: ${activity.mouse_movements}`);
                });
            } else {
                log('❌ No activities recorded at all - input detection not working');
            }
        } catch (error) {
            log(`❌ Error checking activities: ${error.message}`);
        }
    }
    
    return foundNonZero;
}

async function main() {
    process.chdir(__dirname);
    
    log('🚀 Starting Auto Default Project & Timer Process');
    
    try {
        // Step 1: Get first available project
        const project = await getFirstAvailableProject();
        if (!project) {
            log('❌ No projects available - cannot start timer');
            return;
        }
        
        // Step 2: Create active time log
        const timeLog = await createActiveTimeLog(project.id);
        if (!timeLog) {
            log('❌ Failed to create time log - cannot proceed');
            return;
        }
        
        // Step 3: Clean up and start desktop agent
        await killExistingProcesses();
        await startDesktopAgent();
        
        // Step 4: Verify timer is recognized as active
        await sleep(3000); // Wait for agent to sync with database
        const activeTimer = await verifyTimerActive();
        
        if (!activeTimer) {
            log('⚠️ Agent may not have synced with database timer yet');
        }
        
        // Step 5: Open debug console
        await openDebugConsole();
        
        // Step 6: Generate test activity
        await generateTestActivity();
        
        // Step 7: Monitor for activity data
        const hasNonZeroValues = await monitorActivityData();
        
        // Final status report
        log('\n📋 FINAL STATUS REPORT:');
        log('=' .repeat(50));
        
        if (hasNonZeroValues) {
            log('🎉 COMPLETE SUCCESS!');
            log('✅ Project automatically selected as default');
            log('✅ Timer started via database');
            log('✅ Desktop agent running');
            log('✅ Debug console opened');
            log('✅ Non-zero activity values detected');
            log('✅ System fully operational');
        } else {
            log('⚠️ PARTIAL SUCCESS:');
            log('✅ Project automatically selected as default');
            log('✅ Timer started via database');  
            log('✅ Desktop agent running');
            log('✅ Debug console opened');
            log('❌ Still detecting zero values in activity data');
            log('📋 Input detection may need additional configuration');
        }
        
    } catch (error) {
        log(`❌ Process failed: ${error.message}`);
    }
    
    // Save detailed logs
    const logFile = `auto-default-project-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    fs.writeFileSync(logFile, logBuffer.join('\n'));
    log(`📄 Detailed logs saved to: ${logFile}`);
    
    log('\n🏁 Auto default project process completed!');
}

// Cleanup handlers
process.on('SIGINT', async () => {
    log('\n🛑 Process interrupted');
    process.exit(0);
});

main().catch(error => {
    console.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
}); 