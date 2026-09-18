// Shrink the screenshot in the browser before it is uploaded (D73).
//
// PRIVACY: the canvas re-encode below is what strips EXIF. A phone screenshot
// or a photo of a screen can carry the camera model, the timestamp and GPS
// coordinates; drawing the pixels onto a canvas and calling toBlob writes a
// brand-new JPEG from the pixels alone, so none of that metadata survives. The
// original File is never uploaded. This is also why we always re-encode, even
// when the image is already small enough.
//
// The upload is also cheaper and well inside the backend's 5 MB policy, and
// Textract reads a 2400 px screenshot as well as a 4000 px one.

export const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
export const MAX_EDGE = 2400;
// The presigned policy allows 5 MB. Aiming at 4.5 MB leaves room for the
// multipart overhead, so a file that fits here cannot be rejected up there.
export const MAX_UPLOAD_BYTES = Math.round(4.5 * 1024 * 1024);
export const QUALITY_STEPS = [0.9, 0.8, 0.7];
// Last resort if even 0.7 is too big: shrink the long edge and re-encode.
const EDGE_STEPS = [1800, 1400, 1000];

export const REJECT_MESSAGE =
  "Please choose a PNG or JPEG screenshot. Other kinds of files cannot be read.";
export const DECODE_MESSAGE =
  "We could not open that image. Please try another screenshot.";
export const ENCODE_MESSAGE =
  "We could not prepare that image. Please try another screenshot.";

export function isAcceptedType(type) {
  return ACCEPTED_TYPES.includes(type);
}

/** The size to draw at: the long edge capped at maxEdge, aspect ratio kept,
 * and never larger than the original - upscaling a screenshot adds no detail
 * for Textract and only makes the upload bigger.
 *
 * Pure, so the arithmetic is unit-tested without a canvas.
 */
export function targetSize(width, height, maxEdge = MAX_EDGE) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("targetSize needs positive finite dimensions");
  }
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Safari has historically refused some PNGs here; fall through to <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(DECODE_MESSAGE));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sourceSize(source) {
  return {
    width: source.width || source.naturalWidth,
    height: source.height || source.naturalHeight,
  };
}

function toBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(ENCODE_MESSAGE))),
      "image/jpeg",
      quality,
    );
  });
}

function draw(source, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(ENCODE_MESSAGE);
  // A JPEG has no transparency, so a PNG's transparent pixels would come out
  // black without this.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

/** Decode, resize and re-encode the chosen file as a JPEG that fits the
 * upload policy. Returns {blob, width, height, quality}. */
export async function prepareImage(file) {
  if (!file || !isAcceptedType(file.type)) throw new Error(REJECT_MESSAGE);

  const source = await decode(file);
  try {
    const original = sourceSize(source);
    let size = targetSize(original.width, original.height);
    let canvas = draw(source, size);

    // Quality first: it costs less detail than shrinking the text Textract has
    // to read. Only if 0.7 is still too big does the long edge come down.
    for (const quality of QUALITY_STEPS) {
      const blob = await toBlob(canvas, quality);
      if (blob.size <= MAX_UPLOAD_BYTES) return { blob, ...size, quality };
    }
    for (const edge of EDGE_STEPS) {
      const next = targetSize(original.width, original.height, edge);
      if (next.width === size.width && next.height === size.height) continue;
      size = next;
      canvas = draw(source, size);
      const blob = await toBlob(canvas, 0.7);
      if (blob.size <= MAX_UPLOAD_BYTES) return { blob, ...size, quality: 0.7 };
    }
    // Nothing plausible reaches this: a 1000 px JPEG at 0.7 is a few hundred KB.
    throw new Error(ENCODE_MESSAGE);
  } finally {
    source.close?.();
  }
}
