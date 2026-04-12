import { describe, it, expect } from "vitest";
import { ServiceTitanClient, ServiceTitanError } from "../src/index.js";

describe("ServiceTitanClient", () => {
  it("throws if required env vars are missing", () => {
    delete process.env.SERVICETITAN_CLIENT_ID;
    expect(() => new ServiceTitanClient()).toThrow("Missing required env var: SERVICETITAN_CLIENT_ID");
  });

  it("accepts explicit config without env vars", () => {
    const client = new ServiceTitanClient({
      clientId: "test-id",
      clientSecret: "test-secret",
      tenantId: "12345",
      appKey: "test-key",
    });
    expect(client.tenantId).toBe("12345");
    expect(client.appKey).toBe("test-key");
  });

  it("resolves {tenantId} in paths", () => {
    const client = new ServiceTitanClient({
      clientId: "x",
      clientSecret: "x",
      tenantId: "99999",
      appKey: "x",
    });
    expect(client.tenantPath("inventory/v2/tenant/{tenantId}/trucks")).toBe(
      "inventory/v2/tenant/99999/trucks",
    );
  });

  it("ServiceTitanError includes status code", () => {
    const err = new ServiceTitanError("Not found", 404);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.name).toBe("ServiceTitanError");
  });
});
