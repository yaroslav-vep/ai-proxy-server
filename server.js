const express = require("express");
const cors = require("cors");
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY";

console.log('API KEY loaded:', GEMINI_API_KEY ? 'yes' : 'no');
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

/**
 * POST /chat
 * Body: { "message": "Your question here" }
 * Returns: { "reply": "Gemini's response" }
 */
app.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: 'Missing or invalid "message" field.' });
  }

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: message }],
          },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error("Gemini API error:", errBody);
      return res.status(geminiRes.status).json({ error: "Gemini API error", details: errBody });
    }

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no response)";

    return res.json({ reply });
  } catch (err) {
    console.error("Server error:", err.message);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

/**
 * POST /analyze-food-image
 * Body: { "imageBase64": "<base64 string>", "mimeType": "image/jpeg" }
 * Returns: {
 *   "dishName": "...", "calories": 0, "protein": 0, "fats": 0, "carbs": 0,
 *   "ingredients": ["..."], "instructions": ["..."]
 * }
 */
app.post("/analyze-food-image", async (req, res) => {
  const { imageBase64, mimeType } = req.body;

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return res.status(400).json({ error: 'Missing or invalid "imageBase64" field.' });
  }

  const imageMime = mimeType || "image/jpeg";

  const prompt = `Analyze this food photo and provide information in English.
Return the result as a JSON object with this exact structure:
{
  "dishName": "Name of the dish",
  "calories": 0,
  "protein": 0.0,
  "fats": 0.0,
  "carbs": 0.0,
  "ingredients": ["ingredient 1 with quantity", "ingredient 2 with quantity"],
  "instructions": ["Step 1", "Step 2"]
}
Rules:
- All text values must be in English.
- calories: integer kcal.
- protein, fats, carbs: float grams.
- If food is not recognized, set dishName: "Unrecognized Dish" and all numbers to 0.`;

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: imageMime,
                  data: imageBase64,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error("Gemini Vision API error:", errBody);
      return res.status(geminiRes.status).json({ error: "Gemini API error", details: errBody });
    }

    const data = await geminiRes.json();
    let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    console.log("Cleaned JSON (first 300 chars):", rawText.substring(0, 300));

    let analysis;
    try {
      // Robust JSON extraction in case of unexpected wrappers
      const jsonStart = rawText.indexOf('{');
      const jsonEnd = rawText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        rawText = rawText.substring(jsonStart, jsonEnd + 1);
      }

      analysis = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr.message, "Raw:", rawText.substring(0, 500));
      return res.status(500).json({
        error: "Failed to parse AI response as JSON",
        details: parseErr.message,
        raw: rawText.substring(0, 500)
      });
    }

    return res.json(analysis);
  } catch (err) {
    console.error("Server error:", err.message);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gemini proxy server running on http://localhost:${PORT}`);
  console.log(`Send POST requests to http://localhost:${PORT}/chat`);
  console.log(`Send POST requests to http://localhost:${PORT}/analyze-food-image`);
});
