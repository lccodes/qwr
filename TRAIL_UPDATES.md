# Updating Trail Closures & Park Alerts (Admin Guide)

All dynamic trail openings, closures, and facility notices live in **one simple file**:

- [`public/data/trail-status.json`](public/data/trail-status.json)

You **never** need to touch map coordinates, routing logic, or TypeScript code. When you mark a segment `"closed"`, the app automatically:
1. Highlights that trail corridor in hatched red on the map with barrier markers.
2. Detours any affected standard blaze loop (**Green 0.8**, **Yellow 1.4**, **Blue 2.5**, **Red 3.1**) onto open trails and updates its mileage.
3. Prevents **"Take Me To..."** custom walks and **"Back to Parking"** routes from entering closed trails.

When you flip a segment back to `"open"`, all standard loops and custom routes restore automatically!

---

## Quick 30-Second Update Steps

1. Open [`public/data/trail-status.json`](public/data/trail-status.json) (in GitHub's web editor or your local editor).
2. Update `"lastUpdated"` to today's date (`YYYY-MM-DD`).
3. Under `"segments"`, change `"status"` to `"open"`, `"closed"`, or `"caution"`:
   ```json
   "west-fence-south-inner": {
     "name": "West Trail (Old Ice Pond West Side — Inner)",
     "status": "open",
     "updated": "2026-04-15"
   }
   ```
   *(Any segment omitted from `"segments"` automatically defaults to `"open"`.)*
4. If all closures are cleared, set `"globalAlert.active"` to `false`.
5. Run the safety validator before deploying:
   ```bash
   npm run validate:trails
   ```
6. Commit & push — visitors' phones automatically refresh `trail-status.json` next time they have signal (and continue working offline with the cached copy).

---

## Trail Segment ID Reference

### Southwest / Old Ice Pond West Zone (Dec 2025 Pine Beetle Area)
| Segment ID | Trail Section | Canonical Loops |
|---|---|---|
| `old-ice-pond-nw-spur` | Old Ice Pond Northwest Connector (Bridge to West Fence) | Green, Yellow |
| `west-fence-mid-south` | West Fence Trail (Regeneration Area to Old Ice Pond Spur) | Blue, Red |
| `west-fence-spur-link` | West Fence Spur Link | Red |
| `west-fence-south-inner` | West Trail (Old Ice Pond West Side — Inner) | Green, Yellow, Red |
| `west-fence-south-outer` | West Fence Trail (Old Ice Pond West Side — Outer) | Blue |

### Southern Hub, Bog & Fairy Dell
| Segment ID | Trail Section | Canonical Loops |
|---|---|---|
| `entrance-to-split` | Main Trailhead (Parking to Animal Complex Split) | All 4 loops |
| `green-pond-east` | Old Ice Pond East Trail (Inner Green Trail) | Green |
| `east-amphitheater-field` | East Trail (Amphitheater, Restrooms & Field) | Yellow, Blue, Red |
| `east-bridge-connector` | East Fence to Bridge Connector | Yellow, Red |
| `bridge-crossing` | Old Ice Pond Bridge Crossing | Green, Red |
| `bog-south-trail` | South Bog Trail (SW Corner to Bog Boardwalk) | All 4 loops |
| `bog-boardwalk` | Bog Boardwalk (South of Old Ice Pond) | All 4 loops |
| `nature-center-to-parking` | Nature Center to Parking Path | All 4 loops |
| `fairy-dell-connector` | Path to Fairy Dell Boardwalk (Across Old Country Rd & LIRR) | Custom |
| `fairy-dell-boardwalk` | Fairy Dell Boardwalk (Quantuck Creek Wetlands) | Custom |

### Central, Swamp, North Pond & Regeneration Area
| Segment ID | Trail Section | Canonical Loops |
|---|---|---|
| `swamp-east-south` | East Swamp Trail (Bridge to Mid-Swamp) | Yellow |
| `swamp-east-north` | East Swamp Trail (Mid-Swamp to North Pond) | Yellow |
| `east-fence-south-to-north-pond` | East Fence Trail (Mid-South to North Pond) | Blue |
| `east-swamp-shortcut` | East Fence to Swamp Connector | Shortcut |
| `north-pond-east-link` | North Pond East Spur (East Fence to North Pond) | Red |
| `north-pond-crossing` | North Pond South Shore Crossing | Yellow, Red |
| `bridge-to-regen-se` | Central Trail (Bridge West to Regeneration Clearing) | Yellow, Red |
| `regen-se-to-north-pond-west` | Central Trail (Regeneration Clearing to North Pond West) | Yellow, Red |
| `regeneration-new-trail` | **New Trail** (Forest Regeneration & Eastern Bluebird Nestboxes) | Bypass / Custom |
| `regen-north-trail` | Regeneration North Trail (North Pond West to West Trail) | Red |
| `regen-to-west-fence` | Regeneration Trail to West Fence Link | Red |

### Northern Refuge, Deer Pond & Dwarf Pine Barrens
| Segment ID | Trail Section | Canonical Loops |
|---|---|---|
| `east-fence-north-pond-to-deer` | East Fence Trail (North Pond to Deer Pond) | Blue, Red |
| `deer-pond-overlook-spur` | Deer Pond Scenic Overlook Spur | Overlook |
| `east-fence-deer-to-cross` | East Fence Trail (Deer Pond to North Cross Trail) | Blue, Red |
| `east-fence-dwarf-pine-north` | East Fence Trail (Dwarf Pine Barrens to North Apex) | Blue, Red |
| `nw-fence-dwarf-pine` | Northwest Fence Trail (Dwarf Pine Barrens) | Blue, Red |
| `interior-deer-pond-west` | Interior Pine Barrens Trail (West of Deer Pond) | Red |
| `interior-cross-link` | Dwarf Pine Crossroad Link | Red |
| `interior-dwarf-pine-nw` | Interior Dwarf Pine Trail (Crossroad to NW Fence) | Red |
| `north-cross-east` | Northern Cross Trail (East Half) | Cross |
| `north-cross-west` | Northern Cross Trail (West Half) | Cross |
| `west-fence-north-upper` | West Fence Trail (Dwarf Pines North Half) | Blue |
| `west-fence-north-lower` | West Fence Trail (North Cross to Regeneration Area) | Blue |
