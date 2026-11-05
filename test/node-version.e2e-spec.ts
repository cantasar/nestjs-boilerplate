// Static checks that the Node pin, the engines floor and the Docker images agree (task node-security-update).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

type Version = [number, number, number];

/** Node 26.12.1 is the security release that fixed CVE-2026-111497 (Brotli) and nine other CVEs. */
const SECURITY_FLOOR: Version = [26, 12, 1];

function parse(text: string): Version {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (!m) throw new Error(`Not an exact x.y.z version: "${text}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function atLeast(a: Version, b: Version): boolean {
  const [aMajor, aMinor, aPatch] = a;
  const [bMajor, bMinor, bPatch] = b;
  if (aMajor !== bMajor) return aMajor > bMajor;
  if (aMinor !== bMinor) return aMinor > bMinor;
  return aPatch >= bPatch;
}

const pkg = JSON.parse(read('package.json')) as {
  engines: { node: string };
  packageManager: string;
};
const nvmrc = read('.nvmrc').trim();
const engineFloor = /^>=(\d+\.\d+\.\d+)$/.exec(pkg.engines.node)?.[1] ?? '';
const dockerfile = read('Dockerfile');
const dockerTags = [...dockerfile.matchAll(/^FROM node:(\S+)/gm)].map(
  (m) => m[1] ?? '',
);

describe('Node version floor', () => {
  it('.nvmrc holds one exact version at or above the security floor', () => {
    expect(nvmrc).toMatch(/^\d+\.\d+\.\d+$/);
    expect(atLeast(parse(nvmrc), SECURITY_FLOOR)).toBe(true);
  });

  it('engines.node is a plain >=x.y.z floor at or above the security floor', () => {
    expect(pkg.engines.node).toMatch(/^>=\d+\.\d+\.\d+$/);
    expect(atLeast(parse(engineFloor), SECURITY_FLOOR)).toBe(true);
  });

  it('.nvmrc satisfies engines.node', () => {
    expect(atLeast(parse(nvmrc), parse(engineFloor))).toBe(true);
  });

  it('pnpm refuses to install on a Node below engines.node (engineStrict)', () => {
    // Without it, pnpm 12.16.1 installs on Node 26.7.0 with no error and no warning.
    expect(read('pnpm-workspace.yaml')).toMatch(/^engineStrict:\s*true\s*$/m);
  });

  it('README names the same minimum version as engines.node', () => {
    expect(read('README.md')).toContain(`Node ${engineFloor} or newer`);
  });
});

describe('Docker images', () => {
  it('both stages use the same Node Alpine image', () => {
    expect(dockerTags).toHaveLength(2);
    expect(new Set(dockerTags).size).toBe(1);
    expect(dockerTags[0]).toMatch(/-alpine$/);
  });

  it('the Node tag is the .nvmrc version or the floating tag of its major', () => {
    const tag = (dockerTags[0] ?? '').replace(/-alpine$/, '');
    const [major] = parse(nvmrc);
    expect([nvmrc, String(major)]).toContain(tag);
  });

  it('the pnpm version matches packageManager in package.json', () => {
    const version = /^ARG PNPM_VERSION=(\S+)$/m.exec(dockerfile)?.[1];
    expect(`pnpm@${version}`).toBe(pkg.packageManager);
  });

  it('the AWS bootstrap placeholder uses the same Node image as the Dockerfile', () => {
    const tfvars = read('infra/aws/envs/example/terraform.tfvars.example');
    const tag = /^bootstrap_image\s*=\s*"[^"]*\/node:([^"]+)"/m.exec(
      tfvars,
    )?.[1];
    expect(tag).toBe(dockerTags[0]);
  });
});
