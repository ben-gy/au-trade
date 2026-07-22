// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// ABS merchandise-trade country code → ISO 3166-1 alpha-3, for joining to
// Natural Earth polygons.
//
// Most of the 261 ABS codes match Natural Earth on a normalised name. This
// table covers the ones that don't: ABS uses its own spellings ("Cote
// d'Ivoire"), its own historical groupings ("Belgium and Luxembourg", a single
// ABS code for two countries), and its own political phrasing ("China
// (excludes SARs and Taiwan)"). Everything here was checked against the
// codelist rather than guessed.
//
// A code mapped to null has no polygon at this scale on purpose — it is a
// pseudo-destination, a defunct state, or a territory Natural Earth does not
// carry. Those partners still rank and chart; they just don't shade a country.

export const ABS_TO_ISO3 = {
  // --- major partners whose names don't match ---
  CHIN: 'CHN', // China (excludes SARs and Taiwan)
  HONG: 'HKG', // Hong Kong (SAR of China)
  MACA: 'MAC', // Macau (SAR of China)
  RKOR: 'KOR', // Korea, Republic of (South)
  KRDR: 'PRK', // Korea, Democratic People's Republic of (North)
  TAIW: 'TWN',
  UK: 'GBR', // United Kingdom, Channel Islands and Isle of Man, nfd
  USA: 'USA',
  VIET: 'VNM',
  LAOS: 'LAO',
  BRUN: 'BRN',
  MYAN: 'MMR',
  CAMB: 'KHM',
  KAMP: 'KHM', // Kampuchea — historical code for Cambodia
  TIMO: 'TLS',
  PNG: 'PNG',
  SOLI: 'SLB',
  VANU: 'VUT',
  NCAL: 'NCL',
  FIJI: 'FJI',
  WSAM: 'WSM',
  ASAM: 'ASM',
  TONG: 'TON',
  KIRI: 'KIR',
  TUVA: 'TUV',
  NAUR: 'NRU',
  PALA: 'PLW',
  MICR: 'FSM',
  MARS: 'MHL',
  GUAM: 'GUM',
  NORF: 'NFK',
  CHRI: 'CXR', // Christmas Island
  COCO: 'CCK', // Cocos (Keeling) Islands
  COOK: 'COK',
  NIUE: 'NIU',
  PLYN: 'PYF', // French Polynesia
  WALL: 'WLF',

  // --- Europe ---
  BLGM: 'BEL', // "Belgium and Luxembourg" — a single ABS code; shaded as Belgium
  NETH: 'NLD',
  GERM: 'DEU',
  GDR: 'DEU', // German Democratic Rep (historical)
  SWTZ: 'CHE',
  ASTA: 'AUT',
  DENM: 'DNK',
  SWDN: 'SWE',
  NORW: 'NOR',
  FINL: 'FIN',
  ICEL: 'ISL',
  IREL: 'IRL',
  SPAN: 'ESP',
  PORT: 'PRT',
  ITAL: 'ITA',
  GREC: 'GRC',
  TURK: 'TUR',
  RUSS: 'RUS',
  USSR: 'RUS', // Former USSR, nfd (historical)
  UKRN: 'UKR',
  BELA: 'BLR',
  MOLD: 'MDA',
  POLD: 'POL',
  CZRE: 'CZE',
  CZEC: 'CZE', // Czechoslovakia, nfd (historical)
  SLOV: 'SVK',
  SLVN: 'SVN',
  HUNG: 'HUN',
  ROMA: 'ROU',
  BULG: 'BGR',
  CROA: 'HRV',
  BOSN: 'BIH',
  SERB: 'SRB',
  YUGO: 'SRB', // Serbia and Montenegro, nfd (historical)
  MTNG: 'MNE',
  MACE: 'MKD',
  ALBA: 'ALB',
  ESTO: 'EST',
  LATV: 'LVA',
  LITH: 'LTU',
  MALT: 'MLT',
  CYPR: 'CYP',
  LUXM: 'LUX',
  MONA: 'MCO',
  ANDO: 'AND',
  LIEC: 'LIE',
  SMAR: 'SMR',
  VATI: 'VAT',
  GIBR: 'GIB',
  FARO: 'FRO',
  GRLD: 'GRL',

  // --- Middle East / Africa ---
  UARE: 'ARE',
  SAUD: 'SAU',
  BHRN: 'BHR',
  QATA: 'QAT',
  KUWA: 'KWT',
  OMAN: 'OMN',
  YEMN: 'YEM',
  IRAN: 'IRN',
  IRAQ: 'IRQ',
  ISRA: 'ISR',
  JORD: 'JOR',
  LEBA: 'LBN',
  SYRA: 'SYR',
  EGYP: 'EGY',
  LIBY: 'LBY',
  TUNI: 'TUN',
  ALGR: 'DZA',
  MORO: 'MAR',
  SUDA: 'SDN',
  SSUD: 'SSD',
  ETHI: 'ETH',
  ERIT: 'ERI',
  DJIB: 'DJI',
  SOMA: 'SOM',
  KENY: 'KEN',
  UGAN: 'UGA',
  TANZ: 'TZA',
  RWAN: 'RWA',
  BURU: 'BDI',
  ZAIR: 'COD', // Congo, Democratic Republic of
  COBR: 'COG', // Congo, Republic of
  ANGO: 'AGO',
  ZAMB: 'ZMB',
  ZIMB: 'ZWE',
  MALW: 'MWI',
  MOZA: 'MOZ',
  MADG: 'MDG',
  MAUR: 'MUS',
  SEYC: 'SYC',
  CMRO: 'COM',
  SAFR: 'ZAF',
  NAMI: 'NAM',
  BOTS: 'BWA',
  ZULU: 'SWZ',
  LESO: 'LSO',
  NIGE: 'NGA',
  NIGR: 'NER',
  GHAN: 'GHA',
  IVOR: 'CIV', // Cote d'Ivoire
  SENE: 'SEN',
  MALI: 'MLI',
  BURK: 'BFA',
  GUIN: 'GIN',
  SLEO: 'SLE',
  LIBE: 'LBR',
  TOGO: 'TGO',
  BENI: 'BEN',
  GAMB: 'GMB',
  GUBI: 'GNB',
  CVER: 'CPV', // Cabo Verde
  MAUA: 'MRT',
  CHAD: 'TCD',
  CAFR: 'CAF',
  GABO: 'GAB',
  EQGU: 'GNQ',
  STPR: 'STP',

  // --- Asia ---
  JAP: 'JPN',
  INIA: 'IND',
  INDO: 'IDN',
  MALA: 'MYS',
  SING: 'SGP',
  THAI: 'THA',
  PHIL: 'PHL',
  BANG: 'BGD',
  PAKI: 'PAK',
  SRIL: 'LKA',
  NEPA: 'NPL',
  BHUT: 'BTN',
  MALD: 'MDV',
  AFGH: 'AFG',
  MONG: 'MNG',
  KAZK: 'KAZ',
  UZBK: 'UZB',
  TURM: 'TKM',
  KYRG: 'KGZ',
  TAJK: 'TJK',
  AZER: 'AZE',
  ARMN: 'ARM',
  GEOG: 'GEO',

  // --- Americas ---
  CANA: 'CAN',
  MEXI: 'MEX',
  BRAZ: 'BRA',
  ARGE: 'ARG',
  CHIL: 'CHL',
  PERU: 'PER',
  COLM: 'COL',
  VENZ: 'VEN',
  ECUA: 'ECU',
  BOLI: 'BOL',
  PARA: 'PRY',
  URUG: 'URY',
  GUYA: 'GUY',
  SURI: 'SUR',
  FRGU: 'GUF', // French Guiana
  PANA: 'PAN',
  CORI: 'CRI',
  NICA: 'NIC',
  HOND: 'HND',
  ELSA: 'SLV',
  GUAT: 'GTM',
  BELZ: 'BLZ',
  CUBA: 'CUB',
  DOMR: 'DOM',
  HAIT: 'HTI',
  JAMA: 'JAM',
  TRIN: 'TTO',
  BAHA: 'BHS',
  BARB: 'BRB',
  AGUA: 'ATG',
  DMCA: 'DMA',
  GNDA: 'GRD',
  SLUC: 'LCA',
  SVIN: 'VCT',
  SKIT: 'KNA',
  BMDA: 'BMU',
  CAYM: 'CYM',
  ANGA: 'AIA',
  BVIS: 'VGB',
  ARUB: 'ABW',
  PURI: 'PRI',
  NZ: 'NZL',

  // --- deliberately unmapped: not places, or no polygon at this scale ---
  NCD: null,  // No Country Details — confidentialised destination
  CNAV: null, // Country not available
  UNKN: null, // Unknown
  SHIP: null, // Ship and Aircraft Stores
  ORDR: null, // For Orders
  IWAS: null, // International Waters
  CONF: null, // Country Conf Alumina
  AFZ: null,  // Australian Fishing Zone
  AUST: null, // Australia (re-imports)
  ANCA: null, // Australian Antarctic Territory
  ANTC: null, // Antarctica, nfd
  FSAT: null, // Adelie Land (France)
  BIOT: null, // Southern and East Africa, nec
  USOI: null, // Polynesia (excludes Hawaii), nec
  JSIS: null, // Johnston and Sand Islands
  FWIN: null, // French Antilles
  ANTI: null, // Netherlands Antilles, nfd
  FSTE: null, // French Southern Territories
};

/** Normalise a name for fuzzy matching against Natural Earth. */
export function normaliseName(s) {
  return String(s)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/,\s*(nfd|nec)\b/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve an ABS country code to ISO3, preferring the curated table and
 * falling back to a normalised-name match against the Natural Earth index.
 * Returns null when the partner has no polygon (which is a fact to report, not
 * an error to swallow).
 */
export function resolveIso3(code, absName, neIndex) {
  if (Object.prototype.hasOwnProperty.call(ABS_TO_ISO3, code)) return ABS_TO_ISO3[code];
  return neIndex.get(normaliseName(absName)) ?? null;
}
