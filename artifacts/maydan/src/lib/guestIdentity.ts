const GUEST_ID_KEY = "maydan_guest_id";

export function getStableGuestId(
  storage: Pick<Storage, "getItem" | "setItem">,
  createId: () => string = () => crypto.randomUUID(),
): string {
  const existing = storage.getItem(GUEST_ID_KEY);
  if (existing) return existing;
  const created = createId();
  storage.setItem(GUEST_ID_KEY, created);
  return created;
}