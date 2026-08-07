CREATE TABLE `content_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`channel` text NOT NULL,
	`source_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_drafts_owner_status` ON `content_drafts` (`owner_id`,`status`);--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`score` integer,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(`user_id`, `lesson_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_lesson_progress_user` ON `lesson_progress` (`user_id`);--> statement-breakpoint
CREATE TABLE `member_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`member_name` text NOT NULL,
	`milestone` text NOT NULL,
	`next_action` text NOT NULL,
	`due_label` text DEFAULT 'Өнөөдөр' NOT NULL,
	`risk` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_member_tasks_owner_status` ON `member_tasks` (`owner_id`,`status`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'builder' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
