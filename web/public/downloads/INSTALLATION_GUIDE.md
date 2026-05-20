# 🍎 macOS Installation Guide for Alyson Work Time

## The Issue You're Seeing

If you see the error **"Apple could not verify 'Alyson Work Time' is free of malware"**, this is a common macOS security feature called **Gatekeeper**. The app is properly signed, but you need to follow the correct installation steps.

---

## ✅ Correct Installation Steps

### Step 1: Download the Right DMG
- **For Apple Silicon Macs (M1/M2/M3)**: Download `TimeFlow-ARM.dmg`
- **For Intel Macs**: Download `TimeFlow-Intel.dmg`
- **Universal (works on both)**: Download `TimeFlow-Signed.dmg`

### Step 2: Proper Installation Process

1. **Double-click the downloaded DMG file** to mount it
2. **You'll see a window with:**
   - `Alyson Work Time.app` 
   - `Applications` folder (shortcut)
3. **DRAG the app to Applications folder** (don't double-click the app yet!)
4. **Wait for the copy to complete**
5. **Eject the DMG** (right-click on desktop DMG icon → Eject)

### Step 3: First Launch (Important!)

1. **Open Applications folder** (Cmd+Shift+A or Finder → Applications)
2. **Find "Alyson Work Time"**
3. **Right-click on the app** → Select **"Open"**
4. **Click "Open"** when macOS asks for confirmation
5. **The app will now launch successfully!**

---

## 🚨 Bypass Gatekeeper Security Warning

If you still see the security warning, try these methods:

### Method 1: Right-Click Open (Recommended)
1. Right-click on the app in Applications folder
2. Select "Open" from the context menu
3. Click "Open" in the security dialog

### Method 2: System Settings Override
1. Go to **System Settings** → **Privacy & Security**
2. Scroll down to **Security**
3. You'll see a message about "Alyson Work Time" being blocked
4. Click **"Open Anyway"**
5. Enter your password if prompted

### Method 3: Terminal Override (Advanced Users)
```bash
# Navigate to Applications
cd /Applications

# Remove quarantine attribute
sudo xattr -rd com.apple.quarantine "Alyson Work Time.app"

# Launch the app
open "Alyson Work Time.app"
```

---

## ❌ Common Mistakes to Avoid

- **DON'T** run the app directly from the DMG
- **DON'T** run the app from Downloads folder
- **DON'T** just double-click the app on first launch
- **ALWAYS** copy to Applications folder first
- **ALWAYS** use right-click → Open for first launch

---

## 🔐 Why This Happens

- The app is **properly signed** with Apple Developer ID
- However, it's not **notarized** through Apple's notarization service
- This is common for enterprise/internal apps
- The app is completely safe - it's signed with our certificate

---

## 🆘 Still Having Issues?

If you continue to have problems:

1. **Check your macOS version** (should be 10.14+)
2. **Try downloading a different DMG variant**:
   - ARM for Apple Silicon Macs
   - Intel for older Macs
   - Signed for maximum compatibility
3. **Contact your IT administrator**
4. **Restart your Mac** and try again

---

## 📞 Support Information

- **Developer**: RevCloud
- **Certificate ID**: 6GW49LK9V9
- **App Bundle ID**: com.ebdaadt.timetracker
- **Supported macOS**: 10.14 or later

The app is completely safe and properly signed. This security warning is just macOS being cautious with apps that aren't distributed through the Mac App Store. 