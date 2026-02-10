export type PdfExtractResult = {
  pageCount: number
  text: string
}

export const extractPdfText = async (file: File): Promise<PdfExtractResult> => {
  const buffer = await file.arrayBuffer()

  // pdf.js worker: use bundler-resolved URL for Vite.
  // pdfjs-dist ships ESM under `build/*.mjs`.
  const pdfjs = (await import('pdfjs-dist/build/pdf.mjs')) as any
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default as string

  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const loadingTask = pdfjs.getDocument({ data: buffer })
  const doc = await loadingTask.promise

  const pageCount = doc.numPages
  const parts: string[] = []

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => {
        // pdf.js text items can be various shapes; `str` is the common one.
        return typeof item?.str === 'string' ? item.str : ''
      })
      .filter(Boolean)
      .join(' ')

    parts.push(pageText)
  }

  const text = parts
    .join('\n\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { pageCount, text }
}
