ALTER TABLE `checkout_attempts` ADD `payment_method` text DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_method` text DEFAULT 'stripe' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER clear_cod_cart AFTER UPDATE OF status ON checkout_attempts
WHEN OLD.status='reserved' AND NEW.status='cod_confirmed' AND NEW.payment_method='cod'
BEGIN
 DELETE FROM cart_items WHERE cart_id=(SELECT id FROM carts WHERE session_id=NEW.session_id) AND variant_id IN (SELECT variant_id FROM checkout_items WHERE attempt_id=NEW.id) AND quantity <= (SELECT SUM(quantity) FROM checkout_items WHERE attempt_id=NEW.id AND variant_id=cart_items.variant_id);
 UPDATE cart_items SET quantity=quantity-(SELECT SUM(quantity) FROM checkout_items WHERE attempt_id=NEW.id AND variant_id=cart_items.variant_id) WHERE cart_id=(SELECT id FROM carts WHERE session_id=NEW.session_id) AND variant_id IN (SELECT variant_id FROM checkout_items WHERE attempt_id=NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER cancel_cod_stock AFTER UPDATE OF status ON orders
WHEN OLD.status IN ('pending','processing') AND NEW.status='cancelled' AND OLD.payment_method='cod' AND OLD.payment_status IN ('cod_pending','demo_cod_pending')
BEGIN
 UPDATE inventory SET stock=stock+(SELECT COALESCE(SUM(quantity),0) FROM checkout_items WHERE attempt_id=NEW.attempt_id AND variant_id=inventory.variant_id) WHERE variant_id IN (SELECT variant_id FROM checkout_items WHERE attempt_id=NEW.attempt_id);
 UPDATE checkout_attempts SET status='cod_cancelled' WHERE id=NEW.attempt_id AND status='cod_confirmed';
END;
