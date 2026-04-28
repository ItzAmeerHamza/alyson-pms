import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, Monitor, Apple, CheckCircle, AlertCircle } from 'lucide-react';

const GITHUB_REPO = 'ItzAmeerHamza/alyson-pms';
const BASE = `https://github.com/${GITHUB_REPO}/releases/download`;
const FALLBACK_VER = '1.0.182';

interface ReleaseInfo {
  version: string;
  downloadUrls: Record<string, { url: string; filename: string; size: number }>;
}

function buildFallback(v: string): ReleaseInfo {
  return {
    version: v,
    downloadUrls: {
      windows:    { url: `${BASE}/v${v}/Alyson-Time-Doctor-Setup-${v}.exe`,        filename: `Alyson-Time-Doctor-Setup-${v}.exe`,        size: 89_839_416 },
      'mac-arm':  { url: `${BASE}/v${v}/Alyson-Time-Doctor-${v}-arm64.dmg`,       filename: `Alyson-Time-Doctor-${v}-arm64.dmg`,        size: 112_024_511 },
      'mac-intel':{ url: `${BASE}/v${v}/Alyson-Time-Doctor-${v}.dmg`,             filename: `Alyson-Time-Doctor-${v}.dmg`,              size: 119_542_248 },
      mac:        { url: `${BASE}/v${v}/Alyson-Time-Doctor-${v}.dmg`,             filename: `Alyson-Time-Doctor-${v}.dmg`,              size: 119_542_248 },
    },
  };
}

let _cachedRelease: ReleaseInfo | null = null;
let _fetchPromise: Promise<ReleaseInfo> | null = null;

async function fetchLatestRelease(): Promise<ReleaseInfo> {
  if (_cachedRelease) return _cachedRelease;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const data = await res.json();
      const assets: { name: string; browser_download_url: string; size: number }[] = data.assets || [];
      const version = (data.tag_name || '').replace(/^v/, '');

      const find = (pattern: RegExp) => assets.find((a) => pattern.test(a.name));
      const findX64Dmg = () => assets.find((a) => /\.dmg$/i.test(a.name) && !/arm64/i.test(a.name));
      const mk = (a?: typeof assets[0]) =>
        a ? { url: a.browser_download_url, filename: a.name, size: a.size } : undefined;

      const winAsset = find(/Alyson-Time-Doctor-Setup-.*\.exe$/i) ?? find(/Setup[-.].*\.exe$/i) ?? find(/\.exe$/i);
      const armDmg = find(/Alyson-Time-Doctor-.*-arm64\.dmg$/i) ?? find(/arm64\.dmg$/i);
      const x64Dmg = find(/Alyson-Time-Doctor-.*\.dmg$/i) ?? findX64Dmg();

      const downloadUrls: ReleaseInfo['downloadUrls'] = {};
      if (winAsset) downloadUrls.windows = mk(winAsset)!;
      if (armDmg) downloadUrls['mac-arm'] = mk(armDmg)!;
      if (x64Dmg) downloadUrls['mac-intel'] = mk(x64Dmg)!;
      downloadUrls.mac = downloadUrls['mac-intel'] || downloadUrls['mac-arm'] || buildFallback(version).downloadUrls.mac;

      _cachedRelease = { version, downloadUrls };
      return _cachedRelease;
    } catch (err) {
      console.warn('[DesktopDownload] GitHub API failed, using fallback v' + FALLBACK_VER, err);
      _cachedRelease = buildFallback(FALLBACK_VER);
      return _cachedRelease;
    } finally {
      _fetchPromise = null;
    }
  })();

  return _fetchPromise;
}

interface DesktopDownloadProps {
  variant?: 'full' | 'compact';
  className?: string;
}

interface DownloadNotification {
  platform: string;
  filename: string;
  size: string;
  show: boolean;
}

