#!/bin/bash

# 🌐 Update Web Download Links Script
# This script updates the download links in the web application

set -e

VERSION=${1:-$(node -p "require('./package.json').version")}

echo "🌐 Updating Web Download Links for v$VERSION"
echo "============================================="

# GitHub repository info
REPO_URL="https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)"
RELEASE_URL="$REPO_URL/releases/download/v$VERSION"

echo "📦 Release URL: $RELEASE_URL"

# Update download page component
DOWNLOAD_PAGE="src/pages/download/index.tsx"

if [ -f "$DOWNLOAD_PAGE" ]; then
    echo "📝 Updating download page: $DOWNLOAD_PAGE"
    
# Create updated download page content
cat > "$DOWNLOAD_PAGE" << EOF
import React from 'react';
import { Download, Shield, Zap, Monitor } from 'lucide-react';

const DownloadPage = () => {
  const currentVersion = '$VERSION';
  const releaseUrl = '$RELEASE_URL';
  
  const downloads = [
    {
      platform: 'macOS (Apple Silicon)',
      icon: '🍎',
      filename: \`Ebdaa-Work-Time-\${currentVersion}-arm64.dmg\`,
      description: 'For Mac computers with M1, M2, or M3 chips',
      primary: true
    },
    {
      platform: 'macOS (Intel)',
      icon: '🍎',
      filename: \`Ebdaa-Work-Time-\${currentVersion}.dmg\`,
      description: 'For Mac computers with Intel processors',
      primary: false
    },
    {
      platform: 'Windows',
      icon: '🪟',
      filename: \`Ebdaa-Work-Time-Setup-\${currentVersion}.exe\`,
      description: 'For Windows 10 and Windows 11',
      primary: true
    }
  ];

  const handleDownload = (filename: string) => {
    const downloadUrl = \`\${releaseUrl}/\${filename}\`;
    window.open(downloadUrl, '_blank');
    
    // Track download event
    if (typeof gtag !== 'undefined') {
      gtag('event', 'download', {
        event_category: 'engagement',
        event_label: filename,
        value: 1
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-full mb-6">
            <Monitor className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Download Ebdaa Work Time
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            Professional time tracking and productivity monitoring
          </p>
          <div className="inline-flex items-center px-4 py-2 bg-blue-100 rounded-full">
            <span className="text-blue-800 font-semibold">
              Latest Version: v{currentVersion}
            </span>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-lg p-6 shadow-md">
            <div className="flex items-center mb-4">
              <Zap className="w-8 h-8 text-blue-600 mr-3" />
              <h3 className="text-lg font-semibold">Real-time Tracking</h3>
            </div>
            <p className="text-gray-600">
              Monitor application usage, websites visited, and productivity metrics in real-time.
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-md">
            <div className="flex items-center mb-4">
              <Shield className="w-8 h-8 text-green-600 mr-3" />
              <h3 className="text-lg font-semibold">Secure & Private</h3>
            </div>
            <p className="text-gray-600">
              Your data is encrypted and stored securely. Full privacy controls and data ownership.
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-md">
            <div className="flex items-center mb-4">
              <Monitor className="w-8 h-8 text-purple-600 mr-3" />
              <h3 className="text-lg font-semibold">Cross-Platform</h3>
            </div>
            <p className="text-gray-600">
              Works seamlessly on macOS and Windows with automatic updates and sync.
            </p>
          </div>
        </div>

        {/* Download Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {downloads.map((download, index) => (
            <div
              key={index}
              className={\`bg-white rounded-lg p-6 shadow-md border-2 \${
                download.primary ? 'border-blue-500' : 'border-gray-200'
              } hover:shadow-lg transition-shadow\`}
            >
              {download.primary && (
                <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full inline-block mb-3">
                  Recommended
                </div>
              )}
              <div className="flex items-center mb-4">
                <span className="text-3xl mr-3">{download.icon}</span>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {download.platform}
                  </h3>
                  <p className="text-sm text-gray-600">{download.description}</p>
                </div>
              </div>
              <button
                onClick={() => handleDownload(download.filename)}
                className={\`w-full flex items-center justify-center px-4 py-3 rounded-lg font-medium transition-colors \${
                  download.primary
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }\`}
              >
                <Download className="w-5 h-5 mr-2" />
                Download
              </button>
              <p className="text-xs text-gray-500 mt-2 text-center">
                {download.filename}
              </p>
            </div>
          ))}
        </div>

        {/* Security Notice */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
          <div className="flex items-start">
            <Shield className="w-6 h-6 text-green-600 mr-3 mt-1" />
            <div>
              <h4 className="text-lg font-semibold text-green-900 mb-2">
                Verified & Secure Downloads
              </h4>
              <ul className="text-green-800 space-y-1">
                <li>✅ macOS apps are signed and notarized by Apple</li>
                <li>✅ Windows apps are digitally signed with verified certificates</li>
                <li>✅ All downloads are scanned for malware and viruses</li>
                <li>✅ Automatic updates ensure you always have the latest security patches</li>
              </ul>
            </div>
          </div>
        </div>

        {/* System Requirements */}
        <div className="bg-white rounded-lg p-6 shadow-md">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            System Requirements
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">🍎 macOS</h4>
              <ul className="text-gray-600 text-sm space-y-1">
                <li>• macOS 10.15 (Catalina) or later</li>
                <li>• 64-bit processor (Intel or Apple Silicon)</li>
                <li>• 4 GB RAM minimum, 8 GB recommended</li>
                <li>• 500 MB free disk space</li>
                <li>• Internet connection for activation and updates</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">🪟 Windows</h4>
              <ul className="text-gray-600 text-sm space-y-1">
                <li>• Windows 10 version 1809 or later</li>
                <li>• Windows 11 (all versions supported)</li>
                <li>• 64-bit processor</li>
                <li>• 4 GB RAM minimum, 8 GB recommended</li>
                <li>• 500 MB free disk space</li>
                <li>• Internet connection for activation and updates</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="text-center mt-12">
          <p className="text-gray-600 mb-4">
            Need help? Having issues with installation?
          </p>
          <div className="space-x-4">
            <a
              href="mailto:support@ebdaadi.com"
              className="inline-flex items-center px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-medium transition-colors"
            >
              📧 Contact Support
            </a>
            <a
              href={\`\${REPO_URL}/releases/tag/v\${currentVersion}\`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-6 py-3 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-lg font-medium transition-colors"
            >
              📋 Release Notes
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadPage;
EOF

    echo "✅ Download page updated successfully"
else
    echo "⚠️ Download page not found at $DOWNLOAD_PAGE"
fi

# Update any other files that might have download links
echo ""
echo "🔍 Searching for other files with download links..."

# Update README if it exists
if [ -f "README.md" ]; then
    echo "📝 Updating README.md..."
    sed -i '' "s/releases\/download\/v[0-9.]\+/releases\/download\/v$VERSION/g" README.md
    echo "✅ README.md updated"
fi

# Update any config files that might reference the version
if [ -f "public/version.json" ]; then
    echo "📝 Updating version.json..."
    cat > public/version.json << EOF
{
  "version": "$VERSION",
  "releaseDate": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
  "downloads": {
    "macOS_arm64": "$RELEASE_URL/Ebdaa-Work-Time-$VERSION-arm64.dmg",
    "macOS_intel": "$RELEASE_URL/Ebdaa-Work-Time-$VERSION.dmg",
    "windows": "$RELEASE_URL/Ebdaa-Work-Time-Setup-$VERSION.exe"
  }
}
EOF
    echo "✅ version.json updated"
fi

echo ""
echo "✅ Web download links updated successfully!"
echo "📋 Updated files:"
echo "   - $DOWNLOAD_PAGE (download page component)"
[ -f "README.md" ] && echo "   - README.md (release links)"
[ -f "public/version.json" ] && echo "   - public/version.json (version info)"
echo ""
echo "🔗 New download URLs:"
echo "   - macOS ARM64: $RELEASE_URL/Ebdaa-Work-Time-$VERSION-arm64.dmg"
echo "   - macOS Intel: $RELEASE_URL/Ebdaa-Work-Time-$VERSION.dmg"
echo "   - Windows: $RELEASE_URL/Ebdaa-Work-Time-Setup-$VERSION.exe" 