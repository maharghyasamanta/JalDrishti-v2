import type { CategoryKey, CategoryMeta } from './types';

// Marker colours follow the brief's legend (blue floods, cyan flash floods,
// red dam/embankment, orange rainfall/cloudburst, purple coastal, violet GLOF).
export const CATEGORIES: CategoryMeta[] = [
  { key: 'river-flood', label: 'River Floods', short: 'River Flood', color: '#3B74D6', description: 'Rivers overtopping banks during sustained monsoon inflow.' },
  { key: 'urban-flood', label: 'Urban Flooding', short: 'Urban Flood', color: '#5B8DEF', description: 'Drainage overwhelm and waterlogging in built-up areas.' },
  { key: 'flash-flood', label: 'Flash Floods', short: 'Flash Flood', color: '#22B8C4', description: 'Rapid-onset flooding from intense upstream rainfall.' },
  { key: 'extreme-rainfall', label: 'Extreme Rainfall', short: 'Extreme Rain', color: '#F4B544', description: 'Exceptionally heavy precipitation events.' },
  { key: 'cloudburst', label: 'Cloudbursts', short: 'Cloudburst', color: '#F0872E', description: 'Localised, very high-intensity rainfall over a small area.' },
  { key: 'dam-failure', label: 'Dam Failures & Dam-related Flooding', short: 'Dam Failure', color: '#E05252', description: 'Dam breach or flood release causing downstream inundation.' },
  { key: 'embankment-breach', label: 'Embankment Breaches', short: 'Embankment', color: '#C6303A', description: 'Failure of river / coastal embankments.' },
  { key: 'coastal-flood', label: 'Coastal Flooding & Storm Surges', short: 'Coastal / Surge', color: '#8B5CF6', description: 'Cyclone-driven surge and coastal inundation.' },
  { key: 'glof', label: 'Glacial Lake Outburst Floods (GLOFs)', short: 'GLOF', color: '#A855F7', description: 'Sudden release of a glacially dammed lake.' },
  { key: 'landslide', label: 'Rainfall-triggered Landslides', short: 'Landslide', color: '#9A6B3F', description: 'Slope failures driven by saturated ground.' },
];

export const CATEGORY_MAP: Record<CategoryKey, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, CategoryMeta>;

export const categoryLabel = (k: CategoryKey) => CATEGORY_MAP[k]?.label ?? k;
export const categoryColor = (k: CategoryKey) => CATEGORY_MAP[k]?.color ?? '#5c6b7e';