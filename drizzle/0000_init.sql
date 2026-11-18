CREATE TABLE `adventure_log` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`session_no` integer,
	`played_at` integer,
	`title` text NOT NULL,
	`body` text,
	`level_after` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `log_campaign_idx` ON `adventure_log` (`campaign_id`,`played_at`);--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_record` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`schema_version` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaign` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`dm_name` text,
	`mode` text DEFAULT 'campaign' NOT NULL,
	`edition` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_level` integer,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaign_player` (
	`campaign_id` text NOT NULL,
	`player_id` text NOT NULL,
	`role` text DEFAULT 'player' NOT NULL,
	PRIMARY KEY(`campaign_id`, `player_id`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `character` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`campaign_id` text,
	`player_id` text,
	`edition` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_revision_id` text,
	`biography` text DEFAULT '{}' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `char_campaign_idx` ON `character` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `character_content_ref` (
	`revision_id` text NOT NULL,
	`uid` text NOT NULL,
	`package_id` text NOT NULL,
	`package_version` text NOT NULL,
	`hash` text NOT NULL,
	`name` text NOT NULL,
	`mechanics_snapshot` text,
	PRIMARY KEY(`revision_id`, `uid`),
	FOREIGN KEY (`revision_id`) REFERENCES `character_revision`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ref_pkg_idx` ON `character_content_ref` (`package_id`);--> statement-breakpoint
CREATE TABLE `character_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`parent_id` text,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`build` text NOT NULL,
	`engine_version` text NOT NULL,
	`summary` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rev_char_seq_idx` ON `character_revision` (`character_id`,`seq`);--> statement-breakpoint
CREATE TABLE `character_state` (
	`character_id` text PRIMARY KEY NOT NULL,
	`hp_current` integer,
	`hp_temp` integer DEFAULT 0 NOT NULL,
	`hit_dice_used` text DEFAULT '{}' NOT NULL,
	`slots_used` text DEFAULT '{"standard":[],"pact":0}' NOT NULL,
	`resources_used` text DEFAULT '{}' NOT NULL,
	`conditions` text DEFAULT '[]' NOT NULL,
	`exhaustion` integer DEFAULT 0 NOT NULL,
	`prepared_spells` text DEFAULT '{}' NOT NULL,
	`currency` text DEFAULT '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `content_dependency` (
	`from_uid` text NOT NULL,
	`to_uid` text NOT NULL,
	`package_id` text NOT NULL,
	`package_version` text NOT NULL,
	`kind` text NOT NULL,
	`level` integer,
	PRIMARY KEY(`from_uid`, `to_uid`, `kind`, `package_id`, `package_version`)
);
--> statement-breakpoint
CREATE INDEX `dep_to_idx` ON `content_dependency` (`to_uid`,`kind`);--> statement-breakpoint
CREATE TABLE `content_item` (
	`uid` text NOT NULL,
	`package_id` text NOT NULL,
	`package_version` text NOT NULL,
	`type` text NOT NULL,
	`edition` text NOT NULL,
	`name` text NOT NULL,
	`mechanics` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`spell_level` integer,
	`spell_school` text,
	`concentration` integer,
	`ritual` integer,
	`source_ref` text,
	`hash` text NOT NULL,
	PRIMARY KEY(`uid`, `package_id`, `package_version`)
);
--> statement-breakpoint
CREATE INDEX `item_type_edition_idx` ON `content_item` (`type`,`edition`);--> statement-breakpoint
CREATE INDEX `item_spell_idx` ON `content_item` (`spell_level`,`spell_school`);--> statement-breakpoint
CREATE TABLE `content_item_text` (
	`uid` text NOT NULL,
	`locale` text NOT NULL,
	`from_package_id` text NOT NULL,
	`from_package_version` text NOT NULL,
	`name` text NOT NULL,
	`summary` text,
	`body` text,
	`source_text_hash` text,
	`stale` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`uid`, `locale`, `from_package_id`)
);
--> statement-breakpoint
CREATE INDEX `text_locale_idx` ON `content_item_text` (`locale`,`name`);--> statement-breakpoint
CREATE TABLE `content_package` (
	`id` text NOT NULL,
	`version` text NOT NULL,
	`source_id` text NOT NULL,
	`name` text NOT NULL,
	`namespace` text,
	`edition` text,
	`format_version` integer NOT NULL,
	`origin` text NOT NULL,
	`kind` text DEFAULT 'content' NOT NULL,
	`language` text NOT NULL,
	`target_package_id` text,
	`hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`id`, `version`),
	FOREIGN KEY (`source_id`) REFERENCES `content_source`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pkg_active_idx` ON `content_package` (`id`,`active`);--> statement-breakpoint
CREATE TABLE `content_source` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`publisher` text,
	`edition` text NOT NULL,
	`document_version` text NOT NULL,
	`url` text,
	`license_code` text NOT NULL,
	`license_url` text,
	`attribution` text,
	`modifications` text,
	`rights_basis` text,
	`allowed_use` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_item` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`content_uid` text,
	`custom_name` text,
	`custom_mechanics` text,
	`qty` integer DEFAULT 1 NOT NULL,
	`slot` text,
	`attuned` integer DEFAULT false NOT NULL,
	`container_id` text,
	`magic_bonus` integer DEFAULT 0 NOT NULL,
	`charges_used` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inv_char_idx` ON `inventory_item` (`character_id`);--> statement-breakpoint
CREATE TABLE `note` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `note_owner_idx` ON `note` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE `player` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
