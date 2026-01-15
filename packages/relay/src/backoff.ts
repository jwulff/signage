/**
 * Exponential backoff utility for reconnection logic
 */

export interface BackoffOptions {
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Multiplier for each attempt (default: 2) */
  multiplier?: number;
  /** Maximum number of attempts before giving up (default: 10) */
  maxAttempts?: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  jitter?: boolean;
}

export interface BackoffState {
  attempt: number;
  nextDelay: number;
  exhausted: boolean;
}

const DEFAULT_OPTIONS: Required<BackoffOptions> = {
  initialDelay: 1000,
  maxDelay: 30000,
  multiplier: 2,
  maxAttempts: 10,
  jitter: true,
};

/**
 * Calculate the next backoff delay
 */
export function calculateBackoff(
  attempt: number,
  options: BackoffOptions = {}
): BackoffState {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (attempt >= opts.maxAttempts) {
    return {
      attempt,
      nextDelay: 0,
      exhausted: true,
    };
  }

  // Calculate base delay with exponential increase
  let delay = opts.initialDelay * Math.pow(opts.multiplier, attempt);

  // Cap at maximum delay
  delay = Math.min(delay, opts.maxDelay);

  // Add jitter (±25%) to prevent thundering herd
  if (opts.jitter) {
    const jitterRange = delay * 0.25;
    delay = delay - jitterRange + Math.random() * jitterRange * 2;
  }

  return {
    attempt,
    nextDelay: Math.round(delay),
    exhausted: false,
  };
}

/**
 * Create a backoff controller for managing reconnection state
 */
export function createBackoffController(options: BackoffOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let attempt = 0;

  return {
    /** Get the current attempt number */
    getAttempt: () => attempt,

    /** Calculate next delay and increment attempt counter */
    next: (): BackoffState => {
      const state = calculateBackoff(attempt, opts);
      attempt++;
      return state;
    },

    /** Reset the backoff state (call on successful connection) */
    reset: () => {
      attempt = 0;
    },

    /** Check if max attempts have been reached */
    isExhausted: () => attempt >= opts.maxAttempts,
  };
}
