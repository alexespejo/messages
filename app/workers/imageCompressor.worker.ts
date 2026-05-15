interface CompressRequest {
  file: File
  maxWidthPx: number
  quality: number
}

interface CompressResponse {
  blob: Blob
  widthPx: number
  heightPx: number
  sizeBytes: number
}

self.onmessage = async (event: MessageEvent<CompressRequest>) => {
  const { file, maxWidthPx, quality } = event.data

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidthPx / bitmap.width)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })

  const response: CompressResponse = {
    blob,
    widthPx: w,
    heightPx: h,
    sizeBytes: blob.size,
  }
  self.postMessage(response)
}
