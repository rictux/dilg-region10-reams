/**
 * Renders an on-screen QR <svg> to a downloadable PNG — the same artwork as the
 * badge's QR block (DILG seal centered on a white quiet zone) minus the
 * surrounding card, for dropping into posters, slides or chat.
 *
 * Shared by the event registration QR and the Pre-test / Post-test QRs so all
 * three download as the same image.
 */
export const downloadQrCodePng = async (
  svgElement: SVGElement,
  fileName: string
): Promise<void> => {
  const QR_SIZE = 1024;             // rendered QR edge in px
  const MARGIN = 64;                // white quiet zone around it
  const CANVAS = QR_SIZE + MARGIN * 2;

  let svgUrl: string | null = null;
  try {
    // Render the QR SVG at final resolution so it stays sharp when scaled up
    const svgClone = svgElement.cloneNode(true) as SVGElement;
    svgClone.setAttribute('width', String(QR_SIZE));
    svgClone.setAttribute('height', String(QR_SIZE));
    const svgString = new XMLSerializer().serializeToString(svgClone);
    svgUrl = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }));

    const qrImage = new Image();
    await new Promise<void>((resolve, reject) => {
      qrImage.onload = () => resolve();
      qrImage.onerror = () => reject(new Error('Failed to load QR code image'));
      qrImage.src = svgUrl as string;
    });

    // The on-screen seal is an overlay <img>, not part of the SVG, so load it separately
    const logoImage = new Image();
    await new Promise<void>((resolve, reject) => {
      logoImage.onload = () => resolve();
      logoImage.onerror = () => reject(new Error('Failed to load logo image'));
      logoImage.src = '/assets/dilg_logo.png';
    });

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS;
    canvas.height = CANVAS;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS, CANVAS);
    ctx.drawImage(qrImage, MARGIN, MARGIN, QR_SIZE, QR_SIZE);

    // DILG seal in the center, with a thin white circular border (matches UI)
    const logoSize = QR_SIZE * 0.25;
    const ringPadding = QR_SIZE * 0.018;
    const center = MARGIN + QR_SIZE / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, logoSize / 2 + ringPadding, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(center, center, logoSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoImage, center - logoSize / 2, center - logoSize / 2, logoSize, logoSize);
    ctx.restore();

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Failed to render PNG'))),
        'image/png'
      );
    });

    const pngUrl = URL.createObjectURL(pngBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = pngUrl;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    setTimeout(() => URL.revokeObjectURL(pngUrl), 10000);
  } finally {
    if (svgUrl) URL.revokeObjectURL(svgUrl);
  }
};

/** Filename-safe slug of an event name, e.g. "Regional Summit" → "regional_summit". */
export const qrFileSlug = (name?: string | null): string =>
  (name || 'Event')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'event';
