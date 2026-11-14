export type Message = { role: string; text: string };

/** Parses stored prompt/completion content: GenAI message arrays (parts or content) or plain text. */
export function parseMessages(raw: string): Message[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.every((m) => m && typeof m === "object")) {
      return data.map((m) => ({ role: String(m.role || ""), text: contentText(m.parts ?? m.content ?? m) }));
    }
    if (data && typeof data === "object") return [{ role: "", text: JSON.stringify(data, null, 2) }];
  } catch {
    /* plain text */
  }
  return [{ role: "", text: raw }];
}

function contentText(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c.map((p) => (typeof p === "string" ? p : typeof p?.content === "string" ? p.content : typeof p?.text === "string" ? p.text : JSON.stringify(p))).join("\n");
  }
  return JSON.stringify(c, null, 2);
}

export const lastUserMessage = (raw: string) => parseMessages(raw).filter((m) => m.role === "user").pop()?.text || "";
