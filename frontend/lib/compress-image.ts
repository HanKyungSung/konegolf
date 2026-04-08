/**
 * Client-side image compression using Canvas API.
 * Resizes large images and converts to JPEG for efficient upload.
 */

const DEFAULT_MAX_WIDTH = 1200;
const DEFAULT_QUALITY = 0.7;

export async function compressImage(
  file: File,
  maxWidth: number = DEFAULT_MAX_WIDTH,
  quality: number = DEFAULT_QUALITY
): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / img.width);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2d context');

  ctx.drawImage(img, 0, 0, width, height);
  img.close();

  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}

/**
 * Compress image and return as File object with a proper name.
 */
export async function compressImageToFile(
  file: File,
  maxWidth?: number,
  quality?: number
): Promise<File> {
  const blob = await compressImage(file, maxWidth, quality);
  const name = file.name.replace(/\.[^.]+$/, '.jpg');
  return new File([blob], name, { type: 'image/jpeg' });
}
