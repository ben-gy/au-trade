// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Domain glossary. Assume the reader knows nothing about trade statistics —
 * every jargon term in the UI gets an inline `ℹ` that opens one of these.
 */
export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  sitc: {
    term: 'SITC',
    definition:
      'The Standard International Trade Classification — the UN system the ABS uses to sort goods. ' +
      'It is a tree: one digit is a broad section (like "Crude materials"), two digits a division ' +
      '("Metalliferous ores"), three digits a group ("Iron ore and concentrates"). This site lets you ' +
      'move up and down that tree.',
  },
  merchandise: {
    term: 'Merchandise trade',
    definition:
      'Physical goods crossing the border — ore, gas, meat, cars, phones. It excludes services such as ' +
      'tourism, education and consulting, which are counted separately and are not shown on this site. ' +
      'Education alone is one of Australia\'s largest exports, so the totals here are not the whole ' +
      'trade picture.',
  },
  balance: {
    term: 'Trade balance',
    definition:
      'Exports minus imports. A positive balance (a surplus) means Australia sold more to that partner ' +
      'than it bought; negative (a deficit) means the reverse. A deficit is not automatically bad — it ' +
      'often just reflects what a country makes versus what it needs.',
  },
  confidentialised: {
    term: 'Confidentialised',
    definition:
      'When so few businesses trade a particular good that naming the destination country would reveal ' +
      'an individual company\'s commercial dealings, the ABS withholds the country and files the value ' +
      'under "No Country Details". The total is still correct — only the split is hidden. This happens ' +
      'far more at detailed commodity level than at the national total.',
  },
  ncd: {
    term: 'No Country Details',
    definition:
      'The bucket the ABS uses for trade whose destination has been withheld for confidentiality. It is ' +
      'not a place. This site never ranks it as a trading partner, and every concentration figure is ' +
      'calculated over published destinations only, with the withheld share shown alongside.',
  },
  concentration: {
    term: 'Concentration',
    definition:
      'How much of an export goes to its single largest buyer. If 72% of iron ore goes to one country, ' +
      'that export is highly concentrated: demand from that one buyer sets the price and the volume. ' +
      'Low concentration means many buyers and more room to absorb losing one.',
  },
  hhi: {
    term: 'HHI',
    definition:
      'The Herfindahl–Hirschman Index — add up the square of each buyer\'s share. It runs from near 0 ' +
      '(hundreds of small buyers) to 1 (a single buyer takes everything). Above about 0.25 is considered ' +
      'highly concentrated. It captures the whole spread of buyers, not just the biggest one.',
  },
  rollingYear: {
    term: 'Rolling 12 months',
    definition:
      'All headline figures cover the most recent twelve months of data rather than a calendar or ' +
      'financial year. This keeps the totals complete — a part-finished financial year would make every ' +
      'partner look smaller than it is — and means the numbers move every month.',
  },
  reExports: {
    term: 'Re-exports',
    definition:
      'Goods that were imported into Australia and then sent out again largely unchanged. They count in ' +
      'export totals but are not Australian production.',
  },
  sections: {
    term: 'Section',
    definition:
      'The top level of the SITC tree — ten broad families of goods, from "Food and live animals" (0) ' +
      'through to "Commodities not classified elsewhere" (9). Section 9 holds non-monetary gold and the ' +
      'confidential items bucket, which is why it looks surprisingly large.',
  },
  sitc98: {
    term: 'Confidential items',
    definition:
      'SITC 98, "combined confidential items". Not a product — it is where the ABS puts goods whose ' +
      'identity itself is commercially sensitive. It is one of the largest lines in Australia\'s export ' +
      'statistics, and this site flags it everywhere rather than presenting it as a real commodity.',
  },
  stateOrigin: {
    term: 'State of origin',
    definition:
      'The state the goods were produced or dispatched from — not the port they left through. Trade with ' +
      'no state attribution is reported separately, so state figures do not quite sum to the national ' +
      'total.',
  },
  fob: {
    term: 'Free on board',
    definition:
      'Export values are measured "free on board": the value of the goods as they are loaded onto the ' +
      'ship or aircraft in Australia, excluding international freight and insurance. Imports are valued ' +
      'the same way at the foreign port, which is why import figures do not include the cost of getting ' +
      'goods here.',
  },
};

export function lookupTerm(key: string): GlossaryEntry | null {
  return GLOSSARY[key] ?? null;
}

/**
 * Inline glossary link. `gloss('hhi')` renders the term with an ℹ affordance;
 * `gloss('hhi', 'how concentrated')` uses custom link text.
 */
export function gloss(key: string, label?: string): string {
  const entry = GLOSSARY[key];
  if (!entry) return label ?? key;
  const text = label ?? entry.term;
  return `<span class="glossary-link" data-term="${key}" role="button" tabindex="0" aria-label="Define ${entry.term}">${text}<span class="gloss-icon" aria-hidden="true">ℹ</span></span>`;
}
