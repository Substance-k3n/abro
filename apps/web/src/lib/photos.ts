// Profile and group photos (roadmap Phase 4, ADR-017). Photos are cropped
// to a centred square and shrunk to PHOTO_SIZE px before upload, so a phone
// photo of several MB becomes a JPEG of a few dozen KB, well inside the
// API's 2 MB limit, and every avatar downloads fast.

import { api, apiUrl } from './api-client';
import type { AuthProfile } from './auth-api';

const PHOTO_SIZE = 512;
const JPEG_QUALITY = 0.86;

/** A photo URL from the API (or null) as an `<img src>`. */
export function photoSrc(url: string | null | undefined): string | null {
  return url ? apiUrl(url) : null;
}

/** Centre-crops `file` to a square and scales it to PHOTO_SIZE px, as JPEG.
 * Throws a readable Error if the file isn't an image the browser can read. */
export async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a photo (JPG, PNG, WebP or HEIC).');
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That photo couldn't be read. Try a different one.");
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(PHOTO_SIZE, side);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error("Your browser can't process photos.");
  }
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) {
    throw new Error("That photo couldn't be processed. Try a different one.");
  }
  return blob;
}

function asForm(blob: Blob): FormData {
  const form = new FormData();
  form.append('file', blob, 'photo.jpg');
  return form;
}

export function uploadAvatar(blob: Blob): Promise<AuthProfile> {
  return api.postForm('/users/me/avatar', asForm(blob));
}

export function removeAvatar(): Promise<AuthProfile> {
  return api.delete('/users/me/avatar');
}

export function uploadGroupPhoto(groupId: string, blob: Blob): Promise<unknown> {
  return api.postForm(`/groups/${groupId}/photo`, asForm(blob));
}

export function removeGroupPhoto(groupId: string): Promise<unknown> {
  return api.delete(`/groups/${groupId}/photo`);
}
