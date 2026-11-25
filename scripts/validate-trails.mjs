#!/usr/bin/env node
/**
 * Validates public/data/trail-network.json and public/data/trail-status.json.
 * Run via `npm run validate:trails` after editing trail closures.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NETWORK_PATH = path.join(ROOT, 'public', 'data', 'trail-network.json');
const STATUS_PATH = path.join(ROOT, 'public', 'data', 'trail-status.json');

const ALLOWED_SEGMENT_STATUS = new Set(['open', 'closed', 'caution']);
const ALLOWED_FACILITY_STATUS = new Set(['open', 'closed', 'limited']);

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

const network = JSON.parse(fs.readFileSync(NETWORK_PATH, 'utf8'));
const status = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));

const nodeIds = new Set(network.nodes.map((n) => n.id));
const segmentIds = new Set(network.segments.map((s) => s.id));

// 1. Validate trail-network.json structural integrity
if (!nodeIds.has('parking')) {
  fail('trail-network.json must contain a "parking" node.');
}

for (const seg of network.segments) {
  if (!nodeIds.has(seg.from)) fail(`Segment "${seg.id}" references unknown from-node "${seg.from}".`);
  if (!nodeIds.has(seg.to)) fail(`Segment "${seg.id}" references unknown to-node "${seg.to}".`);
  if (!Array.isArray(seg.waypoints) || seg.waypoints.length < 2) {
    fail(`Segment "${seg.id}" must have at least 2 waypoints.`);
  }
}

for (const poi of network.pois) {
  if (!nodeIds.has(poi.nodeId)) {
    fail(`POI "${poi.id}" references unknown nodeId "${poi.nodeId}".`);
  }
}

// 2. Validate admin trail-status.json entries
if (!status.lastUpdated || !/^\d{4}-\d{2}-\d{2}$/.test(status.lastUpdated)) {
  warn('trail-status.json "lastUpdated" should use YYYY-MM-DD format.');
}

for (const [segId, entry] of Object.entries(status.segments ?? {})) {
  if (!segmentIds.has(segId)) {
    fail(`trail-status.json references unknown segment ID "${segId}". Check TRAIL_UPDATES.md for valid IDs.`);
  }
  if (!ALLOWED_SEGMENT_STATUS.has(entry.status)) {
    fail(`Segment "${segId}" has invalid status "${entry.status}". Use "open", "closed", or "caution".`);
  }
}

for (const [facId, entry] of Object.entries(status.facilities ?? {})) {
  if (!ALLOWED_FACILITY_STATUS.has(entry.status)) {
    fail(`Facility "${facId}" has invalid status "${entry.status}". Use "open", "closed", or "limited".`);
  }
}

// 3. Check reachability from parking over open segments
const adj = new Map();
for (const n of network.nodes) adj.set(n.id, []);
const closedIds = [];
for (const seg of network.segments) {
  const st = status.segments?.[seg.id]?.status ?? 'open';
  if (st === 'closed') {
    closedIds.push(seg.id);
    continue;
  }
  adj.get(seg.from).push(seg.to);
  adj.get(seg.to).push(seg.from);
}

const visited = new Set(['parking']);
const queue = ['parking'];
while (queue.length > 0) {
  const curr = queue.shift();
  for (const next of adj.get(curr) ?? []) {
    if (!visited.has(next)) {
      visited.add(next);
      queue.push(next);
    }
  }
}

if (visited.size < 3) {
  fail('Too few open trail nodes are reachable from "parking" — visitors would have no navigable trails.');
}

const unreachablePois = network.pois
  .filter(
    (p) =>
      p.selectableForCustomWalk &&
      status.facilities?.[p.id]?.status !== 'closed' &&
      !visited.has(p.nodeId)
  )
  .map((p) => p.name);

if (unreachablePois.length > 0) {
  warn(`POIs currently isolated by closures: ${unreachablePois.join(', ')}`);
}

// Summary output
console.log('=== QWR Trail Data Validation ===');
console.log(`Network version : ${network.version} (${network.nodes.length} nodes, ${network.segments.length} segments, ${network.pois.length} POIs)`);
console.log(`Status updated  : ${status.lastUpdated}`);
console.log(`Active closures : ${closedIds.length === 0 ? 'None (all trails open)' : closedIds.join(', ')}`);
console.log(`Reachable nodes : ${visited.size}/${network.nodes.length}`);

for (const w of warnings) console.warn(`WARN: ${w}`);
for (const e of errors) console.error(`ERROR: ${e}`);

if (errors.length > 0) {
  process.exit(1);
}
console.log('PASS: Trail network and admin closure schema are valid.');
