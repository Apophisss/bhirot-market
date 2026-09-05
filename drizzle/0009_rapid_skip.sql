CREATE TABLE `rapid_skip` (
	`userId` text NOT NULL,
	`marketId` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `marketId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marketId`) REFERENCES `market`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rapid_skip_user_idx` ON `rapid_skip` (`userId`);