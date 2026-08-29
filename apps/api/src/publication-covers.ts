import { BadRequestException } from '@nestjs/common';
import { PublicationCoverSource } from '@prisma/client';
import {
  hasValidPublicationCoverSignature,
  maxPublicationCoverUploadSize,
  publicationCoverUploadExtension,
  type PublicationCoverUploadFile,
} from './uploads';

export type PublicationCoverMutation =
  | { action: 'keep' }
  | { action: 'clear' }
  | { action: 'external'; coverUrl: string; coverSource: PublicationCoverSource }
  | { action: 'upload'; extension: string; file: PublicationCoverUploadFile; coverSource: PublicationCoverSource };

export function publicationCoverMutation(
  input: Record<string, unknown>,
  file?: PublicationCoverUploadFile,
  updating = false,
): PublicationCoverMutation {
  const mode = typeof input.coverMode === 'string' ? input.coverMode.trim().toUpperCase() : '';
  if (!mode) {
    if (file) return uploadMutation(file);
    return updating ? { action: 'keep' } : { action: 'clear' };
  }
  if (mode === 'NONE') {
    if (file) throw new BadRequestException('Do not upload a file when no publication cover is selected.');
    return { action: 'clear' };
  }
  if (mode === 'EXTERNAL') {
    if (file) throw new BadRequestException('Choose either an uploaded cover or a cover URL.');
    return { action: 'external', coverUrl: normalizePublicationCoverUrl(input.coverUrl), coverSource: PublicationCoverSource.EXTERNAL };
  }
  if (mode === 'UPLOAD') {
    if (!file) throw new BadRequestException('A publication cover file is required.');
    return uploadMutation(file);
  }
  throw new BadRequestException('Publication cover selection is invalid.');
}

export function normalizePublicationCoverUrl(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) throw new BadRequestException('Publication cover URL is required.');
  const value = raw.trim();
  if (value.length > 2048) throw new BadRequestException('Publication cover URL is too long.');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadRequestException('Publication cover URL is invalid.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new BadRequestException('Publication cover URL must use HTTP or HTTPS.');
  }
  return parsed.toString();
}

function uploadMutation(file: PublicationCoverUploadFile): PublicationCoverMutation {
  const extension = publicationCoverUploadExtension(file);
  if (!extension) throw new BadRequestException('Publication cover must be JPEG, PNG, or WebP.');
  if (file.size > maxPublicationCoverUploadSize) throw new BadRequestException('Publication cover must be 5MB or smaller.');
  if (!hasValidPublicationCoverSignature(file)) throw new BadRequestException('Publication cover is invalid.');
  return { action: 'upload', extension, file, coverSource: PublicationCoverSource.UPLOAD };
}
