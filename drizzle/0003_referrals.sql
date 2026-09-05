CREATE TABLE `referral` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`referrerId` text NOT NULL,
	`invitedId` text NOT NULL,
	`bonus` real DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`referrerId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitedId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_invited_idx` ON `referral` (`invitedId`);--> statement-breakpoint
CREATE INDEX `referral_referrer_idx` ON `referral` (`referrerId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `user` ADD `referralCode` text;--> statement-breakpoint
ALTER TABLE `user` ADD `referredBy` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_referralCode_unique` ON `user` (`referralCode`);