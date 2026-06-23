CREATE TABLE `p2p_cid_index` (
	`cid` text PRIMARY KEY NOT NULL,
	`root_cid` text NOT NULL,
	`package_id` text,
	`resource_id` text,
	`resource_type` text,
	`version` text,
	`local_path` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_p2p_cid_index_root` ON `p2p_cid_index` (`root_cid`);
--> statement-breakpoint
CREATE INDEX `idx_p2p_cid_index_resource` ON `p2p_cid_index` (`resource_id`, `version`);
