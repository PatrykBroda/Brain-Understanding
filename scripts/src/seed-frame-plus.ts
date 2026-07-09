import Stripe from "stripe";

const PLAN_KEY = "frame_plus";
const PRODUCT_NAME = "FRAME+";
const UNIT_AMOUNT = 699; // £6.99
const CURRENCY = "gbp";

async function getStripeSecretKey(): Promise<string> {
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error("Missing Replit env vars for the Stripe connection.");
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } },
  );
  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status}`);
  }
  const data = (await resp.json()) as {
    items?: Array<{ settings?: { secret?: string; secret_key?: string } }>;
  };
  const settings = data.items?.[0]?.settings;
  const key = settings?.secret ?? settings?.secret_key;
  if (!key) throw new Error("Stripe integration not connected.");
  return key;
}

async function main(): Promise<void> {
  const stripe = new Stripe(await getStripeSecretKey());

  // Idempotent: find existing product by plan_key metadata first.
  const existing = await stripe.products.search({
    query: `metadata['plan_key']:'${PLAN_KEY}' AND active:'true'`,
  });
  let product = existing.data[0];
  if (product) {
    console.log(`Product exists: ${product.id} (${product.name})`);
  } else {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      description:
        "Unlimited coaching, full athlete model, complete analysis history, and full weekly missions.",
      metadata: { plan_key: PLAN_KEY },
    });
    console.log(`Created product: ${product.id}`);
  }

  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });
  let price = prices.data.find(
    (p) =>
      p.currency === CURRENCY &&
      p.unit_amount === UNIT_AMOUNT &&
      p.recurring?.interval === "month",
  );
  if (price) {
    console.log(`Price exists: ${price.id} (${price.unit_amount} ${price.currency}/month)`);
  } else {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: UNIT_AMOUNT,
      currency: CURRENCY,
      recurring: { interval: "month" },
    });
    console.log(`Created price: ${price.id} (699 gbp/month)`);
  }

  console.log("FRAME+ seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
