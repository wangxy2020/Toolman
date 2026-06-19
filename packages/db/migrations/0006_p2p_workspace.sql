CREATE TABLE `p2p_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_device_id` text NOT NULL,
	`owner_identity_id` text NOT NULL,
	`workspace_key_hash` text NOT NULL,
	`description` text,
	`avatar_hash` text,
	`max_members` integer DEFAULT 10 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`last_event_seq` integer DEFAULT 0 NOT NULL,
	`last_snapshot_seq` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`owner_identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_p2p_workspaces_owner` ON `p2p_workspaces` (`owner_identity_id`);--> statement-breakpoint
CREATE INDEX `idx_p2p_workspaces_status` ON `p2p_workspaces` (`status`);--> statement-breakpoint
CREATE TABLE `p2p_workspace_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`identity_id` text NOT NULL,
	`device_id` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`invited_by` text,
	`joined_at` integer,
	`last_seen_at` integer,
	`cert_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `p2p_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `p2p_workspace_members_workspace_device_unique` ON `p2p_workspace_members` (`workspace_id`,`device_id`);--> statement-breakpoint
CREATE INDEX `idx_p2p_members_workspace` ON `p2p_workspace_members` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_p2p_members_identity` ON `p2p_workspace_members` (`identity_id`);--> statement-breakpoint
CREATE TABLE `p2p_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`seq` integer NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`operator_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`prev_event_hash` text,
	`timestamp` integer NOT NULL,
	`source_device_id` text NOT NULL,
	`synced` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `p2p_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `p2p_events_workspace_seq_unique` ON `p2p_events` (`workspace_id`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_p2p_events_workspace_seq` ON `p2p_events` (`workspace_id`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_p2p_events_resource` ON `p2p_events` (`workspace_id`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `idx_p2p_events_timestamp` ON `p2p_events` (`workspace_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `p2p_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`snapshot_seq` integer NOT NULL,
	`state_json` text NOT NULL,
	`state_compressed` blob,
	`state_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `p2p_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_p2p_snapshots_workspace_seq` ON `p2p_snapshots` (`workspace_id`,`snapshot_seq`);--> statement-breakpoint
CREATE TABLE `p2p_shared_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`local_resource_id` text,
	`name` text NOT NULL,
	`shared_by` text NOT NULL,
	`permission` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`content_hash` text,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `p2p_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_p2p_shared_ws_type` ON `p2p_shared_resources` (`workspace_id`,`resource_type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_p2p_shared_local` ON `p2p_shared_resources` (`local_resource_id`);--> statement-breakpoint
CREATE TABLE `p2p_peer_nodes` (
	`workspace_id` text NOT NULL,
	`device_id` text NOT NULL,
	`display_name` text NOT NULL,
	`device_name` text NOT NULL,
	`public_key` text NOT NULL,
	`online` integer DEFAULT false NOT NULL,
	`last_seen_at` integer,
	`connection_state` text,
	`trusted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `device_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `p2p_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `p2p_sync_cursors` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`peer_device_id` text NOT NULL,
	`last_sent_seq` integer DEFAULT 0 NOT NULL,
	`last_received_seq` integer DEFAULT 0 NOT NULL,
	`last_sync_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `p2p_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `p2p_sync_cursors_workspace_peer_unique` ON `p2p_sync_cursors` (`workspace_id`,`peer_device_id`);--> statement-breakpoint
CREATE TABLE `p2p_file_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`shared_resource_id` text NOT NULL,
	`version` integer NOT NULL,
	`content_hash` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`mime_type` text,
	`uploaded_by` text NOT NULL,
	`event_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `p2p_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shared_resource_id`) REFERENCES `p2p_shared_resources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `p2p_events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `p2p_file_versions_resource_version_unique` ON `p2p_file_versions` (`shared_resource_id`,`version`);--> statement-breakpoint
CREATE TABLE `p2p_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text NOT NULL,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `p2p_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
