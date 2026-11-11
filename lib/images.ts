/**
 * Prépare une photo de retour avant envoi : redimensionnée à 1280 px max et recompressée en JPEG,
 * pour des envois rapides en 4G. L'image est stockée dans le stockage S3 par le backend.
 */
export const MAX_FEEDBACK_IMAGES = 6;
const MAX_SIDE = 1280;

export interface PreparedImage {
  id: string;
  name: string;
  blob: Blob;
  /** Aperçu local (URL objet), à libérer après usage. */
  preview: string;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} n'est pas une image.`);
  const id = `img${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return { id, name: file.name, blob: file, preview: URL.createObjectURL(file) };
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image illisible.'))), 'image/jpeg', 0.75));
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return { id, name, blob, preview: URL.createObjectURL(blob) };
}
