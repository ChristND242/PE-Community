-- Final registration decisions no longer need a duplicate password hash.
UPDATE "RegistrationApplication"
SET "passwordHash" = NULL
WHERE "status" IN ('APPROVED', 'REJECTED')
  AND "passwordHash" IS NOT NULL;
