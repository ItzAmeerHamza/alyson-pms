Tavilo logo pack - desktop app assets
=====================================

mark/
  tavilo.ico                  Windows app icon (16-256px embedded)
  tavilo.icns                 macOS app icon
  tavilo-mark-{16,32,48,64,128,256,512}.png   Transparent clock mark, all sizes
  tavilo-badge.ico / tavilo-mark-badge-light-*.png
                              Same mark on a light rounded square - use for
                              dark taskbars/docks where the dark indigo ring
                              would disappear
full/
  tavilo-logo-full.png        Full lockup (clock + "tavilo." wordmark), 848x253,
                              transparent background - for splash screens,
                              about dialogs, installers

Notes:
- All files are transparent PNG unless named .ico/.icns
- Brand colors: indigo #3D4A8C, coral #F0765B
- For Electron: point "icon" at tavilo.ico (Windows/Linux) or tavilo.icns (macOS);
  @electron/packager accepts the .icns for mac and .ico for win
- Linux .deb/AppImage: use tavilo-mark-512.png
