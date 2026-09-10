/** bpy on PyPI ↔ Python ↔ wheel platforms. Verify against https://pypi.org/project/bpy/ when bumping. */
export interface BpyRelease {
  bpy: string;
  python: string;
  blender: string;
  lts: boolean;
  platforms: string[];
  approxMb: number;
}

export const BPY_MATRIX: BpyRelease[] = [
  { bpy: '5.2', python: '3.13', blender: '5.2 LTS', lts: true, platforms: ['win32-x64', 'win32-arm64', 'linux-x64', 'darwin-arm64'], approxMb: 330 },
  { bpy: '5.0', python: '3.11', blender: '5.0', lts: false, platforms: ['win32-x64', 'win32-arm64', 'linux-x64', 'darwin-arm64'], approxMb: 330 },
  { bpy: '4.5', python: '3.11', blender: '4.5 LTS', lts: true, platforms: ['win32-x64', 'win32-arm64', 'linux-x64', 'darwin-arm64'], approxMb: 260 },
  { bpy: '4.2', python: '3.11', blender: '4.2 LTS', lts: true, platforms: ['win32-x64', 'linux-x64', 'darwin-arm64'], approxMb: 240 },
];

export const MIN_BLENDER = [4, 2];

export function platformKey(): string {
  return `${process.platform}-${process.arch}`;
}

/** Releases installable on this machine, newest first. */
export function installableReleases(): BpyRelease[] {
  const key = platformKey();
  return BPY_MATRIX.filter((r) => r.platforms.includes(key));
}

export function appInstallHint(): string {
  switch (process.platform) {
    case 'darwin':
      return 'brew install --cask blender   (or download from https://www.blender.org/download/)';
    case 'win32':
      return 'winget install BlenderFoundation.Blender   (or https://www.blender.org/download/)';
    default:
      return 'sudo snap install blender --classic   (or your distro package / https://www.blender.org/download/)';
  }
}

export function parseVersion(s: string): [number, number, number] | undefined {
  const m = s.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : undefined;
}
export function versionAtLeast(v: [number, number, number], min: number[]): boolean {
  for (let i = 0; i < min.length; i++) {
    if (v[i] > min[i]) return true;
    if (v[i] < min[i]) return false;
  }
  return true;
}
