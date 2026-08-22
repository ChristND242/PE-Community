ALTER TYPE "TaskBoardAutomationRunMode" ADD VALUE 'TEST_NOTIFICATION';
ALTER TABLE "TaskBoardAutomationRule" ADD COLUMN "lastRunMode" "TaskBoardAutomationRunMode";
