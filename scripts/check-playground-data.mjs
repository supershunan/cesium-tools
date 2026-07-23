#!/usr/bin/env node
/**
 * 检查 playground 所需样例文件是否存在（不下载）。
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const required = [
    'public/resources/grid.json',
    'public/resources/slope/639203079460274842.dat',
    'public/resources/slope/639203080386429090.dat',
];

const optional = [
    'public/resources/slope/639203080386429090.tif',
    'public/resources/639021950828737727.zip',
    'public/resources/RADAR_PRE_2.0_20260601000000_result.zip',
];

async function exists(rel) {
    try {
        await access(path.join(root, rel));
        return true;
    } catch {
        return false;
    }
}

let missingRequired = 0;
console.log('Playground 样例数据检查\n');

for (const rel of required) {
    const ok = await exists(rel);
    console.log(`${ok ? '✓' : '✗'} [必需] ${rel}`);
    if (!ok) missingRequired++;
}

for (const rel of optional) {
    const ok = await exists(rel);
    console.log(`${ok ? '✓' : '○'} [可选] ${rel}`);
}

console.log('\n说明见 public/resources/README.md');

if (missingRequired > 0) {
    process.exitCode = 1;
}
