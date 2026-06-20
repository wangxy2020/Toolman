ALTER TABLE `identities` ADD COLUMN `registration_status` text DEFAULT 'guest' NOT NULL;
--> statement-breakpoint
ALTER TABLE `identities` ADD COLUMN `auth_region` text;
--> statement-breakpoint
ALTER TABLE `identities` ADD COLUMN `subscription_sku` text;
--> statement-breakpoint
ALTER TABLE `identities` ADD COLUMN `entitlements_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `identities` ADD COLUMN `registered_at` integer;
--> statement-breakpoint
CREATE TABLE `auth_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text NOT NULL,
	`provider` text NOT NULL,
	`subject_id` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`verified_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_bindings_provider_subject_unique` ON `auth_bindings` (`provider`,`subject_id`);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text,
	`is_logged_in` integer DEFAULT false NOT NULL,
	`preferred_region` text,
	`access_token_ref` text,
	`refresh_token_ref` text,
	`id_token_ref` text,
	`hub_token_ref` text,
	`token_expires_at` integer,
	`last_login_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
