import { afterEach, describe, expect, it, vi } from "vitest";
import { measureReads, nameReads, readLoggingOn, recordRead } from "./read-tally";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("read tally", () => {
  it("is off unless LOG_FIRESTORE_READS is 1", () => {
    expect(readLoggingOn({})).toBe(false);
    expect(readLoggingOn({ LOG_FIRESTORE_READS: "0" })).toBe(false);
    expect(readLoggingOn({ LOG_FIRESTORE_READS: "1" })).toBe(true);
  });
  it("runs the function and logs nothing when off", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await measureReads("x", async () => { recordRead("records", 5); return 7; })).toBe(7);
    expect(log).not.toHaveBeenCalled();
  });
  it("adds up reads per collection and logs one summary line, with the biggest first", async () => {
    vi.stubEnv("LOG_FIRESTORE_READS", "1");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await measureReads("page load", async () => { recordRead("records", 400); recordRead("records", 20); recordRead("accounts", 8); recordRead("none", 0); });
    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(log.mock.calls[0][0]));
    expect(line).toMatchObject({ t: "fs-reads", name: "page load", total: 428, top: { records: 420, accounts: 8 } });
    expect(Object.keys(line.top)).toEqual(["records", "accounts"]);
  });
  it("can rename the request once it is known, and still logs when the work throws", async () => {
    vi.stubEnv("LOG_FIRESTORE_READS", "1");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(measureReads("api/data", async () => { nameReads("api/data record.add"); recordRead("records", 3); throw new Error("boom"); })).rejects.toThrow("boom");
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ name: "api/data record.add", total: 3 });
  });
  it("logs a single line for a read outside any request", () => {
    vi.stubEnv("LOG_FIRESTORE_READS", "1");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    recordRead("participants", 4);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({ t: "fs-read", label: "participants", n: 4 });
  });
});
