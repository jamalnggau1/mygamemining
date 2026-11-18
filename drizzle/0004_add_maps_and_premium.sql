ALTER TABLE `player` ADD COLUMN `current_zone` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `player` ADD COLUMN `premium_until` integer;
--> statement-breakpoint
UPDATE `player` SET `current_zone` = CASE WHEN `layer` >= 15 THEN 4 WHEN `layer` >= 10 THEN 3 WHEN `layer` >= 6 THEN 2 WHEN `layer` >= 3 THEN 1 ELSE 0 END;
