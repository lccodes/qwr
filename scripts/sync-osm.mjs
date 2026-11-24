#!/usr/bin/env node
/**
 * Builds public/data/trail-network.json directly from OpenStreetMap (OSM) geometry
 * reconciled with Quogue Wildlife Refuge's December 2025 trail map.
 *
 * Usage:
 *   node scripts/sync-osm.mjs [optional-local-osm.json]
 *
 * Without an argument, fetches live OSM map JSON for Quogue Wildlife Refuge.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'public', 'data', 'trail-network.json');
const OSM_BBOX = '-72.624,40.829,-72.610,40.853';

function roundCoord(v) {
  return Math.round(v * 1e6) / 1e6;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function polylineMeters(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += haversineMeters(pts[i - 1], pts[i]);
  }
  return d;
}

async function loadOsmJson(localFile) {
  if (localFile && fs.existsSync(localFile)) {
    console.log(`Reading local OSM snapshot: ${localFile}`);
    return JSON.parse(fs.readFileSync(localFile, 'utf8'));
  }
  const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${OSM_BBOX}`;
  console.log(`Fetching live OpenStreetMap geometry from ${url} ...`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'QWR-Trail-Map-Builder/1.0' }
  });
  if (!res.ok) {
    throw new Error(`OSM API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function main(osm) {
  const osmNodes = new Map();
  const osmWays = new Map();
  for (const el of osm.elements) {
    if (el.type === 'node') osmNodes.set(el.id, [roundCoord(el.lat), roundCoord(el.lon)]);
    if (el.type === 'way') osmWays.set(el.id, el);
  }

  const pt = (nid) => {
    const p = osmNodes.get(nid);
    if (!p) throw new Error(`Missing OSM node ${nid}`);
    return p;
  };

  /** Extract a slice of an OSM way between two OSM node IDs (either direction) */
  const sliceWay = (wid, startNid, endNid) => {
    const w = osmWays.get(wid);
    if (!w) throw new Error(`Missing OSM way ${wid}`);
    const ids = w.nodes;
    const i0 = ids.indexOf(startNid);
    const i1 = ids.indexOf(endNid);
    if (i0 === -1 || i1 === -1) {
      throw new Error(`Way ${wid} missing endpoints ${startNid} / ${endNid}`);
    }
    const sub = i0 <= i1 ? ids.slice(i0, i1 + 1) : ids.slice(i1, i0 + 1).reverse();
    return sub.map(pt);
  };

  /** Chain multiple way slices together, deduplicating touching vertices */
  const chainSlices = (...slices) => {
    const out = [];
    for (const s of slices) {
      for (let i = 0; i < s.length; i++) {
        if (out.length > 0 && i === 0) {
          const prev = out[out.length - 1];
          if (prev[0] === s[0][0] && prev[1] === s[0][1]) continue;
        }
        out.push(s[i]);
      }
    }
    return out;
  };

  const wayRing = (wid) => {
    const w = osmWays.get(wid);
    if (!w) throw new Error(`Missing OSM way ${wid}`);
    return w.nodes.map(pt);
  };

  // Canonical graph nodes mapped to real OSM junction node IDs
  const nodeSpecs = [
    ['parking', 8901534960, 'Parking & Trailhead'],
    ['animal-complex-north', 8901516134, 'Animal Complex Split'],
    ['east-fence-mid-south', 8901516154, 'East Fence Junction'],
    ['bridge-east-junction', 8901535031, 'East of Bridge'],
    ['bridge-west', 8901516210, 'The Bridge (West)'],
    ['west-fence-nw-spur', 8901535027, 'West Trail NW Spur'],
    ['west-fence-mid-south-outer', 8901535026, 'West Fence at NW Spur'],
    ['sw-bog-corner', 8901534933, 'Southwest Bog Corner'],
    ['bog-boardwalk-west', 8901534941, 'Bog Boardwalk'],
    ['nature-center-south', 11087786659, 'Nature Center'],
    ['east-swamp-mid', 8901535039, 'East Swamp Trail'],
    ['east-fence-north-pond', 8901535038, 'East Fence near North Pond'],
    ['north-pond-east', 8901516182, 'North Pond (East)'],
    ['north-pond-west', 8901516187, 'North Pond (West)'],
    ['new-trail-se', 14049482228, 'Forest Regeneration Clearing'],
    ['new-trail-west', 13532886442, 'New Trail West End'],
    ['west-fence-regen', 8901535005, 'West Fence at Regeneration Area'],
    ['east-fence-deer-pond', 13044609220, 'Deer Pond Trailhead'],
    ['deer-pond-overlook', 13044609221, 'Deer Pond Overlook'],
    ['east-fence-north-cross', 8901535025, 'East Fence North Cross'],
    ['dwarf-pine-apex', 8901534983, 'Dwarf Pine Barrens North Tip'],
    ['nw-fence-red-split', 8901535020, 'Northwest Fence Split'],
    ['interior-north-cross-east', 8901535018, 'Dwarf Pine Crossroad (East)'],
    ['interior-north-cross-west', 8901535019, 'Dwarf Pine Crossroad (West)'],
    ['west-fence-north-cross', 8901535022, 'West Fence North Cross'],
    ['fairy-dell-entry', 9349973652, 'Fairy Dell Boardwalk Entry'],
    ['fairy-dell-overlook', 9349973632, 'Fairy Dell Overlook']
  ];

  const osmIdByNode = Object.fromEntries(nodeSpecs.map(([id, nid]) => [id, nid]));
  const nodes = nodeSpecs.map(([id, nid, label]) => {
    const [lat, lng] = pt(nid);
    return { id, lat, lng, label };
  });

  // Trail segments with human-friendly IDs for trivial admin closure updates
  const segments = [
    {
      id: 'entrance-to-split',
      name: 'Main Trailhead (Parking to Animal Complex Split)',
      from: 'parking',
      to: 'animal-complex-north',
      waypoints: sliceWay(1419544797, 8901534960, 8901516134),
      habitat: 'pine-oak-forest',
      surface: 'gravel',
      loops: ['green', 'yellow', 'blue', 'red']
    },
    {
      id: 'green-pond-east',
      name: 'Old Ice Pond East Trail (Inner Green Trail)',
      from: 'animal-complex-north',
      to: 'bridge-east-junction',
      waypoints: sliceWay(962314905, 8901516134, 8901535031),
      habitat: 'pine-oak-forest',
      surface: 'dirt',
      loops: ['green']
    },
    {
      id: 'east-amphitheater-field',
      name: 'East Trail (Amphitheater, Restrooms & Field)',
      from: 'animal-complex-north',
      to: 'east-fence-mid-south',
      waypoints: sliceWay(1419544795, 8901516134, 8901516154),
      habitat: 'field',
      surface: 'dirt',
      loops: ['yellow', 'blue', 'red']
    },
    {
      id: 'east-bridge-connector',
      name: 'East Fence to Bridge Connector',
      from: 'east-fence-mid-south',
      to: 'bridge-east-junction',
      waypoints: sliceWay(1419544798, 8901516154, 8901535031),
      habitat: 'pine-oak-forest',
      surface: 'dirt',
      loops: ['yellow', 'red']
    },
    {
      id: 'bridge-crossing',
      name: 'Old Ice Pond Bridge Crossing',
      from: 'bridge-east-junction',
      to: 'bridge-west',
      waypoints: chainSlices(
        sliceWay(1419544799, 8901535031, 8901535033),
        sliceWay(962314907, 8901535033, 11087786657),
        sliceWay(962314906, 11087786657, 8901516210)
      ),
      habitat: 'swamp',
      surface: 'bridge',
      loops: ['green', 'red']
    },
    {
      id: 'old-ice-pond-nw-spur',
      name: 'Old Ice Pond Northwest Connector (Bridge to West Fence)',
      from: 'bridge-west',
      to: 'west-fence-nw-spur',
      waypoints: sliceWay(1419544800, 8901516210, 8901535027),
      habitat: 'pine-barrens',
      surface: 'dirt',
      loops: ['green', 'yellow']
    },
    {
      id: 'west-fence-spur-link',
      name: 'West Fence Spur Link',
      from: 'west-fence-mid-south-outer',
      to: 'west-fence-nw-spur',
      waypoints: sliceWay(962314904, 8901535026, 8901535027),
      habitat: 'pine-barrens',
      surface: 'dirt',
      loops: ['red']
    },
    {
      id: 'west-fence-south-inner',
      name: 'West Trail (Old Ice Pond West Side — Inner)',
      from: 'west-fence-nw-spur',
      to: 'sw-bog-corner',
      waypoints: sliceWay(1419544796, 8901535027, 8901534933),
      habitat: 'pine-barrens',
      surface: 'dirt',
      loops: ['green', 'yellow', 'red']
    },
    {
      id: 'west-fence-south-outer',
      name: 'West Fence Trail (Old Ice Pond West Side — Outer)',
      from: 'west-fence-mid-south-outer',
      to: 'sw-bog-corner',
      waypoints: sliceWay(1419544807, 8901535026, 8901534933),
      habitat: 'pine-barrens',
      surface: 'dirt',
      loops: ['blue']
    },
    {
      id: 'west-fence-mid-south',
      name: 'West Fence Trail (Regeneration Area to Old Ice Pond Spur)',
      from: 'west-fence-regen',
      to: 'west-fence-mid-south-outer',
      waypoints: sliceWay(1419544806, 8901535005, 8901535026),
      habitat: 'pine-barrens',
      surface: 'dirt',
      loops: ['blue', 'red']
    },
    {
      id: 'bog-south-trail',
      name: 'South Bog Trail (SW Corner to Bog Boardwalk)',
      from: 'sw-bog-corner',
      to: 'bog-boardwalk-west',
      waypoints: sliceWay(1419544794, 8901534933, 8901534941),
      habitat: 'bog',
      surface: 'dirt',
      loops: ['green', 'yellow', 'blue', 'red']
    },
    {
      id: 'bog-boardwalk',
      name: 'Bog Boardwalk (South of Old Ice Pond)',
      from: 'bog-boardwalk-west',
      to: 'nature-center-south',
      waypoints: sliceWay(1194602557, 8901534941, 11087786659),
      habitat: 'bog',
      surface: 'boardwalk',
      loops: ['green', 'yellow', 'blue', 'red']
    },
    {
      id: 'nature-center-to-parking',
      name: 'Nature Center to Parking Path',
      from: 'nature-center-south',
      to: 'parking',
      waypoints: sliceWay(1194602556, 11087786659, 8901534960),
      habitat: 'pine-oak-forest',
      surface: 'gravel',
      loops: ['green', 'yellow', 'blue', 'red']
    },
    {
      id: 'swamp-east-south',
      name: 'East Swamp Trail (Bridge to Mid-Swamp)',
      from: 'bridge-east-junction',
      to: 'east-swamp-mid',
      waypoints: sliceWay(962314897, 8901535031, 8901535039),
      habitat: 'swamp',
      surface: 'dirt',
      loops: ['yellow']
    },
    {
      id: 'swamp-east-north',
      name: 'East Swamp Trail (Mid-Swamp to North Pond)',
      from: 'east-swamp-mid',
      to: 'north-pond-east',
      waypoints: sliceWay(962314897, 8901535039, 8901516182),
      habitat: 'swamp',
      surface: 'dirt',
      loops: ['yellow']
    },
    {
      id: 'east-fence-south-to-north-pond',
      name: 'East Fence Trail (Mid-South to North Pond)',
      from: 'east-fence-mid-south',
      to: 'east-fence-north-pond',
      waypoints: sliceWay(1419544803, 8901516154, 8901535038),
      habitat: 'pine-oak-forest',
      surface: 'dirt',
      loops: ['blue']
    },
    {
      id: 'east-swamp-shortcut',
      name: 'East Fence to Swamp Connector',
      from: 'east-fence-north-pond',
      to: 'east-swamp-mid',
      waypoints: sliceWay(1419544804, 8901535038, 8901535039),
      habitat: 'pine-oak-forest',
      surface: 'dirt'
    },
    {
      id: 'north-pond-east-link',
      name: 'North Pond East Spur (East Fence to North Pond)',
      from: 'east-fence-north-pond',
      to: 'north-pond-east',
      waypoints: sliceWay(962314910, 8901535038, 8901516182),
      habitat: 'pine-barrens',
      surface: 'dirt',
      loops: ['red']
    },
    {
      id: 'north-pond-crossing',
      name: 'North Pond South Shore Crossing',
      from: 'north-pond-east',
      to: 'north-pond-west',
      waypoints: sliceWay(1419544805, 8901516182, 8901516187),
      habitat: 'swamp',
      surface: 'dirt',
      loops: ['yellow', 'red']
    },
    {
      id: 'bridge-to-regen-se',
      name: 'Central Trail (Bridge West to Regeneration Clearing)',
      from: 'bridge-west',
      to: 'new-trail-se',
      waypoints: sliceWay(1419544801, 8901516210, 14049482228),
      habitat: 'pine-barrens',
      surface: 'dirt',
      loops: ['yellow', 'red']
    },
    {
      id: 'regen-se-to-north-pond-west',
      name: 'Central Trail (Regeneration Clearing to North Pond West)',
      from: 'new-trail-se',
      to: 'north-pond-west',
      waypoints: sliceWay(1544607874, 14049482228, 8901516187),
      habitat: 'pine-barrens',
      surface: 'dirt',
      loops: ['yellow', 'red']
    },
    {
      id: 'regeneration-new-trail',
      name: 'New Trail (Forest Regeneration & Eastern Bluebird Nestboxes)',
      from: 'new-trail-se',
      to: 'new-trail-west',
      waypoints: sliceWay(1475111035, 14049482228, 13532886442),
      habitat: 'forest-regeneration',
      surface: 'dirt',
      isNewTrail: true
    },
    {
      id: 'regen-north-trail',
      name: 'Regeneration North Trail (North Pond West to West Trail)',
      from: 'north-pond-west',
      to: 'new-trail-west',
      waypoints: sliceWay(962314900, 8901516187, 13532886442),
      habitat: 'forest-regeneration',
      surface: 'dirt',
      loops: ['red']
    },
    {
      id: 'regen-to-west-fence',
      name: 'Regeneration Trail to West Fence Link',
      from: 'new-trail-west',
      to: 'west-fence-regen',
      waypoints: chainSlices(
        sliceWay(1544607873, 13532886442, 13532886443),
        sliceWay(1544607872, 13532886443, 8901535005)
      ),
      habitat: 'forest-regeneration',
      surface: 'dirt',
      loops: ['red']
    },
    {
      id: 'east-fence-north-pond-to-deer',
      name: 'East Fence Trail (North Pond to Deer Pond)',
      from: 'east-fence-north-pond',
      to: 'east-fence-deer-pond',
      waypoints: sliceWay(962314899, 8901535038, 13044609220),
      habitat: 'pine-barrens',
      surface: 'dirt',
      loops: ['blue', 'red']
    },
    {
      id: 'deer-pond-overlook-spur',
      name: 'Deer Pond Scenic Overlook Spur',
      from: 'east-fence-deer-pond',
      to: 'deer-pond-overlook',
      waypoints: sliceWay(1419543443, 13044609220, 13044609221),
      habitat: 'swamp',
      surface: 'dirt'
    },
    {
      id: 'east-fence-deer-to-cross',
      name: 'East Fence Trail (Deer Pond to North Cross Trail)',
      from: 'east-fence-deer-pond',
      to: 'east-fence-north-cross',
      waypoints: sliceWay(962314899, 13044609220, 8901535025),
      habitat: 'pine-barrens',
      surface: 'dirt',
      loops: ['blue', 'red']
    },
    {
      id: 'east-fence-dwarf-pine-north',
      name: 'East Fence Trail (Dwarf Pine Barrens to North Apex)',
      from: 'east-fence-north-cross',
      to: 'dwarf-pine-apex',
      waypoints: sliceWay(962314899, 8901535025, 8901534983),
      habitat: 'dwarf-pine-barrens',
      surface: 'dirt',
      loops: ['blue', 'red']
    },
    {
      id: 'nw-fence-dwarf-pine',
      name: 'Northwest Fence Trail (Dwarf Pine Barrens)',
      from: 'dwarf-pine-apex',
      to: 'nw-fence-red-split',
      waypoints: sliceWay(962314899, 8901534983, 8901535020),
      habitat: 'dwarf-pine-barrens',
      surface: 'dirt',
      loops: ['blue', 'red']
    },
    {
      id: 'interior-deer-pond-west',
      name: 'Interior Pine Barrens Trail (West of Deer Pond)',
      from: 'north-pond-west',
      to: 'interior-north-cross-east',
      waypoints: sliceWay(962314901, 8901516187, 8901535018),
      habitat: 'pine-barrens',
      surface: 'dirt',
      loops: ['red']
    },
    {
      id: 'interior-cross-link',
      name: 'Dwarf Pine Crossroad Link',
      from: 'interior-north-cross-east',
      to: 'interior-north-cross-west',
      waypoints: sliceWay(962314901, 8901535018, 8901535019),
      habitat: 'dwarf-pine-barrens',
      surface: 'dirt',
      loops: ['red']
    },
    {
      id: 'interior-dwarf-pine-nw',
      name: 'Interior Dwarf Pine Trail (Crossroad to NW Fence)',
      from: 'interior-north-cross-west',
      to: 'nw-fence-red-split',
      waypoints: sliceWay(962314901, 8901535019, 8901535020),
      habitat: 'dwarf-pine-barrens',
      surface: 'dirt',
      loops: ['red']
    },
    {
      id: 'north-cross-east',
      name: 'Northern Cross Trail (East Half)',
      from: 'interior-north-cross-east',
      to: 'east-fence-north-cross',
      waypoints: sliceWay(962314903, 8901535018, 8901535025),
      habitat: 'dwarf-pine-barrens',
      surface: 'dirt'
    },
    {
      id: 'north-cross-west',
      name: 'Northern Cross Trail (West Half)',
      from: 'interior-north-cross-west',
      to: 'west-fence-north-cross',
      waypoints: sliceWay(962314902, 8901535019, 8901535022),
      habitat: 'dwarf-pine-barrens',
      surface: 'dirt'
    },
    {
      id: 'west-fence-north-upper',
      name: 'West Fence Trail (Dwarf Pines North Half)',
      from: 'nw-fence-red-split',
      to: 'west-fence-north-cross',
      waypoints: sliceWay(1419544802, 8901535020, 8901535022),
      habitat: 'dwarf-pine-barrens',
      surface: 'dirt',
      loops: ['blue']
    },
    {
      id: 'west-fence-north-lower',
      name: 'West Fence Trail (North Cross to Regeneration Area)',
      from: 'west-fence-north-cross',
      to: 'west-fence-regen',
      waypoints: sliceWay(1419544802, 8901535022, 8901535005),
      habitat: 'pine-barrens',
      surface: 'dirt',
      loops: ['blue']
    },
    {
      id: 'fairy-dell-connector',
      name: 'Path to Fairy Dell Boardwalk (Across Old Country Rd & LIRR)',
      from: 'nature-center-south',
      to: 'fairy-dell-entry',
      waypoints: chainSlices(
        [pt(11087786659), [40.83348, -72.61598], pt(13044609217)],
        sliceWay(1419543442, 13044609217, 13044609216),
        sliceWay(1419543441, 13044609216, 13044609212),
        sliceWay(1419543440, 13044609212, 9349973652)
      ),
      habitat: 'bog',
      surface: 'gravel'
    },
    {
      id: 'fairy-dell-boardwalk',
      name: 'Fairy Dell Boardwalk (Quantuck Creek Wetlands)',
      from: 'fairy-dell-entry',
      to: 'fairy-dell-overlook',
      waypoints: sliceWay(1013430382, 9349973652, 9349973632),
      habitat: 'swamp',
      surface: 'boardwalk'
    }
  ];

  // Standard blaze loops (exact counter-clockwise order from the December 2025 map)
  const standardLoops = [
    {
      id: 'green-08',
      colorId: 'green',
      name: 'Green Trail',
      shortName: 'Green · 0.8 mi',
      colorHex: '#1E8E4E',
      badgeShape: 'circle',
      canonicalMiles: 0.8,
      difficulty: 'Easy',
      summary: 'Old Ice Pond & Bridge',
      highlights: ['Old Ice Pond', 'The Bridge', 'Bog Boardwalk'],
      canonicalNodeIds: [
        'parking',
        'animal-complex-north',
        'bridge-east-junction',
        'bridge-west',
        'west-fence-nw-spur',
        'sw-bog-corner',
        'bog-boardwalk-west',
        'nature-center-south',
        'parking'
      ],
      detourAnchors: ['animal-complex-north', 'bridge-east-junction', 'bridge-west', 'east-fence-mid-south']
    },
    {
      id: 'yellow-14',
      colorId: 'yellow',
      name: 'Yellow Trail',
      shortName: 'Yellow · 1.4 mi',
      colorHex: '#C28500',
      badgeShape: 'diamond',
      canonicalMiles: 1.4,
      difficulty: 'Easy',
      summary: 'Field, North Pond & Pine Barrens',
      highlights: ['Butterfly Garden', 'North Pond', 'Bluebird Nestboxes'],
      canonicalNodeIds: [
        'parking',
        'animal-complex-north',
        'east-fence-mid-south',
        'bridge-east-junction',
        'east-swamp-mid',
        'north-pond-east',
        'north-pond-west',
        'new-trail-se',
        'bridge-west',
        'west-fence-nw-spur',
        'sw-bog-corner',
        'bog-boardwalk-west',
        'nature-center-south',
        'parking'
      ],
      detourAnchors: [
        'east-fence-mid-south',
        'east-swamp-mid',
        'north-pond-east',
        'north-pond-west',
        'new-trail-se',
        'bridge-west',
        'bridge-east-junction'
      ]
    },
    {
      id: 'blue-25',
      colorId: 'blue',
      name: 'Blue Trail',
      shortName: 'Blue · 2.5 mi',
      colorHex: '#1D5FD6',
      badgeShape: 'square',
      canonicalMiles: 2.5,
      difficulty: 'Moderate',
      summary: 'Perimeter Loop & Dwarf Pines',
      highlights: ['Deer Pond', 'Dwarf Pine Barrens', 'New Trail Bypass'],
      canonicalNodeIds: [
        'parking',
        'animal-complex-north',
        'east-fence-mid-south',
        'east-fence-north-pond',
        'east-fence-deer-pond',
        'east-fence-north-cross',
        'dwarf-pine-apex',
        'nw-fence-red-split',
        'west-fence-north-cross',
        'west-fence-regen',
        'west-fence-mid-south-outer',
        'sw-bog-corner',
        'bog-boardwalk-west',
        'nature-center-south',
        'parking'
      ],
      detourAnchors: [
        'east-fence-north-pond',
        'east-fence-deer-pond',
        'dwarf-pine-apex',
        'nw-fence-red-split',
        'west-fence-regen',
        'new-trail-west',
        'new-trail-se',
        'bridge-west'
      ]
    },
    {
      id: 'red-31',
      colorId: 'red',
      name: 'Red Trail',
      shortName: 'Red · 3.1 mi',
      colorHex: '#C62828',
      badgeShape: 'triangle',
      canonicalMiles: 3.1,
      difficulty: 'Moderate',
      summary: 'Full Refuge Grand Tour',
      highlights: ['The Bridge', 'Deer Pond', 'Dwarf Pines', 'North Pond'],
      canonicalNodeIds: [
        'parking',
        'animal-complex-north',
        'east-fence-mid-south',
        'bridge-east-junction',
        'bridge-west',
        'new-trail-se',
        'north-pond-west',
        'interior-north-cross-east',
        'interior-north-cross-west',
        'nw-fence-red-split',
        'dwarf-pine-apex',
        'east-fence-north-cross',
        'east-fence-deer-pond',
        'east-fence-north-pond',
        'north-pond-east',
        'north-pond-west',
        'new-trail-west',
        'west-fence-regen',
        'west-fence-mid-south-outer',
        'west-fence-nw-spur',
        'sw-bog-corner',
        'bog-boardwalk-west',
        'nature-center-south',
        'parking'
      ],
      detourAnchors: [
        'east-fence-mid-south',
        'bridge-west',
        'north-pond-west',
        'interior-north-cross-east',
        'nw-fence-red-split',
        'dwarf-pine-apex',
        'east-fence-deer-pond',
        'north-pond-east',
        'new-trail-west',
        'new-trail-se',
        'bridge-east-junction'
      ]
    }
  ];

  // Landmarks & POIs positioned accurately from OSM buildings/features & Dec 2025 map
  const pois = [
    {
      id: 'parking',
      name: 'Main Parking & Trailhead',
      shortName: 'Parking',
      category: 'entry',
      icon: 'parking',
      lat: 40.83436,
      lng: -72.61515,
      nodeId: 'parking',
      description: 'Free gravel parking lot at 3 Old Country Rd and main starting hub for all Refuge trails.',
      kidTip: 'Start and end your walk here — check the trailhead board for seasonal bird sightings!',
      selectableForCustomWalk: false
    },
    {
      id: 'animal-complex',
      name: 'Outdoor Wildlife Complex',
      shortName: 'Animal Complex',
      category: 'wildlife',
      icon: 'animals',
      lat: 40.83457,
      lng: -72.61514,
      nodeId: 'animal-complex-north',
      description: 'Home to permanently injured native New York wildlife ambassadors including owls, hawks, falcons, and foxes.',
      kidTip: 'Look quietly into the tall aviaries to spot barred owls, screech owls, and red-tailed hawks.',
      selectableForCustomWalk: true
    },
    {
      id: 'nature-center',
      name: 'Charles Banks Belt Nature Center',
      shortName: 'Nature Center',
      category: 'entry',
      icon: 'nature-center',
      lat: 40.83411,
      lng: -72.61585,
      nodeId: 'nature-center-south',
      description: 'Historic lakeside Nature Center overlooking Old Ice Pond (undergoing renovation & expansion).',
      kidTip: 'Peek out over Old Ice Pond right beside the building to look for painted turtles and ducks.',
      selectableForCustomWalk: true
    },
    {
      id: 'restrooms',
      name: 'Outdoor Restrooms',
      shortName: 'Restrooms',
      category: 'amenity',
      icon: 'restrooms',
      lat: 40.83467,
      lng: -72.61456,
      nodeId: 'animal-complex-north',
      description: 'Accessible outdoor restrooms open daily from sunrise to sunset near the Butterfly Garden.',
      kidTip: 'Good pit stop right at the start or end of your walk!',
      selectableForCustomWalk: true
    },
    {
      id: 'butterfly-garden',
      name: 'Butterfly Garden & Greenhouse',
      shortName: 'Butterfly Garden',
      category: 'garden',
      icon: 'butterfly',
      lat: 40.83444,
      lng: -72.61482,
      nodeId: 'animal-complex-north',
      description: 'Native Long Island pollinator garden and greenhouse where resident giant tortoises live.',
      kidTip: 'Look for monarch butterflies on goldenrod and milkweed in warm months, plus giant tortoises in the greenhouse!',
      selectableForCustomWalk: true
    },
    {
      id: 'amphitheater',
      name: 'Woodland Amphitheater',
      shortName: 'Amphitheater',
      category: 'landmark',
      icon: 'amphitheater',
      lat: 40.83490,
      lng: -72.61465,
      nodeId: 'animal-complex-north',
      description: 'Shaded outdoor wooden seating area along the east trail used for nature talks and school groups.',
      kidTip: 'Take a quick rest on the curved benches and listen for woodpeckers tapping nearby.',
      selectableForCustomWalk: false
    },
    {
      id: 'ice-exhibit',
      name: 'Ice Harvesting Exhibit & Bog',
      shortName: 'Bog & Ice Exhibit',
      category: 'landmark',
      icon: 'ice-exhibit',
      lat: 40.83400,
      lng: -72.61642,
      nodeId: 'bog-boardwalk-west',
      description: 'Scenic wooden boardwalk over the southern bog showcasing how the Quogue Ice Company harvested pond ice in the 1910s.',
      kidTip: 'Before freezers existed, people sawed giant blocks of winter ice right out of Old Ice Pond!',
      selectableForCustomWalk: true
    },
    {
      id: 'old-ice-pond',
      name: 'Old Ice Pond',
      shortName: 'Old Ice Pond',
      category: 'water',
      icon: 'pond',
      lat: 40.83555,
      lng: -72.61665,
      nodeId: 'bridge-east-junction',
      description: '10-acre freshwater pond dotted with mossy islands — a favorite sanctuary for waterfowl, turtles, and osprey.',
      kidTip: 'Count how many tiny wooded islands you can spot floating across the pond.',
      selectableForCustomWalk: true
    },
    {
      id: 'the-bridge',
      name: 'The Bridge',
      shortName: 'The Bridge',
      category: 'landmark',
      icon: 'bridge',
      lat: 40.83678,
      lng: -72.61645,
      nodeId: 'bridge-west',
      description: 'Wooden footbridge spanning the lush wetland channel connecting the northern swamp into Old Ice Pond.',
      kidTip: 'Pause in the middle of the bridge and look straight down into the water for frogs and dragonflies.',
      selectableForCustomWalk: true
    },
    {
      id: 'bluebird-nestboxes',
      name: 'Eastern Bluebird Nestboxes (New Trail)',
      shortName: 'Bluebird Nestboxes',
      category: 'wildlife',
      icon: 'bluebird',
      lat: 40.83918,
      lng: -72.61775,
      nodeId: 'new-trail-se',
      description: 'Open Forest Regeneration Area along the New Trail featuring wooden nestboxes for bright blue Eastern Bluebirds.',
      kidTip: 'Look for tiny wooden birdhouses mounted on posts in the sunny clearing — bluebirds love open meadows!',
      selectableForCustomWalk: true
    },
    {
      id: 'north-pond',
      name: 'North Pond',
      shortName: 'North Pond',
      category: 'water',
      icon: 'pond',
      lat: 40.84020,
      lng: -72.61550,
      nodeId: 'north-pond-east',
      description: 'Quiet freshwater marsh pond tucked between pine-oak woodland and swamp — great for spotting herons and wood ducks.',
      kidTip: 'Whisper softly as you walk up to the shore so you don’t spook resting ducks or turtles.',
      selectableForCustomWalk: true
    },
    {
      id: 'deer-pond',
      name: 'Deer Pond Overlook',
      shortName: 'Deer Pond',
      category: 'water',
      icon: 'pond',
      lat: 40.84355,
      lng: -72.61530,
      nodeId: 'deer-pond-overlook',
      description: 'Tranquil northern forest pond with a wooden waterside bench where white-tailed deer often come to drink.',
      kidTip: 'Check the soft sandy trail near the bench for heart-shaped deer hoofprints!',
      selectableForCustomWalk: true
    },
    {
      id: 'dwarf-pines',
      name: 'Dwarf Pine Barrens',
      shortName: 'Dwarf Pines',
      category: 'landmark',
      icon: 'dwarf-pines',
      lat: 40.84820,
      lng: -72.61720,
      nodeId: 'dwarf-pine-apex',
      description: 'One of the rarest ecosystems in the world — ancient pitch pines that naturally grow only 4 to 8 feet tall.',
      kidTip: 'Even though these miniature pine trees are shorter than a basketball hoop, some are over 50 years old!',
      selectableForCustomWalk: true
    },
    {
      id: 'fairy-dell',
      name: 'Fairy Dell Boardwalk',
      shortName: 'Fairy Dell',
      category: 'water',
      icon: 'boardwalk',
      lat: 40.83155,
      lng: -72.61695,
      nodeId: 'fairy-dell-overlook',
      description: 'Elevated wooden catwalk south of the railroad tracks winding through tidal wetlands along Quantuck Creek.',
      kidTip: 'Walk carefully across Old Country Rd to reach the boardwalk — watch for fiddler crabs and egrets from the platforms!',
      selectableForCustomWalk: true
    }
  ];

  // Extract real OSM water bodies & wetlands
  const waterBodies = [
    {
      id: 'old-ice-pond-water',
      name: 'Old Ice Pond',
      kind: 'water',
      coordinates: wayRing(188520878),
      labelPosition: [40.83520, -72.61695]
    },
    {
      id: 'north-pond-water',
      name: 'North Pond',
      kind: 'water',
      coordinates: wayRing(188520868),
      labelPosition: [40.84035, -72.61545]
    },
    {
      id: 'deer-pond-water',
      name: 'Deer Pond',
      kind: 'water',
      coordinates: wayRing(193818007),
      labelPosition: [40.84345, -72.61538]
    },
    {
      id: 'quantuck-pond-south',
      name: 'Quantuck Creek',
      kind: 'water',
      coordinates: wayRing(1013429881),
      labelPosition: [40.83140, -72.61795]
    }
  ];

  // Habitat zones (combining real OSM wetlands + ecologically mapped refuge regions)
  const habitats = [
    {
      id: 'habitat-dwarf-pines',
      name: 'Dwarf Pine Barrens',
      kind: 'dwarf-pine-barrens',
      coordinates: [
        [40.84492, -72.61992],
        [40.84527, -72.61950],
        [40.84562, -72.61998],
        [40.84675, -72.62006],
        [40.84702, -72.61995],
        [40.84748, -72.61940],
        [40.84942, -72.61696],
        [40.84942, -72.61656],
        [40.84920, -72.61625],
        [40.84552, -72.61494],
        [40.84485, -72.61750]
      ],
      labelPosition: [40.8470, -72.6172]
    },
    {
      id: 'habitat-regeneration',
      name: 'Forest Regeneration Area',
      kind: 'forest-regeneration',
      coordinates: [
        [40.8397, -72.6192],
        [40.8398, -72.6168],
        [40.8384, -72.6168],
        [40.8378, -72.6184],
        [40.8386, -72.6192]
      ],
      labelPosition: [40.8389, -72.6180]
    },
    {
      id: 'habitat-swamp-north',
      name: 'Swamp',
      kind: 'swamp',
      coordinates: wayRing(1419543456),
      labelPosition: [40.8383, -72.6157]
    },
    {
      id: 'habitat-swamp-upper',
      name: 'Swamp',
      kind: 'swamp',
      coordinates: wayRing(1419543457)
    },
    {
      id: 'habitat-swamp-bridge',
      name: 'Swamp',
      kind: 'swamp',
      coordinates: wayRing(1419544808)
    },
    {
      id: 'habitat-bog-south',
      name: 'Bog',
      kind: 'bog',
      coordinates: [
        [40.8342, -72.6188],
        [40.8341, -72.6162],
        [40.8336, -72.6163],
        [40.8336, -72.6188]
      ],
      labelPosition: [40.83385, -72.61755]
    },
    {
      id: 'habitat-fairy-dell',
      name: 'Fairy Dell Tidal Wetlands',
      kind: 'swamp',
      coordinates: wayRing(1013430381),
      labelPosition: [40.8318, -72.6169]
    },
    {
      id: 'habitat-field',
      name: 'Field',
      kind: 'field',
      coordinates: [
        [40.8359, -72.6149],
        [40.8359, -72.6140],
        [40.8349, -72.6141],
        [40.8349, -72.6150]
      ],
      labelPosition: [40.8354, -72.6145]
    }
  ];

  // Clean refuge perimeter polygon faithfully tracing the real fence line (including NW notch & bulge)
  const boundaryPolygon = [
    [40.83360, -72.61945],
    [40.83675, -72.61955],
    [40.83975, -72.61968],
    [40.84450, -72.61992],
    [40.84492, -72.61995],
    [40.84527, -72.61952],
    [40.84562, -72.62000],
    [40.84675, -72.62008],
    [40.84702, -72.61998],
    [40.84748, -72.61942],
    [40.84945, -72.61698],
    [40.84946, -72.61655],
    [40.84924, -72.61622],
    [40.84555, -72.61490],
    [40.84380, -72.61442],
    [40.83900, -72.61368],
    [40.83680, -72.61336],
    [40.83375, -72.61355],
    [40.83355, -72.61620]
  ];

  // LIRR railroad line clipped to refuge width + Quantuck Creek stream
  const decorLines = [
    {
      id: 'lirr-railroad',
      name: 'LIRR Montauk Branch',
      kind: 'railroad',
      coordinates: [
        [40.83318, -72.62040],
        [40.83333, -72.61620],
        [40.83348, -72.61260]
      ]
    },
    {
      id: 'quantuck-creek-upper',
      name: 'Quantuck Creek',
      kind: 'creek',
      coordinates: wayRing(188553439)
    },
    {
      id: 'quantuck-creek-mid',
      name: 'Quantuck Creek',
      kind: 'creek',
      coordinates: wayRing(188553435)
    },
    {
      id: 'quantuck-creek-south',
      name: 'Quantuck Creek',
      kind: 'creek',
      coordinates: [
        [40.83391, -72.61761],
        [40.83343, -72.61775],
        [40.83266, -72.61780],
        [40.83180, -72.61782],
        [40.83050, -72.61810]
      ]
    }
  ];

  const network = {
    version: '2025.12-osm',
    sourceNote:
      'Real-world GPS coordinates from OpenStreetMap contributors reconciled with Quogue Wildlife Refuge Trail Map (December 2025 with Clearing).',
    refugeCenter: { lat: 40.8405, lng: -72.6166 },
    bounds: {
      north: 40.8504,
      south: 40.8300,
      west: -72.6210,
      east: -72.6124
    },
    svgViewBox: {
      width: 560,
      height: 1120,
      padding: 28
    },
    nodes,
    segments,
    standardLoops,
    pois,
    waterBodies,
    habitats,
    boundaryPolygon,
    decorLines
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(network, null, 2) + '\n');

  // Print verification stats
  const segByPair = new Map();
  for (const s of segments) {
    segByPair.set(`${s.from}|${s.to}`, s);
    segByPair.set(`${s.to}|${s.from}`, s);
  }
  console.log(`\nWrote ${OUTPUT_PATH}`);
  console.log(`Nodes: ${nodes.length}, Segments: ${segments.length}, POIs: ${pois.length}`);
  for (const loop of standardLoops) {
    let meters = 0;
    for (let i = 0; i < loop.canonicalNodeIds.length - 1; i++) {
      const a = loop.canonicalNodeIds[i];
      const b = loop.canonicalNodeIds[i + 1];
      const seg = segByPair.get(`${a}|${b}`);
      if (!seg) {
        console.error(`ERROR: Missing segment for loop ${loop.id}: ${a} -> ${b}`);
        process.exit(1);
      }
      meters += polylineMeters(seg.waypoints);
    }
    console.log(
      `  ${loop.name.padEnd(14)} canonical=${loop.canonicalMiles.toFixed(1)} mi | real OSM=${(
        meters / 1609.344
      ).toFixed(2)} mi (${Math.round(meters)} m)`
    );
  }
}

const localPath = process.argv[2];
loadOsmJson(localPath)
  .then(main)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
