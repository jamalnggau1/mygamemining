DROP TABLE IF EXISTS `entries`;
--> statement-breakpoint
CREATE TABLE `player` (
	`id` integer PRIMARY KEY NOT NULL,
	`kt_balance` integer DEFAULT 0 NOT NULL,
	`energy` integer DEFAULT 20 NOT NULL,
	`energy_updated_at` integer NOT NULL,
	`layer` integer DEFAULT 1 NOT NULL,
	`grid` text DEFAULT '[]' NOT NULL,
	`total_digs` integer DEFAULT 0 NOT NULL,
	`total_kt_earned` integer DEFAULT 0 NOT NULL,
	`total_wd_paid_gram` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`ore_id` text PRIMARY KEY NOT NULL,
	`qty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `upgrades` (
	`upgrade_id` text PRIMARY KEY NOT NULL,
	`level` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wd_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_address` text NOT NULL,
	`amount_kt` integer NOT NULL,
	`amount_gram` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_note` text,
	`tx_ref` text,
	`created_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`amount_kt` integer,
	`created_at` integer NOT NULL
);
