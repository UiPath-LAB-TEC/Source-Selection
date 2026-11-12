/**
 * Dev preview only (?preview): canned agent answers, so the builder can be walked through without a tenant or a
 * deployed agent. Never used in a build that signs in.
 */
import type { DocKind, Question, RequirementRow, Section, Spec } from './types'

const wait = async (onState: (s: string) => void) => {
  onState('Pending')
  await new Promise((r) => setTimeout(r, 500))
  onState('Running')
  await new Promise((r) => setTimeout(r, 1100))
}

const TABLET_QUESTIONS = [
  { id: 'software', question: 'What software must the tablets run?', why: 'The apps decide the operating system and processor. Naming the app is fine; naming a tablet brand isn’t.', options: ['Browser-based apps only', 'Windows maintenance apps', 'Android apps'] },
  { id: 'environment', question: 'What drops, weather and temperatures must they survive on the flight line?', why: 'These become salient characteristics, so any brand that meets them can compete.', options: ['4 ft drop, IP65', '6 ft drop, IP67', 'MIL-STD-810H, any compliant model'] },
  { id: 'brand', question: 'Is there a reason only the Toughbook will work?', why: 'A brand name needs a written justification. Most needs are met by “brand name or equal” with salient characteristics.', options: ['It’s just what we use today', 'Our docks and spares fit only that model', 'Only that model is approved for our network'] },
  { id: 'network', question: 'Will the tablets join the base network or hold controlled information?', why: 'Connected devices must meet DoD mobile device security requirements, which narrows the models.', options: ['Yes, the network and CUI', 'Wi-Fi only, no CUI', 'Not sure yet'] },
  { id: 'delivery', question: 'When and where do you need them?', why: 'Delivery terms go in the purchase description and drive the schedule.', options: ['All within 60 days, one base', 'Phased over 6 months'] },
  { id: 'extras', question: 'Do you need accessories, spares or a longer warranty?', why: 'Accessories and warranty years change the estimate and the line items.', options: ['Hand strap, stylus, 3-year warranty', 'Vehicle docks as well', 'Standard warranty is fine'] },
]

const TABLET_ROUND_2 = [
  { id: 'batteries', question: 'How many spare batteries per tablet?', why: 'Hot-swap batteries keep a tablet working a full shift; spares are their own line item.', options: ['One per tablet', 'One per two tablets', 'None'] },
  { id: 'acceptance', question: 'Who receives and inspects them when they arrive?', why: 'The purchase description names where inspection and acceptance happen.', options: ['Squadron supply, at destination', 'Base communications squadron'] },
]

const tabletSpec = (answered: Question[]): Partial<Spec> => {
  const a = (id: string) => answered.find((q) => q.id === id)?.answer ?? ''
  return {
    items: [
      { name: 'Rugged tablet', quantity: 120, unit: 'each', characteristics: [
        '10 to 12 in. touch display, readable in direct sunlight (at least 800 nits)',
        'Works with gloves and when wet',
        'Hot-swappable battery: at least 8 hours per battery',
        a('environment') || 'Meets MIL-STD-810H drop, vibration and temperature tests',
        a('software') === 'Windows maintenance apps' ? 'Runs current Windows maintenance applications' : 'Runs a current, supported operating system and browser',
      ] },
      { name: 'Spare battery', quantity: 120, unit: 'each', characteristics: ['Hot-swappable with the tablet above'] },
    ],
    standards: ['MIL-STD-810H', 'Revised Section 508 Standards', 'Trade Agreements Act'],
    deliveryPlace: 'Aircraft maintenance squadron, [installation]',
    deliveryDate: a('delivery') || 'Within 60 days after award',
    warranty: a('extras').includes('3-year') ? '3-year warranty covering accidental damage' : 'Manufacturer’s standard warranty',
    packaging: 'Commercial packaging, marked with the order number',
    inspection: 'At destination, by the squadron',
    support: 'Warranty repair or replacement within 10 business days',
  }
}

