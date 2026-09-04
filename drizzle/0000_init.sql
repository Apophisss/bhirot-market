CREATE TABLE `account` (
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `providerAccountId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`added` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`ok` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` text NOT NULL,
	`marketId` text NOT NULL,
	`body` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marketId`) REFERENCES `market`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comment_market_idx` ON `comment` (`marketId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `market` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`description` text DEFAULT '' NOT NULL,
	`resolutionCriteria` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`imageUrl` text,
	`people` text DEFAULT '[]' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`resolutionNote` text,
	`resolvedAt` integer,
	`closesAt` integer NOT NULL,
	`liquidity` real DEFAULT 2000 NOT NULL,
	`qYes` real DEFAULT 0 NOT NULL,
	`qNo` real DEFAULT 0 NOT NULL,
	`probability` real DEFAULT 0.5 NOT NULL,
	`volume` real DEFAULT 0 NOT NULL,
	`tradeCount` integer DEFAULT 0 NOT NULL,
	`createdBy` text DEFAULT 'seed' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `market_status_idx` ON `market` (`status`);--> statement-breakpoint
CREATE INDEX `market_category_idx` ON `market` (`category`);--> statement-breakpoint
CREATE TABLE `position` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` text NOT NULL,
	`marketId` text NOT NULL,
	`yesShares` real DEFAULT 0 NOT NULL,
	`noShares` real DEFAULT 0 NOT NULL,
	`yesCost` real DEFAULT 0 NOT NULL,
	`noCost` real DEFAULT 0 NOT NULL,
	`realizedPnl` real DEFAULT 0 NOT NULL,
	`settled` integer DEFAULT false NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marketId`) REFERENCES `market`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `position_user_market_idx` ON `position` (`userId`,`marketId`);--> statement-breakpoint
CREATE INDEX `position_market_idx` ON `position` (`marketId`);--> statement-breakpoint
CREATE TABLE `price_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`marketId` text NOT NULL,
	`probability` real NOT NULL,
	`ts` integer NOT NULL,
	FOREIGN KEY (`marketId`) REFERENCES `market`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `price_history_market_idx` ON `price_history` (`marketId`,`ts`);--> statement-breakpoint
CREATE TABLE `session` (
	`sessionToken` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` text NOT NULL,
	`marketId` text NOT NULL,
	`side` text NOT NULL,
	`action` text NOT NULL,
	`shares` real NOT NULL,
	`amount` real NOT NULL,
	`priceBefore` real NOT NULL,
	`priceAfter` real NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marketId`) REFERENCES `market`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trade_market_idx` ON `trade` (`marketId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `trade_user_idx` ON `trade` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`emailVerified` integer,
	`image` text,
	`balance` real DEFAULT 10000 NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verificationToken` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
