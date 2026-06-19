CREATE VIRTUAL TABLE IF NOT EXISTS `chunks_fts` USING fts5(
	`chunk_id` UNINDEXED,
	`kb_id` UNINDEXED,
	`document_id` UNINDEXED,
	`text`,
	tokenize = 'unicode61'
);
