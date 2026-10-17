/**
 * BuildingCatalog.js
 * 
 * 6 Post-Apocalyptic Building Archetypes:
 * 1. Brutalist Block (4-5 floors, collapsed slabs, broken columns, rebar)
 * 2. Low-Rise Apartment (3 floors, balcony slabs, window grid, collapsed corner)
 * 3. Warehouse (single story, wide, corrugated roof partly collapsed, big open front door)
 * 4. Half-Collapsed Office Tower (6 floors, sheared top, exposed slabs, rebar)
 * 5. Concrete Bunker (squat, thick walls, one doorway, antenna mast)
 * 6. Gas Station (canopy on pillars, small shop with door, rusted pumps)
 * 
 * Budget: <= 1,500 tris at LOD0, ~40% at LOD1, merged per material (<= 4 draws).
 */

export const BUILDING_ARCHETYPES = [
  {
    id: 1,
    key: 'brutalist',
    name: 'Brutalist Block',
    description: 'Heavily reinforced brutalist block with collapsed slabs and exposed rebar'
  },
  {
    id: 2,
    key: 'apartment',
    name: 'Low-Rise Apartment',
    description: '3-story apartment complex with exterior balcony slabs and sheared corner'
  },
  {
    id: 3,
    key: 'warehouse',
    name: 'Industrial Warehouse',
    description: 'Single-story wide depot with collapsed corrugated roof and wide open doorway'
  },
  {
    id: 4,
    key: 'office',
    name: 'Sheared Office Tower',
    description: '6-story corporate tower sheared diagonally with dangling rebar'
  },
  {
    id: 5,
    key: 'bunker',
    name: 'Concrete Military Bunker',
    description: 'Squat fortified bunker with 0.8m blast walls, single doorway, and antenna mast'
  },
  {
    id: 6,
    key: 'gas_station',
    name: 'Derelict Gas Station',
    description: 'Service canopy on pillars with rusted fuel pumps and attached convenience shop'
  }
];

export function getArchetypeByKey(key) {
  return BUILDING_ARCHETYPES.find((a) => a.key === key) || BUILDING_ARCHETYPES[0];
}

export function getArchetypeById(id) {
  const num = Number(id);
  return BUILDING_ARCHETYPES.find((a) => a.id === num) || BUILDING_ARCHETYPES[0];
}
