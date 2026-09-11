let fallbackId: string | undefined;

export function visitorId() {
  try {
    const saved = localStorage.getItem("perkdrop-visitor");
    if (saved && /^[a-zA-Z0-9-]{16,128}$/.test(saved)) return saved;
    const id = fallbackId ?? crypto.randomUUID();
    localStorage.setItem("perkdrop-visitor", id);
    return id;
  } catch {
    fallbackId ??= crypto.randomUUID();
    return fallbackId;
  }
}
