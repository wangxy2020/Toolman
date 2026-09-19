ALTER TABLE `knowledge_bases` ADD `retrieval_config_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_bases` ADD `active_index_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_bases` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_bases` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `document_sources` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `document_sources` ADD `fetched_at` integer;--> statement-breakpoint
ALTER TABLE `document_sources` ADD `http_status` integer;--> statement-breakpoint
ALTER TABLE `document_sources` ADD `etag` text;--> statement-breakpoint
ALTER TABLE `document_sources` ADD `last_modified` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `parsed_hash` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `revision_number` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `current_revision_id` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `index_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `index_fingerprint` text;--> statement-breakpoint
ALTER TABLE `chunks` ADD `revision_id` text;--> statement-breakpoint
ALTER TABLE `chunks` ADD `index_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `knowledge_index_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`kb_id` text NOT NULL,
	`version` integer NOT NULL,
	`embedding_model` text DEFAULT '' NOT NULL,
	`embedding_dimension` integer DEFAULT 0 NOT NULL,
	`chunk_strategy` text DEFAULT 'markdown' NOT NULL,
	`chunk_size` integer DEFAULT 512 NOT NULL,
	`chunk_overlap` integer DEFAULT 64 NOT NULL,
	`reranker` text,
	`vector_backend` text DEFAULT 'file' NOT NULL,
	`index_fingerprint` text,
	`status` text DEFAULT 'active' NOT NULL,
	`error_json` text,
	`created_at` integer NOT NULL,
	`activated_at` integer,
	`retired_at` integer,
	FOREIGN KEY (`kb_id`) REFERENCES `knowledge_bases`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `knowledge_index_versions_kb_version_unique` ON `knowledge_index_versions` (`kb_id`,`version`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `knowledge_index_versions_kb_id_idx` ON `knowledge_index_versions` (`kb_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `document_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`kb_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`content_hash` text,
	`parsed_hash` text,
	`index_fingerprint` text,
	`index_version` integer DEFAULT 1 NOT NULL,
	`is_current` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kb_id`) REFERENCES `knowledge_bases`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `document_revisions_doc_number_unique` ON `document_revisions` (`document_id`,`revision_number`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `document_revisions_document_id_idx` ON `document_revisions` (`document_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `document_revisions_kb_id_idx` ON `document_revisions` (`kb_id`);--> statement-breakpoint
INSERT INTO `knowledge_index_versions` (
	`id`,
	`kb_id`,
	`version`,
	`embedding_model`,
	`embedding_dimension`,
	`chunk_strategy`,
	`chunk_size`,
	`chunk_overlap`,
	`reranker`,
	`vector_backend`,
	`status`,
	`created_at`,
	`activated_at`
)
SELECT
	`id` || ':idx:1',
	`id`,
	1,
	COALESCE(json_extract(`embed_config_json`, '$.embedModelId'), 'bge-m3:latest'),
	COALESCE(CAST(json_extract(`embed_config_json`, '$.embedDimension') AS INTEGER), 1024),
	COALESCE(json_extract(`chunk_config_json`, '$.strategy'), 'markdown'),
	COALESCE(CAST(json_extract(`chunk_config_json`, '$.chunkSize') AS INTEGER), 512),
	COALESCE(CAST(json_extract(`chunk_config_json`, '$.chunkOverlap') AS INTEGER), 64),
	json_extract(`embed_config_json`, '$.rerankModelId'),
	COALESCE(json_extract(`embed_config_json`, '$.vectorBackend'), 'file'),
	'active',
	`created_at`,
	`created_at`
FROM `knowledge_bases`
WHERE NOT EXISTS (
	SELECT 1 FROM `knowledge_index_versions` AS `v`
	WHERE `v`.`kb_id` = `knowledge_bases`.`id` AND `v`.`version` = 1
);--> statement-breakpoint
INSERT INTO `document_revisions` (
	`id`,
	`document_id`,
	`kb_id`,
	`revision_number`,
	`content_hash`,
	`parsed_hash`,
	`index_fingerprint`,
	`index_version`,
	`is_current`,
	`created_at`
)
SELECT
	`id` || ':rev:1',
	`id`,
	`kb_id`,
	1,
	`content_hash`,
	`parsed_hash`,
	`index_fingerprint`,
	COALESCE(`index_version`, 1),
	1,
	`created_at`
FROM `documents`
WHERE NOT EXISTS (
	SELECT 1 FROM `document_revisions` AS `r`
	WHERE `r`.`document_id` = `documents`.`id` AND `r`.`revision_number` = 1
);--> statement-breakpoint
UPDATE `documents`
SET `current_revision_id` = `id` || ':rev:1'
WHERE `current_revision_id` IS NULL;