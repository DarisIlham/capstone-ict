// Pemetaan IP -> negara memakai Country.is (https://country.is), dipanggil
// langsung dari browser karena endpoint-nya mengizinkan CORS wildcard.
//
// Dua hal yang membuat kelas ini harus dipakai sebelum request apa pun:
//   1. IP privat/reserved tidak pernah ditanyakan ke API, jadi tidak buang
//      kuota dan tidak mungkin salah dibaca sebagai negara.
//   2. Hasil disimpan di localStorage, karena negara suatu IP nyaris tidak
//      berubah sementara tabel di-refresh tiap 60 detik.

const CACHE_KEY = "ip-geo-cache-v1";
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

// Country.is hanya mengembalikan kode ISO 3166-1 alpha-2, jadi nama negara
// perlu dipetakan sendiri agar tooltip tidak hanya menampilkan "DE".
export const COUNTRY_NAMES = {
  AD: "Andorra", AE: "United Arab Emirates", AF: "Afghanistan", AG: "Antigua and Barbuda",
  AI: "Anguilla", AL: "Albania", AM: "Armenia", AO: "Angola", AQ: "Antarctica",
  AR: "Argentina", AS: "American Samoa", AT: "Austria", AU: "Australia", AW: "Aruba",
  AX: "Åland Islands", AZ: "Azerbaijan", BA: "Bosnia and Herzegovina", BB: "Barbados",
  BD: "Bangladesh", BE: "Belgium", BF: "Burkina Faso", BG: "Bulgaria", BH: "Bahrain",
  BI: "Burundi", BJ: "Benin", BL: "Saint Barthélemy", BM: "Bermuda", BN: "Brunei",
  BO: "Bolivia", BQ: "Caribbean Netherlands", BR: "Brazil", BS: "Bahamas", BT: "Bhutan",
  BV: "Bouvet Island", BW: "Botswana", BY: "Belarus", BZ: "Belize", CA: "Canada",
  CC: "Cocos Islands", CD: "DR Congo", CF: "Central African Republic", CG: "Congo",
  CH: "Switzerland", CI: "Côte d'Ivoire", CK: "Cook Islands", CL: "Chile", CM: "Cameroon",
  CN: "China", CO: "Colombia", CR: "Costa Rica", CU: "Cuba", CV: "Cape Verde",
  CW: "Curaçao", CX: "Christmas Island", CY: "Cyprus", CZ: "Czechia", DE: "Germany",
  DJ: "Djibouti", DK: "Denmark", DM: "Dominica", DO: "Dominican Republic", DZ: "Algeria",
  EC: "Ecuador", EE: "Estonia", EG: "Egypt", EH: "Western Sahara", ER: "Eritrea",
  ES: "Spain", ET: "Ethiopia", FI: "Finland", FJ: "Fiji", FK: "Falkland Islands",
  FM: "Micronesia", FO: "Faroe Islands", FR: "France", GA: "Gabon", GB: "United Kingdom",
  GD: "Grenada", GE: "Georgia", GF: "French Guiana", GG: "Guernsey", GH: "Ghana",
  GI: "Gibraltar", GL: "Greenland", GM: "Gambia", GN: "Guinea", GP: "Guadeloupe",
  GQ: "Equatorial Guinea", GR: "Greece", GS: "South Georgia", GT: "Guatemala",
  GU: "Guam", GW: "Guinea-Bissau", GY: "Guyana", HK: "Hong Kong", HM: "Heard & McDonald Islands",
  HN: "Honduras", HR: "Croatia", HT: "Haiti", HU: "Hungary", ID: "Indonesia",
  IE: "Ireland", IL: "Israel", IM: "Isle of Man", IN: "India", IO: "British Indian Ocean Territory",
  IQ: "Iraq", IR: "Iran", IS: "Iceland", IT: "Italy", JE: "Jersey", JM: "Jamaica",
  JO: "Jordan", JP: "Japan", KE: "Kenya", KG: "Kyrgyzstan", KH: "Cambodia",
  KI: "Kiribati", KM: "Comoros", KN: "Saint Kitts & Nevis", KP: "North Korea",
  KR: "South Korea", KW: "Kuwait", KY: "Cayman Islands", KZ: "Kazakhstan", LA: "Laos",
  LB: "Lebanon", LC: "Saint Lucia", LI: "Liechtenstein", LK: "Sri Lanka", LR: "Liberia",
  LS: "Lesotho", LT: "Lithuania", LU: "Luxembourg", LV: "Latvia", LY: "Libya",
  MA: "Morocco", MC: "Monaco", MD: "Moldova", ME: "Montenegro", MF: "Saint Martin",
  MG: "Madagascar", MH: "Marshall Islands", MK: "North Macedonia", ML: "Mali",
  MM: "Myanmar", MN: "Mongolia", MO: "Macao", MP: "Northern Mariana Islands",
  MQ: "Martinique", MR: "Mauritania", MS: "Montserrat", MT: "Malta", MU: "Mauritius",
  MV: "Maldives", MW: "Malawi", MX: "Mexico", MY: "Malaysia", MZ: "Mozambique",
  NA: "Namibia", NC: "New Caledonia", NE: "Niger", NF: "Norfolk Island", NG: "Nigeria",
  NI: "Nicaragua", NL: "Netherlands", NO: "Norway", NP: "Nepal", NR: "Nauru",
  NU: "Niue", NZ: "New Zealand", OM: "Oman", PA: "Panama", PE: "Peru",
  PF: "French Polynesia", PG: "Papua New Guinea", PH: "Philippines", PK: "Pakistan",
  PL: "Poland", PM: "Saint Pierre & Miquelon", PN: "Pitcairn Islands", PR: "Puerto Rico",
  PS: "Palestine", PT: "Portugal", PW: "Palau", PY: "Paraguay", QA: "Qatar",
  RE: "Réunion", RO: "Romania", RS: "Serbia", RU: "Russia", RW: "Rwanda",
  SA: "Saudi Arabia", SB: "Solomon Islands", SC: "Seychelles", SD: "Sudan",
  SE: "Sweden", SG: "Singapore", SH: "Saint Helena", SI: "Slovenia", SJ: "Svalbard",
  SK: "Slovakia", SL: "Sierra Leone", SM: "San Marino", SN: "Senegal", SO: "Somalia",
  SR: "Suriname", SS: "South Sudan", ST: "São Tomé & Príncipe", SV: "El Salvador",
  SX: "Sint Maarten", SY: "Syria", SZ: "Eswatini", TC: "Turks & Caicos Islands",
  TD: "Chad", TF: "French Southern Territories", TG: "Togo", TH: "Thailand",
  TJ: "Tajikistan", TK: "Tokelau", TL: "Timor-Leste", TM: "Turkmenistan", TN: "Tunisia",
  TO: "Tonga", TR: "Türkiye", TT: "Trinidad & Tobago", TV: "Tuvalu", TW: "Taiwan",
  TZ: "Tanzania", UA: "Ukraine", UG: "Uganda", UM: "U.S. Minor Outlying Islands",
  US: "United States", UY: "Uruguay", UZ: "Uzbekistan", VA: "Vatican City",
  VC: "Saint Vincent & Grenadines", VE: "Venezuela", VG: "British Virgin Islands",
  VI: "U.S. Virgin Islands", VN: "Vietnam", VU: "Vanuatu", WF: "Wallis & Futuna",
  WS: "Samoa", YE: "Yemen", YT: "Mayotte", ZA: "South Africa", ZM: "Zambia",
  ZW: "Zimbabwe",
};

