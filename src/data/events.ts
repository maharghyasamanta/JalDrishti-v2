import type { DisasterEvent } from './types';

/**
 * PROTOTYPE DATASET.
 *
 * Verification semantics (shown on every record in the UI):
 *  - documented: a widely-reported major event; details summarised from public
 *    reporting and the cited official body. Still cross-check before any
 *    operational use.
 *  - reported: appears in agency / media reports; specifics not fully verified.
 *  - demo: an illustrative sample record. NOT a real historical claim.
 *
 * Coordinates are real district / town locations, labelled by precision.
 * No exact inundation points, damage figures or affected-population counts are
 * invented; figures are only included where widely reported and are approximate.
 */

const V = '2026-11-07'; // catalogue review date (not official re-verification)

export const EVENTS: DisasterEvent[] = [
  // ---------------- KERALA ----------------
  {
    id: 'kl-2018-floods', state: 'Kerala', district: 'Idukki / Ernakulam / Alappuzha',
    name: 'Kerala Great Floods 2018', category: 'river-flood', date: '2018-08-08', endDate: '2018-08-29',
    location: 'Central Kerala — Periyar & Pamba basins', lat: 9.85, lon: 76.97, coordinatePrecision: 'district-level',
    description: 'Exceptionally heavy August monsoon rainfall caused widespread river flooding and landslides across central Kerala; reservoirs including Idukki were opened after reaching critical levels.',
    affected: 'Widely reported as the worst Kerala flood in a century; millions affected.', severity: 'severe',
    source: 'IMD / Kerala SDMA', sourceUrl: 'https://sdma.kerala.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'kl-2019-wayanad', state: 'Kerala', district: 'Wayanad',
    name: 'Wayanad (Puthumala) Landslide 2019', category: 'landslide', date: '2019-08-08',
    location: 'Puthumala, Meppadi, Wayanad', lat: 11.61, lon: 76.08, coordinatePrecision: 'approximate',
    description: 'Repeated August 2019 rainfall triggered landslides in Wayanad, including a major slide at Puthumala.',
    source: 'Kerala SDMA / IMD', sourceUrl: 'https://sdma.kerala.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'kl-2021-kottayam', state: 'Kerala', district: 'Kottayam / Idukki',
    name: 'Koottickal Landslides 2021', category: 'landslide', date: '2021-10-16',
    location: 'Koottickal & Kokkayar, Kottayam/Idukki', lat: 9.59, lon: 76.79, coordinatePrecision: 'approximate',
    description: 'Intense October rainfall triggered landslides and flash flooding in the high ranges of Kottayam and Idukki.',
    source: 'IMD / Kerala SDMA', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'kl-2024-wayanad', state: 'Kerala', district: 'Wayanad',
    name: 'Wayanad (Mundakkai–Chooralmala) Landslides 2024', category: 'landslide', date: '2024-07-30',
    location: 'Mundakkai, Chooralmala & Meppadi, Wayanad', lat: 11.53, lon: 76.13, coordinatePrecision: 'approximate',
    description: 'Pre-dawn rainfall-triggered debris flows struck villages near Meppadi, causing large-scale loss of life and destruction.',
    affected: 'Hundreds of casualties reported; among India’s deadliest recent landslides.', severity: 'severe',
    source: 'IMD / Kerala SDMA / NRSC', sourceUrl: 'https://www.nrsc.gov.in/', lastVerified: V, verification: 'documented',
  },

  // ---------------- TAMIL NADU ----------------
  {
    id: 'tn-2015-chennai', state: 'Tamil Nadu', district: 'Chennai / Kanchipuram / Tiruvallur',
    name: 'Chennai Floods 2015', category: 'urban-flood', date: '2015-12-01', endDate: '2015-12-05',
    location: 'Chennai metropolitan region & Adyar–Cooum basins', lat: 13.08, lon: 80.27, coordinatePrecision: 'approximate',
    description: 'Record north-east monsoon rainfall and upstream releases inundated Chennai and surrounding districts in early December 2015.',
    severity: 'severe', source: 'IMD / Tamil Nadu SDMA', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'tn-2021-rains', state: 'Tamil Nadu', district: 'Chennai / Tiruvallur',
    name: 'North Tamil Nadu Rains 2021', category: 'extreme-rainfall', date: '2021-11-08',
    location: 'Chennai, Tiruvallur & Kanchipuram', lat: 13.14, lon: 79.91, coordinatePrecision: 'district-level',
    description: 'Persistent north-east monsoon rainfall flooded low-lying areas and overwhelmed drainage across northern Tamil Nadu.',
    source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'tn-2023-michaung', state: 'Tamil Nadu', district: 'Chennai',
    name: 'Cyclone Michaung — Chennai Inundation 2023', category: 'urban-flood', date: '2023-12-04',
    location: 'Chennai & northern coastal districts', lat: 13.08, lon: 80.27, coordinatePrecision: 'approximate',
    description: 'Cyclone Michaung stalled near the north Tamil Nadu coast, dumping extreme rainfall that paralysed Chennai.',
    severity: 'major', source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'tn-2023-coast', state: 'Tamil Nadu', district: 'Tiruvallur / Kanchipuram',
    name: 'Michaung Coastal Surge 2023', category: 'coastal-flood', date: '2023-12-05',
    location: 'North Tamil Nadu coast', lat: 13.4, lon: 80.2, coordinatePrecision: 'district-level',
    description: 'Storm surge and heavy rain associated with Michaung affected coastal hamlets north of Chennai.',
    source: 'IMD / INCOIS', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'tn-2024-fengal', state: 'Tamil Nadu', district: 'Villupuram / Tiruvannamalai',
    name: 'Cyclone Fengal Rains 2024', category: 'extreme-rainfall', date: '2024-11-30',
    location: 'Northern Tamil Nadu', lat: 11.94, lon: 79.49, coordinatePrecision: 'district-level',
    description: 'Slow-moving Cyclone Fengal brought exceptional late-November rainfall to northern Tamil Nadu, flooding fields and tanks.',
    source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- UTTARAKHAND ----------------
  {
    id: 'uk-2021-chamoli', state: 'Uttarakhand', district: 'Chamoli',
    name: 'Chamoli (Rishiganga) Flash Flood 2021', category: 'flash-flood', date: '2021-02-07',
    location: 'Rishiganga–Dhauliganga confluence, Tapovan', lat: 30.55, lon: 79.58, coordinatePrecision: 'approximate',
    description: 'A rock-and-ice avalanche from a Himalayan glacier triggered a devastating flash flood along the Rishiganga and Dhauliganga, damaging hydropower projects.',
    affected: 'Large loss of life; two hydropower projects damaged.', severity: 'severe',
    source: 'NDMA / IMD / NRSC', sourceUrl: 'https://ndma.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'uk-2023-cloudburst', state: 'Uttarakhand', district: 'Rudraprayag / Tehri',
    name: 'Garhwal Cloudburst Spells 2023', category: 'cloudburst', date: '2023-08-12',
    location: 'Garhwal Himalaya', lat: 30.28, lon: 78.98, coordinatePrecision: 'district-level',
    description: 'Localised cloudbursts and intense monsoon rain caused flash floods and slope failures across Garhwal during the 2023 monsoon.',
    source: 'IMD / Uttarakhand SDMA', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- HIMACHAL PRADESH ----------------
  {
    id: 'hp-2023-rains', state: 'Himachal Pradesh', district: 'Mandi / Kullu',
    name: 'Himachal Monsoon Deluge 2023', category: 'extreme-rainfall', date: '2023-07-09', endDate: '2023-08-31',
    location: 'Mandi, Kullu & adjacent districts', lat: 31.71, lon: 76.93, coordinatePrecision: 'district-level',
    description: 'Repeated extreme-rainfall spells through the 2023 monsoon caused flash floods, landslides and heavy infrastructure loss across Himachal Pradesh.',
    severity: 'severe', source: 'IMD / Himachal SDMA', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'hp-2023-shimla', state: 'Himachal Pradesh', district: 'Shimla',
    name: 'Shimla (Summer Hill) Landslide 2023', category: 'landslide', date: '2023-08-14',
    location: 'Summer Hill, Shimla', lat: 31.1, lon: 77.15, coordinatePrecision: 'approximate',
    description: 'A rain-triggered slope collapse near Summer Hill buried a temple and nearby structures during the August 2023 deluge.',
    source: 'IMD / Himachal SDMA', sourceUrl: 'https://ndma.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- SIKKIM ----------------
  {
    id: 'sk-2023-glof', state: 'Sikkim', district: 'North Sikkim (Mangan)',
    name: 'South Lhonak Lake Outburst (Teesta) 2023', category: 'glof', date: '2023-10-04',
    location: 'South Lhonak Lake → Teesta valley; Chungthang', lat: 27.6, lon: 88.6, coordinatePrecision: 'approximate',
    description: 'A glacial lake outburst from South Lhonak Lake sent a flood wave down the Teesta, destroying the Teesta III hydropower dam at Chungthang and damaging downstream assets.',
    severity: 'severe', source: 'NRSC / CWC / NDMA', sourceUrl: 'https://www.nrsc.gov.in/', lastVerified: V, verification: 'documented',
  },

  // ---------------- ASSAM ----------------
  {
    id: 'as-2022-cachar', state: 'Assam', district: 'Cachar (Barak valley)',
    name: 'Barak Valley Floods 2022', category: 'river-flood', date: '2022-05-18', endDate: '2022-06-20',
    location: 'Silchar & Barak valley, southern Assam', lat: 24.83, lon: 92.78, coordinatePrecision: 'approximate',
    description: 'Pre-monsoon and monsoon rainfall flooded the Barak valley, submerging large parts of Silchar and surrounding areas in May–June 2022.',
    severity: 'major', source: 'CWC / Assam SDMA', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'as-2020-brahmaputra', state: 'Assam', district: 'Multiple (Brahmaputra valley)',
    name: 'Brahmaputra Flood Wave 2020', category: 'river-flood', date: '2020-07-15',
    location: 'Central Brahmaputra valley & Kaziranga region', lat: 26.5, lon: 92.6, coordinatePrecision: 'district-level',
    description: 'Seasonal Brahmaputra flooding inundated riverside districts and parts of Kaziranga during the 2020 monsoon.',
    source: 'CWC / Assam SDMA', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'as-2024-floods', state: 'Assam', district: 'Dibrugarh / Morigaon',
    name: 'Assam Monsoon Floods 2024', category: 'river-flood', date: '2024-06-28',
    location: 'Upper & central Assam districts', lat: 27.0, lon: 94.2, coordinatePrecision: 'district-level',
    description: 'Multiple flood waves during the 2024 monsoon affected districts along the Brahmaputra and its tributaries.',
    source: 'Assam SDMA / CWC', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- BIAR ----------------
  {
    id: 'br-2019-kosi', state: 'Bihar', district: 'Supaul / Madhubani (Kosi basin)',
    name: 'North Bihar (Kosi) Floods 2019', category: 'river-flood', date: '2019-07-13',
    location: 'Kosi basin, north Bihar', lat: 26.3, lon: 86.3, coordinatePrecision: 'district-level',
    description: 'Monsoon inflow and the shifting Kosi channel flooded north Bihar districts, a recurring pattern in the Kosi megafan.',
    source: 'CWC / Bihar SDMA', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'br-2020-embankment', state: 'Bihar', district: 'Supaul (Kosi embankment)',
    name: 'Kosi Embankment Breach (reported) 2020', category: 'embankment-breach', date: '2020-08-02',
    location: 'Kosi embankment, north Bihar', lat: 26.28, lon: 86.6, coordinatePrecision: 'district-level',
    description: 'Embankment stress and reported breaches along the Kosi during high monsoon flow inundated adjoining villages. Exact breach point requires official confirmation.',
    source: 'Bihar Water Resources / CWC', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- WEST BENGAL ----------------
  {
    id: 'wb-2020-amphan', state: 'West Bengal', district: 'North & South 24 Parganas / Kolkata',
    name: 'Cyclone Amphan 2020', category: 'coastal-flood', date: '2020-05-20',
    location: 'Sundarbans & coastal Bengal', lat: 22.3, lon: 88.6, coordinatePrecision: 'district-level',
    description: 'Super Cyclone Amphan drove a large storm surge into the Sundarbans and coastal Bengal, with widespread inundation and wind damage.',
    severity: 'severe', source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'wb-2021-yaas', state: 'West Bengal', district: 'East Midnapore',
    name: 'Cyclone Yaas 2021', category: 'coastal-flood', date: '2021-05-26',
    location: 'Digha–Midnapore coast', lat: 21.7, lon: 87.7, coordinatePrecision: 'district-level',
    description: 'Cyclone Yaas caused coastal inundation and embankment overtopping along the south Bengal and north Odisha coast.',
    source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- ODISHA ----------------
  {
    id: 'od-2019-fani', state: 'Odisha', district: 'Puri / Khordha',
    name: 'Cyclone Fani 2019', category: 'coastal-flood', date: '2019-05-03',
    location: 'Puri–Khordha–Cuttack coast', lat: 19.81, lon: 85.83, coordinatePrecision: 'approximate',
    description: 'Extremely Severe Cyclonic Storm Fani made landfall near Puri, bringing storm surge, extreme wind and coastal flooding.',
    severity: 'severe', source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'documented',
  },

  // ---------------- ANDHRA PRADESH / TELANGANA ----------------
  {
    id: 'ap-2022-godavari', state: 'Andhra Pradesh', district: 'East & West Godavari',
    name: 'Godavari Floods 2022', category: 'river-flood', date: '2022-07-16',
    location: 'Godavari basin — Rajahmundry / Polavaram reach', lat: 17.0, lon: 81.78, coordinatePrecision: 'district-level',
    description: 'Heavy upstream rainfall and large inflows swelled the Godavari, flooding riverside villages in the Godavari districts.',
    source: 'CWC / AP SDMA', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'ts-2020-hyderabad', state: 'Telangana', district: 'Hyderabad',
    name: 'Hyderabad Urban Floods 2020', category: 'urban-flood', date: '2020-10-13',
    location: 'Hyderabad & surrounding low-lying colonies', lat: 17.38, lon: 78.49, coordinatePrecision: 'approximate',
    description: 'An intense October rainfall episode inundated large parts of Hyderabad, submerging settlements around lakes and drains.',
    severity: 'major', source: 'IMD / GHMC', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'ts-2022-godavari', state: 'Telangana', district: 'Bhadradri Kothagudem',
    name: 'Godavari (Bhadrachalam) Floods 2022', category: 'river-flood', date: '2022-07-16',
    location: 'Bhadrachalam reach of the Godavari', lat: 17.67, lon: 80.89, coordinatePrecision: 'approximate',
    description: 'High Godavari inflows flooded the Bhadrachalam area, submerging low-lying habitations during July 2022.',
    source: 'CWC / Telangana SDMA', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- MAHARASHTRA ----------------
  {
    id: 'mh-2017-mumbai', state: 'Maharashtra', district: 'Mumbai',
    name: 'Mumbai Deluge 2017', category: 'urban-flood', date: '2017-08-29',
    location: 'Mumbai Metropolitan Region', lat: 19.07, lon: 72.87, coordinatePrecision: 'approximate',
    description: 'An extreme August rainfall event paralysed Mumbai with severe waterlogging and transport disruption.',
    source: 'IMD / BMC', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'mh-2021-raigad', state: 'Maharashtra', district: 'Raigad',
    name: 'Raigad (Mahad/Taliye) Landslides 2021', category: 'landslide', date: '2021-07-22',
    location: 'Mahad & Taliye, Raigad', lat: 18.08, lon: 73.42, coordinatePrecision: 'approximate',
    description: 'Very heavy Konkan rainfall triggered landslides, including a destructive slide at Taliye village near Mahad.',
    severity: 'major', source: 'IMD / Maharashtra SDMA', sourceUrl: 'https://ndma.gov.in/', lastVerified: V, verification: 'documented',
  },

  // ---------------- KARNATAKA ----------------
  {
    id: 'ka-2018-kodagu', state: 'Karnataka', district: 'Kodagu',
    name: 'Kodagu Landslides 2018', category: 'landslide', date: '2018-08-15',
    location: 'Madikeri & Kodagu hills', lat: 12.42, lon: 75.74, coordinatePrecision: 'approximate',
    description: 'Exceptional August rainfall triggered numerous landslides and flooding in Kodagu (Coorg).',
    source: 'IMD / Karnataka SDMA', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'ka-2019-belagavi', state: 'Karnataka', district: 'Belagavi',
    name: 'Belagavi Floods 2019', category: 'river-flood', date: '2019-08-08',
    location: 'Belagavi & Krishna basin districts', lat: 15.85, lon: 74.5, coordinatePrecision: 'district-level',
    description: 'Heavy rainfall and river inflow flooded parts of north Karnataka during the 2019 monsoon.',
    source: 'CWC / Karnataka SDMA', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'ka-2022-bengaluru', state: 'Karnataka', district: 'Bengaluru Urban',
    name: 'Bengaluru Urban Floods 2022', category: 'urban-flood', date: '2022-09-05',
    location: 'Bengaluru — low-lying IT corridor & lake overflow zones', lat: 12.97, lon: 77.59, coordinatePrecision: 'approximate',
    description: 'Intense September rainfall overwhelmed Bengaluru’s drainage, flooding roads, layouts and lakeside areas.',
    source: 'IMD / BBMP', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'documented',
  },

  // ---------------- GUJARAT ----------------
  {
    id: 'gj-2017-floods', state: 'Gujarat', district: 'Banaskantha / Patan',
    name: 'North Gujarat Floods 2017', category: 'river-flood', date: '2017-07-24',
    location: 'Banaskantha & Patan (Banās basin)', lat: 24.17, lon: 72.43, coordinatePrecision: 'district-level',
    description: 'Very heavy July rainfall caused flash flooding and river flooding across north Gujarat districts.',
    severity: 'major', source: 'IMD / Gujarat SDMA', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'documented',
  },

  // ---------------- GOA ----------------
  {
    id: 'ga-2021-rains', state: 'Goa', district: 'North Goa',
    name: 'Goa Monsoon Flooding 2021', category: 'extreme-rainfall', date: '2021-07-17',
    location: 'North Goa low-lying areas', lat: 15.59, lon: 73.81, coordinatePrecision: 'district-level',
    description: 'Heavy monsoon rainfall caused waterlogging and localised flooding across parts of Goa.',
    source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- DELHI / NORTH PLAINS ----------------
  {
    id: 'dl-2023-yamuna', state: 'Delhi', district: 'Delhi (Yamuna floodplain)',
    name: 'Yamuna Floods, Delhi 2023', category: 'river-flood', date: '2023-07-13',
    location: 'Yamuna floodplain, Delhi', lat: 28.66, lon: 77.23, coordinatePrecision: 'approximate',
    description: 'The Yamuna rose past its record danger level, inundating floodplain settlements and prompting large evacuations.',
    severity: 'major', source: 'CWC / IMD', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'hr-2023-yamuna', state: 'Haryana', district: 'Yamunanagar / Karnal',
    name: 'Yamuna Basin Floods, Haryana 2023', category: 'river-flood', date: '2023-07-14',
    location: 'Yamuna riverside, eastern Haryana', lat: 30.13, lon: 77.28, coordinatePrecision: 'district-level',
    description: 'High Yamuna discharge and local rainfall flooded riverside areas of eastern Haryana.',
    source: 'CWC', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'pb-2023-ghaggar', state: 'Punjab', district: 'Patiala / Sangrur',
    name: 'Ghaggar Floods, Punjab 2023', category: 'river-flood', date: '2023-07-10',
    location: 'Ghaggar basin, south Punjab', lat: 30.25, lon: 75.84, coordinatePrecision: 'district-level',
    description: 'Heavy rain and Ghaggar overflow flooded fields and villages across southern Punjab districts.',
    source: 'CWC / Punjab SDMA', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'ch-2023-urban', state: 'Chandigarh', district: 'Chandigarh',
    name: 'Chandigarh Waterlogging 2023', category: 'urban-flood', date: '2023-07-11',
    location: 'Chandigarh city', lat: 30.73, lon: 76.78, coordinatePrecision: 'approximate',
    description: 'Intense monsoon rainfall caused significant waterlogging on arterial roads and low-lying sectors.',
    source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- UTTAR PRADESH / RAJASTHAN / MP ----------------
  {
    id: 'up-2023-east', state: 'Uttar Pradesh', district: 'Ballia / Gorakhpur',
    name: 'East UP (Ghaghara–Ganga) Floods 2023', category: 'river-flood', date: '2023-08-01',
    location: 'Eastern Uttar Pradesh river basins', lat: 25.76, lon: 84.15, coordinatePrecision: 'district-level',
    description: 'Monsoon inflow flooded riverside villages across eastern Uttar Pradesh districts.',
    source: 'CWC / UP SDMA', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'rj-2024-barmer', state: 'Rajasthan', district: 'Barmer',
    name: 'West Rajasthan Flash Floods 2024', category: 'flash-flood', date: '2024-08-25',
    location: 'Barmer & western Rajasthan', lat: 25.75, lon: 71.39, coordinatePrecision: 'district-level',
    description: 'Unusual late-monsoon downpours caused flash flooding in the arid western Rajasthan districts.',
    source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'mp-2023-vidisha', state: 'Madhya Pradesh', district: 'Vidisha (Ganj Basoda)',
    name: 'Ganj Basoda Floods 2023', category: 'extreme-rainfall', date: '2023-09-17',
    location: 'Ganj Basoda, Vidisha', lat: 23.85, lon: 78.0, coordinatePrecision: 'approximate',
    description: 'A late-monsoon extreme-rainfall spell flooded Ganj Basoda town and surrounding areas.',
    source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- JAMMU & KASHMIR / LADAKH ----------------
  {
    id: 'jk-2022-amarnath', state: 'Jammu and Kashmir', district: 'Anantnag (Pahalgam)',
    name: 'Amarnath Cloudburst & Flash Flood 2022', category: 'cloudburst', date: '2022-07-08',
    location: 'Near Amarnath cave, Pahalgam axis', lat: 34.21, lon: 75.5, coordinatePrecision: 'approximate',
    description: 'A cloudburst near the Amarnath cave area triggered a flash flood that struck pilgrim camps and temporary shelters.',
    severity: 'major', source: 'IMD / J&K SDMA', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'documented',
  },
  {
    id: 'la-2024-leh', state: 'Ladakh', district: 'Leh',
    name: 'Leh Flash Floods 2024', category: 'flash-flood', date: '2024-08-06',
    location: 'Leh & surrounding valleys', lat: 34.15, lon: 77.58, coordinatePrecision: 'district-level',
    description: 'Localised intense rainfall caused flash flooding and mudflows in the Leh region during August 2024.',
    source: 'IMD / LAHDC', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- NORTHEAST ----------------
  {
    id: 'ml-2022-rain', state: 'Meghalaya', district: 'East Khasi Hills (Sohra)',
    name: 'Meghalaya Record Rains 2022', category: 'extreme-rainfall', date: '2022-06-17',
    location: 'Sohra / Mawsynram belt', lat: 25.28, lon: 91.73, coordinatePrecision: 'district-level',
    description: 'The Cherrapunji–Mawsynram belt recorded exceptional June rainfall, causing localised flooding and slope failures.',
    source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'ar-2022-landslide', state: 'Arunachal Pradesh', district: 'Papum Pare (Itanagar)',
    name: 'Itanagar Landslides 2022', category: 'landslide', date: '2022-06-10',
    location: 'Itanagar capital region', lat: 27.08, lon: 93.61, coordinatePrecision: 'district-level',
    description: 'Monsoon rainfall triggered landslides and road-cut collapses around the Itanagar capital region.',
    source: 'IMD / Arunachal SDMA', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'tr-2024-floods', state: 'Tripura', district: 'Gomati / West Tripura',
    name: 'Tripura Floods 2024', category: 'river-flood', date: '2024-08-21',
    location: 'Gomati & adjacent districts', lat: 23.5, lon: 91.5, coordinatePrecision: 'district-level',
    description: 'Exceptional August rainfall caused severe flooding across Tripura, worsened by upstream reservoir releases.',
    severity: 'major', source: 'IMD / CWC / Tripura SDMA', sourceUrl: 'https://cwc.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- UTs (reported) ----------------
  {
    id: 'py-2020-nivar', state: 'Puducherry', district: 'Puducherry',
    name: 'Cyclone Nivar — Puducherry 2020', category: 'coastal-flood', date: '2020-11-25',
    location: 'Puducherry coast', lat: 11.93, lon: 79.83, coordinatePrecision: 'approximate',
    description: 'Cyclone Nivar brought heavy rain and coastal inundation to the Puducherry region.',
    source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },
  {
    id: 'dn-2021-daman', state: 'Dadra and Nagar Haveli and Daman and Diu', district: 'Daman',
    name: 'Daman Monsoon Flooding 2021', category: 'coastal-flood', date: '2021-07-17',
    location: 'Daman coast', lat: 20.42, lon: 72.85, coordinatePrecision: 'approximate',
    description: 'Heavy monsoon rainfall and high tide caused coastal and urban flooding in Daman.',
    source: 'IMD', sourceUrl: 'https://mausam.imd.gov.in/', lastVerified: V, verification: 'reported',
  },

  // ---------------- DEMO RECORDS (clearly labelled) ----------------
  // Illustrative coverage for regions/categories without a confident verified
  // record in this prototype. These are NOT historical claims.
  {
    id: 'demo-cg', state: 'Chhattisgarh', district: 'Bastar (Jagdalpur)',
    name: 'Demo — Bastar Monsoon Flooding', category: 'river-flood', date: '2022-08-10',
    location: 'Indravati basin (illustrative)', lat: 19.07, lon: 82.03, coordinatePrecision: 'district-level',
    description: 'Illustrative demo record representing seasonal monsoon flooding. Replace with a verified SDMA record before use.',
    source: 'Demo dataset', sourceUrl: '', lastVerified: V, verification: 'demo',
  },
  {
    id: 'demo-jh', state: 'Jharkhand', district: 'Ranchi',
    name: 'Demo — Ranchi Urban Waterlogging', category: 'urban-flood', date: '2023-07-20',
    location: 'Ranchi city (illustrative)', lat: 23.34, lon: 85.31, coordinatePrecision: 'district-level',
    description: 'Illustrative demo record for prototype coverage. Not a verified historical event.',
    source: 'Demo dataset', sourceUrl: '', lastVerified: V, verification: 'demo',
  },
  {
    id: 'demo-mn', state: 'Manipur', district: 'Imphal West',
    name: 'Demo — Imphal Valley Flooding', category: 'river-flood', date: '2022-06-25',
    location: 'Imphal valley (illustrative)', lat: 24.82, lon: 93.94, coordinatePrecision: 'district-level',
    description: 'Illustrative demo record for prototype coverage. Not a verified historical event.',
    source: 'Demo dataset', sourceUrl: '', lastVerified: V, verification: 'demo',
  },
  {
    id: 'demo-mz', state: 'Mizoram', district: 'Aizawl',
    name: 'Demo — Aizawl Landslide', category: 'landslide', date: '2023-06-14',
    location: 'Aizawl slopes (illustrative)', lat: 23.73, lon: 92.72, coordinatePrecision: 'district-level',
    description: 'Illustrative demo record for prototype coverage. Not a verified historical event.',
    source: 'Demo dataset', sourceUrl: '', lastVerified: V, verification: 'demo',
  },
  {
    id: 'demo-nl', state: 'Nagaland', district: 'Kohima',
    name: 'Demo — Kohima Landslide', category: 'landslide', date: '2023-07-05',
    location: 'Kohima slopes (illustrative)', lat: 25.67, lon: 94.11, coordinatePrecision: 'district-level',
    description: 'Illustrative demo record for prototype coverage. Not a verified historical event.',
    source: 'Demo dataset', sourceUrl: '', lastVerified: V, verification: 'demo',
  },
  {
    id: 'demo-an', state: 'Andaman and Nicobar Islands', district: 'South Andaman (Port Blair)',
    name: 'Demo — Andaman Coastal Inundation', category: 'coastal-flood', date: '2021-12-04',
    location: 'Port Blair coast (illustrative)', lat: 11.62, lon: 92.73, coordinatePrecision: 'district-level',
    description: 'Illustrative demo record for prototype coverage. Not a verified historical event.',
    source: 'Demo dataset', sourceUrl: '', lastVerified: V, verification: 'demo',
  },
  {
    id: 'demo-ld', state: 'Lakshadweep', district: 'Kavaratti',
    name: 'Demo — Lakshadweep Coastal Surge', category: 'coastal-flood', date: '2022-05-15',
    location: 'Kavaratti island (illustrative)', lat: 10.57, lon: 72.64, coordinatePrecision: 'district-level',
    description: 'Illustrative demo record for prototype coverage. Not a verified historical event.',
    source: 'Demo dataset', sourceUrl: '', lastVerified: V, verification: 'demo',
  },
  {
    id: 'demo-dam', state: 'Uttarakhand', district: 'Chamoli (illustrative)',
    name: 'Demo — Dam-breach Scenario', category: 'dam-failure', date: '2020-09-12',
    location: 'Illustrative reservoir location', lat: 30.4, lon: 79.33, coordinatePrecision: 'district-level',
    description: 'Illustrative demo record representing a dam-failure category. Not a real historical event; replace with a verified CWC record.',
    source: 'Demo dataset', sourceUrl: '', lastVerified: V, verification: 'demo',
  },
];