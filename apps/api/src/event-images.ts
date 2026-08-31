import { BadRequestException } from '@nestjs/common';
import { EventImageSource } from '@prisma/client';
import {
  eventImageUploadExtension,
  hasValidEventImageSignature,
  maxEventImageUploadSize,
  type EventImageUploadFile,
} from './uploads';

export type EventImageMutation =
  | { action: 'keep' }
  | { action: 'clear' }
  | { action: 'external'; imageUrl: string; imageSource: EventImageSource }
  | { action: 'upload'; extension: string; file: EventImageUploadFile; imageSource: EventImageSource };

export function eventImageMutation(
  input: Record<string, unknown>,
  file?: EventImageUploadFile,
  updating = false,
): EventImageMutation {
  const mode = typeof input.imageMode === 'string' ? input.imageMode.trim().toUpperCase() : '';
  if (!mode) {
    if (file) return uploadMutation(file);
    return updating ? { action: 'keep' } : { action: 'clear' };
  }
  if (mode === 'NONE') {
    if (file) throw new BadRequestException('Do not upload a file when no event image is selected.');
    return { action: 'clear' };
  }
  if (mode === 'EXTERNAL') {
    if (file) throw new BadRequestException('Choose either an uploaded image or an image URL.');
    return { action: 'external', imageUrl: normalizeEventImageUrl(input.imageUrl), imageSource: EventImageSource.EXTERNAL };
  }
  if (mode === 'UPLOAD') {
    if (!file) throw new BadRequestException('An event image file is required.');
    return uploadMutation(file);
  }
  throw new BadRequestException('Event image selection is invalid.');
}

export function normalizeEventImageUrl(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) throw new BadRequestException('Event image URL is required.');
  const value = raw.trim();
  if (value.length > 2048) throw new BadRequestException('Event image URL is too long.');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadRequestException('Event image URL is invalid.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new BadRequestException('Event image URL must use HTTP or HTTPS.');
  }
  return parsed.toString();
}

function uploadMutation(file: EventImageUploadFile): EventImageMutation {
  const extension = eventImageUploadExtension(file);
  if (!extension) throw new BadRequestException('Event image must be JPEG, PNG, or WebP.');
  if (file.size > maxEventImageUploadSize) throw new BadRequestException('Event image must be 5MB or smaller.');
  if (!hasValidEventImageSignature(file)) throw new BadRequestException('Event image is invalid.');
  return { action: 'upload', extension, file, imageSource: EventImageSource.UPLOAD };
}
