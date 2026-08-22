ALTER TABLE "CommunityReminderSettings"
ADD COLUMN "birthdayDayNotificationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "anniversaryDayNotificationEnabled" BOOLEAN NOT NULL DEFAULT true;
