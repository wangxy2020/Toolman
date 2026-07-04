CREATE TABLE `agent_task_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'file' NOT NULL,
	`relative_path` text NOT NULL,
	`absolute_path` text NOT NULL,
	`mime_type` text,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`source_json` text DEFAULT '{}' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_task_artifacts_task_created_idx` ON `agent_task_artifacts` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_task_artifacts_task_rel_path_idx` ON `agent_task_artifacts` (`task_id`,`relative_path`);
