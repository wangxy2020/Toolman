CREATE TABLE IF NOT EXISTS `pm_time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`work_item_id` text,
	`assignee` text,
	`spent_hours` real NOT NULL,
	`work_date` integer NOT NULL,
	`description` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `pm_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pm_time_entries_project_idx` ON `pm_time_entries` (`project_id`,`work_date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pm_time_entries_workspace_idx` ON `pm_time_entries` (`workspace_id`,`work_date`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pm_document_links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text,
	`work_item_id` text,
	`knowledge_base_id` text NOT NULL,
	`knowledge_document_id` text NOT NULL,
	`link_type` text DEFAULT 'reference' NOT NULL,
	`title_override` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pm_document_links_project_idx` ON `pm_document_links` (`project_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pm_document_links_workspace_idx` ON `pm_document_links` (`workspace_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pm_document_links_doc_idx` ON `pm_document_links` (`knowledge_document_id`);
