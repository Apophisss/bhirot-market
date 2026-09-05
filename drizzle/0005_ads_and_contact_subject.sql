ALTER TABLE `contact_message` ADD `subject` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `gclid` text;--> statement-breakpoint
ALTER TABLE `user` ADD `utmSource` text;--> statement-breakpoint
ALTER TABLE `user` ADD `utmCampaign` text;--> statement-breakpoint
ALTER TABLE `user` ADD `signupReportedAt` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `firstTradeReportedAt` integer;