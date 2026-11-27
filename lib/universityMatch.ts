// Typo-tolerant university matching used by the sign-up form.
// No dependencies: normalises text, understands acronyms (NUB, BUET, BRACU...) and
// scores names with Damerau-Levenshtein, Jaro-Winkler and token overlap.

export type UniversityLike = { id: string; name: string };
export type UniversityMatch<T extends UniversityLike> = { university: T; score: number; reason: "exact" | "acronym" | "similar" };

export const STRONG_MATCH = 0.88;
export const POSSIBLE_MATCH = 0.66;

/** True when the best match is clear enough to pick automatically. */
export function isConfidentMatch<T extends UniversityLike>(matches: UniversityMatch<T>[]): boolean {
  const [top, second] = matches;
  if (!top) return false;
  if (top.score >= STRONG_MATCH) return true;
  return top.score >= 0.8 && top.score - (second?.score ?? 0) >= 0.1;
}

const FILLER = new Set(["the", "of", "and", "for", "at", "in", "a"]);
// Words that mean "a different kind of institution": typing one that the candidate lacks is a strong signal it is not the same place.
const TYPE_WORDS = new Set(["college", "institute", "school", "academy", "polytechnic", "madrasa", "cadet"]);
const UNIVERSITY_WORDS = new Set(["university", "universty", "universtiy", "univercity", "univarsity", "universiti", "uni", "univ", "varsity"]);

export function normalizeUniversity(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(input: string): string[] {
  return normalizeUniversity(input).split(" ").filter(Boolean);
}

/** Words that carry the identity of the name ("university", "of", "the" removed). */
function coreWords(input: string): string[] {
  return words(input).filter(word => !FILLER.has(word) && !UNIVERSITY_WORDS.has(word));
}

/** Optimal string alignment distance (handles swapped letters like "norhtern"). */
function osa(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function editSimilarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  return 1 - osa(a, b) / Math.max(a.length, b.length);
}

function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - range);
    const end = Math.min(b.length - 1, i + range);
    for (let j = start; j <= end; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  // short words (e.g. "du", "nub") must match closely; do not forgive typos in 2-letter tokens
  if (Math.min(a.length, b.length) <= 2) return 0;
  return Math.max(editSimilarity(a, b), jaroWinkler(a, b) - 0.04);
}

/** Possible acronyms for a university name: NUB, BUET, BRACU, DU, NSU ... */
function acronyms(name: string): string[] {
  const all = words(name).filter(word => !FILLER.has(word));
  const core = all.filter(word => !UNIVERSITY_WORDS.has(word));
  const initials = (list: string[]) => list.map(word => word[0]).join("");
  const set = new Set<string>();
  set.add(initials(all));
  if (core.length) {
    set.add(initials(core));
    set.add(initials(core) + "u");
    set.add("u" + initials(core));
    set.add(core.join(""));
    set.add(core.join("") + "u");
    if (core.length === 1) set.add(core[0].slice(0, 4));
  }
  return [...set].filter(item => item.length >= 2);
}

function scoreOne(inputNorm: string, inputCore: string[], inputCompact: string, name: string): { score: number; reason: "exact" | "acronym" | "similar" } {
  const nameNorm = normalizeUniversity(name);
  if (inputNorm === nameNorm) return { score: 1, reason: "exact" };

  const nameCore = coreWords(name);
  const nameCoreJoined = nameCore.join(" ");
  const inputCoreJoined = inputCore.join(" ");

  // acronym typed as a single token ("nub", "buet", "bracu")
  const compactInput = inputCompact;
  if (compactInput.length >= 2 && compactInput.length <= 8 && !inputNorm.includes(" ")) {
    if (acronyms(name).includes(compactInput)) return { score: 0.96, reason: "acronym" };
  }

  if (!inputCoreJoined) return { score: editSimilarity(inputNorm, nameNorm) * 0.6, reason: "similar" };

  const compactCore = inputCoreJoined.replace(/ /g, "");
  const compactNameCore = nameCoreJoined.replace(/ /g, "");

  // whole-string similarity on identity words only (typos, missing spaces)
  let best = Math.max(
    editSimilarity(compactCore, compactNameCore),
    jaroWinkler(compactCore, compactNameCore) - 0.03,
  );

  // token overlap: every typed word finds its closest word in the name and vice versa
  if (inputCore.length && nameCore.length) {
    const cover = (from: string[], to: string[]) => from.reduce((sum, word) => sum + Math.max(...to.map(other => wordSimilarity(word, other))), 0) / from.length;
    const precision = cover(inputCore, nameCore);
    const recall = cover(nameCore, inputCore);
    const f = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    best = Math.max(best, f);
    // typed a clear prefix/subset of the name ("north south", "northern") -> good but not exact
    if (precision >= 0.92 && recall < 0.92) best = Math.max(best, 0.7 + 0.18 * recall);
  }

  // user typed a long-enough fragment of the name
  if (compactCore.length >= 5 && compactNameCore.includes(compactCore)) best = Math.max(best, 0.74);

  // typed a distinguishing word the candidate does not have -> penalise
  if (inputCore.length >= 2 && nameCore.length) {
    const unmatched = inputCore.filter(word => Math.max(...nameCore.map(other => wordSimilarity(word, other))) < 0.6).length;
    if (unmatched > 0) best *= 1 - 0.12 * unmatched;
  }
  const nameWords = new Set(words(name));
  if (inputNorm.split(" ").some(word => TYPE_WORDS.has(word) && !nameWords.has(word))) best *= 0.6;
  return { score: Math.min(0.99, Math.max(0, best)), reason: "similar" };
}

export function matchUniversities<T extends UniversityLike>(input: string, universities: T[], limit = 4): UniversityMatch<T>[] {
  const inputNorm = normalizeUniversity(input);
  if (inputNorm.length < 2) return [];
  const inputCore = coreWords(input);
  const inputCompact = inputNorm.replace(/ /g, "");
  return universities
    .map(university => ({ university, ...scoreOne(inputNorm, inputCore, inputCompact, university.name) }))
    .filter(match => match.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Tidy a typed name before saving it as a new university. */
export function prettifyUniversityName(input: string): string {
  const clean = input.trim().replace(/\s+/g, " ");
  if (!clean) return clean;
  const hasLower = /[a-z]/.test(clean);
  const hasUpper = /[A-Z]/.test(clean);
  if (hasLower && hasUpper) return clean; // user already capitalised it
  return clean
    .toLowerCase()
    .split(" ")
    .map((word, index) => (FILLER.has(word) && index > 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}
