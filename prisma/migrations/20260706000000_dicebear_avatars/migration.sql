ALTER TABLE "MemberProfile"
ADD COLUMN "sex" TEXT,
ADD COLUMN "dicebearStyle" TEXT,
ADD COLUMN "dicebearSeed" TEXT;

ALTER TABLE "RegistrationApplication"
ADD COLUMN "sex" TEXT;
