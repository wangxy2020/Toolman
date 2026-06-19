CREATE TABLE `p2p_device_identity` (
	`device_id` text PRIMARY KEY NOT NULL,
	`identity_id` text NOT NULL,
	`public_key` text NOT NULL,
	`private_key_ref` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
