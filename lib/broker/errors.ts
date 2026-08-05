// Never include a credential value in any of these — messages are safe to
// log, display, and pass through to audit_log.

/** Missing, malformed, or suspicious broker configuration. Thrown by the
 * adapter factory before any adapter object is ever constructed — the app
 * fails closed rather than returning a half-configured adapter. */
export class BrokerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerConfigError";
  }
}

/** The broker returned a definite error response (4xx/5xx with a body we
 * could parse) — the request's outcome is known, just unsuccessful. Only
 * ever thrown by read-only GET requests now (see ReadOnlyAlpacaClient), so
 * there is no "ambiguous write outcome" case left to represent — that
 * error class existed only for order submission, which no longer makes any
 * network call at all. */
export class BrokerRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly brokerMessage?: string
  ) {
    super(message);
    this.name = "BrokerRequestError";
  }
}
