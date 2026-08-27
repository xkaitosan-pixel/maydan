import { describe, expect, it, vi } from "vitest";
import { getStableGuestId } from "@/lib/guestIdentity";

describe("getStableGuestId", () => {
  it("creates and persists one guest identity", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    };
    expect(getStableGuestId(storage, () => "stable-id")).toBe("stable-id");
    expect(storage.setItem).toHaveBeenCalledWith("maydan_guest_id", "stable-id");
  });

  it("reuses the persisted identity", () => {
    const create = vi.fn(() => "new-id");
    expect(getStableGuestId({
      getItem: () => "existing-id",
      setItem: vi.fn(),
    }, create)).toBe("existing-id");
    expect(create).not.toHaveBeenCalled();
  });
});