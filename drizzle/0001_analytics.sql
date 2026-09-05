CREATE TABLE `analytics_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`referrer` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`medium` text DEFAULT '' NOT NULL,
	`campaign` text DEFAULT '' NOT NULL,
	`visitorId` text DEFAULT '' NOT NULL,
	`sessionId` text DEFAULT '' NOT NULL,
	`userId` text,
	`marketId` text,
	`device` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`value` real,
	`props` text DEFAULT '{}' NOT NULL,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_ts_idx` ON `analytics_event` (`ts`);--> statement-breakpoint
CREATE INDEX `analytics_name_ts_idx` ON `analytics_event` (`name`,`ts`);--> statement-breakpoint
CREATE INDEX `analytics_path_ts_idx` ON `analytics_event` (`path`,`ts`);--> statement-breakpoint
CREATE INDEX `analytics_visitor_ts_idx` ON `analytics_event` (`visitorId`,`ts`);--> statement-breakpoint
CREATE INDEX `analytics_market_ts_idx` ON `analytics_event` (`marketId`,`ts`);--> statement-breakpoint
CREATE INDEX `analytics_user_ts_idx` ON `analytics_event` (`userId`,`ts`);--> statement-breakpoint
CREATE INDEX `analytics_session_ts_idx` ON `analytics_event` (`sessionId`,`ts`);