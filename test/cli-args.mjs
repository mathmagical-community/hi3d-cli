/** Shell → zod coercion for generated tool commands (no Blender needed). Run: node test/cli-args.mjs */
import assert from 'node:assert/strict';
import { z } from 'zod';
import { coerceCliValue } from '../packages/cli/dist/program.js';

const vec3 = z.array(z.number()).length(3).optional();
const scale = z.union([z.number(), z.array(z.number()).length(3)]).optional();
const views = z.array(z.string()).max(8).optional();
const n = z.number().int().positive().optional();

assert.deepEqual(coerceCliValue(vec3, ['0', '0', '90']), [0, 0, 90]);
assert.deepEqual(coerceCliValue(vec3, ['-1.5', '2e-3', '0']), [-1.5, 0.002, 0]);
assert.deepEqual(coerceCliValue(scale, ['2']), 2);
assert.deepEqual(coerceCliValue(scale, '2'), 2);
assert.deepEqual(coerceCliValue(scale, ['1', '2', '3']), [1, 2, 3]);
assert.deepEqual(coerceCliValue(views, ['iso', 'front']), ['iso', 'front']);
assert.deepEqual(coerceCliValue(n, '42'), 42);
assert.deepEqual(coerceCliValue(vec3, ['a', '0', '0']), ['a', 0, 0]); // left for zod to reject with a real message
assert.ok(z.object({ rotate_deg: vec3, scale }).safeParse({ rotate_deg: coerceCliValue(vec3, ['0', '0', '90']), scale: coerceCliValue(scale, ['2']) }).success);
assert.ok(!z.object({ rotate_deg: vec3 }).safeParse({ rotate_deg: coerceCliValue(vec3, ['a', '0', '0']) }).success);
console.log('cli-args: ALL OK');
