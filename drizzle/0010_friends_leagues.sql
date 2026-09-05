CREATE TABLE `friendship` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requesterId` text NOT NULL,
	`addresseeId` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`createdAt` integer NOT NULL,
	`respondedAt` integer,
	FOREIGN KEY (`requesterId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`addresseeId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friendship_pair_idx` ON `friendship` (`requesterId`,`addresseeId`);--> statement-breakpoint
CREATE INDEX `friendship_addressee_idx` ON `friendship` (`addresseeId`,`status`);--> statement-breakpoint
CREATE INDEX `friendship_requester_idx` ON `friendship` (`requesterId`,`status`);--> statement-breakpoint
CREATE TABLE `league_member` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`leagueId` integer NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'member' NOT NULL,
	`invitedBy` text,
	`createdAt` integer NOT NULL,
	`joinedAt` integer,
	FOREIGN KEY (`leagueId`) REFERENCES `league`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `league_member_idx` ON `league_member` (`leagueId`,`userId`);--> statement-breakpoint
CREATE INDEX `league_member_user_idx` ON `league_member` (`userId`,`status`);--> statement-breakpoint
CREATE TABLE `league` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`ownerId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `league_code_unique` ON `league` (`code`);--> statement-breakpoint
CREATE INDEX `league_owner_idx` ON `league` (`ownerId`);