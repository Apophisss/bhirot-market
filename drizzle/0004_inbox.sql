CREATE TABLE `contact_message` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` text,
	`name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`topic` text DEFAULT 'other' NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`adminNote` text,
	`createdAt` integer NOT NULL,
	`handledAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `contact_status_idx` ON `contact_message` (`status`,`createdAt`);--> statement-breakpoint
CREATE TABLE `question_suggestion` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` text,
	`name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`resolutionCriteria` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`imageUrl` text,
	`probability` real,
	`sourceUrl` text,
	`closesAt` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`adminNote` text,
	`publishedSlug` text,
	`createdAt` integer NOT NULL,
	`reviewedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `suggestion_status_idx` ON `question_suggestion` (`status`,`createdAt`);