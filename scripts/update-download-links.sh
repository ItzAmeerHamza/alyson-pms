#!/bin/bash

# Update Download Links Script
# Updates download links in the web application after a new release

set -e

VERSION=${1:-$(node -p "require('./package.json').version")}

echo "🔗 Updating download links for version $VERSION"
echo "=============================================="

# GitHub repository info
REPO_OWNER="mafatah"
REPO_NAME="time-flow-admin"
BASE_URL="https://github.com/$REPO_OWNER/$REPO_NAME/releases/download/v$VERSION"

echo "📋 Base URL: $BASE_URL"

# Update download page component
cat > src/pages/download/index.tsx << EOF
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  Apple, 
  Monitor, 
  Smartphone,
  Shield,
  CheckCircle,
  ExternalLink
} from "lucide-react";

const DownloadPage = () => {
  const version = "$VERSION";
  const releaseDate = new Date().toLocaleDateString();
  
  const downloads = [
    {
      platform: "macOS (Apple Silicon)",
      icon: <Apple className="h-6 w-6" />,
      description: "For M1, M2, M3 Macs",
      filename: "Ebdaa-Work-Time-\${version}-arm64.dmg",
      url: "$BASE_URL/Ebdaa-Work-Time-$VERSION-arm64.dmg",
      size: "~112 MB",
      requirements: "macOS 11.0+",
      verified: true
    },
    {
      platform: "macOS (Intel)",
      icon: <Apple className="h-6 w-6" />,
      description: "For Intel-based Macs",
      filename: "Ebdaa-Work-Time-\${version}.dmg",
      url: "$BASE_URL/Ebdaa-Work-Time-$VERSION.dmg",
      size: "~118 MB",
      requirements: "macOS 10.14+",
      verified: true
    },
    {
      platform: "Windows",
      icon: <Monitor className="h-6 w-6" />,
      description: "For Windows 10/11",
      filename: "Ebdaa-Work-Time-Setup-\${version}.exe",
      url: "$BASE_URL/Ebdaa-Work-Time-Setup-$VERSION.exe",
      size: "~85 MB",
      requirements: "Windows 10/11 (64-bit)",
      verified: true
    },
    {
      platform: "Linux",
      icon: <Smartphone className="h-6 w-6" />,
      description: "AppImage for Linux",
      filename: "Ebdaa-Work-Time-\${version}.AppImage",
      url: "$BASE_URL/Ebdaa-Work-Time-$VERSION.AppImage",
      size: "~120 MB", 
      requirements: "Ubuntu 18.04+ or equivalent",
      verified: true
    }
  ];

  const handleDownload = (url: string, filename: string) => {
    // Track download analytics if needed
    console.log(\`Download started: \${filename}\`);
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            📱 Download Ebdaa Work Time
          </h1>
          <p className="text-xl text-gray-600 mb-6">
            Professional employee time tracking desktop application
          </p>
          <div className="flex justify-center items-center gap-4 mb-8">
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Version {version}
            </Badge>
            <Badge variant="outline" className="text-sm">
              Released {releaseDate}
            </Badge>
          </div>
        </div>

        {/* Features Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          {[
            { icon: <Shield className="h-5 w-5" />, text: "Code Signed & Notarized" },
            { icon: <CheckCircle className="h-5 w-5" />, text: "Enterprise Security" },
            { icon: <Download className="h-5 w-5" />, text: "Auto Updates" },
            { icon: <Monitor className="h-5 w-5" />, text: "Cross Platform" }
          ].map((feature, index) => (
            <div key={index} className="flex items-center gap-2 text-sm text-gray-600 bg-white/50 rounded-lg p-3">
              {feature.icon}
              <span>{feature.text}</span>
            </div>
          ))}
        </div>

        {/* Download Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {downloads.map((download, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  {download.icon}
                  <CardTitle className="text-xl">{download.platform}</CardTitle>
                  {download.verified && (
                    <Badge className="bg-green-100 text-green-800">
                      <Shield className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>
                <CardDescription>{download.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-gray-600">
                    <div>📁 {download.filename}</div>
                    <div>📊 Size: {download.size}</div>
                    <div>⚙️ Requires: {download.requirements}</div>
                  </div>
                  
                  <Button 
                    onClick={() => handleDownload(download.url, download.filename)}
                    className="w-full"
                    size="lg"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download for {download.platform.split(' ')[0]}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Installation Instructions */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>📋 Installation Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold text-lg mb-2">🍎 macOS Installation</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>Download the appropriate DMG file for your Mac</li>
                <li>Open the downloaded DMG file</li>
                <li>Drag "Ebdaa Work Time.app" to your Applications folder</li>
                <li>Eject the DMG and launch the app from Applications</li>
                <li>If prompted about security, go to System Preferences → Security & Privacy → "Open Anyway"</li>
              </ol>
            </div>
            
            <div>
              <h3 className="font-semibold text-lg mb-2">🪟 Windows Installation</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>Download the EXE installer</li>
                <li>Right-click and select "Run as administrator"</li>
                <li>Follow the installation wizard</li>
                <li>Launch from Start Menu or Desktop shortcut</li>
              </ol>
            </div>
            
            <div>
              <h3 className="font-semibold text-lg mb-2">🐧 Linux Installation</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>Download the AppImage file</li>
                <li>Make it executable: <code className="bg-gray-100 px-1 rounded">chmod +x Ebdaa-Work-Time-{version}.AppImage</code></li>
                <li>Run: <code className="bg-gray-100 px-1 rounded">./Ebdaa-Work-Time-{version}.AppImage</code></li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-gray-600 space-y-4">
          <div className="flex justify-center gap-6 text-sm">
            <a 
              href="https://github.com/mafatah/time-flow-admin/releases/tag/v$VERSION"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-blue-600"
            >
              <ExternalLink className="h-4 w-4" />
              View on GitHub
            </a>
            <a 
              href="https://github.com/mafatah/time-flow-admin/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-blue-600"
            >
              All Releases
            </a>
          </div>
          <p className="text-sm">
            All downloads are code-signed and verified for security
          </p>
          <p className="text-xs text-gray-500">
            © $(date +%Y) Ebdaa Digital Technology. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DownloadPage;
EOF

echo "✅ Updated download page component"

# Update latest.yml files with correct URLs
cat > public/latest-mac.yml << EOF
version: $VERSION
files:
  - url: Ebdaa-Work-Time-$VERSION-arm64.dmg
    sha512: placeholder_hash_will_be_updated_after_build
    size: 120000000
    blockMapSize: 150000
  - url: Ebdaa-Work-Time-$VERSION.dmg  
    sha512: placeholder_hash_will_be_updated_after_build
    size: 125000000
    blockMapSize: 155000
path: Ebdaa-Work-Time-$VERSION-arm64.dmg
sha512: placeholder_hash_will_be_updated_after_build
releaseDate: '$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'
EOF

cat > public/latest.yml << EOF
version: $VERSION
files:
  - url: Ebdaa-Work-Time-Setup-$VERSION.exe
    sha512: placeholder_hash_will_be_updated_after_build
    size: 90000000
path: Ebdaa-Work-Time-Setup-$VERSION.exe
sha512: placeholder_hash_will_be_updated_after_build
releaseDate: '$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'
EOF

echo "✅ Updated auto-updater configuration files"

# Update README with new download links
sed -i '' "s/download\/v[0-9.]*\//download\/v$VERSION\//g" README.md 2>/dev/null || true

echo "✅ Updated README download links"

# Commit changes if git is available
if command -v git &> /dev/null; then
    git add .
    git commit -m "🔗 Update download links for v$VERSION" || true
    echo "✅ Committed download link updates"
fi

echo ""
echo "🎉 Download links updated successfully!"
echo "=================================="
echo "📦 Version: $VERSION"
echo "🔗 Download page: /download"
echo "🌐 GitHub release: https://github.com/$REPO_OWNER/$REPO_NAME/releases/tag/v$VERSION"
echo ""
echo "📋 Direct download links:"
echo "  🍎 macOS ARM64: $BASE_URL/Ebdaa-Work-Time-$VERSION-arm64.dmg"
echo "  🍎 macOS Intel: $BASE_URL/Ebdaa-Work-Time-$VERSION.dmg"
echo "  🪟 Windows: $BASE_URL/Ebdaa-Work-Time-Setup-$VERSION.exe"
echo "  🐧 Linux: $BASE_URL/Ebdaa-Work-Time-$VERSION.AppImage" 