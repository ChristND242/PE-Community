import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiRequestError, userFacingApiError } from './api';

test('expected API validation errors expose only their human-readable message', () => {
  const error = new ApiRequestError(
    400,
    JSON.stringify({
      message: 'Template must include {{recipientName}}.',
      error: 'Bad Request',
      statusCode: 400,
    }),
  );

  assert.equal(
    userFacingApiError(error, 'Could not save template.'),
    'Template must include {{recipientName}}.',
  );
});

test('unexpected and malformed API errors use safe fallback copy', () => {
  assert.equal(
    userFacingApiError(
      new ApiRequestError(
        500,
        JSON.stringify({ statusCode: 500, message: 'Internal server error' }),
      ),
      'Preview could not be generated.',
    ),
    'Preview could not be generated.',
  );
  assert.equal(
    userFacingApiError(
      new ApiRequestError(400, '{"message":'),
      'Could not save template.',
    ),
    'Could not save template.',
  );
});
