ALTER TABLE `checkout_attempts` ADD `stripe_params` text;--> statement-breakpoint
ALTER TABLE `homepage_content` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `homepage_content` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `orders` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `site_settings` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `site_settings` DROP COLUMN `created_at`;--> statement-breakpoint
CREATE TRIGGER clear_purchased_cart AFTER UPDATE OF status ON checkout_attempts
WHEN OLD.status='reserved' AND NEW.status='paid'
BEGIN
 DELETE FROM cart_items WHERE cart_id=(SELECT id FROM carts WHERE session_id=NEW.session_id) AND variant_id IN (SELECT variant_id FROM checkout_items WHERE attempt_id=NEW.id) AND quantity <= (SELECT SUM(quantity) FROM checkout_items WHERE attempt_id=NEW.id AND variant_id=cart_items.variant_id);
 UPDATE cart_items SET quantity=quantity-(SELECT SUM(quantity) FROM checkout_items WHERE attempt_id=NEW.id AND variant_id=cart_items.variant_id) WHERE cart_id=(SELECT id FROM carts WHERE session_id=NEW.session_id) AND variant_id IN (SELECT variant_id FROM checkout_items WHERE attempt_id=NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER reset_token_single_use BEFORE UPDATE OF used ON reset_tokens
WHEN NEW.used>1 OR OLD.expires<CAST(strftime('%s','now') AS INTEGER)*1000
BEGIN
 SELECT RAISE(ABORT,'Reset link already used or expired');
END;
--> statement-breakpoint
CREATE TRIGGER single_initial_admin BEFORE INSERT ON admins
WHEN EXISTS(SELECT 1 FROM admins)
BEGIN
 SELECT RAISE(ABORT,'Initial administrator already exists');
END;
