import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  Apple, 
  Monitor, 
  Shield,
  CheckCircle,
  ExternalLink
} from "lucide-react";

const GITHUB_REPO = 'ItzAmeerHamza/alyson-pms';
const BASE = `https://github.com/${GITHUB_REPO}/releases/download`;
const FALLBACK_VER = '1.0.182';

interface DownloadEntry { url: string; filename: string; size: number }

interface DownloadItem {
  platform: string;
  icon: React.ReactNode;
  description: string;
  filename: string;
  url: string;
  size: string;
  requirements: string;
  verified: boolean;
}

function buildFallbackDownloads(v: string) {
  return {
    version: v,
    date: new Date().toLocaleDateString(),
    windows:   { url: `${BASE}/v${v}/Alyson-Time-Doctor-Setup-${v}.exe`,  filename: `Alyson-Time-Doctor-Setup-${v}.exe`,  size: 89_839_416 } as DownloadEntry,
    armDmg:    { url: `${BASE}/v${v}/Alyson-Time-Doctor-${v}-arm64.dmg`,  filename: `Alyson-Time-Doctor-${v}-arm64.dmg`,  size: 112_024_511 } as DownloadEntry,
    x64Dmg:    { url: `${BASE}/v${v}/Alyson-Time-Doctor-${v}.dmg`,        filename: `Alyson-Time-Doctor-${v}.dmg`,        size: 119_542_248 } as DownloadEntry,
  };
}

function formatBytes(bytes: number): string {
  return `~${Math.round(bytes / 1024 / 1024)} MB`;
}

const DownloadPage = () => {
  const fb = buildFallbackDownloads(FALLBACK_VER);
  const [version, setVersion] = useState(fb.version);
  const [releaseDate, setReleaseDate] = useState(fb.date);
  const [winDl, setWinDl] = useState<DownloadEntry>(fb.windows);
  const [armDl, setArmDl] = useState<DownloadEntry>(fb.armDmg);
  const [x64Dl, setX64Dl] = useState<DownloadEntry>(fb.x64Dmg);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const assets: { name: string; browser_download_url: string; size: number }[] = data.assets || [];
        const v = (data.tag_name || '').replace(/^v/, '');
        const find = (p: RegExp) => assets.find((a) => p.test(a.name));
        const findX64Dmg = () => assets.find((a) => /\.dmg$/i.test(a.name) && !/arm64/i.test(a.name));
        const mk = (a?: typeof assets[0]) => a ? { url: a.browser_download_url, filename: a.name, size: a.size } : undefined;

        setVersion(v || fb.version);
        if (data.published_at) setReleaseDate(new Date(data.published_at).toLocaleDateString());

        const w = mk(find(/Alyson-Time-Doctor-Setup-.*\.exe$/i) ?? find(/Setup[-.].*\.exe$/i) ?? find(/\.exe$/i));
        const arm = mk(find(/Alyson-Time-Doctor-.*-arm64\.dmg$/i) ?? find(/arm64\.dmg$/i));
        const x64 = mk(find(/Alyson-Time-Doctor-.*\.dmg$/i) ?? findX64Dmg());

        if (w) setWinDl(w);
        if (arm) setArmDl(arm);
        if (x64) setX64Dl(x64);
      })
      .catch((err) => console.warn('GitHub API failed, using fallback:', err));
  }, []);

  const downloads: DownloadItem[] = [
    {
      platform: "macOS (Apple Silicon)",
      icon: <Apple className="h-6 w-6" />,
      description: "For M1, M2, M3, M4 Macs",
      filename: armDl.filename,
      url: armDl.url,
      size: formatBytes(armDl.size),
      requirements: "macOS 11.0+",
      verified: true,
    },
    {
      platform: "macOS (Intel)",
      icon: <Apple className="h-6 w-6" />,
      description: "For Intel-based Macs",
      filename: x64Dl.filename,
      url: x64Dl.url,
      size: formatBytes(x64Dl.size),
      requirements: "macOS 10.14+",
      verified: true,
    },
    {
      platform: "Windows",
      icon: <Monitor className="h-6 w-6" />,
      description: "For Windows 10/11",
      filename: winDl.filename,
      url: winDl.url,
      size: formatBytes(winDl.size),
      requirements: "Windows 10/11 (64-bit)",
      verified: true,
    },
  ];

  const handleDownload = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Download Alyson Time Doctor
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          {[
            { icon: <Shield className="h-5 w-5" />, text: "Code Signed & Verified" },
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
                    <div>Size: {download.size}</div>
                    <div>Requires: {download.requirements}</div>
                  </div>
                  <Button 
                    onClick={() => handleDownload(download.url)}
                    className="w-full"
                    size="lg"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download for {download.platform}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Installation Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold text-lg mb-2">macOS</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>Download the appropriate DMG file for your Mac</li>
                <li>Open the downloaded DMG file</li>
                <li>Drag "Alyson Time Doctor.app" to your Applications folder</li>
                <li>Eject the DMG and launch the app from Applications</li>
                <li>If prompted about security, go to System Preferences &rarr; Security &amp; Privacy &rarr; "Open Anyway"</li>
              </ol>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">Windows</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>Download the EXE installer</li>
                <li>Right-click and select "Run as administrator"</li>
                <li>Follow the installation wizard</li>
                <li>Launch from Start Menu or Desktop shortcut</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-gray-600 space-y-4">
          <div className="flex justify-center gap-6 text-sm">
            <a 
              href={`https://github.com/${GITHUB_REPO}/releases/tag/v${version}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-blue-600"
            >
              <ExternalLink className="h-4 w-4" />
              View on GitHub
            </a>
            <a 
              href={`https://github.com/${GITHUB_REPO}/releases`}
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
            &copy; {new Date().getFullYear()} Ebdaa Digital Technology. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DownloadPage;
