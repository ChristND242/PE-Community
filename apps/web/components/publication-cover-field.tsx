'use client';

import {
  ImageSelectionField,
  imageSelectionValidation,
  initialImageSelection,
  type ImageSelection,
  type ImageSelectionFieldLabels,
} from './image-selection-field';

export type PublicationCoverSelection = ImageSelection;
export type PublicationCoverFieldLabels = ImageSelectionFieldLabels;

export function initialPublicationCoverSelection(coverUrl?: string | null, coverSource?: 'UPLOAD' | 'EXTERNAL' | null) {
  return initialImageSelection(coverUrl, coverSource);
}

export function publicationCoverValidation(value: PublicationCoverSelection, labels: { fileRequired: string; invalidUrl: string }) {
  return imageSelectionValidation(value, labels);
}

export function publicationRequestBody(fields: Record<string, string>, cover: PublicationCoverSelection) {
  if (!cover.changed) return JSON.stringify(fields);
  if (cover.mode !== 'UPLOAD') {
    return JSON.stringify({
      ...fields,
      coverMode: cover.mode,
      coverUrl: cover.mode === 'EXTERNAL' ? cover.url.trim() : undefined,
    });
  }
  const body = new FormData();
  Object.entries(fields).forEach(([key, value]) => body.append(key, value));
  body.append('coverMode', 'UPLOAD');
  if (cover.file) body.append('coverImage', cover.file);
  return body;
}

export function PublicationCoverField(props: {
  value: PublicationCoverSelection;
  onChange: (value: PublicationCoverSelection) => void;
  labels: PublicationCoverFieldLabels;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  errorMessage?: string;
}) {
  return (
    <ImageSelectionField
      {...props}
      urlPlaceholder="https://example.com/cover.jpg"
      fallbackBasename="publication-cover"
    />
  );
}
