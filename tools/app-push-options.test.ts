import { describe, expect, test } from "bun:test";
import { parseOptions } from "./app-push";

describe("app push options", () => {
  test("accepts a private image directory with an existing package", () => {
    expect(parseOptions(["--package", "a.pocket", "--slot", "dev.example", "--image-dir", "/dev/shm/images"]))
      .toMatchObject({ packagePath: "a.pocket", slotId: "dev.example", imageDirectory: "/dev/shm/images" });
  });

  test("rejects missing, duplicate and unknown image-dir options", () => {
    expect(() => parseOptions(["--package", "a", "--slot", "id", "--image-dir"])).toThrow("requires a value");
    expect(() => parseOptions(["--package", "a", "--slot", "id", "--image-dir", "x", "--image-dir", "y"]))
      .toThrow("more than once");
    expect(() => parseOptions(["--package", "a", "--slot", "id", "--images", "x"])).toThrow("unknown option");
  });
});