const DesktopDownload: React.FC<DesktopDownloadProps> = ({ variant = 'compact', className = '' }) => {
  const [os, setOs] = useState<'windows' | 'mac' | 'mac-intel' | 'mac-arm' | 'unknown'>('unknown');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [notification, setNotification] = useState<DownloadNotification | null>(null);
  const [release, setRelease] = useState<ReleaseInfo>(_cachedRelease || buildFallback(FALLBACK_VER));
  const fetchedRef = useRef(false);

  useEffect(() => {
    const detectOS = () => {
      const userAgent = window.navigator.userAgent;
      const platform = window.navigator.platform;

      if (platform.includes('Mac') || userAgent.includes('Mac')) {
        let isAppleSilicon = false;
        if (userAgent.includes('ARM64') || platform.includes('ARM')) {
          isAppleSilicon = true;
        } else {
          try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
              const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
              if (debugInfo) {
                const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                if (renderer && /Apple M\d/.test(renderer)) {
                  isAppleSilicon = true;
                }
              }
            }
          } catch (_) {}
        }
        setOs(isAppleSilicon ? 'mac-arm' : 'mac-intel');
      } else if (platform.includes('Win') || userAgent.includes('Windows')) {
        setOs('windows');
      } else {
        setOs('unknown');
      }
    };

    detectOS();

    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchLatestRelease().then((r) => setRelease(r));
    }
  }, []);

  const handleDownload = async (platform: string) => {
    setDownloading(platform);

    const info = release.downloadUrls[platform];
    if (!info?.url) {
      setNotification({ platform: 'Error', filename: 'No download available for this platform.', size: '', show: true });
      setDownloading(null);
      setTimeout(() => setNotification((p) => (p ? { ...p, show: false } : null)), 5000);
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = info.url;
      link.download = info.filename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setNotification({
        platform: getOSName(platform),
        filename: info.filename,
        size: formatBytes(info.size),
        show: true,
      });
      setDownloading(null);
      setTimeout(() => setNotification((p) => (p ? { ...p, show: false } : null)), 10000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setNotification({ platform: 'Error', filename: `Download failed: ${msg}`, size: '', show: true });
      setDownloading(null);
      setTimeout(() => setNotification((p) => (p ? { ...p, show: false } : null)), 15000);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '';
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  };

  const getOSIcon = (platform: string) => {
    if (platform.startsWith('mac')) return <Apple className="h-4 w-4" />;
    if (platform === 'windows') return <Monitor className="h-4 w-4" />;
    return <Download className="h-4 w-4" />;
  };

  const getOSName = (platform: string) => {
    switch (platform) {
      case 'mac': return 'macOS';
      case 'mac-intel': return 'macOS (Intel)';
      case 'mac-arm': return 'macOS (Apple Silicon)';
      case 'windows': return 'Windows';
      default: return 'Unknown';
    }
  };

  const getFileSize = (platform: string) => {
    const info = release?.downloadUrls[platform];
    return info ? formatBytes(info.size) : '';
  };

  if (variant === 'compact') {
    const normalizedOS = os.startsWith('mac') ? os : os; // Keep the specific mac variant for proper DMG selection
    
    return (
      <div className={`relative ${className}`}>
        <div className="flex flex-col sm:flex-row gap-2">
          <Badge variant="outline" className="w-fit">
            {getOSIcon(os)}
            <span className="ml-1">{getOSName(os)} Detected</span>
          </Badge>
          <Button
            size="sm"
            onClick={() => handleDownload(normalizedOS)}
            disabled={downloading === normalizedOS}
            className="flex items-center gap-2"
          >
            {downloading === normalizedOS ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                <span>Download Desktop App</span>
              </>
            )}
          </Button>
        </div>
        
        {/* Download notification */}
        {notification && (
          <div className={`fixed top-4 right-4 z-50 transition-all duration-300 ${
            notification.show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}>
            <div className={`p-4 rounded-lg shadow-lg border max-w-sm ${
              notification.platform === 'Error' 
                ? 'bg-red-50 border-red-200 text-red-800' 
                : 'bg-green-50 border-green-200 text-green-800'
            }`}>
              <div className="flex items-start gap-3">
                {notification.platform === 'Error' ? (
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <h4 className="font-medium text-sm mb-1">
                    {notification.platform === 'Error' ? 'Download Failed' : `Download started for ${notification.platform}!`}
                  </h4>
                  {notification.platform !== 'Error' && (
                    <>
                      <p className="text-xs opacity-90 mb-2">
                        File: {notification.filename}<br />
                        Size: {notification.size}
                      </p>
                      <div className="text-xs opacity-80">
                        <strong>Installation Notes:</strong><br />
                        • Windows: Run as administrator<br />
                        • macOS: Drag to Applications<br />
                        • Linux: Make executable and run
                      </div>
                    </>
                  )}
                  {notification.platform === 'Error' && (
                    <p className="text-xs opacity-90">
                      {notification.filename}. Please try again or contact your administrator.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setNotification(prev => prev ? { ...prev, show: false } : null)}
                  className="text-xs opacity-60 hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Alyson Time Doctor Desktop App
          </CardTitle>
          <CardDescription>
            Download the enterprise-ready desktop application with zero security warnings. Professional terminal-based installation bypasses all macOS Gatekeeper prompts for seamless deployment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {getOSIcon(os)}
                <span className="ml-1">Your System: {getOSName(os)}</span>
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Windows Download */}
              <Button
                variant={os === 'windows' ? 'default' : 'outline'}
                onClick={() => handleDownload('windows')}
                disabled={downloading === 'windows'}
                className="flex flex-col items-center gap-2 h-auto p-4"
              >
                {downloading === 'windows' ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-background border-t-transparent" />
                ) : (
                  <Monitor className="h-5 w-5" />
                )}
                <div className="text-center">
                  <div className="font-medium">Windows</div>
                  <div className="text-xs opacity-70">Windows 10/11 • {getFileSize('windows')}</div>
                </div>
              </Button>

              {/* macOS Download */}
              <Button
                variant={os.startsWith('mac') ? 'default' : 'outline'}
                onClick={() => handleDownload(os.startsWith('mac') ? os : 'mac')}
                disabled={downloading === (os.startsWith('mac') ? os : 'mac')}
                className="flex flex-col items-center gap-2 h-auto p-4"
              >
                {downloading === (os.startsWith('mac') ? os : 'mac') ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-background border-t-transparent" />
                ) : (
                  <Apple className="h-5 w-5" />
                )}
                <div className="text-center">
                  <div className="font-medium">macOS</div>
                  <div className="text-xs opacity-70">
                    {os === 'mac-arm' ? `Apple Silicon • ${getFileSize('mac-arm')}` : 
                     os === 'mac-intel' ? `Intel • ${getFileSize('mac-intel')}` : 
                     `Auto-detected • ${getFileSize('mac')}`}
                  </div>
                </div>
              </Button>
            </div>

            <div className="bg-muted/50 p-3 rounded-lg">
              <h4 className="font-medium text-sm mb-2">Features included:</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                                  <li>• Random screenshot capture (3 per 10 minutes)</li>
                <li>• Activity and idle time tracking</li>
                <li>• Application usage monitoring</li>
                <li>• Real-time sync with dashboard</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Download notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 transition-all duration-300 ${
          notification.show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}>
          <div className={`p-4 rounded-lg shadow-lg border max-w-sm ${
            notification.platform === 'Error' 
              ? 'bg-red-50 border-red-200 text-red-800' 
              : 'bg-green-50 border-green-200 text-green-800'
          }`}>
            <div className="flex items-start gap-3">
              {notification.platform === 'Error' ? (
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              )}
              <div className="flex-1">
                <h4 className="font-medium text-sm mb-1">
                  {notification.platform === 'Error' ? 'Download Failed' : `Download started for ${notification.platform}!`}
                </h4>
                {notification.platform !== 'Error' && (
                  <>
                    <p className="text-xs opacity-90 mb-2">
                      File: {notification.filename}<br />
                      Size: {notification.size}
                    </p>
                    <div className="text-xs opacity-80">
                      <strong>Installation Notes:</strong><br />
                      • Windows: Run as administrator<br />
                      • macOS: Drag to Applications
                    </div>
                  </>
                )}
                {notification.platform === 'Error' && (
                  <p className="text-xs opacity-90">
                    {notification.filename}. Please try again or contact your administrator.
                  </p>
                )}
              </div>
              <button
                onClick={() => setNotification(prev => prev ? { ...prev, show: false } : null)}
                className="text-xs opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DesktopDownload; 