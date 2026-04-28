# 🚨 CRITICAL: Desktop Agent Instance Management Rules

## ⚠️ **WHY THIS IS CRITICAL**

Multiple desktop agent instances cause:
- **Data conflicts** and corruption
- **Resource waste** (CPU, memory, disk I/O)
- **IPC communication failures** (render frame disposed errors)
- **Database sync issues** and duplicate entries
- **System instability** and crashes

## 🔒 **SINGLE INSTANCE RULE**

**NEVER allow multiple desktop agent instances to run simultaneously.**

## 🚀 **SAFE STARTUP PROCESS**

### **Option 1: Use Safe Start Script (RECOMMENDED)**
```bash
cd desktop-agent
npm run safe-start
```

### **Option 2: Manual Process (if script fails)**
```bash
# 1. Check for existing processes
ps aux | grep "desktop-agent"

# 2. Kill any existing instances
pkill -f "desktop-agent"

# 3. Wait for cleanup
sleep 3

# 4. Verify no processes remain
ps aux | grep "desktop-agent"

# 5. Start fresh instance
cd desktop-agent
npm run start
```

## 🔍 **DETECTION METHODS**

### **Process Check Commands**
```bash
# Check for desktop agent processes
ps aux | grep "desktop-agent"

# Check for electron processes related to time-flow
ps aux | grep "electron.*time-flow"

# Check for specific process IDs
pgrep -f "desktop-agent"
```

### **Signs of Multiple Instances**
- Multiple Electron processes in Activity Monitor
- Duplicate app icons in dock/menu bar
- High CPU/memory usage
- Database sync errors
- IPC communication failures

## 🛡️ **PREVENTION MECHANISMS**

### **1. Single Instance Lock (Production)**
```javascript
// In main.js
const isSecondInstance = app.requestSingleInstanceLock();

if (!isSecondInstance) {
  console.log('❌ Another instance is already running');
  app.quit();
  return;
}

app.on('second-instance', () => {
  if (global.mainWindow) {
    if (global.mainWindow.isMinimized()) global.mainWindow.restore();
    global.mainWindow.focus();
  }
});
```

### **2. Process Cleanup on Exit**
```javascript
// Ensure clean shutdown
app.on('before-quit', () => {
  // Cleanup all timers, intervals, and processes
  global.cleanupRegistry?.cleanupAll();
});
```

## 🚨 **EMERGENCY RECOVERY**

### **If Multiple Instances Detected:**
1. **STOP all instances immediately**
2. **Kill all processes** with `pkill -9 -f "desktop-agent"`
3. **Wait 5 seconds** for system cleanup
4. **Verify no processes remain**
5. **Start fresh instance** using safe-start script

### **Force Kill Commands**
```bash
# Normal kill
pkill -f "desktop-agent"

# Force kill (use only if normal kill fails)
pkill -9 -f "desktop-agent"

# Kill all electron processes (nuclear option)
pkill -f "electron"
```

## 📋 **CHECKLIST BEFORE STARTING**

- [ ] No existing desktop agent processes running
- [ ] No electron processes related to time-flow
- [ ] System resources available (CPU < 80%, memory < 90%)
- [ ] Database connection stable
- [ ] All previous instances properly terminated

## 🔧 **DEVELOPMENT WORKFLOW**

### **Before Development:**
```bash
# Always check and clean before starting
npm run safe-start
```

### **After Testing:**
```bash
# Properly close the app (don't force quit)
# Or use Cmd+Q to ensure clean shutdown
```

### **If Issues Occur:**
```bash
# Use safe restart
npm run safe-start
```

## 📊 **MONITORING**

### **Watch for These Log Messages:**
```
🔔 Second Desktop Agent instance detected (debounced)
⚠️ [SYNC] Cannot send activity-update - window not available
Error sending from webFrameMain: Render frame was disposed
```

### **System Health Indicators:**
- Memory usage > 200MB per instance
- CPU usage > 50% per instance
- Multiple processes in Activity Monitor
- Database connection errors

## 🎯 **SUMMARY**

**ALWAYS:**
1. ✅ Use `npm run safe-start` for development
2. ✅ Check for existing instances before starting
3. ✅ Kill conflicting processes before startup
4. ✅ Verify clean environment before proceeding
5. ✅ Use single instance lock in production

**NEVER:**
1. ❌ Start without checking existing instances
2. ❌ Allow multiple instances to run
3. ❌ Force quit without proper cleanup
4. ❌ Ignore instance conflict warnings
5. ❌ Skip the safe startup process

## 📞 **SUPPORT**

If you encounter persistent instance conflicts:
1. Check this document first
2. Use the safe-start script
3. Review system logs for errors
4. Contact the development team

---

**Remember: A single, clean instance is always better than multiple conflicting instances!**
