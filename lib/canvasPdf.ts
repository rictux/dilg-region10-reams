// Minimal single-page PDF writer for canvas renders.
//
// The app has no PDF dependency, so this builds the file by hand: one page whose
// entire area is a single image XObject. Pixels are embedded losslessly with
// /FlateDecode (flat artwork and QR codes compress very well and stay crisp);
// browsers without CompressionStream fall back to an embedded JPEG.

const enc = new TextEncoder();

const concat = (parts: Uint8Array[]) => {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
        out.set(part, at);
        at += part.length;
    }
    return out;
};

// PDF's /FlateDecode expects zlib-wrapped data, which is what 'deflate' produces.
const zlibDeflate = async (bytes: Uint8Array) => {
    if (typeof CompressionStream === 'undefined') return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
};

const round = (value: number) => Number(value.toFixed(2));

/** Page sizes in PostScript points (1pt = 1/72in). */
export const PAGE_SIZES = {
    A4: { widthPt: 595.28, heightPt: 841.89 },
    LETTER: { widthPt: 612, heightPt: 792 },
} as const;

export interface CanvasPdfOptions {
    /** Page width in points. */
    widthPt: number;
    /** Page height in points. */
    heightPt: number;
    /** Keeps this much clear space on every edge; the canvas is scaled to fit and centered. */
    marginPt?: number;
}

/**
 * Renders a canvas as a single-page PDF. The canvas keeps its aspect ratio, scaled
 * as large as the page and margin allow and centered on the page.
 */
export const canvasToPdfBlob = async (canvas: HTMLCanvasElement, { widthPt, heightPt, marginPt = 0 }: CanvasPdfOptions) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    const { width, height } = canvas;
    const { data } = ctx.getImageData(0, 0, width, height);

    // PDF images are RGB; the badge is drawn on an opaque background so alpha is dropped.
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0, o = 0; i < data.length; i += 4) {
        rgb[o++] = data[i];
        rgb[o++] = data[i + 1];
        rgb[o++] = data[i + 2];
    }

    let imageBytes = await zlibDeflate(rgb);
    let filter = '/FlateDecode';
    if (!imageBytes) {
        const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        if (!jpeg) throw new Error('Unable to encode the page image');
        imageBytes = new Uint8Array(await jpeg.arrayBuffer());
        filter = '/DCTDecode';
    }

    const pw = round(widthPt);
    const ph = round(heightPt);

    // Fit the canvas inside the printable area, then center it on the page
    const fit = Math.min((widthPt - marginPt * 2) / width, (heightPt - marginPt * 2) / height);
    const drawW = round(width * fit);
    const drawH = round(height * fit);
    const drawX = round((widthPt - drawW) / 2);
    const drawY = round((heightPt - drawH) / 2);
    const content = `q\n${drawW} 0 0 ${drawH} ${drawX} ${drawY} cm\n/Im0 Do\nQ\n`;

    const objects: Uint8Array[] = [
        enc.encode('<< /Type /Catalog /Pages 2 0 R >>'),
        enc.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
        enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`),
        enc.encode(`<< /Length ${content.length} >>\nstream\n${content}endstream`),
        concat([
            enc.encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter} /Length ${imageBytes.length} >>\nstream\n`),
            imageBytes,
            enc.encode('\nendstream'),
        ]),
    ];

    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let cursor = 0;
    const push = (chunk: Uint8Array) => {
        chunks.push(chunk);
        cursor += chunk.length;
    };

    push(enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    objects.forEach((obj, i) => {
        offsets.push(cursor);
        push(enc.encode(`${i + 1} 0 obj\n`));
        push(obj);
        push(enc.encode('\nendobj\n'));
    });

    const xrefOffset = cursor;
    push(enc.encode(`xref\n0 ${objects.length + 1}\n`));
    push(enc.encode('0000000000 65535 f \n'));
    offsets.forEach(o => push(enc.encode(`${String(o).padStart(10, '0')} 00000 n \n`)));
    push(enc.encode(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));

    return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
};
