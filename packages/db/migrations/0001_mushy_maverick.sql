ALTER TABLE `messages` ADD `content` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `model_id` text;