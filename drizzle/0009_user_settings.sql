CREATE TABLE `user_setting` (
	`userId` text PRIMARY KEY NOT NULL,
	`rapidStake` integer,
	`rapidSort` text,
	`rapidIncludeAnswered` integer,
	`surveySnoozedUntil` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
