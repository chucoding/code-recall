import {onRequest, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import Stripe from "stripe";

/** 로드 시점에 키가 없을 수 있으므로(에뮬레이터 등) 지연 초기화. 실제 호출 시 키 없으면 throw */
let stripeInstance: Stripe | null = null;
function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  stripeInstance = new Stripe(key, {apiVersion: "2026-01-28.clover"});
  return stripeInstance;
}

const db = getFirestore();

/**
 * Firebase ID Token 검증 후 uid 반환
 */
async function getUidFromRequest(req: { headers: { authorization?: string } }): Promise<string> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HttpsError("unauthenticated", "ID token required.");
  }
  const idToken = authHeader.split("Bearer ")[1];
  const decoded = await getAuth().verifyIdToken(idToken);
  return decoded.uid;
}

/**
 * Pro 체크아웃 세션 생성 (월간/연간)
 * POST body: { priceId: 'monthly' | 'yearly', returnUrlBase: string }
 */
export const createCheckoutSession = onRequest(
  {cors: true, region: "asia-northeast3", invoker: "public"},
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }
    try {
      const uid = await getUidFromRequest(req);
      const {priceId, returnUrlBase} = req.body as { priceId?: string; returnUrlBase?: string };
      const priceIdMonthly = process.env.STRIPE_PRICE_ID_MONTHLY;
      const priceIdYearly = process.env.STRIPE_PRICE_ID_YEARLY;
      if (!priceIdMonthly || !priceIdYearly) {
        res.status(500).json({error: "Stripe price IDs not configured"});
        return;
      }
      const stripePriceId = priceId === "yearly" ? priceIdYearly : priceIdMonthly;
      const base = returnUrlBase || "https://coderecall.app";
      const successUrl = `${base}/#settings?subscription=success`;
      const cancelUrl = `${base}/#settings?subscription=cancel`;

      const userDoc = await db.collection("users").doc(uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      const stripeCustomerId = userData?.stripeCustomerId as string | undefined;
      const email = (await getAuth().getUser(uid).catch(() => null))?.email;

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "subscription",
        line_items: [{price: stripePriceId, quantity: 1}],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: uid,
        subscription_data: {
          metadata: {firebase_uid: uid},
        },
      };
      if (stripeCustomerId) {
        sessionParams.customer = stripeCustomerId;
      } else if (email) {
        sessionParams.customer_email = email;
      }

      const session = await getStripe().checkout.sessions.create(sessionParams);
      res.status(200).json({url: session.url});
    } catch (e: unknown) {
      if (e instanceof HttpsError) {
        res.status(401).json({error: e.message});
        return;
      }
      console.error("createCheckoutSession error:", e);
      res.status(500).json({error: "Failed to create checkout session"});
    }
  }
);

/**
 * Stripe 웹훅: checkout.session.completed, customer.subscription.updated/deleted
 * rawBody 사용 (Firebase v2에서 가능한 경우). 없으면 body로 대체.
 */
export const stripeWebhook = onRequest(
  {cors: false, region: "asia-northeast3", invoker: "public"},
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).end();
      return;
    }
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret || !sig) {
      res.status(400).json({error: "Missing signature or webhook secret"});
      return;
    }
    let rawBody: Buffer | string;
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (raw) {
      rawBody = raw;
    } else {
      rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      res.status(400).json({error: "Invalid signature"});
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const uid = session.client_reference_id as string | null;
          const subId = session.subscription as string | null;
          if (!subId) break;
          const sub = await getStripe().subscriptions.retrieve(subId);
          const resolvedUid = uid || (sub.metadata as { firebase_uid?: string })?.firebase_uid;
          if (resolvedUid) {
            const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
            const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;
            await setPro(resolvedUid, periodEnd, customerId);
          }
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const uid = (sub.metadata as { firebase_uid?: string })?.firebase_uid;
          if (uid) {
            if (sub.status === "active" || sub.status === "trialing") {
              const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;
              await setPro(uid, periodEnd, undefined);
            } else {
              await setFree(uid);
            }
          }
          break;
        }
        default:
          break;
      }
      res.status(200).json({received: true});
    } catch (err) {
      console.error("Webhook handler error:", err);
      res.status(500).json({error: "Webhook handler failed"});
    }
  }
);

async function setPro(uid: string, periodEnd: number, stripeCustomerId?: string): Promise<void> {
  const ref = db.collection("users").doc(uid);
  const endDate = new Date(periodEnd * 1000).toISOString();
  const update: Record<string, unknown> = {
    subscriptionTier: "pro",
    subscriptionPeriodEnd: endDate,
    updatedAt: new Date().toISOString(),
  };
  if (stripeCustomerId) update.stripeCustomerId = stripeCustomerId;
  await ref.set(update, {merge: true});
}

async function setFree(uid: string): Promise<void> {
  await db.collection("users").doc(uid).set(
    {
      subscriptionTier: "free",
      subscriptionPeriodEnd: null,
      updatedAt: new Date().toISOString(),
    },
    {merge: true}
  );
}

