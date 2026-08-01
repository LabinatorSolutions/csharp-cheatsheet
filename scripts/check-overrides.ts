#!/usr/bin/env bun
/**
 * Audits package.json `overrides` for two distinct failure modes.
 *
 * Overrides are invisible to `ncu` and `bun outdated` — both read direct
 * dependencies only — so they rot silently in two opposite directions:
 *
 *   DRIFT     the pinned range no longer admits the latest release; the
 *             override is holding the tree back.
 *   REDUNDANT every consumer's own declared range already accepts the
 *             installed version, so removing the override would change
 *             nothing. This is what happens once upstream catches up, and it
 *             is the signal to delete the override rather than carry it.
 *
 * Exits 1 when either is found. Both are informational, not build failures —
 * someone else's release schedule should not red-gate a build.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';

/**
 * Reached through globalThis rather than the `Bun` global so that repos which
 * run a plain `tsc --noEmit` typecheck do not need @types/bun installed. A
 * bare `declare const Bun` would collide wherever those types *are* present.
 */
const bun = (
  globalThis as unknown as {
    Bun: {
      spawnSync(cmd: string[]): { stdout: { toString(): string } };
      semver: { satisfies(version: string, range: string): boolean };
    };
  }
).Bun;

type Overrides = Record<string, string | Record<string, string>>;

/** Flatten npm's nested override form ({parent: {child: range}}) to child->range. */
function flatten(overrides: Overrides): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [name, value] of Object.entries(overrides)) {
    if (typeof value === 'string') out.push([name, value]);
    else
      for (const [child, range] of Object.entries(value))
        out.push([child, range]);
  }
  return out;
}

function latestOf(pkg: string): string | null {
  const r = bun.spawnSync(['bun', 'pm', 'view', pkg, 'version']);
  const line = r.stdout.toString().trim().split('\n').pop()?.trim();
  return line && /^\d/.test(line) ? line : null;
}

function installedOf(pkg: string): string | null {
  const pj = `node_modules/${pkg}/package.json`;
  if (!existsSync(pj)) return null;
  try {
    return JSON.parse(readFileSync(pj, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/** Installed packages that declare `pkg` as a runtime/optional dep, with their range. */
function consumers(pkg: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  if (!existsSync('node_modules')) return found;
  for (const scope of readdirSync('node_modules')) {
    if (scope.startsWith('.')) continue;
    const dirs = scope.startsWith('@')
      ? readdirSync(`node_modules/${scope}`).map((s) => `${scope}/${s}`)
      : [scope];
    for (const d of dirs) {
      if (d === pkg) continue;
      const pj = `node_modules/${d}/package.json`;
      if (!existsSync(pj)) continue;
      try {
        const m = JSON.parse(readFileSync(pj, 'utf8'));
        const range = m.dependencies?.[pkg] ?? m.optionalDependencies?.[pkg];
        if (range) found.push([d, range]);
      } catch {
        /* unreadable manifest — skip */
      }
    }
  }
  return found;
}

const pkgJson = JSON.parse(readFileSync('package.json', 'utf8'));
const entries = flatten(pkgJson.overrides ?? {});

if (entries.length === 0) {
  console.log('No overrides declared.');
  process.exit(0);
}

let flagged = 0;

for (const [name, range] of entries) {
  const latest = latestOf(name);
  const installed = installedOf(name);
  const users = consumers(name);

  if (latest && !bun.semver.satisfies(latest, range)) {
    flagged++;
    console.log(
      `  DRIFT     ${name}: pinned ${range}, latest ${latest} — range excludes latest`,
    );
    continue;
  }

  // Redundant only if every consumer would already accept what is installed.
  const holdouts = installed
    ? users.filter(([, r]) => !bun.semver.satisfies(installed, r))
    : users;

  if (installed && users.length > 0 && holdouts.length === 0) {
    flagged++;
    console.log(
      `  REDUNDANT ${name}: pinned ${range}, installed ${installed} — all ${users.length} consumer(s) already accept it; delete the override`,
    );
    continue;
  }

  const why =
    holdouts.length > 0
      ? ` (holding ${holdouts.map(([w]) => w).join(', ')})`
      : '';
  console.log(
    `  ok        ${name}: pinned ${range}, latest ${latest ?? '?'}${why}`,
  );
}

if (flagged > 0) {
  console.log(
    `\n${flagged} override(s) need review — bump the pin, or drop it if upstream caught up.`,
  );
  process.exit(1);
}
