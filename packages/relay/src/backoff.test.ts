import { describe, it, expect } from "vitest";
import { calculateBackoff, createBackoffController } from "./backoff";

describe("calculateBackoff", () => {
  it("returns initial delay on first attempt", () => {
    const state = calculateBackoff(0, { initialDelay: 1000, jitter: false });
    expect(state.attempt).toBe(0);
    expect(state.nextDelay).toBe(1000);
    expect(state.exhausted).toBe(false);
  });

  it("doubles delay on each attempt", () => {
    const delays = [0, 1, 2, 3].map(
      (attempt) =>
        calculateBackoff(attempt, { initialDelay: 1000, jitter: false })
          .nextDelay
    );
    expect(delays).toEqual([1000, 2000, 4000, 8000]);
  });

  it("caps delay at maxDelay", () => {
    // Attempt 5: 1000 * 2^5 = 32000, but capped at 5000
    const state = calculateBackoff(5, {
      initialDelay: 1000,
      maxDelay: 5000,
      maxAttempts: 10,
      jitter: false,
    });
    expect(state.nextDelay).toBe(5000);
    expect(state.exhausted).toBe(false);
  });

  it("marks as exhausted after maxAttempts", () => {
    const state = calculateBackoff(10, { maxAttempts: 10 });
    expect(state.exhausted).toBe(true);
    expect(state.nextDelay).toBe(0);
  });

  it("adds jitter within expected range", () => {
    const delays: number[] = [];
    for (let i = 0; i < 100; i++) {
      delays.push(
        calculateBackoff(0, { initialDelay: 1000, jitter: true }).nextDelay
      );
    }
    // With ±25% jitter on 1000ms, range should be 750-1250
    const min = Math.min(...delays);
    const max = Math.max(...delays);
    expect(min).toBeGreaterThanOrEqual(750);
    expect(max).toBeLessThanOrEqual(1250);
    // Should have some variation
    expect(max - min).toBeGreaterThan(100);
  });

  it("uses custom multiplier", () => {
    const state = calculateBackoff(2, {
      initialDelay: 1000,
      multiplier: 3,
      jitter: false,
    });
    expect(state.nextDelay).toBe(9000); // 1000 * 3^2
  });

  it("never exceeds maxDelay even with jitter", () => {
    const maxDelay = 5000;
    // Run many iterations at a high attempt number where delay would be capped
    for (let i = 0; i < 100; i++) {
      const state = calculateBackoff(10, {
        initialDelay: 1000,
        maxDelay,
        maxAttempts: 20,
        jitter: true,
      });
      expect(state.nextDelay).toBeLessThanOrEqual(maxDelay);
    }
  });
});

describe("createBackoffController", () => {
  it("starts at attempt 0", () => {
    const controller = createBackoffController({ jitter: false });
    expect(controller.getAttempt()).toBe(0);
  });

  it("increments attempt on each next() call", () => {
    const controller = createBackoffController({
      initialDelay: 1000,
      jitter: false,
    });

    const first = controller.next();
    expect(first.attempt).toBe(0);
    expect(first.nextDelay).toBe(1000);
    expect(controller.getAttempt()).toBe(1);

    const second = controller.next();
    expect(second.attempt).toBe(1);
    expect(second.nextDelay).toBe(2000);
    expect(controller.getAttempt()).toBe(2);
  });

  it("resets attempt counter", () => {
    const controller = createBackoffController({ jitter: false });
    controller.next();
    controller.next();
    expect(controller.getAttempt()).toBe(2);

    controller.reset();
    expect(controller.getAttempt()).toBe(0);
  });

  it("reports exhausted state", () => {
    const controller = createBackoffController({ maxAttempts: 3, jitter: false });
    expect(controller.isExhausted()).toBe(false);

    controller.next(); // 0
    controller.next(); // 1
    controller.next(); // 2
    expect(controller.isExhausted()).toBe(true);

    const state = controller.next();
    expect(state.exhausted).toBe(true);
  });
});
