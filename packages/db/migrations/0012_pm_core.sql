CREATE TABLE `pm_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`domain` text NOT NULL,
	`workspace_root` text,
	`description` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pm_projects_workspace_domain_idx` ON `pm_projects` (`workspace_id`,`domain`);--> statement-breakpoint
CREATE INDEX `pm_projects_workspace_updated_idx` ON `pm_projects` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `pm_work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`parent_id` text,
	`type` text DEFAULT 'task' NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`domain` text NOT NULL,
	`assignee` text,
	`description` text,
	`start_date` integer,
	`due_date` integer,
	`progress_percent` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `pm_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pm_work_items_project_sort_idx` ON `pm_work_items` (`project_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `pm_work_items_workspace_domain_idx` ON `pm_work_items` (`workspace_id`,`domain`);--> statement-breakpoint
CREATE INDEX `pm_work_items_status_idx` ON `pm_work_items` (`status`);--> statement-breakpoint
CREATE INDEX `pm_work_items_parent_idx` ON `pm_work_items` (`parent_id`);
