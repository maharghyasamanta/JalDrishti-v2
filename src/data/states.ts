import type { StateMeta } from './types';

// All 28 states + 8 Union Territories (post-2019/2020 boundaries).
// `name` matches properties.st_nm in public/data/india-states.geojson.
export const STATES: StateMeta[] = [
  { name: 'Andhra Pradesh', code: 'AP', type: 'State', region: 'South', capital: 'Amaravati' },
  { name: 'Arunachal Pradesh', code: 'AR', type: 'State', region: 'Northeast', capital: 'Itanagar' },
  { name: 'Assam', code: 'AS', type: 'State', region: 'Northeast', capital: 'Dispur' },
  { name: 'Bihar', code: 'BR', type: 'State', region: 'East', capital: 'Patna' },
  { name: 'Chhattisgarh', code: 'CG', type: 'State', region: 'Central', capital: 'Raipur' },
  { name: 'Goa', code: 'GA', type: 'State', region: 'West', capital: 'Panaji' },
  { name: 'Gujarat', code: 'GJ', type: 'State', region: 'West', capital: 'Gandhinagar' },
  { name: 'Haryana', code: 'HR', type: 'State', region: 'North', capital: 'Chandigarh' },
  { name: 'Himachal Pradesh', code: 'HP', type: 'State', region: 'North', capital: 'Shimla' },
  { name: 'Jharkhand', code: 'JH', type: 'State', region: 'East', capital: 'Ranchi' },
  { name: 'Karnataka', code: 'KA', type: 'State', region: 'South', capital: 'Bengaluru' },
  { name: 'Kerala', code: 'KL', type: 'State', region: 'South', capital: 'Thiruvananthapuram' },
  { name: 'Madhya Pradesh', code: 'MP', type: 'State', region: 'Central', capital: 'Bhopal' },
  { name: 'Maharashtra', code: 'MH', type: 'State', region: 'West', capital: 'Mumbai' },
  { name: 'Manipur', code: 'MN', type: 'State', region: 'Northeast', capital: 'Imphal' },
  { name: 'Meghalaya', code: 'ML', type: 'State', region: 'Northeast', capital: 'Shillong' },
  { name: 'Mizoram', code: 'MZ', type: 'State', region: 'Northeast', capital: 'Aizawl' },
  { name: 'Nagaland', code: 'NL', type: 'State', region: 'Northeast', capital: 'Kohima' },
  { name: 'Odisha', code: 'OD', type: 'State', region: 'East', capital: 'Bhubaneswar' },
  { name: 'Punjab', code: 'PB', type: 'State', region: 'North', capital: 'Chandigarh' },
  { name: 'Rajasthan', code: 'RJ', type: 'State', region: 'North', capital: 'Jaipur' },
  { name: 'Sikkim', code: 'SK', type: 'State', region: 'Northeast', capital: 'Gangtok' },
  { name: 'Tamil Nadu', code: 'TN', type: 'State', region: 'South', capital: 'Chennai' },
  { name: 'Telangana', code: 'TS', type: 'State', region: 'South', capital: 'Hyderabad' },
  { name: 'Tripura', code: 'TR', type: 'State', region: 'Northeast', capital: 'Agartala' },
  { name: 'Uttar Pradesh', code: 'UP', type: 'State', region: 'North', capital: 'Lucknow' },
  { name: 'Uttarakhand', code: 'UK', type: 'State', region: 'North', capital: 'Dehradun' },
  { name: 'West Bengal', code: 'WB', type: 'State', region: 'East', capital: 'Kolkata' },
  { name: 'Andaman and Nicobar Islands', code: 'AN', type: 'Union Territory', region: 'Islands', capital: 'Port Blair' },
  { name: 'Chandigarh', code: 'CH', type: 'Union Territory', region: 'North', capital: 'Chandigarh' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: 'DN', type: 'Union Territory', region: 'West', capital: 'Daman' },
  { name: 'Delhi', code: 'DL', type: 'Union Territory', region: 'North', capital: 'New Delhi' },
  { name: 'Jammu and Kashmir', code: 'JK', type: 'Union Territory', region: 'North', capital: 'Srinagar / Jammu' },
  { name: 'Ladakh', code: 'LA', type: 'Union Territory', region: 'North', capital: 'Leh' },
  { name: 'Lakshadweep', code: 'LD', type: 'Union Territory', region: 'Islands', capital: 'Kavaratti' },
  { name: 'Puducherry', code: 'PY', type: 'Union Territory', region: 'South', capital: 'Puducherry' },
];

export const STATE_MAP: Record<string, StateMeta> = Object.fromEntries(
  STATES.map((s) => [s.name, s]),
);

export const stateMeta = (name: string): StateMeta | undefined => STATE_MAP[name];