/** The analyst's answer for the example needs: rugged tablets (a product) in detail, anything else generically. */
export async function mockAnalysis(r: RequirementRow, answered: Question[], onState: (s: string) => void) {
  await wait(onState)
  const round = answered.length ? 2 : 1
  if (/tablet/i.test(r.Need)) {
    return {
      kind: 'Product', title: 'Rugged tablets for flight line maintainers',
      summary: 'About 120 rugged tablets for maintainers to read technical orders and record work on the flight line. A commercial product with several makers; the Toughbook named in the need should become “brand name or equal” unless only it will work.',
      pscCode: '7E20', pscName: 'IT and telecom, end user: laptops, workstations and mobile devices',
      naicsCode: '334111', naicsName: 'Electronic computer manufacturing', sizeStandard: '1,250 employees',
      commercialLikely: true, commercialReason: 'Rugged tablets are sold to the public in the configurations described.',
      valueLow: 420_000, valueHigh: 610_000, valueBasis: '120 tablets at $3,200 to $4,500, plus spare batteries and a longer warranty.',
      flags: [
        { id: 'brandName', label: 'A brand is named', reason: 'The need mentions Panasonic Toughbook.' },
        { id: 'ict', label: 'Information technology', reason: 'Tablets are ICT, so Section 508 applies.' },
        { id: 'cui', label: 'Controlled information', reason: 'Technical orders are often controlled; the devices must protect that data.' },
      ],
      questions: round === 1 ? TABLET_QUESTIONS : TABLET_ROUND_2,
      requirement: tabletSpec(answered),
    }
  }
  const service = /support|service|maint(ain|enance) (of|for)|help desk|staff|training|analy/i.test(r.Need)
  return {
    kind: service ? 'Service' : 'Product', title: r.Title || r.Need.split(/[.\n]/)[0].slice(0, 70),
    summary: 'A first read of the need. Answer the questions so the draft can fill in.',
    pscCode: '', pscName: '', naicsCode: '', naicsName: '', sizeStandard: '',
    commercialLikely: true, commercialReason: 'Likely available commercially; market research will confirm.',
    valueLow: 0, valueHigh: 0, valueBasis: 'Not enough detail yet.',
    flags: [],
    questions: round === 1 ? [
      { id: 'what', question: service ? 'What result do you need the contractor to achieve?' : 'What must the item do?', why: 'The requirement states outcomes and characteristics, not a method or a brand.', options: [] },
      { id: 'howmuch', question: service ? 'How many people, sites or hours does it cover?' : 'How many do you need?', why: 'Quantity drives the estimate and the procedures that apply.', options: [] },
      { id: 'when', question: 'When do you need it, and where?', why: 'Delivery or performance dates set the schedule.', options: [] },
    ] : [],
    requirement: service ? { objective: r.Need.slice(0, 300) } : { items: [{ name: 'Item', quantity: 1, unit: 'each', characteristics: [] }] },
  }
}

const bullets = (xs: string[]) => xs.filter(Boolean).map((x) => `- ${x}`).join('\n')

/** The drafter's answer: sections built from the structured requirement. */
export async function mockDraft(kind: DocKind, r: RequirementRow, s: Spec, onState: (x: string) => void) {
  await wait(onState)
  const items = s.items.map((i) => `${i.quantity} ${i.unit} · ${i.name}`)
  const chars = s.items.flatMap((i) => i.characteristics.map((c) => `${i.name}: ${c}`))
  const docs: Partial<Record<DocKind, Section[]>> = {
    purchaseDescription: [
      { heading: '1. Background', text: `${r.Office || 'The requiring activity'} needs ${r.Title.toLowerCase()}. ${r.Need.split('.')[0]}.` },
      { heading: '2. Items', text: bullets(items) },
      { heading: '3. Salient characteristics', text: `Each item must meet every characteristic below. Any make or model that meets them is acceptable.\n${bullets(chars)}` },
      { heading: '4. Standards', text: bullets(s.standards) },
      { heading: '5. Delivery', text: `Deliver to ${s.deliveryPlace || '[place]'}, ${s.deliveryDate || '[date]'}. ${s.packaging}` },
      { heading: '6. Warranty and support', text: `${s.warranty}. ${s.support}.` },
      { heading: '7. Inspection and acceptance', text: s.inspection || 'At destination.' },
    ],
    pws: [
      { heading: '1. Objective', text: s.objective || r.Need },
      { heading: '2. Scope', text: s.scope || '[Scope]' },
      { heading: '3. Tasks', text: bullets(s.tasks) || '[Tasks]' },
      { heading: '4. Performance standards', text: bullets(s.performanceStandards.map((p) => `${p.standard} (acceptable quality level: ${p.aql})`)) || '[Standards]' },
      { heading: '5. Deliverables', text: bullets(s.deliverables.map((d) => `${d.name}, ${d.due}`)) || '[Deliverables]' },
      { heading: '6. Place and period of performance', text: `${s.placeOfPerformance || '[Place]'}; ${s.periodOfPerformance || '[Period]'}.` },
    ],
    qasp: [
      { heading: '1. Purpose', text: 'How the government will check that the contractor meets each performance standard in the PWS.' },
      { heading: '2. Surveillance', text: bullets(s.performanceStandards.map((p) => `${p.standard}: ${p.method}, acceptable quality level ${p.aql}`)) || '[Standards]' },
    ],
    brandName: [
      { heading: '1. What is named', text: 'Panasonic Toughbook, as written in the need.' },
      { heading: '2. Why only it will do', text: '[The program office’s reason. If the reason is only that it is in use today, use “brand name or equal” with the salient characteristics instead.]' },
      { heading: '3. Market research', text: '[Which other makers were checked, and why they can’t meet the need.]' },
    ],
    section508: [
      { heading: '1. Determination', text: 'The tablets are information and communication technology. The Revised 508 Standards apply to the hardware and the software delivered with it.' },
      { heading: '2. What the offer must show', text: 'An Accessibility Conformance Report (VPAT 2.x, Section 508 edition) for the model offered.' },
    ],
  }
  return { title: `${r.Title}: ${kind}`, sections: docs[kind] ?? [{ heading: 'Draft', text: '[Draft]' }], openQuestions: kind === 'brandName' ? ['Is there a reason only the named brand will work?'] : [] }
}
