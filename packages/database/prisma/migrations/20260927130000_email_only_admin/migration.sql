BEGIN;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;


-- Phone remains mandatory for mobile accounts. An email-only admin must retain
-- an email when updated or when its role changes. SQL NULL must not pass CHECK.
ALTER TABLE "users" ADD CONSTRAINT "users_phone_or_admin_email_check" CHECK (
  "phone" IS NOT NULL OR (
    "role" = 'ADMIN' AND "email" IS NOT NULL AND length(btrim("email")) > 0
  )
);

COMMIT;
