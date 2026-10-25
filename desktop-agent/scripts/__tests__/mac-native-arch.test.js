const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  BUILDER_ARCH,
  checkMacInputHelper,
  checkPatchedUiohook,
  ensurePatchedUiohook,
  ensureSharpPlatformPackages,
  isForOtherTarget,
  prepareMacAppNatives,
} = require('../mac-native-arch');

// Fake binaries hold their lipo archs as text, e.g. "x86_64 arm64".
const readArchs = (file) => fs.readFileSync(file, 'utf8').split(/\s+/).filter(Boolean);

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-native-arch-test-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeFile(root, rel, contents) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

function packedApp(files) {
  const appPath = path.join(tmp, 'Tavilo Time.app');
  const nodeModules = path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules');
  for (const [rel, archs] of Object.entries(files)) writeFile(nodeModules, rel, archs);
  return { appPath, nodeModules };
}

const sharp = (arch, lipo) => ({
  [`@img/sharp-darwin-${arch}/lib/sharp-darwin-${arch}.node`]: lipo,
  [`@img/sharp-libvips-darwin-${arch}/lib/libvips-cpp.8.17.3.dylib`]: lipo,
});

const uiohookPrebuilds = {
  'uiohook-napi/prebuilds/darwin-arm64/node.napi.node': 'arm64',
  'uiohook-napi/prebuilds/darwin-x64/node.napi.node': 'x86_64',
  'uiohook-napi/prebuilds/linux-x64/node.napi.node': 'not-mach-o',
  'uiohook-napi/prebuilds/win32-x64/node.napi.node': 'not-mach-o',
};

