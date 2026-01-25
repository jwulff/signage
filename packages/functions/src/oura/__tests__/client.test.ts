import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockDdbSend } = vi.hoisted(() => ({
  mockDdbSend: vi.fn(),
}));

vi.mock("sst", () => ({
  Resource: {
    SignageTable: { name: "test-table" },
    OuraClientId: { value: "test-client-id" },
    OuraClientSecret: { value: "test-client-secret" },
  },
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mockDdbSend })),
  },
  GetCommand: vi.fn((params) => ({ type: "Get", params })),
  PutCommand: vi.fn((params) => ({ type: "Put", params })),
}));

import {
  getOuraUsers,
  getOuraUserProfile,
  getTokens,
  saveTokens,
  refreshTokens,
  getValidAccessToken,
  fetchUserInfo,
  fetchReadiness,
  cacheReadiness,
  getCachedReadiness,
} from "../client";

describe("oura client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    mockDdbSend.mockResolvedValue({});
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("getOuraUsers", () => {
    it("returns list of user IDs from DynamoDB", async () => {
      mockDdbSend.mockResolvedValueOnce({
        Item: { pk: "OURA_USERS", sk: "LIST", userIds: ["user1", "user2"] },
      });

      const users = await getOuraUsers();

      expect(users).toEqual(["user1", "user2"]);
      expect(mockDdbSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "Get",
          params: expect.objectContaining({
            Key: { pk: "OURA_USERS", sk: "LIST" },
          }),
        })
      );
    });

    it("returns empty array when no users found", async () => {
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });

      const users = await getOuraUsers();

      expect(users).toEqual([]);
    });

    it("returns empty array on error", async () => {
      mockDdbSend.mockRejectedValueOnce(new Error("DynamoDB error"));

      const users = await getOuraUsers();

      expect(users).toEqual([]);
    });
  });

  describe("getOuraUserProfile", () => {
    it("returns user profile from DynamoDB", async () => {
      mockDdbSend.mockResolvedValueOnce({
        Item: {
          pk: "OURA_USER#user1",
          sk: "PROFILE",
          userId: "user1",
          displayName: "Test User",
          initial: "T",
          ouraUserId: "oura-123",
          createdAt: "2024-01-01T00:00:00Z",
          needsReauth: false,
        },
      });

      const profile = await getOuraUserProfile("user1");

      expect(profile).toEqual({
        userId: "user1",
        displayName: "Test User",
        initial: "T",
        ouraUserId: "oura-123",
        createdAt: "2024-01-01T00:00:00Z",
        needsReauth: false,
      });
    });

    it("returns null when profile not found", async () => {
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });

      const profile = await getOuraUserProfile("unknown");

      expect(profile).toBeNull();
    });

    it("returns null on error", async () => {
      mockDdbSend.mockRejectedValueOnce(new Error("DynamoDB error"));

      const profile = await getOuraUserProfile("user1");

      expect(profile).toBeNull();
    });
  });

  describe("getTokens", () => {
    it("returns tokens from DynamoDB", async () => {
      const now = Date.now();
      mockDdbSend.mockResolvedValueOnce({
        Item: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: now + 3600000,
        },
      });

      const tokens = await getTokens("user1");

      expect(tokens).toEqual({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: now + 3600000,
      });
    });

    it("returns null when tokens not found", async () => {
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });

      const tokens = await getTokens("unknown");

      expect(tokens).toBeNull();
    });
  });

  describe("saveTokens", () => {
    it("saves tokens to DynamoDB", async () => {
      const tokens = {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresAt: Date.now() + 3600000,
        scope: "personal email daily",
      };

      await saveTokens("user1", tokens);

      expect(mockDdbSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "Put",
          params: expect.objectContaining({
            Item: expect.objectContaining({
              pk: "OURA_USER#user1",
              sk: "TOKENS",
              accessToken: "new-access",
              refreshToken: "new-refresh",
            }),
          }),
        })
      );
    });
  });

  describe("refreshTokens", () => {
    it("refreshes tokens via Oura API", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 3600,
          }),
      });

      const tokens = await refreshTokens("old-refresh-token");

      expect(tokens.accessToken).toBe("new-access-token");
      expect(tokens.refreshToken).toBe("new-refresh-token");
      expect(tokens.expiresAt).toBeGreaterThan(Date.now());
    });

    it("throws on token refresh failure", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Invalid refresh token"),
      });

      await expect(refreshTokens("bad-token")).rejects.toThrow(
        "Token refresh failed"
      );
    });
  });

  describe("getValidAccessToken", () => {
    it("returns access token when not expired", async () => {
      mockDdbSend.mockResolvedValueOnce({
        Item: {
          accessToken: "valid-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() + 3600000, // 1 hour from now
        },
      });

      const token = await getValidAccessToken("user1");

      expect(token).toBe("valid-token");
    });

    it("refreshes token when expired", async () => {
      mockDdbSend.mockResolvedValueOnce({
        Item: {
          accessToken: "expired-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() - 1000, // Already expired
        },
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "new-token",
            refresh_token: "new-refresh",
            expires_in: 3600,
          }),
      });

      const token = await getValidAccessToken("user1");

      expect(token).toBe("new-token");
    });

    it("returns null when no tokens exist", async () => {
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });

      const token = await getValidAccessToken("unknown");

      expect(token).toBeNull();
    });
  });

  describe("fetchUserInfo", () => {
    it("fetches user info from Oura API", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "oura-user-id",
            email: "user@example.com",
          }),
      });

      const userInfo = await fetchUserInfo("access-token");

      expect(userInfo).toEqual({
        id: "oura-user-id",
        email: "user@example.com",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.ouraring.com/v2/usercollection/personal_info",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer access-token",
          }),
        })
      );
    });

    it("throws on API failure", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      await expect(fetchUserInfo("bad-token")).rejects.toThrow();
    });
  });

  describe("fetchReadiness", () => {
    it("fetches readiness data from Oura API", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                day: "2024-01-15",
                score: 85,
                contributors: {
                  activity_balance: 80,
                  body_temperature: 90,
                  hrv_balance: 85,
                  previous_day_activity: 75,
                  previous_night: 88,
                  recovery_index: 82,
                  resting_heart_rate: 78,
                  sleep_balance: 86,
                },
              },
            ],
          }),
      });

      const readiness = await fetchReadiness("access-token", "2024-01-15", "2024-01-15");

      expect(readiness).toHaveLength(1);
      expect(readiness[0].score).toBe(85);
      expect(readiness[0].date).toBe("2024-01-15");
      expect(readiness[0].contributors.activityBalance).toBe(80);
    });

    it("returns empty array when no data available", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const readiness = await fetchReadiness("access-token", "2024-01-15", "2024-01-15");

      expect(readiness).toEqual([]);
    });
  });

  describe("cacheReadiness", () => {
    it("caches readiness data in DynamoDB", async () => {
      const readiness = {
        date: "2024-01-15",
        score: 85,
        contributors: {
          activityBalance: 80,
          bodyTemperature: 90,
          hrvBalance: 85,
          previousDayActivity: 75,
          previousNight: 88,
          recoveryIndex: 82,
          restingHeartRate: 78,
          sleepBalance: 86,
        },
        fetchedAt: Date.now(),
      };

      await cacheReadiness("user1", readiness);

      expect(mockDdbSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "Put",
          params: expect.objectContaining({
            Item: expect.objectContaining({
              pk: "OURA_USER#user1",
              sk: "READINESS#2024-01-15",
              score: 85,
            }),
          }),
        })
      );
    });
  });

  describe("getCachedReadiness", () => {
    it("returns cached readiness from DynamoDB", async () => {
      mockDdbSend.mockResolvedValueOnce({
        Item: {
          pk: "OURA_USER#user1",
          sk: "READINESS#2024-01-15",
          date: "2024-01-15",
          score: 85,
          contributors: {
            activityBalance: 80,
            bodyTemperature: 90,
            hrvBalance: 85,
            previousDayActivity: 75,
            previousNight: 88,
            recoveryIndex: 82,
            restingHeartRate: 78,
            sleepBalance: 86,
          },
          fetchedAt: 1705320000000,
        },
      });

      const readiness = await getCachedReadiness("user1", "2024-01-15");

      expect(readiness).not.toBeNull();
      expect(readiness?.score).toBe(85);
      expect(readiness?.date).toBe("2024-01-15");
    });

    it("returns null when not cached", async () => {
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });

      const readiness = await getCachedReadiness("user1", "2024-01-15");

      expect(readiness).toBeNull();
    });
  });
});
