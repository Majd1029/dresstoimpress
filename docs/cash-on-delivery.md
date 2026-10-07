# Cash on delivery

The configured payment method is cash on delivery (COD), in Tunisian dinars. Delivery is limited to Sousse, Tunisia, with a delivery fee of TND 0.000, as requested by the owner.

Customers can browse publicly but must sign in to order. COD requires a delivery address and phone number. The server checks the delivery country/city and calculates all prices and totals; no card details or Stripe request is involved.

## Order handling

1. A COD order starts as **pending / Awaiting cash on delivery**. Stock is reserved and the ordered items leave the bag.
2. Move it to **processing**, then **shipped**, then **delivered** in the administrator dashboard.
3. Use **Mark cash collected** only after receiving the full amount. This is separate from delivery status. Uncollected COD orders do not count as paid revenue.
4. Before shipment, cancelling an unpaid COD order returns its stock exactly once. Shipped orders cannot use that cancellation shortcut. Cash refunds and post-shipment returns require manual handling; they never invoke Stripe.

Repeated checkout submissions return the existing order. Expired checkout recovery does not release stock for a confirmed COD order.

## Demo content and launch

The existing demo catalog remains demo content. While live sales is off, COD produces a clearly labeled test order with no money due and no shipment. Test cash collection does not count as real revenue.

Before enabling live sales, add real products and inventory, configure a customer contact email, and replace the placeholder shipping and returns policies. COD does not require Stripe credentials. Keep the configured delivery area and price accurate. Email confirmations remain queued until an email service is configured; orders are still available in the dashboard and customer account.

Settings under **Payments & launch** select COD or card payment. Delivery cities, countries, and shipping fee are editable under **Shipping & taxes**. Blank delivery cities permits any city in the configured countries.