export const countryName = (iso2) => COUNTRY_NAMES[String(iso2 || "").toUpperCase()] || null;

// Kode negara -> emoji flag. Emoji flag adalah dua "regional indicator symbol",
// yaitu masing-masing huruf ASCII dikurangi 0x1F1E6.
export const countryCodeToFlag = (iso2) => {
  const code = String(iso2 || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  // Ganti emoji regional indicator dengan gambar SVG bendera agar lebih
  // terlihat jelas di UI (beberapa font menampilkan emoji dengan ukuran
  // tidak konsisten).
  return `https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.3/flags/4x3/${code.toLowerCase()}.svg`;
};

const isValidIpv4 = (ip) => {
  const parts = String(ip).split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
};

// Hanya IPv4 publik yang layak ditanyakan. IPv6 tidak dikenali country.is
// dan range privat/reserved tidak punya arti geografis.
export const isPublicIpv4 = (ip) => {
  const value = String(ip || "").trim();
  if (!isValidIpv4(value)) return false;
  const [a, b] = value.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC 1918
  if (a === 192 && b === 168) return false; // RFC 1918
  if (a === 192 && b === 0) return false; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast + reserved
  return true;
};

// ── Cache localStorage ───────────────────────────────────────────────────────
// Nilai: { code } untuk IP yang ketemu, { code: null } untuk IP yang memang
// tidak punya data (contohnya 1.1.1.1 yang dijawab HTTP 404). Yang penting
// negatif ikut dicache supaya tidak ditanyakan ulang tiap polling.
export const readGeoCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.entries) return {};
    const now = Date.now();
    const entries = {};
    Object.entries(parsed.entries).forEach(([ip, value]) => {
      if (value?.at && now - value.at < CACHE_MAX_AGE_MS) entries[ip] = value;
    });
    return entries;
  } catch {
    return {};
  }
};

export const writeGeoCache = (entries) => {
  try {
    const current = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    const merged = { ...(current.entries || {}), ...entries };
    // Buang entri paling lama kalau mulai membengkak.
    const keys = Object.keys(merged);
    const trimmed = keys.length > 2000
      ? Object.fromEntries(keys.slice(0, 2000).map((k) => [k, merged[k]]))
      : merged;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ entries: trimmed }));
  } catch {
    /* abaikan, cache hanya optimasi */
  }
};

// Satu request ke Country.is. 404 berarti IP tidak ada di database mereka,
// itu hasil valid dan bukan error.
export const fetchCountry = async (ip, signal) => {
  const res = await fetch(`https://api.country.is/${encodeURIComponent(ip)}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`country.is returned ${res.status}`);
  const body = await res.json();
  const code = String(body?.country || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
};