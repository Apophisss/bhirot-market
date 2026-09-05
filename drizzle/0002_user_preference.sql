CREATE TABLE `user_preference` (
	`userId` text PRIMARY KEY NOT NULL,
	`topics` text DEFAULT '[]' NOT NULL,
	`people` text DEFAULT '[]' NOT NULL,
	`horizon` text DEFAULT 'mixed' NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