describe('prepareMacAppNatives', () => {
  it('rejects the v1.0.249 Intel bundle (arm64 uiohook build, arm64-only sharp)', () => {
    const { appPath } = packedApp({
      ...uiohookPrebuilds,
      'uiohook-napi/build/Release/uiohook_napi.node': 'arm64',
      ...sharp('arm64', 'arm64'),
      'keytar/build/Release/keytar.node': 'x86_64',
      'active-win/lib/binding/napi-6-darwin-unknown-x64/node-active-win.node': 'x86_64',
      'active-win/lib/binding/napi-6-darwin-unknown-arm64/node-active-win.node': 'arm64',
      'active-win/bin/darwin-arm64-119/active-win.node': 'arm64',
    });

    let message = '';
    try {
      prepareMacAppNatives({ appPath, arch: 'x64', readArchs });
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('@img/sharp-darwin-x64 is missing');
    expect(message).toContain('@img/sharp-libvips-darwin-x64 is missing');
    expect(message).toContain('uiohook-napi/build is packaged');
    expect(message).toContain(path.join('uiohook-napi', 'build', 'Release', 'uiohook_napi.node') + ' is arm64, needs x86_64');
    expect(message).not.toContain('keytar');
    expect(message).not.toContain('active-win');
  });

  it('accepts a correct Intel bundle and drops the arm64 sharp binaries', () => {
    const { appPath, nodeModules } = packedApp({
      ...uiohookPrebuilds,
      ...sharp('arm64', 'arm64'),
      ...sharp('x64', 'x86_64'),
      'keytar/build/Release/keytar.node': 'x86_64',
    });

    const result = prepareMacAppNatives({ appPath, arch: 'x64', readArchs });

    expect(result.pruned).toEqual(['@img/sharp-darwin-arm64', '@img/sharp-libvips-darwin-arm64']);
    expect(fs.existsSync(path.join(nodeModules, '@img/sharp-darwin-arm64'))).toBe(false);
    expect(fs.existsSync(path.join(nodeModules, '@img/sharp-darwin-x64'))).toBe(true);
    // uiohook darwin-x64 prebuild, keytar, sharp .node, libvips dylib
    expect(result.checked).toBe(4);
  });

  it('accepts a correct Apple silicon bundle and drops the x64 sharp binaries', () => {
    const { appPath } = packedApp({
      ...uiohookPrebuilds,
      ...sharp('arm64', 'arm64'),
      ...sharp('x64', 'x86_64'),
      'keytar/build/Release/keytar.node': 'arm64',
    });

    const result = prepareMacAppNatives({ appPath, arch: 'arm64', readArchs });

    expect(result.pruned).toEqual(['@img/sharp-darwin-x64', '@img/sharp-libvips-darwin-x64']);
    expect(result.checked).toBe(4);
  });

  it('flags a host-arch build/Release binary in the other arch', () => {
    const { appPath } = packedApp({
      ...uiohookPrebuilds,
      ...sharp('arm64', 'arm64'),
      'keytar/build/Release/keytar.node': 'x86_64',
    });

    expect(() => prepareMacAppNatives({ appPath, arch: 'arm64', readArchs })).toThrow(
      /keytar.+keytar\.node is x86_64, needs arm64/,
    );
  });

  it('accepts universal binaries for either arch', () => {
    const { appPath } = packedApp({
      ...uiohookPrebuilds,
      ...sharp('x64', 'x86_64'),
      'keytar/build/Release/keytar.node': 'x86_64 arm64',
    });

    expect(() => prepareMacAppNatives({ appPath, arch: 'x64', readArchs })).not.toThrow();
  });

  it('maps electron-builder arch values', () => {
    expect(BUILDER_ARCH[1]).toBe('x64');
    expect(BUILDER_ARCH[3]).toBe('arm64');
  });
});

describe('isForOtherTarget', () => {
  it.each([
    ['uiohook-napi/prebuilds/darwin-arm64/node.napi.node', 'x64', true],
    ['uiohook-napi/prebuilds/darwin-x64/node.napi.node', 'x64', false],
    ['foo/prebuilds/darwin-x64+arm64/foo.node', 'arm64', false],
    ['uiohook-napi/prebuilds/linux-x64/node.napi.node', 'x64', true],
    ['active-win/lib/binding/napi-6-darwin-unknown-arm64/node-active-win.node', 'x64', true],
    ['active-win/bin/darwin-arm64-119/active-win.node', 'x64', true],
    ['active-win/bin/darwin-x64-119/active-win.node', 'x64', false],
    ['@img/sharp-libvips-darwin-x64/lib/libvips-cpp.8.17.3.dylib', 'x64', false],
    ['keytar/build/Release/keytar.node', 'x64', false],
  ])('%s for %s -> %s', (rel, arch, expected) => {
    expect(isForOtherTarget(rel.split('/').join(path.sep), arch)).toBe(expected);
  });
});

describe('ensureSharpPlatformPackages', () => {
  const optionalDependencies = {
    '@img/sharp-darwin-arm64': '0.34.5',
    '@img/sharp-darwin-x64': '0.34.5',
    '@img/sharp-libvips-darwin-arm64': '1.2.4',
    '@img/sharp-libvips-darwin-x64': '1.2.4',
  };

  function project() {
    const projectDir = path.join(tmp, 'project');
    const nodeModules = path.join(projectDir, 'node_modules');
    writeFile(nodeModules, 'sharp/package.json', JSON.stringify({ name: 'sharp', version: '0.34.5', optionalDependencies }));
    writeFile(nodeModules, '@img/sharp-darwin-arm64/package.json', JSON.stringify({ version: '0.34.5' }));
    writeFile(nodeModules, '@img/sharp-libvips-darwin-arm64/package.json', JSON.stringify({ version: '1.2.4' }));
    return { projectDir, nodeModules };
  }

  const fakeFetch = (fetched) => (spec, dest) => {
    fetched.push(spec);
    const version = spec.slice(spec.lastIndexOf('@') + 1);
    writeFile(dest, 'package.json', JSON.stringify({ version }));
  };

  it('adds only the missing arch next to sharp, then is a no-op', () => {
    const { projectDir, nodeModules } = project();
    const fetched = [];

    const added = ensureSharpPlatformPackages({ projectDir, fetchPackage: fakeFetch(fetched) });

    expect(added).toEqual(['@img/sharp-darwin-x64@0.34.5', '@img/sharp-libvips-darwin-x64@1.2.4']);
    expect(fs.existsSync(path.join(nodeModules, '@img/sharp-darwin-x64/package.json'))).toBe(true);
    expect(ensureSharpPlatformPackages({ projectDir, fetchPackage: fakeFetch(fetched) })).toEqual([]);
    expect(fetched).toHaveLength(2);
  });

  it('replaces a platform package whose version does not match sharp', () => {
    const { projectDir, nodeModules } = project();
    writeFile(nodeModules, '@img/sharp-darwin-x64/package.json', JSON.stringify({ version: '0.33.0' }));
    writeFile(nodeModules, '@img/sharp-libvips-darwin-x64/package.json', JSON.stringify({ version: '1.2.4' }));
    const fetched = [];

    ensureSharpPlatformPackages({ projectDir, fetchPackage: fakeFetch(fetched) });

    expect(fetched).toEqual(['@img/sharp-darwin-x64@0.34.5']);
  });

  it('fails when the fetch does not produce the pinned version', () => {
    const { projectDir } = project();
    expect(() => ensureSharpPlatformPackages({ projectDir, fetchPackage: () => {} })).toThrow(
      'Failed to install @img/sharp-darwin-x64@0.34.5',
    );
  });
});

describe('checkMacInputHelper', () => {
  const helper = (archs) => {
    const appPath = path.join(tmp, 'Tavilo Time.app');
    if (archs !== undefined) writeFile(appPath, 'Contents/Resources/helpers/macos-input-helper', archs);
    return appPath;
  };

  it('fails the build when the Swift helper is missing (no clicks/keys if uiohook fails)', () => {
    expect(() => checkMacInputHelper({ appPath: helper(), arch: 'x64', readArchs })).toThrow(
      'macos-input-helper is missing',
    );
  });

  it('fails the build when the helper lacks the target arch', () => {
    expect(() => checkMacInputHelper({ appPath: helper('arm64'), arch: 'x64', readArchs })).toThrow(
      'macos-input-helper is arm64, needs x86_64',
    );
  });

  it('accepts the universal helper for both arches', () => {
    const appPath = helper('x86_64 arm64');
    for (const arch of ['x64', 'arm64']) {
      expect(checkMacInputHelper({ appPath, arch, readArchs })).toBe(
        path.join(appPath, 'Contents/Resources/helpers/macos-input-helper'),
      );
    }
  });
});

describe('patched uiohook (no per-key main-thread wait)', () => {
  const vendor = () => {
    const vendorDir = path.join(tmp, 'vendor');
    writeFile(vendorDir, 'darwin-arm64/node.napi.node', 'patched-arm64');
    writeFile(vendorDir, 'darwin-x64/node.napi.node', 'patched-x64');
    return vendorDir;
  };

  it('replaces the stock prebuilds and removes a shadowing build/', () => {
    const vendorDir = vendor();
    const nodeModules = path.join(tmp, 'node_modules');
    writeFile(nodeModules, 'uiohook-napi/prebuilds/darwin-arm64/node.napi.node', 'stock');
    writeFile(nodeModules, 'uiohook-napi/prebuilds/darwin-x64/node.napi.node', 'stock');
    writeFile(nodeModules, 'uiohook-napi/build/Release/uiohook_napi.node', 'stock');

    ensurePatchedUiohook({ nodeModules, vendorDir });

    const read = (rel) => fs.readFileSync(path.join(nodeModules, 'uiohook-napi', rel), 'utf8');
    expect(read('prebuilds/darwin-arm64/node.napi.node')).toBe('patched-arm64');
    expect(read('prebuilds/darwin-x64/node.napi.node')).toBe('patched-x64');
    expect(fs.existsSync(path.join(nodeModules, 'uiohook-napi', 'build'))).toBe(false);
  });

  it('fails the build when the packed app has the stock binary', () => {
    const vendorDir = vendor();
    const { appPath } = packedApp({ 'uiohook-napi/prebuilds/darwin-x64/node.napi.node': 'stock' });
    expect(() => checkPatchedUiohook({ appPath, arch: 'x64', vendorDir })).toThrow('is the stock build');
  });

  it('accepts the packed app with the patched binary', () => {
    const vendorDir = vendor();
    const { appPath } = packedApp({ 'uiohook-napi/prebuilds/darwin-arm64/node.napi.node': 'patched-arm64' });
    expect(() => checkPatchedUiohook({ appPath, arch: 'arm64', vendorDir })).not.toThrow();
  });

  it('ships real Mach-O binaries for both arches', () => {
    const real = path.join(__dirname, '..', '..', 'vendor', 'uiohook-napi-mac');
    for (const arch of ['arm64', 'x64']) {
      const head = fs.readFileSync(path.join(real, `darwin-${arch}`, 'node.napi.node')).subarray(0, 4);
      expect(head.readUInt32LE(0)).toBe(0xfeedfacf);
    }
  });
});
