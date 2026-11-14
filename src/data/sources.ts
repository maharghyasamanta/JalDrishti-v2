export interface DataSource {
  abbr: string;
  name: string;
  role: string;
  url: string;
}

// Official providers referenced by the methodology. These are the bodies a
// production version of this platform would ingest verified records from.
export const DATA_SOURCES: DataSource[] = [
  { abbr: 'IMD', name: 'India Meteorological Department', role: 'Rainfall and flood-related warnings, cyclone track & intensity bulletins.', url: 'https://mausam.imd.gov.in/' },
  { abbr: 'CWC', name: 'Central Water Commission', role: 'River level & flood forecasting, reservoir / dam inflow and breach reports.', url: 'https://cwc.gov.in/' },
  { abbr: 'NRSC', name: 'National Remote Sensing Centre (ISRO)', role: 'Satellite-derived flood inundation mapping and damage assessment.', url: 'https://www.nrsc.gov.in/' },
  { abbr: 'NDEM', name: 'National Database for Emergency Management', role: 'Multi-hazard geospatial database and disaster event layers (ISRO).', url: 'https://ndem.nrsc.gov.in/' },
  { abbr: 'NDMA', name: 'National Disaster Management Authority', role: 'National guidelines, situation reports and documented event summaries.', url: 'https://ndma.gov.in/' },
  { abbr: 'SDMAs', name: 'State Disaster Management Authorities', role: 'State / district incident reports, affected-population and relief data.', url: 'https://ndma.gov.in/Governance/SDMA' },
];