import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Fallback rates when API fails or is loading
const FALLBACK_RATES = {
  goldPriceUsdPerGram: 77.50,
  silverPriceUsdPerGram: 0.92,
  rates: {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.79,
    SAR: 3.75,
    AED: 3.67,
    INR: 83.5,
    PKR: 278.0,
    MYR: 4.7,
    IDR: 16200.0,
    KWD: 0.31,
    QAR: 3.64,
    CAD: 1.37,
    AUD: 1.51,
    TRY: 33.0,
    EGP: 48.0,
    BDT: 117.0
  },
  lastUpdated: new Date().toISOString().split("T")[0]
};

// In-memory cache for precious metal rates and exchange rates (12 hours)
let cachedRates: any = null;
let lastFetchTime = 0;
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

// API: Get live gold and silver rates with currency exchange
app.get("/api/rates", async (req, res) => {
  const now = Date.now();
  
  // If cache is valid, return cached rates
  if (cachedRates && (now - lastFetchTime < CACHE_DURATION)) {
    return res.json({ ...cachedRates, isCached: true });
  }

  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is not defined. Using fallback rates.");
      return res.json({ ...FALLBACK_RATES, isFallback: true });
    }

    const prompt = `Query the latest live market prices for gold per gram in USD, and exchange rates for major currencies. Search for: "current gold price per gram in USD" and "exchange rate USD to EUR, GBP, SAR, AED, INR, PKR, MYR, IDR, KWD, QAR, CAD, AUD, TRY, EGP, BDT". Provide exchange rates from 1 USD to each currency. 
    Return a raw JSON object with the following fields:
    {
      "goldPriceUsdPerGram": number, 
      "silverPriceUsdPerGram": number,
      "rates": {
        "USD": 1.0,
        "EUR": number,
        "GBP": number,
        "SAR": number,
        "AED": number,
        "INR": number,
        "PKR": number,
        "MYR": number,
        "IDR": number,
        "KWD": number,
        "QAR": number,
        "CAD": number,
        "AUD": number,
        "TRY": number,
        "EGP": number,
        "BDT": number
      },
      "lastUpdated": "YYYY-MM-DD"
    }
    Respond ONLY with the JSON object itself. Do not include markdown formatting blocks like \`\`\`json or any other text before or after the JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
      },
    });

    const text = response.text?.trim() || "";
    try {
      // Clean possible backticks or markdown if the model output them despite system instructions
      const cleanJson = text
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      const parsed = JSON.parse(cleanJson);
      
      // Basic schema validation
      if (
        parsed &&
        typeof parsed.goldPriceUsdPerGram === "number" &&
        parsed.rates &&
        typeof parsed.rates.USD === "number"
      ) {
        cachedRates = { ...parsed, isFallback: false };
        lastFetchTime = now;
        return res.json({ ...cachedRates, isFallback: false });
      } else {
        throw new Error("Invalid structure returned from model");
      }
    } catch (e) {
      console.warn("Failed to parse Gemini output, using fallback rates:", e, "\nOriginal output:", text);
      // Cache the fallback rates for 1 hour to avoid immediately retrying on malformed outputs
      cachedRates = { ...FALLBACK_RATES, isFallback: true };
      lastFetchTime = now - CACHE_DURATION + (60 * 60 * 1000); // Expires in 1 hour
      return res.json(cachedRates);
    }
  } catch (error: any) {
    const errorStr = `${error} ${error?.message} ${JSON.stringify(error)}`;
    const isQuotaError = 
      errorStr.toLowerCase().includes("quota") || 
      errorStr.toLowerCase().includes("resource_exhausted") || 
      errorStr.toLowerCase().includes("rate limit") || 
      errorStr.toLowerCase().includes("429") || 
      error?.status === 429 || 
      error?.code === 429 || 
      error?.status === "RESOURCE_EXHAUSTED";

    if (isQuotaError) {
      console.warn("Gemini API rate/quota limit exceeded when fetching live rates. Using fallback rates.");
    } else {
      console.error("Error fetching rates from Gemini:", error.message || error);
    }
    
    // Cache the fallback rates for 5 minutes so we don't spam the API during rate limiting
    cachedRates = { ...FALLBACK_RATES, isFallback: true };
    lastFetchTime = now - CACHE_DURATION + (5 * 60 * 1000); // Expires in 5 minutes
    res.json(cachedRates);
  }
});

// API: Zakat Chat Advisor endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [], totalAssets = 0, currency = "USD" } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        reply: "I am currently running in offline mode because the Gemini API Key is missing. Please add the GEMINI_API_KEY secret in Settings > Secrets to enable live chat capabilities.",
      });
    }

    const chatHistory = history.map((h: { role: string; text: string }) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.text }],
    }));

    // Add instructions context
    const systemInstruction = `You are an expert, compassionate, and authentic Islamic Finance Scholar specializing in Zakat calculations. 
    You guide users through the rules of Zakat with patience and absolute clarity, referencing authentic opinions across major schools of Islamic jurisprudence (Fiqh) where appropriate (Hanafi, Shafi'i, Maliki, Hanbali).
    
    Current calculation context for this user:
    - User's selected reporting currency: ${currency}
    - User's calculated total Zakat-eligible assets so far: ${totalAssets} ${currency}
    
    Keep responses highly structured, legible, and visual. If quoting amounts, use the user's selected currency (${currency}). Include references to classical principles such as Nisab (minimum threshold), Hawl (holding period of one lunar year), and different asset classes (gold, silver, cash, shares, crypto, real estate, trade goods, business equity, liabilities).
    Be extremely humble, scholarly, yet simple and practical. Keep formatting clean using standard Markdown lists and bold text. No unrequested features or system logs in the output.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        ...chatHistory,
        { role: "user", parts: [{ text: message }] }
      ],
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }], // enable search for authentic fatwas/rulings if needed
      }
    });

    res.json({
      reply: response.text || "I apologize, but I could not formulate a response at this time.",
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    });
  } catch (error: any) {
    console.error("Chat error:", error);
    const errorStr = `${error} ${error?.message} ${JSON.stringify(error)}`;
    const isQuotaError = 
      errorStr.toLowerCase().includes("quota") || 
      errorStr.toLowerCase().includes("resource_exhausted") || 
      errorStr.toLowerCase().includes("rate limit") || 
      errorStr.toLowerCase().includes("429") || 
      error?.status === 429 || 
      error?.code === 429 || 
      error?.status === "RESOURCE_EXHAUSTED";

    if (isQuotaError) {
      return res.json({
        reply: "Assalamu Alaikum. I am currently receiving an unusually high volume of inquiries, which has temporarily exceeded my scholarly database's rate limit. \n\nPlease try again in a few moments, or select the **Zakat Fiqh Guide** tab above to view a detailed, comprehensive offline guide on Nisab, jewelry rules, and deductible liabilities across major legal schools (Fiqh)!",
        sources: []
      });
    }
    res.status(500).json({ error: error.message || "Something went wrong" });
  }
});

// Setup Vite or Static assets serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
