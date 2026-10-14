/** Extract plain text from a PDF in the browser (pdf.js), page by page. Text files pass through. */
import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

export async function fileText(file: File): Promise<{ text: string; pages: number }> {
  if (!/\.pdf$/i.test(file.name)) return { text: await file.text(), pages: 1 }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    const line = content.items.map((it) => ('str' in it ? it.str : '')).join(' ')
    // Drop the running header/footer the synthetic documents carry (federal and District banners alike).
    pages.push(line.replace(/SYNTHETIC DEMO [A-Z ]+?[^A-Z]*NOT (?:AN ACTUAL|A REAL) [A-Z ]*(?:REQUIREMENT|ESTIMATE|PROCUREMENT)/g, '').replace(/\S+ · Section M · Page \d+/g, ''))
  }
  return { text: pages.join('\n\n').replace(/[ \t]+/g, ' ').trim(), pages: doc.numPages }
}
