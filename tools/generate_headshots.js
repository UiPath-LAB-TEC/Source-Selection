const { createAvatar } = require('@dicebear/core')
const { avataaars } = require('@dicebear/collection')
const fs = require('fs')
const base = { style: ['circle'], mouth: ['smile'], eyes: ['default'], eyebrows: ['defaultNatural'], facialHairProbability: 0, accessoriesProbability: 0, topProbability: 100 }
const people = {
  co:         { backgroundColor: ['1d3a8a'], top: ['bob'], hairColor: ['724133'], skinColor: ['edb98a'], clothing: ['blazerAndShirt'], clothesColor: ['25557c'] },
  evaluator1: { backgroundColor: ['2a78d6'], top: ['shortFlat'], hairColor: ['2c1b18'], skinColor: ['d08b5b'], clothing: ['collarAndSweater'], clothesColor: ['3c4f5c'], facialHair: ['beardLight'], facialHairProbability: 100, facialHairColor: ['2c1b18'] },
  evaluator2: { backgroundColor: ['0e7490'], top: ['straight01'], hairColor: ['2c1b18'], skinColor: ['ae5d29'], clothing: ['blazerAndSweater'], clothesColor: ['262e33'] },
  evaluator3: { backgroundColor: ['7c3aed'], top: ['theCaesar'], hairColor: ['2c1b18'], skinColor: ['614335'], clothing: ['shirtCrewNeck'], clothesColor: ['5199e4'], accessories: ['prescription02'], accessoriesProbability: 100 },
  chair:      { backgroundColor: ['b45309'], top: ['bun'], hairColor: ['a55728'], skinColor: ['ffdbb4'], clothing: ['blazerAndShirt'], clothesColor: ['929598'], accessories: ['prescription01'], accessoriesProbability: 100 },
  ssa:        { backgroundColor: ['be123c'], top: ['sides'], hairColor: ['e8e1e1'], skinColor: ['edb98a'], clothing: ['blazerAndShirt'], clothesColor: ['262e33'], facialHair: ['beardMedium'], facialHairProbability: 100, facialHairColor: ['e8e1e1'] },
}
const out = process.argv[2] || 'out'
fs.mkdirSync(out, { recursive: true })
let html = '<body style="background:#1f2937;display:flex;gap:24px;padding:24px">'
for (const [id, o] of Object.entries(people)) {
  const svg = createAvatar(avataaars, { ...base, ...o, seed: id }).toString()
  fs.writeFileSync(`${out}/${id}.svg`, svg)
  html += `<figure style="color:#fff;font:14px sans-serif;text-align:center"><img src="${id}.svg" width="120"><figcaption>${id}</figcaption></figure>`
}
fs.writeFileSync(`${out}/index.html`, html)
