CREATE TABLE `knowledge_bases` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`embed_config_json` text DEFAULT '{}' NOT NULL,
	`chunk_config_json` text DEFAULT '{}' NOT NULL,
	`watch_config_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`document_count` integer DEFAULT 0 NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `knowledge_bases_workspace_id_idx` ON `knowledge_bases` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `document_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`kb_id` text NOT NULL,
	`type` text NOT NULL,
	`uri` text NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`kb_id`) REFERENCES `knowledge_bases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_sources_kb_id_idx` ON `document_sources` (`kb_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`kb_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`content_hash` text,
	`mime_type` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`absolute_path` text,
	`blob_hash` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`error_json` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `document_sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`kb_id`) REFERENCES `knowledge_bases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blob_hash`) REFERENCES `blobs`(`hash`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `documents_kb_id_idx` ON `documents` (`kb_id`);--> statement-breakpoint
CREATE INDEX `documents_source_id_idx` ON `documents` (`source_id`);--> statement-breakpoint
CREATE INDEX `documents_content_hash_idx` ON `documents` (`content_hash`);--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`kb_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`text` text NOT NULL,
	`token_count` integer,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kb_id`) REFERENCES `knowledge_bases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chunks_document_id_idx` ON `chunks` (`document_id`);--> statement-breakpoint
CREATE INDEX `chunks_kb_id_idx` ON `chunks` (`kb_id`);--> statement-breakpoint
CREATE TABLE `ingest_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`kb_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`stage` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`error_json` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kb_id`) REFERENCES `knowledge_bases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ingest_jobs_document_id_idx` ON `ingest_jobs` (`document_id`);--> statement-breakpoint
CREATE INDEX `ingest_jobs_kb_id_idx` ON `ingest_jobs` (`kb_id`);--> statement-breakpoint
CREATE TABLE `memory_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`assistant_id` text,
	`session_id` text,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`source` text DEFAULT 'conversation' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memory_entries_workspace_id_idx` ON `memory_entries` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `file_registry` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`absolute_path` text NOT NULL,
	`content_hash` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`mtime_ms` integer NOT NULL,
	`document_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_registry_workspace_path_unique` ON `file_registry` (`workspace_id`,`absolute_path`);--> statement-breakpoint
CREATE INDEX `file_registry_workspace_id_idx` ON `file_registry` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `file_registry_content_hash_idx` ON `file_registry` (`content_hash`);
