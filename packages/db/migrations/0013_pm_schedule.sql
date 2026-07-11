CREATE TABLE IF NOT EXISTS `pm_work_item_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`from_work_item_id` text NOT NULL,
	`to_work_item_id` text NOT NULL,
	`type` text DEFAULT 'FS' NOT NULL,
	`lag_days` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `pm_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pm_relations_project_idx` ON `pm_work_item_relations` (`project_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pm_relations_from_idx` ON `pm_work_item_relations` (`from_work_item_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pm_relations_to_idx` ON `pm_work_item_relations` (`to_work_item_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pm_schedule_baselines` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`snapshot_json` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `pm_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pm_baselines_project_idx` ON `pm_schedule_baselines` (`project_id`,`created_at`);
