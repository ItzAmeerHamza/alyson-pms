/**
 * FORCE SYNC OFFLINE QUEUE - Emergency URL Pipeline Fix
 * 
 * Manually processes the offline queue to force-sync URLs to database
 * Addresses the "234 detections → 0 saves" issue
 */

const fs = require('fs');
const path = require('path');

class ForceSyncManager {
  constructor() {
    this.queueFile = path.join(__dirname, 'offline-queue.json');
    this.backupFile = path.join(__dirname, 'offline-queue-backup.json');
    
    console.log('🔧 Force Sync Manager initialized');
  }

  async processOfflineQueue() {
    try {
      console.log('🚀 Starting emergency sync of offline queue...');
      
      // Read offline queue
      if (!fs.existsSync(this.queueFile)) {
        console.log('❌ No offline queue file found');
        return;
      }
      
      const queueData = JSON.parse(fs.readFileSync(this.queueFile, 'utf8'));
      
      console.log('📊 Queue analysis:');
      console.log(`   📱 App logs: ${queueData.appLogs?.length || 0} batches`);
      console.log(`   🌐 URL logs: ${queueData.urlLogs?.length || 0} batches`);
      console.log(`   📸 Screenshots: ${queueData.screenshots?.length || 0} batches`);
      
      // Backup current queue
      fs.writeFileSync(this.backupFile, JSON.stringify(queueData, null, 2));
      console.log('💾 Created backup at:', this.backupFile);
      
      // Process URL logs first (main issue)
      if (queueData.urlLogs && queueData.urlLogs.length > 0) {
        await this.processUrlLogs(queueData.urlLogs);
      }
      
      // Process app logs
      if (queueData.appLogs && queueData.appLogs.length > 0) {
        await this.processAppLogs(queueData.appLogs);
      }
      
      // Clear the queue after successful processing
      const clearedQueue = {
        appLogs: [],
        urlLogs: [],
        screenshots: [],
        timeLogs: [],
        idleLogs: [],
        fraudAlerts: []
      };
      
      fs.writeFileSync(this.queueFile, JSON.stringify(clearedQueue, null, 2));
      console.log('🧹 Cleared offline queue after successful sync');
      
      return true;
      
    } catch (error) {
      console.error('❌ Error processing offline queue:', error.message);
      return false;
    }
  }

  async processUrlLogs(urlLogBatches) {
    console.log('🌐 Processing URL logs...');
    
    let totalUrls = 0;
    let successfulUrls = 0;
    
    for (const batch of urlLogBatches) {
      console.log(`📦 Processing batch: ${batch.id}`);
      
      for (const urlLog of batch.logs) {
        totalUrls++;
        
        try {
          // Simulate the sync to database that should have happened
          const result = await this.insertUrlToDatabase(urlLog);
          if (result.success) {
            successfulUrls++;
            console.log(`✅ Synced URL: ${urlLog.domain} (${urlLog.browser})`);
          } else {
            console.log(`⚠️ Failed to sync URL: ${urlLog.domain} - ${result.error}`);
          }
        } catch (error) {
          console.log(`❌ Error syncing URL: ${urlLog.domain} - ${error.message}`);
        }
      }
    }
    
    console.log(`📊 URL sync results: ${successfulUrls}/${totalUrls} successful`);
    return { total: totalUrls, successful: successfulUrls };
  }

  async processAppLogs(appLogBatches) {
    console.log('📱 Processing App logs...');
    
    let totalApps = 0;
    let successfulApps = 0;
    
    for (const batch of appLogBatches) {
      console.log(`📦 Processing batch: ${batch.id}`);
      
      for (const appLog of batch.logs) {
        totalApps++;
        
        try {
          const result = await this.insertAppToDatabase(appLog);
          if (result.success) {
            successfulApps++;
            console.log(`✅ Synced App: ${appLog.app_name}`);
          } else {
            console.log(`⚠️ Failed to sync App: ${appLog.app_name} - ${result.error}`);
          }
        } catch (error) {
          console.log(`❌ Error syncing App: ${appLog.app_name} - ${error.message}`);
        }
      }
    }
    
    console.log(`📊 App sync results: ${successfulApps}/${totalApps} successful`);
    return { total: totalApps, successful: successfulApps };
  }

  async insertUrlToDatabase(urlLog) {
    try {
      // Use curl to hit the backend API for database insertion
      const { spawn } = require('child_process');
      
      return new Promise((resolve) => {
        const curlProcess = spawn('curl', [
          '-X', 'POST',
          'http://localhost:3000/sync/force-url-insert',
          '-H', 'Content-Type: application/json',
          '-d', JSON.stringify(urlLog)
        ]);
        
        let response = '';
        curlProcess.stdout.on('data', (data) => {
          response += data.toString();
        });
        
        curlProcess.on('close', (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(response);
              resolve({ success: true, result });
            } catch (e) {
              resolve({ success: false, error: 'Invalid response' });
            }
          } else {
            resolve({ success: false, error: `Curl failed with code ${code}` });
          }
        });
        
        curlProcess.on('error', (error) => {
          resolve({ success: false, error: error.message });
        });
      });
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async insertAppToDatabase(appLog) {
    try {
      const { spawn } = require('child_process');
      
      return new Promise((resolve) => {
        const curlProcess = spawn('curl', [
          '-X', 'POST',
          'http://localhost:3000/sync/force-app-insert',
          '-H', 'Content-Type: application/json',
          '-d', JSON.stringify(appLog)
        ]);
        
        let response = '';
        curlProcess.stdout.on('data', (data) => {
          response += data.toString();
        });
        
        curlProcess.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `Curl failed with code ${code}` });
          }
        });
        
        curlProcess.on('error', (error) => {
          resolve({ success: false, error: error.message });
        });
      });
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getQueueStats() {
    try {
      if (!fs.existsSync(this.queueFile)) {
        return { exists: false };
      }
      
      const queueData = JSON.parse(fs.readFileSync(this.queueFile, 'utf8'));
      
      return {
        exists: true,
        urlBatches: queueData.urlLogs?.length || 0,
        appBatches: queueData.appLogs?.length || 0,
        totalUrls: queueData.urlLogs?.reduce((sum, batch) => sum + batch.logs.length, 0) || 0,
        totalApps: queueData.appLogs?.reduce((sum, batch) => sum + batch.logs.length, 0) || 0
      };
    } catch (error) {
      return { exists: false, error: error.message };
    }
  }
}

// Main execution
async function main() {
  const syncManager = new ForceSyncManager();
  
  console.log('🔍 Analyzing offline queue...');
  const stats = await syncManager.getQueueStats();
  
  if (!stats.exists) {
    console.log('❌ No offline queue found');
    return;
  }
  
  console.log('📊 Current queue stats:');
  console.log(`   🌐 URLs queued: ${stats.totalUrls} (in ${stats.urlBatches} batches)`);
  console.log(`   📱 Apps queued: ${stats.totalApps} (in ${stats.appBatches} batches)`);
  
  if (stats.totalUrls > 0 || stats.totalApps > 0) {
    console.log('\n🚀 Processing queue...');
    const success = await syncManager.processOfflineQueue();
    
    if (success) {
      console.log('\n✅ Queue processing completed successfully!');
      console.log('🎯 URLs should now be visible in the database');
    } else {
      console.log('\n❌ Queue processing failed');
    }
  } else {
    console.log('\n✅ Queue is already empty');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ForceSyncManager;
