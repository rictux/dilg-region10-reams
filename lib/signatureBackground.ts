/**
 * Makes the paper behind a scanned e-signature transparent.
 *
 * Signatures uploaded as JPEG carry an opaque white rectangle, which looks fine on a plain
 * certificate but sits as a visible box once a theme image is behind it. The CSS route
 * (`mix-blend-mode: multiply`) does not work here: the certificate's content overlay sets a
 * z-index and therefore opens a stacking context, so the signature would blend against the
 * overlay rather than the theme underneath it. Rewriting the pixels sidesteps that entirely
 * and, unlike a blend mode, is guaranteed to survive html-to-image's canvas capture.
 *
 * Pixels are keyed on their brightest channel so coloured ink keeps its hue: anything at or
 * above WHITE_CUTOFF is paper and goes fully transparent, anything at or below INK_CUTOFF is
 * ink and stays untouched, and the band between them fades out so antialiased strokes do not
 * leave a hard halo.
 */
const WHITE_CUTOFF = 248;
const INK_CUTOFF = 180;

const cache = new Map<string, Promise<string>>();

const processSignature = async (url: string): Promise<string> => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.referrerPolicy = 'no-referrer';
  image.src = url;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return url;

  context.drawImage(image, 0, 0);

  // Throws if the storage bucket withheld CORS headers, which taints the canvas. The caller
  // falls back to the original URL rather than dropping the signature.
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;

    const paperness = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);

    if (paperness >= WHITE_CUTOFF) {
      pixels[i + 3] = 0;
    } else if (paperness > INK_CUTOFF) {
      const fade = 1 - (paperness - INK_CUTOFF) / (WHITE_CUTOFF - INK_CUTOFF);
      pixels[i + 3] = Math.round(pixels[i + 3] * fade);
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

/**
 * Returns a data URL with the paper knocked out, or the original URL if the image cannot be
 * read (missing file, or a cross-origin response the canvas refuses to export). Results are
 * cached per URL so repeated renders and batch exports pay the cost once.
 */
export const getTransparentSignature = (url: string): Promise<string> => {
  if (!url) return Promise.resolve(url);

  const cached = cache.get(url);
  if (cached) return cached;

  const task = processSignature(url).catch(() => url);
  cache.set(url, task);
  return task;
};
