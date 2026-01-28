require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));
const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});

app.use("/api/", limiter);

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/api/analyze", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY가 .env에 없습니다." });

    const model = String(req.body?.model ?? "").trim();
    const symptom = String(req.body?.symptom ?? "").trim();
    if (!model || !symptom) return res.status(400).json({ error: "model / symptom 값이 비었습니다." });

    const prompt = `기종: ${model}\n증상: ${symptom}\n\n아래 JSON 형태로만 한국어로 답하세요.\n{\n  "officialPrice": "예: 420,000",\n  "privatePrice": "예: 250,000 ~ 300,000",\n  "analysis": "핵심 진단 요약(2~4문장)",\n  "detailedParts": [{ "name": "부품명", "role": "역할", "trait": "정품/호환 특징" }],\n  "time": "예: 30~60분"\n}`

    const url = "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=" + encodeURIComponent(apiKey);
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const rawText = await r.text();
    let raw;
    try { raw = JSON.parse(rawText); } catch { return res.status(502).json({ error: "Gemini 응답 파싱 실패", rawText }); }

    if (!r.ok || raw?.error) return res.status(502).json({ error: raw?.error?.message ?? "Gemini 호출 실패", code: raw?.error?.code ?? r.status, detail: raw });

    const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s < 0 || e < 0) return res.status(502).json({ error: "응답에 JSON이 없습니다.", text });

    return res.json(JSON.parse(text.slice(s, e + 1)));
  } catch (e) {
    return res.status(500).json({ error: "서버 내부 오류", detail: String(e) });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}\n테스트: http://localhost:${PORT}/health`));
