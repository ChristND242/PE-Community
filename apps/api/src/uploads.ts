import { join } from 'path';

export type AvatarUploadFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
};

export type EventImageUploadFile = AvatarUploadFile;
export type PublicationCoverUploadFile = AvatarUploadFile;

export const maxAvatarUploadSize = 5 * 1024 * 1024;
export const maxEventImageUploadSize = 5 * 1024 * 1024;
export const maxPublicationCoverUploadSize = maxEventImageUploadSize;

const avatarMimeExtensions = new Map([
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

export function avatarUploadDir() {
  if (process.env.UPLOADS_DIR) return join(process.env.UPLOADS_DIR, 'avatars');
  return join(__dirname, '..', 'uploads', 'avatars');
}

export function avatarUploadExtension(file: AvatarUploadFile) {
  return avatarMimeExtensions.get(file.mimetype);
}

export function hasValidAvatarSignature(file: AvatarUploadFile) {
  const bytes = file.buffer;
  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.mimetype === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (file.mimetype === 'image/webp') {
    return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

export function avatarPublicUrl(filename: string) {
  const baseUrl = (process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`).replace(/\/$/, '');
  return `${baseUrl}/uploads/avatars/${filename}`;
}

export function eventImageUploadDir() {
  if (process.env.UPLOADS_DIR) return join(process.env.UPLOADS_DIR, 'event-images');
  return join(__dirname, '..', 'uploads', 'event-images');
}

export function eventImageUploadExtension(file: EventImageUploadFile) {
  return avatarUploadExtension(file);
}

export function hasValidEventImageSignature(file: EventImageUploadFile) {
  return hasValidAvatarSignature(file);
}

export function eventImagePublicUrl(filename: string) {
  const baseUrl = (process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`).replace(/\/$/, '');
  return `${baseUrl}/uploads/event-images/${filename}`;
}

export function publicationCoverUploadDir() {
  if (process.env.UPLOADS_DIR) return join(process.env.UPLOADS_DIR, 'publication-covers');
  return join(__dirname, '..', 'uploads', 'publication-covers');
}

export function publicationCoverUploadExtension(file: PublicationCoverUploadFile) {
  return avatarUploadExtension(file);
}

export function hasValidPublicationCoverSignature(file: PublicationCoverUploadFile) {
  return hasValidAvatarSignature(file);
}

export function publicationCoverPublicUrl(filename: string) {
  const baseUrl = (process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`).replace(/\/$/, '');
  return `${baseUrl}/uploads/publication-covers/${filename}`;
}

export function chatAttachmentUploadDir() {
  if (process.env.UPLOADS_DIR) return join(process.env.UPLOADS_DIR, 'chat-attachments');
  return join(__dirname, '..', 'uploads', 'chat-attachments');
}

export function eventTaskAttachmentUploadDir() {
  if (process.env.UPLOADS_DIR) return join(process.env.UPLOADS_DIR, 'event-task-attachments');
  return join(__dirname, '..', 'uploads', 'event-task-attachments');
}
