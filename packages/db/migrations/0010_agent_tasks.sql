CREATE TABLE `agent_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`assistant_id` text,
	`session_id` text,
	`title` text NOT NULL,
	`goal` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`current_step_id` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`planner_model_id` text,
	`executor_model_id` text,
	`workspace_root` text,
	`history_json` text DEFAULT '[]' NOT NULL,
	`budget_json` text DEFAULT '{}' NOT NULL,
	`notes` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assistant_id`) REFERENCES `assistants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_tasks_workspace_updated_idx` ON `agent_tasks` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `agent_tasks_assistant_updated_idx` ON `agent_tasks` (`assistant_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `agent_tasks_session_idx` ON `agent_tasks` (`session_id`);--> statement-breakpoint
CREATE INDEX `agent_tasks_status_idx` ON `agent_tasks` (`status`);--> statement-breakpoint
CREATE TABLE `agent_task_lock` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`acquired_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `agent_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
