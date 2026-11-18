ALTER TABLE `player` ADD COLUMN `expedition` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `player` ADD COLUMN `job` text;
--> statement-breakpoint
ALTER TABLE `player` ADD COLUMN `total_scans` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `player` ADD COLUMN `asteroids_done` integer DEFAULT 0 NOT NULL;
