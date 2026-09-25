import { describe, it, expect, vi, beforeEach } from "vitest";
import { geminiIstek, geminiModelleri } from "../lib/gemini";

const cevap = (status: number, govde: unknown) => new Response(JSON.stringify(govde), { status });
const basari = (metin: string) => cevap(200, { candidates: [{ finishReason: "STOP", content: { parts: [{ text: metin }] } }] });
const istek = { contents: [{ role: "user" as const, parts: [{ text: "x" }] }] };

describe("Gemini yedek model geçişi", () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = "test"; delete process.env.GEMINI_MODEL; vi.restoreAllMocks(); });

  it("kota dolunca aynı modeli tekrar denemeden yedeğe geçer", async () => {
    const f = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(cevap(429, { error: { message: "Quota exceeded. Please retry in 23.9s." } }))
      .mockResolvedValueOnce(basari("tamam"));
    const s = await geminiIstek(istek);
    expect(s).toMatchObject({ ok: true, metin: "tamam", model: geminiModelleri()[1] });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("hepsi doluysa bekleme süresiyle Türkçe mesaj verir", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => cevap(429, { error: { message: "Please retry in 23.9s." } }));
    const s = await geminiIstek(istek);
    expect(s.ok).toBe(false);
    if (!s.ok) { expect(s.status).toBe(429); expect(s.hata).toContain("24 saniye"); }
  });

  it("thinking ayarını desteklemeyen modelde ayarı çıkarıp tekrar dener", async () => {
    const f = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(cevap(400, { error: { message: "thinking_level is not supported" } }))
      .mockResolvedValueOnce(basari("ok"));
    const s = await geminiIstek(istek);
    expect(s.ok).toBe(true);
    const ikinciGovde = JSON.parse((f.mock.calls[1][1] as RequestInit).body as string);
    expect(ikinciGovde.generationConfig.thinkingConfig).toBeUndefined();
  });

  it("anahtar yoksa açık hata verir", async () => {
    delete process.env.GEMINI_API_KEY;
    const s = await geminiIstek(istek);
    expect(s.ok).toBe(false);
  });
});
