import { describe, it, expect, beforeAll } from "vitest";
import { server } from "../src/index";

describe("Health", () => {
  beforeAll(async () => {
    await server.ready();
  });

  it("should return 200 with ok status and database connected", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/health",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("ok");
    expect(body.database).toBe("connected");
    expect(body.timestamp).toBeDefined();
  });

  it("should return a greeting", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/hello?name=Test",
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).message).toBe("Hello, Test!");
  });

  it("should default greeting to world", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/hello",
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).message).toBe("Hello, world!");
  });
});
