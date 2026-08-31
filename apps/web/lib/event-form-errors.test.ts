import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiRequestError } from './api';
import { eventSubmissionError, validateEventForm, type EventErrorLabels } from './event-form-errors';

const en: EventErrorLabels = {
  createSummary: 'Could not create event', updateSummary: 'Could not update event', reviewFields: 'Review fields',
  titleRequired: 'Title required', descriptionRequired: 'Description required', dateRequired: 'Date required', dateInvalid: 'Date invalid',
  locationRequired: 'Location required', capacityInvalid: 'Capacity invalid', imageInvalid: 'Image invalid', imageUrlInvalid: 'URL invalid',
  imageTooLarge: 'Image too large', unauthorized: 'Sign in', forbidden: 'Forbidden', conflict: 'Conflict', network: 'Connectivity', server: 'Server failure',
};

const fr: EventErrorLabels = { ...en, createSummary: 'Impossible de créer l’événement', imageInvalid: 'Image non valide', network: 'Connexion impossible' };

test('client Event validation maps required, date, and capacity errors to fields', () => {
  assert.deepEqual(validateEventForm({ title: '', description: '', startsAt: '', location: '', onlineUrl: '', capacity: '-2' }, en), {
    title: 'Title required', description: 'Description required', location: 'Location required', startsAt: 'Date required', capacity: 'Capacity invalid',
  });
});

test('backend image validation maps to the image field with localized copy', () => {
  const error = new ApiRequestError(400, JSON.stringify({ message: 'Event image is invalid.', error: 'Bad Request', statusCode: 400 }));
  assert.deepEqual(eventSubmissionError(error, 'create', en), { summary: 'Could not create event', detail: 'Image invalid', field: 'image' });
  assert.deepEqual(eventSubmissionError(error, 'create', fr), { summary: 'Impossible de créer l’événement', detail: 'Image non valide', field: 'image' });
});

test('URL, payload size, server, and network failures remain safe and actionable', () => {
  assert.equal(eventSubmissionError(new ApiRequestError(400, JSON.stringify({ message: 'Event image URL is invalid.' })), 'create', en).detail, 'URL invalid');
  assert.deepEqual(eventSubmissionError(new ApiRequestError(413, ''), 'update', en), { summary: 'Could not update event', detail: 'Image too large', field: 'image' });
  assert.equal(eventSubmissionError(new ApiRequestError(500, JSON.stringify({ message: 'internal detail' })), 'create', en).detail, 'Server failure');
  assert.equal(eventSubmissionError(new TypeError('fetch failed'), 'create', en).detail, 'Connectivity');
  assert.equal(eventSubmissionError(new TypeError('fetch failed'), 'create', fr).detail, 'Connexion impossible');
});
