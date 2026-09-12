/**
 * Defines response and persisted-session shapes for the legacy Web API.
 *
 * These types are deliberately separate from the native Mega contracts. They
 * describe only values required by WebClient and the WebRTC experiment, not a
 * public promise about Eufy's portal response schema.
 */

/** ECDH identity cached for one Web API host. */
export interface WebApiIdentity {
  readonly keyIdent: string;
  readonly sharedKey: string;
  readonly privateKey: string;
  readonly publicKey: string;
}

/** Persisted Web API login state, separate from native Mega session state. */
export interface WebSession {
  readonly version: 1;
  readonly country: string;
  readonly loginHash: string;
  readonly host: string;
  readonly authToken: string;
  readonly userId: string;
  readonly tokenExpiresAt: number;
  readonly clientPrivateKey: string;
  readonly clientPublicKey: string;
  readonly serverPublicKey: string;
  readonly apiIdentity: WebApiIdentity;
}

/** Web login outcome and any challenge data needed by the caller. */
export interface WebAuthResult {
  readonly state: "authenticated" | "verification-required" | "captcha-required";
  readonly captcha?: { readonly id: string; readonly image: string };
}
