const MAX_EDGE = 320
const QUALITY = 0.72

/**
 * Turns a picked file into a small JPEG data URL.
 *
 * There is no server to upload to, so a cat photo has to live in localStorage
 * alongside everything else. Downscaling first keeps each one in the tens of
 * KB rather than the several MB a phone camera produces — the difference
 * between fitting the ~5MB quota and blowing it on the third cat.
 */
export function fileToThumbnail(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('That file isn’t an image.'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not read that image.'))
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)

        try {
          resolve(canvas.toDataURL('image/jpeg', QUALITY))
        } catch {
          reject(new Error('Could not process that image.'))
        }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
