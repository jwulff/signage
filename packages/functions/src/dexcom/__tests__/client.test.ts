import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseDexcomTimestamp,
  getSessionId,
  fetchGlucoseReadings,
  DEXCOM_BASE_URL,
  DEXCOM_APP_ID,
  type DexcomCredentials,
  type DexcomReading,
} from "../client";

describe("parseDexcomTimestamp", () => {
  it("parses valid Dexcom timestamp format", () => {
    const timestamp = parseDexcomTimestamp("Date(1705678901234)");
    expect(timestamp).toBe(1705678901234);
  });

  it("returns 0 for invalid format", () => {
    expect(parseDexcomTimestamp("invalid")).toBe(0);
    expect(parseDexcomTimestamp("")).toBe(0);
    expect(parseDexcomTimestamp("Date()")).toBe(0);
  });

  it("handles timestamp with additional characters", () => {
    // Some API responses may have extra formatting
    const timestamp = parseDexcomTimestamp("Date(1705678901234)/");
    expect(timestamp).toBe(1705678901234);
  });
});

describe("getSessionId", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  const credentials: DexcomCredentials = {
    username: "test-user",
    password: "test-pass",
  };

  it("authenticates and returns session ID", async () => {
    fetchMock
      // AuthenticatePublisherAccount
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("mock-account-id"),
      })
      // LoginPublisherAccountById
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("mock-session-id"),
      });

    const sessionId = await getSessionId(credentials);

    expect(sessionId).toBe("mock-session-id");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("calls AuthenticatePublisherAccount with correct payload", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("mock-account-id"),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("mock-session-id"),
      });

    await getSessionId(credentials);

    const [authUrl, authOptions] = fetchMock.mock.calls[0];
    expect(authUrl).toBe(
      `${DEXCOM_BASE_URL}/General/AuthenticatePublisherAccount`
    );
    expect(JSON.parse(authOptions.body)).toEqual({
      accountName: "test-user",
      password: "test-pass",
      applicationId: DEXCOM_APP_ID,
    });
  });

  it("calls LoginPublisherAccountById with account ID", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("the-account-id"),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("mock-session-id"),
      });

    await getSessionId(credentials);

    const [loginUrl, loginOptions] = fetchMock.mock.calls[1];
    expect(loginUrl).toBe(
      `${DEXCOM_BASE_URL}/General/LoginPublisherAccountById`
    );
    expect(JSON.parse(loginOptions.body)).toEqual({
      accountId: "the-account-id",
      password: "test-pass",
      applicationId: DEXCOM_APP_ID,
    });
  });

  it("throws on authentication failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Invalid credentials"),
    });

    await expect(getSessionId(credentials)).rejects.toThrow(
      "Dexcom auth failed: 401"
    );
  });

  it("throws on login failure", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("mock-account-id"),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

    await expect(getSessionId(credentials)).rejects.toThrow(
      "Dexcom login failed: 500"
    );
  });
});

describe("fetchGlucoseReadings", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("fetches glucose readings with default parameters", async () => {
    const mockReadings: DexcomReading[] = [
      {
        WT: "Date(1705678901234)",
        ST: "2024-01-19T12:00:00",
        DT: "2024-01-19T12:00:00",
        Value: 120,
        Trend: "Flat",
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockReadings),
    });

    const readings = await fetchGlucoseReadings("test-session");

    expect(readings).toEqual(mockReadings);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("calls API with correct URL and parameters", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await fetchGlucoseReadings("my-session", 60, 10);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `${DEXCOM_BASE_URL}/Publisher/ReadPublisherLatestGlucoseValues?sessionId=my-session&minutes=60&maxCount=10`
    );
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      "Content-Type": "application/json",
      Accept: "application/json",
    });
  });

  it("uses default values for minutes and maxCount", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await fetchGlucoseReadings("my-session");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("minutes=30");
    expect(url).toContain("maxCount=2");
  });

  it("throws on fetch failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
    });

    await expect(fetchGlucoseReadings("bad-session")).rejects.toThrow(
      "Dexcom fetch failed: 400"
    );
  });

  it("returns multiple readings in order", async () => {
    const now = Date.now();
    const mockReadings: DexcomReading[] = [
      {
        WT: `Date(${now})`,
        ST: "",
        DT: "",
        Value: 130,
        Trend: "SingleUp",
      },
      {
        WT: `Date(${now - 5 * 60 * 1000})`,
        ST: "",
        DT: "",
        Value: 120,
        Trend: "Flat",
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockReadings),
    });

    const readings = await fetchGlucoseReadings("test-session", 30, 2);

    expect(readings).toHaveLength(2);
    expect(readings[0].Value).toBe(130); // Newest first
    expect(readings[1].Value).toBe(120);
  });
});

describe("constants", () => {
  it("exports correct Dexcom base URL", () => {
    expect(DEXCOM_BASE_URL).toBe(
      "https://share2.dexcom.com/ShareWebServices/Services"
    );
  });

  it("exports correct Dexcom app ID", () => {
    expect(DEXCOM_APP_ID).toBe("d89443d2-327c-4a6f-89e5-496bbb0317db");
  });
});
