declare module 'pdfjs-dist/build/pdf.mjs' {
  const pdfjs: any
  export = pdfjs
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const workerUrl: string
  export default workerUrl
}

