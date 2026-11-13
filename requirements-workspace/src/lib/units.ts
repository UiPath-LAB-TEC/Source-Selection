/** Units of issue for a product line, most used first. The stored value is the word, as the documents print it ("120 each"). */
export const UNITS = [
  'each', 'set', 'kit', 'pair', 'box', 'case', 'pack', 'package', 'dozen', 'roll', 'ream', 'lot', 'license',
  'pound', 'gallon', 'foot', 'yard',
] as const

/** Other ways an agent or a person writes a unit, mapped to the word above. */
const ALIASES: Record<string, string> = {
  ea: 'each', unit: 'each', units: 'each', piece: 'each', pieces: 'each', pc: 'each', pcs: 'each', item: 'each', items: 'each',
  se: 'set', kt: 'kit', pr: 'pair', bx: 'box', boxes: 'box', cs: 'case', pk: 'pack', pg: 'package', pkg: 'package',
  dz: 'dozen', doz: 'dozen', ro: 'roll', rl: 'roll', rm: 'ream', lt: 'lot', lic: 'license', licence: 'license', licenses: 'license',
  lb: 'pound', lbs: 'pound', gal: 'gallon', gl: 'gallon', ft: 'foot', feet: 'foot', yd: 'yard', yds: 'yard',
}

/** The unit as one of UNITS when it is one, however it was written; anything else unchanged, so nothing typed is lost. */
export function unitOf(raw: unknown): string {
  const t = String(raw ?? '').trim()
  const k = t.toLowerCase().replace(/[.\s]+$/g, '')
  if (!k) return 'each'
  if ((UNITS as readonly string[]).includes(k)) return k
  if (ALIASES[k]) return ALIASES[k]
  const one = k.endsWith('es') && (UNITS as readonly string[]).includes(k.slice(0, -2)) ? k.slice(0, -2) : k.endsWith('s') ? k.slice(0, -1) : k
  return (UNITS as readonly string[]).includes(one) ? one : t
}
