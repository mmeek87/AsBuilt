// Published test cards, one per payment provider, taken from each provider's
// own documentation. AsBuilt only ever types these: a check file names the
// provider, never a card number, so a real card can't reach a payment form.
// Each one is refused by the provider's live system or only exists in its
// sandbox. Sources (checked Nov 26, 2026):
//   stripe     https://docs.stripe.com/testing
//   paddle     https://developer.paddle.com/sdks/sandbox  (CVC 100)
//   square     https://developer.squareup.com/docs/devtools/sandbox/payments  (CVV 111)
//   braintree  https://developer.paypal.com/braintree/docs/guides/credit-cards/testing-go-live
//   adyen      https://docs.adyen.com/development-resources/test-cards-and-credentials/test-card-numbers  (03/30, 737)
//   test-visa  the industry-wide Visa test number used by many sandboxes
//              (Cybersource, Primer, Checkout.com and others); any future
//              expiry and any 3-digit code
export const TEST_CARDS = {
  stripe: { number: "4242424242424242", expiry: "12/34", cvc: "123" },
  paddle: { number: "4242424242424242", expiry: "12/34", cvc: "100" },
  square: { number: "4111111111111111", expiry: "12/34", cvc: "111" },
  braintree: { number: "4111111111111111", expiry: "12/34", cvc: "123" },
  adyen: { number: "4111111145551142", expiry: "03/30", cvc: "737" },
  "test-visa": { number: "4111111111111111", expiry: "12/34", cvc: "123" },
};
export const TEST_HOLDER = { name: "AsBuilt Test", postal: "10001" };
export const CARD_PROVIDERS = Object.keys(TEST_CARDS);
