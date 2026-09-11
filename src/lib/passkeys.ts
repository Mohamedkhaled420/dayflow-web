"use client";

// ============================================================
// Dayflow AI — passkeys (Amendment #17 / Phase 5 T4)
// ------------------------------------------------------------
// Raw WebAuthn against Supabase GoTrue's native WebAuthn
// endpoints — zero SDKs (the installed supabase-js 2.57.4 has no
// WebAuthn surface). navigator.credentials.create() enrolls at the
// end of onboarding; navigator.credentials.get() signs in from the
// auth page. The FALLBACK CHAIN is mandatory (never a dead end):
// unsupported browser, disabled server feature, or a dismissed /
// failed ceremony always resolves to revealing the password form.
//
// Wire shape (GoTrue /auth/v1/webauthn/*): options and ceremonies
// travel inside a { code, type, responses } envelope; binary
// fields are base64url strings. All parsing is defensive — any
// deviation throws PasskeyError and the caller falls back.
// ============================================================

export class PasskeyError extends Error {
  constructor(
    message: string,
    /** true → the platform/browser can't do passkeys at all */
    readonly unsupported = false
  ) {
    super(message);
    this.name = "PasskeyError";
  }
}

const b64urlEncode = (bytes: ArrayBufferLike): string => {
  const arr = new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const b64urlDecode = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

/** Recursively base64url-decode the fields WebAuthn expects as buffers. */
const decodeCredentialFields = (options: Record<string, unknown>): Record<string, unknown> => {
  const BUFFER_FIELDS = new Set(["challenge", "id", "rawId", "userHandle", "user.id"]);
  const walk = (node: unknown, key = ""): unknown => {
    if (typeof node === "string" && BUFFER_FIELDS.has(key)) {
      try {
        return b64urlDecode(node);
      } catch {
        return node;
      }
    }
    if (node && typeof node === "object" && !Array.isArray(node)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v, k);
      }
      return out;
    }
    return node;
  };
  return walk(options) as unknown as Record<string, unknown>;
};

/** Recursively base64url-encode buffer-ish fields for the return trip. */
const encodeCredentialFields = (credential: Record<string, unknown>): Record<string, unknown> => {
  const ENCODED_FIELDS = new Set(["rawId", "id", "userHandle"]);
  const walk = (node: unknown, key = ""): unknown => {
    if (
      ENCODED_FIELDS.has(key) &&
      typeof node === "object" && node !== null &&
      (node instanceof Uint8Array || node instanceof ArrayBuffer)
    ) {
      return b64urlEncode(node instanceof Uint8Array ? node.buffer : (node as ArrayBuffer));
    }
    if (node && typeof node === "object" && !Array.isArray(node)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v, k);
      }
      return out;
    }
    return node;
  };
  return walk(credential) as Record<string, unknown>;
};

const supabaseAuthUrl = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new PasskeyError("Supabase URL is not configured", true);
  return `${url.replace(/\/$/, "")}/auth/v1`;
};

const anonKey = () => {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new PasskeyError("Supabase anon key is not configured", true);
  return key;
};

interface GoTrueEnvelope {
  code?: number;
  type?: string;
  responses?: Record<string, unknown>;
  msg?: string;
  error?: string;
  error_description?: string;
}

const post = async (path: string, body: unknown, accessToken?: string) => {
  const res = await fetch(`${supabaseAuthUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey(),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as GoTrueEnvelope;
  if (!res.ok) {
    throw new PasskeyError(
      json.error_description ?? json.msg ?? json.error ?? `WebAuthn endpoint returned ${res.status}`
    );
  }
  return json;
};

/** Can this browser + build attempt passkeys at all? */
export function passkeysSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials !== "undefined" &&
    window.isSecureContext
  );
}

/**
 * Probe whether the Supabase project has WebAuthn enabled
 * (dashboard → Authentication → WebAuthn). A 4xx from the start
 * endpoint with "not enabled"/"not configured" semantics answers
 * no — the UI then hides the button and the password form stays
 * the primary path.
 */
export async function passkeysServerEnabled(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  try {
    await post("/webauthn/authenticate/start", {});
    // A successful (or "no credentials" 404-ish) round trip still
    // proves the feature is ON — the error would carry GoTrue's
    // feature-disabled message instead.
    return true;
  } catch (e) {
    if (e instanceof PasskeyError && e.unsupported) return false;
    const message = e instanceof Error ? e.message.toLowerCase() : "";
    if (message.includes("not enabled") || message.includes("disabled") || message.includes("not configured")) {
      return false;
    }
    // Endpoint reached and refused for a request-shape reason — the
    // feature exists; treat as enabled and let the ceremony decide.
    return true;
  }
}

/** Sign in with a passkey (discoverable / usernameless). */
export async function signInWithPasskey(): Promise<{ accessToken: string; refreshToken: string }> {
  if (!passkeysSupported()) {
    throw new PasskeyError("This browser can't use passkeys", true);
  }
  const start = await post("/webauthn/authenticate/start", {});
  const requestOptions = decodeCredentialFields(
    (start.responses?.publicKey ?? start.responses ?? {}) as Record<string, unknown>
  ) as unknown as PublicKeyCredentialRequestOptions;

  let assertion: PublicKeyCredential;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: requestOptions,
    })) as PublicKeyCredential;
  } catch (e) {
    // Cancelled / NotAllowedError / not-registered — the caller
    // falls back to the password form (mandatory chain).
    throw new PasskeyError(
      e instanceof Error && e.name === "NotAllowedError"
        ? "Passkey cancelled"
        : "No passkey available for this site"
    );
  }

  const payload = encodeCredentialFields({
    id: assertion.id,
    rawId: assertion.rawId,
    type: assertion.type,
    response: {
      clientDataJSON: (assertion.response as AuthenticatorAssertionResponse).clientDataJSON,
      authenticatorData: (assertion.response as AuthenticatorAssertionResponse).authenticatorData,
      signature: (assertion.response as AuthenticatorAssertionResponse).signature,
      userHandle: (assertion.response as AuthenticatorAssertionResponse).userHandle,
    },
  });

  const finish = await post("/webauthn/authenticate", { responses: payload });
  const session = (finish.responses?.session ?? finish.responses ?? {}) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!session.access_token || !session.refresh_token) {
    throw new PasskeyError("The server didn't return a session");
  }
  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}

/** Enroll a passkey for the signed-in user (offered after onboarding). */
export async function enrollPasskey(accessToken: string): Promise<void> {
  if (!passkeysSupported()) {
    throw new PasskeyError("This browser can't use passkeys", true);
  }
  const start = await post("/webauthn/register/start", {}, accessToken);
  const creationOptions = decodeCredentialFields(
    (start.responses?.publicKey ?? start.responses ?? {}) as Record<string, unknown>
  ) as unknown as PublicKeyCredentialCreationOptions;

  let attestation: PublicKeyCredential;
  try {
    attestation = (await navigator.credentials.create({
      publicKey: creationOptions,
    })) as PublicKeyCredential;
  } catch (e) {
    throw new PasskeyError(
      e instanceof Error && e.name === "NotAllowedError"
        ? "Passkey enrollment cancelled"
        : "Passkey enrollment failed"
    );
  }

  const payload = encodeCredentialFields({
    id: attestation.id,
    rawId: attestation.rawId,
    type: attestation.type,
    response: {
      clientDataJSON: (attestation.response as AuthenticatorAttestationResponse).clientDataJSON,
      attestationObject: (attestation.response as AuthenticatorAttestationResponse).attestationObject,
    },
  });

  await post("/webauthn/register", { responses: payload }, accessToken);
}
