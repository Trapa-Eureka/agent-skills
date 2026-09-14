/**
 * Certificate identity constraints a signature must satisfy to be accepted — pins verification
 * to a specific OIDC issuer and workload identity rather than "signed by Sigstore at all".
 */
export interface SignatureVerificationOptions {
  /** Expected Fulcio certificate issuer, e.g. `'https://token.actions.githubusercontent.com'`. */
  certificateIssuer: string
  /** Expected certificate Subject Alternative Name (the signing workflow's OIDC identity URI). */
  certificateIdentityURI: string
}

/**
 * Cryptographic signature verification required by core services. Kept as its own port (rather
 * than calling `sigstore.verify` directly from a service) so tests can inject a fake instead of
 * relying on module mocking — module mocking is unreliable under this workspace's ESM + ts-jest
 * setup (see the note in `update.service.spec.ts`) and has previously caused a suite to silently
 * exercise real production code while believing it was mocked.
 */
export interface SignatureVerifierPort {
  /**
   * Verifies a signature bundle against `data`, throwing when verification fails for any reason
   * (bad signature, wrong identity, malformed bundle, transparency log failure, ...).
   *
   * @param bundle - Parsed signature bundle (e.g. a Sigstore bundle fetched as JSON).
   * @param data - Exact bytes the bundle is expected to have signed.
   * @param options - Identity constraints the signing certificate must satisfy.
   * @throws {Error} When the bundle does not verify against `data` and `options`.
   */
  verify(bundle: unknown, data: Buffer, options: SignatureVerificationOptions): Promise<void>
}
