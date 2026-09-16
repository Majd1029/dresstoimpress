CREATE TABLE `addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `addresses_user_idx` ON `addresses` (`user_id`);--> statement-breakpoint
CREATE TABLE `admins` (
	`user_id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cart_items` (
	`id` text PRIMARY KEY NOT NULL,
	`cart_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cart_qty" CHECK("cart_items"."quantity">0 AND "cart_items"."quantity"<=20)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cart_variant_idx` ON `cart_items` (`cart_id`,`variant_id`);--> statement-breakpoint
CREATE TABLE `carts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carts_session_id_unique` ON `carts` (`session_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `checkout_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`request_key` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'reserved' NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`subtotal` integer NOT NULL,
	`shipping` integer NOT NULL,
	`tax` integer NOT NULL,
	`total` integer NOT NULL,
	`currency` text NOT NULL,
	`demo` integer NOT NULL,
	`stripe_id` text,
	`stripe_url` text,
	`expires` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_attempts_stripe_id_unique` ON `checkout_attempts` (`stripe_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_request_idx` ON `checkout_attempts` (`session_id`,`request_key`);--> statement-breakpoint
CREATE TABLE `checkout_items` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`price` integer NOT NULL,
	`snapshot` text NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `checkout_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "checkout_qty" CHECK("checkout_items"."quantity">0 AND "checkout_items"."quantity"<=20)
);
--> statement-breakpoint
CREATE INDEX `checkout_items_attempt_idx` ON `checkout_items` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`user_id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_outbox_dedupe_key_unique` ON `email_outbox` (`dedupe_key`);--> statement-breakpoint
CREATE TABLE `homepage_content` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`variant_id` text PRIMARY KEY NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`threshold` integer DEFAULT 3 NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "stock_not_negative" CHECK("inventory"."stock">=0 AND "inventory"."threshold">=0)
);
--> statement-breakpoint
CREATE TABLE `newsletter_subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_subscribers_email_unique` ON `newsletter_subscribers` (`email`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`price` integer NOT NULL,
	`snapshot` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`user_id` text,
	`session_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`subtotal` integer NOT NULL,
	`shipping` integer NOT NULL,
	`tax` integer NOT NULL,
	`total` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'paid' NOT NULL,
	`payment_status` text NOT NULL,
	`demo` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `checkout_attempts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_attempt_id_unique` ON `orders` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`url` text NOT NULL,
	`alt` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_images_product_idx` ON `product_images` (`product_id`);--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`size` text NOT NULL,
	`color` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_variant_options_idx` ON `product_variants` (`product_id`,`size`,`color`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text NOT NULL,
	`price` integer NOT NULL,
	`sale_price` integer,
	`sku` text NOT NULL,
	`category_id` text,
	`materials` text DEFAULT '' NOT NULL,
	`care` text DEFAULT '' NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`is_new` integer DEFAULT 0 NOT NULL,
	`best_seller` integer DEFAULT 0 NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`demo` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "product_price_positive" CHECK("products"."price">0 AND ("products"."sale_price" IS NULL OR ("products"."sale_price">0 AND "products"."sale_price"<"products"."price")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `products_published_category_idx` ON `products` (`published`,`category_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reset_tokens` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text,
	`csrf` text NOT NULL,
	`expires` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'customer' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TRIGGER reserve_checkout_stock BEFORE INSERT ON checkout_items
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM product_variants v JOIN products p ON p.id=v.product_id JOIN inventory i ON i.variant_id=v.id JOIN checkout_attempts a ON a.id=NEW.attempt_id WHERE v.id=NEW.variant_id AND p.published=1 AND a.status='reserved' AND i.stock>=NEW.quantity AND COALESCE(p.sale_price,p.price)=NEW.price) THEN RAISE(ABORT, 'Stock or price changed') END;
 UPDATE inventory SET stock=stock-NEW.quantity WHERE variant_id=NEW.variant_id;
END;
--> statement-breakpoint
CREATE TRIGGER release_checkout_stock AFTER UPDATE OF status ON checkout_attempts
WHEN OLD.status='reserved' AND NEW.status='released'
BEGIN
 UPDATE inventory SET stock=stock+(SELECT COALESCE(SUM(quantity),0) FROM checkout_items WHERE attempt_id=NEW.id AND variant_id=inventory.variant_id) WHERE variant_id IN (SELECT variant_id FROM checkout_items WHERE attempt_id=NEW.id);
END;
