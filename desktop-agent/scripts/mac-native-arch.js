/**
 * Per-arch native modules for the macOS build.
 *
 * electron-builder packs arm64 and x64 from one node_modules tree on an arm64
 * runner, so anything installed or compiled for the host leaks into the Intel
 * build (v1.0.249 shipped an arm64 uiohook and only the arm64 sharp in x64).
 *
 *   node scripts/mac-native-arch.js ensure-sharp   # before electron-builder
 *   prepareMacAppNatives({ appPath, arch })         # from after-pack.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MAC_ARCHES = ['arm64', 'x64'];
const LIPO_ARCH = { arm64: 'arm64', x64: 'x86_64' };
// electron-builder's Arch enum, as passed in afterPack context.arch.
const BUILDER_ARCH = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };
// prebuilds/darwin-x64, napi-6-darwin-unknown-x64, sharp-darwin-x64, bin/darwin-arm64-119 (ABI suffix)
const PLATFORM_ARCH_TAG = /(?:^|-)(darwin|linux|win32|freebsd|android)-(?:unknown-)?([a-z0-9_]+(?:\+[a-z0-9_]+)*)(?:-\d+)?$/;

function sharpPlatformPackages(arch) {
  return [`@img/sharp-darwin-${arch}`, `@img/sharp-libvips-darwin-${arch}`];
}

function installedVersion(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

function npmPackInto(spec, dest) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-native-arch-'));
  try {
    const out = execFileSync('npm', ['pack', spec, '--silent', '--pack-destination', tmp], { encoding: 'utf8' });
    const tarball = path.join(tmp, out.trim().split('\n').pop());
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    execFileSync('tar', ['-xzf', tarball, '-C', dest, '--strip-components=1']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * npm only installs sharp's binaries for the host, so add the other Mac arch
 * next to sharp at the exact versions sharp pins.
 */
function ensureSharpPlatformPackages({
  projectDir = path.join(__dirname, '..'),
  arches = MAC_ARCHES,
  fetchPackage = npmPackInto,
} = {}) {
  const sharpPkgPath = require.resolve('sharp/package.json', { paths: [projectDir] });
  const sharpPkg = JSON.parse(fs.readFileSync(sharpPkgPath, 'utf8'));
  const nodeModulesDir = path.resolve(path.dirname(sharpPkgPath), '..');
  const added = [];
  for (const arch of arches) {
    for (const name of sharpPlatformPackages(arch)) {
      const version = sharpPkg.optionalDependencies && sharpPkg.optionalDependencies[name];
      if (!version) throw new Error(`sharp ${sharpPkg.version} does not list ${name}`);
      const dest = path.join(nodeModulesDir, name);
      if (installedVersion(dest) === version) continue;
      fetchPackage(`${name}@${version}`, dest);
      if (installedVersion(dest) !== version) throw new Error(`Failed to install ${name}@${version}`);
      added.push(`${name}@${version}`);
    }
  }
  return added;
}

function lipoArchs(file) {
  try {
    return execFileSync('lipo', ['-archs', file], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}

/** True when a path segment tags the binary for another platform or arch. */
function isForOtherTarget(relPath, arch) {
  for (const segment of relPath.split(path.sep)) {
    const tag = segment.match(PLATFORM_ARCH_TAG);
    if (!tag) continue;
    if (tag[1] !== 'darwin') return true;
    const arches = tag[2].split('+');
    return !arches.includes(arch) && !arches.includes('universal');
  }
  return false;
}

/**
 * Drop the other arch's sharp binaries from the packed app and fail when any
 * binary the target arch would load can't run on it.
 */
function prepareMacAppNatives({ appPath, arch, readArchs = lipoArchs }) {
  const want = LIPO_ARCH[arch];
  if (!want) return { pruned: [], checked: 0 };

  const nodeModules = path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules');
  if (!fs.existsSync(nodeModules)) throw new Error(`No unpacked node_modules in ${appPath}`);

  const pruned = [];
  for (const other of MAC_ARCHES.filter((a) => a !== arch)) {
    for (const name of sharpPlatformPackages(other)) {
      const dir = path.join(nodeModules, name);
      if (!fs.existsSync(dir)) continue;
      fs.rmSync(dir, { recursive: true, force: true });
      pruned.push(name);
    }
  }

  const problems = [];
  for (const name of sharpPlatformPackages(arch)) {
    if (!fs.existsSync(path.join(nodeModules, name))) problems.push(`${name} is missing, so sharp cannot load`);
  }
  // node-gyp-build loads build/Release before prebuilds/, and the asar header
  // still lists build/ even if the unpacked copy is deleted after packing.
  if (fs.existsSync(path.join(nodeModules, 'uiohook-napi', 'build'))) {
    problems.push(`uiohook-napi/build is packaged and would shadow prebuilds/darwin-${arch}`);
  }

  let checked = 0;
  for (const file of walkFiles(nodeModules)) {
    if (!/\.(node|dylib)$/.test(file)) continue;
    const rel = path.relative(nodeModules, file);
    if (isForOtherTarget(rel, arch)) continue;
    checked += 1;
    const archs = readArchs(file);
    if (!archs.includes(want)) problems.push(`${rel} is ${archs.join('+') || 'not Mach-O'}, needs ${want}`);
  }

  if (problems.length) {
    throw new Error(`Native modules do not match ${arch}:\n  - ${problems.join('\n  - ')}`);
  }
  return { pruned, checked };
}

/**
 * The Swift helper is the fallback input source when uiohook can't load. A
 * build without it (or without the target arch) records no clicks/keys at all.
 */
function checkMacInputHelper({ appPath, arch, readArchs = lipoArchs }) {
  const helperPath = path.join(appPath, 'Contents', 'Resources', 'helpers', 'macos-input-helper');
  if (!fs.existsSync(helperPath)) {
    throw new Error(`macos-input-helper is missing from ${path.dirname(helperPath)} (run scripts/build-swift-helper.sh)`);
  }
  const want = LIPO_ARCH[arch];
  const archs = readArchs(helperPath);
  if (want && !archs.includes(want)) {
    throw new Error(`macos-input-helper is ${archs.join('+') || 'not Mach-O'}, needs ${want}`);
  }
  return helperPath;
}

module.exports = {
  BUILDER_ARCH,
  checkMacInputHelper,
  ensureSharpPlatformPackages,
  isForOtherTarget,
  prepareMacAppNatives,
};

if (require.main === module) {
  const command = process.argv[2];
  if (command !== 'ensure-sharp') {
    console.error('Usage: node scripts/mac-native-arch.js ensure-sharp');
    process.exit(1);
  }
  const added = ensureSharpPlatformPackages();
  console.log(added.length ? `✅ Added ${added.join(', ')}` : '✅ sharp binaries present for arm64 and x64');
}
