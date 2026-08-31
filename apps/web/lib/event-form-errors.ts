import { ApiRequestError, userFacingApiError } from './api';

export type EventFormValues = {
  title: string;
  description: string;
  startsAt: string;
  location: string;
  onlineUrl: string;
  capacity: string;
};

export type EventFormField = keyof EventFormValues | 'image' | 'form';
export type EventFormErrors = Partial<Record<EventFormField, string>>;

export type EventErrorLabels = {
  createSummary: string;
  updateSummary: string;
  reviewFields: string;
  titleRequired: string;
  descriptionRequired: string;
  dateRequired: string;
  dateInvalid: string;
  locationRequired: string;
  capacityInvalid: string;
  imageInvalid: string;
  imageUrlInvalid: string;
  imageTooLarge: string;
  unauthorized: string;
  forbidden: string;
  conflict: string;
  network: string;
  server: string;
};

export function validateEventForm(values: EventFormValues, labels: EventErrorLabels): EventFormErrors {
  const errors: EventFormErrors = {};
  if (!values.title.trim()) errors.title = labels.titleRequired;
  if (!values.description.trim()) errors.description = labels.descriptionRequired;
  if (!values.location.trim()) errors.location = labels.locationRequired;
  if (!values.startsAt.trim()) errors.startsAt = labels.dateRequired;
  else if (Number.isNaN(new Date(values.startsAt).getTime())) errors.startsAt = labels.dateInvalid;
  if (values.capacity.trim()) {
    const capacity = Number(values.capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) errors.capacity = labels.capacityInvalid;
  }
  return errors;
}

export function eventSubmissionError(error: unknown, operation: 'create' | 'update', labels: EventErrorLabels) {
  const summary = operation === 'create' ? labels.createSummary : labels.updateSummary;
  if (!(error instanceof ApiRequestError)) return { summary, detail: labels.network, field: 'form' as const };
  if (error.status === 401) return { summary, detail: labels.unauthorized, field: 'form' as const };
  if (error.status === 403) return { summary, detail: labels.forbidden, field: 'form' as const };
  if (error.status === 409) return { summary, detail: labels.conflict, field: 'form' as const };
  if (error.status === 413) return { summary, detail: labels.imageTooLarge, field: 'image' as const };
  if (error.status >= 500) return { summary, detail: labels.server, field: 'form' as const };

  const apiMessage = userFacingApiError(error, '').toLowerCase();
  if (apiMessage.includes('event image url')) return { summary, detail: labels.imageUrlInvalid, field: 'image' as const };
  if (apiMessage.includes('event image') || apiMessage.includes('uploaded image')) {
    const detail = apiMessage.includes('5mb') || apiMessage.includes('too large') ? labels.imageTooLarge : labels.imageInvalid;
    return { summary, detail, field: 'image' as const };
  }
  if (apiMessage.includes('date')) return { summary, detail: labels.dateInvalid, field: 'startsAt' as const };
  if (apiMessage.includes('capacity')) return { summary, detail: labels.capacityInvalid, field: 'capacity' as const };
  return { summary, detail: labels.reviewFields, field: 'form' as const };
}
