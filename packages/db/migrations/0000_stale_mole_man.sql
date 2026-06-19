CREATE TABLE `identities` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'local' NOT NULL,
	`display_name` text NOT NULL,
	`public_key` text,
	`avatar_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `assistants` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`avatar_hash` text,
	`system_prompt` text DEFAULT '' NOT NULL,
	`model_id` text NOT NULL,
	`parameters_json` text DEFAULT '{}' NOT NULL,
	`tools_json` text DEFAULT '[]' NOT NULL,
	`kb_ids_json` text DEFAULT '[]' NOT NULL,
	`is_builtin` integer DEFAULT false NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`base_url` text,
	`api_key_ref` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`models_json` text DEFAULT '[]' NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`scope_id` text,
	`key` text NOT NULL,
	`value_json` text DEFAULT '{}' NOT NULL,
	`secret_ref` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_scope_scope_id_key_unique` ON `settings` (`scope`,`scope_id`,`key`);--> statement-breakpoint
CREATE TABLE `blobs` (
	`hash` text PRIMARY KEY NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`original_name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`blob_hash` text NOT NULL,
	`name` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blob_hash`) REFERENCES `blobs`(`hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`parent_message_id` text,
	`role` text NOT NULL,
	`model_id` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`content_blocks_json` text DEFAULT '[]' NOT NULL,
	`tool_calls_json` text,
	`tool_call_id` text,
	`error_json` text,
	`token_usage_json` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`window_id` text NOT NULL,
	`route` text DEFAULT '/chat' NOT NULL,
	`bounds_json` text DEFAULT '{}' NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`is_focused` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_windows_window_id_unique` ON `session_windows` (`window_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`assistant_id` text,
	`title` text DEFAULT '新对话' NOT NULL,
	`type` text DEFAULT 'chat' NOT NULL,
	`parent_session_id` text,
	`fork_message_id` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assistant_id`) REFERENCES `assistants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sync_events` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`op` text NOT NULL,
	`payload_json` text NOT NULL,
	`vector_clock` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
