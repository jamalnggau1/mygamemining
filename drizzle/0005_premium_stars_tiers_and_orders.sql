ALTER TABLE `player` ADD COLUMN `premium_tier` text;
--> statement-breakpoint
CREATE TABLE `premium_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan` text NOT NULL,
	`stars` integer NOT NULL,
	`days` integer NOT NULL,
	`tier` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`processed_at` integer
);
