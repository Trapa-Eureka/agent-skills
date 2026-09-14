import { verify, type Bundle } from 'sigstore'

import type { SignatureVerificationOptions, SignatureVerifierPort } from '../ports/signature-verifier.port'

/**
 * Real implementation of {@link SignatureVerifierPort} backed by the `sigstore` package —
 * verifies a Sigstore bundle's certificate chain, signature, and transparency log inclusion,
 * constrained to the given certificate identity.
 */
export class SigstoreSignatureVerifierAdapter implements SignatureVerifierPort {
  /**
   * @inheritdoc
   */
  public async verify(bundle: unknown, data: Buffer, options: SignatureVerificationOptions): Promise<void> {
    await verify(bundle as Bundle, data, {
      certificateIssuer: options.certificateIssuer,
      certificateIdentityURI: options.certificateIdentityURI,
    })
  }
}
