import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Calculator,
  Coins,
  HelpCircle,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Globe,
  Sparkles,
  BookOpen,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Info,
  Scale,
  MessageSquare,
  TrendingUp,
  X,
  Plus,
  Cloud,
  Download,
  Wallet,
  HeartHandshake
} from "lucide-react";
import {
  CurrencyRates,
  ZakatRatesResponse,
  GoldAssetInput,
  ZakatAssets,
  ZakatLiabilities,
  CalculationResult,
  ChatMessage
} from "./types";
import DriveBackupTab from "./components/DriveBackupTab";
import { jsPDF } from "jspdf";

// Supported Currencies with detailed presentation metadata
const CURRENCY_DETAILS: {
  [code: string]: { symbol: string; name: string; flag: string; locale: string };
} = {
  USD: { symbol: "$", name: "US Dollar", flag: "🇺🇸", locale: "en-US" },
  EUR: { symbol: "€", name: "Euro", flag: "🇪🇺", locale: "de-DE" },
  GBP: { symbol: "£", name: "British Pound", flag: "🇬🇧", locale: "en-GB" },
  SAR: { symbol: "SR", name: "Saudi Riyal", flag: "🇸🇦", locale: "ar-SA" },
  AED: { symbol: "DH", name: "UAE Dirham", flag: "🇦🇪", locale: "ar-AE" },
  INR: { symbol: "₹", name: "Indian Rupee", flag: "🇮🇳", locale: "en-IN" },
  PKR: { symbol: "₨", name: "Pakistani Rupee", flag: "🇵🇰", locale: "en-PK" },
  MYR: { symbol: "RM", name: "Malaysian Ringgit", flag: "🇲🇾", locale: "ms-MY" },
  IDR: { symbol: "Rp", name: "Indonesian Rupiah", flag: "🇮🇩", locale: "id-ID" },
  KWD: { symbol: "KD", name: "Kuwaiti Dinar", flag: "🇰🇼", locale: "ar-KW" },
  QAR: { symbol: "QR", name: "Qatari Riyal", flag: "🇶🇦", locale: "ar-QA" },
  CAD: { symbol: "C$", name: "Canadian Dollar", flag: "🇨🇦", locale: "en-CA" },
  AUD: { symbol: "A$", name: "Australian Dollar", flag: "🇦🇺", locale: "en-AU" },
  TRY: { symbol: "₺", name: "Turkish Lira", flag: "🇹🇷", locale: "tr-TR" },
  EGP: { symbol: "E£", name: "Egyptian Pound", flag: "🇪🇬", locale: "ar-EG" },
  BDT: { symbol: "৳", name: "Bangladeshi Taka", flag: "🇧🇩", locale: "bn-BD" },
};

// Simple Markdown-like formatter for AI chat responses
const renderMessageText = (text: string = "") => {
  if (typeof text !== "string") {
    return <p className="text-sm text-slate-700 leading-relaxed">I am currently experiencing higher demand than usual. Please try again soon.</p>;
  }
  const lines = text.split("\n");
  return lines.map((line, i) => {
    let content = line;
    // Handle list item
    const isBullet = content.trim().startsWith("- ") || content.trim().startsWith("* ");
    if (isBullet) {
      content = content.replace(/^[\s*-]+/, "").trim();
    }

    // Bold text regex parsing: **text** -> <strong>text</strong>
    const parts = [];
    let remaining = content;
    const boldRegex = /\*\*(.*?)\*\*/g;
    let match;
    let lastIndex = 0;

    while ((match = boldRegex.exec(remaining)) !== null) {
      const textBefore = remaining.substring(lastIndex, match.index);
      if (textBefore) parts.push(textBefore);
      parts.push(<strong key={match.index} className="font-semibold text-emerald-900">{match[1]}</strong>);
      lastIndex = boldRegex.lastIndex;
    }
    const textAfter = remaining.substring(lastIndex);
    if (textAfter) parts.push(textAfter);

    if (isBullet) {
      return (
        <li key={i} className="ml-4 list-disc text-sm text-slate-700 leading-relaxed mb-1">
          {parts.length > 0 ? parts : content}
        </li>
      );
    }

    // Header lines
    if (line.startsWith("###")) {
      return (
        <h4 key={i} className="text-sm font-bold text-emerald-800 mt-3 mb-1 font-display">
          {parts.length > 0 ? parts : line.replace(/^###\s*/, "")}
        </h4>
      );
    }
    if (line.startsWith("##")) {
      return (
        <h3 key={i} className="text-base font-bold text-emerald-900 mt-4 mb-2 font-display border-b border-emerald-100 pb-1">
          {parts.length > 0 ? parts : line.replace(/^##\s*/, "")}
        </h3>
      );
    }

    // Paragraph
    return (
      <p key={i} className={`text-sm text-slate-700 leading-relaxed ${line.trim() === "" ? "h-2" : "mb-2"}`}>
        {parts.length > 0 ? parts : content}
      </p>
    );
  });
};

export default function App() {
  // Main settings states
  const [currency, setCurrency] = useState<string>("USD");
  const [prevCurrency, setPrevCurrency] = useState<string>("USD");
  const [nisabStandard, setNisabStandard] = useState<"gold" | "silver">("gold");

  // Fetching rates state
  const [ratesData, setRatesData] = useState<ZakatRatesResponse | null>(null);
  const [loadingRates, setLoadingRates] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);

  // User input states
  const [assets, setAssets] = useState<ZakatAssets>({
    cashOnHand: 0,
    cashInBanks: 0,
    gold: {
      weight24k: 0,
      weight22k: 0,
      weight21k: 0,
      weight18k: 0,
    },
    silverWeight: 0,
    investments: 0,
    businessInventory: 0,
    receivables: 0,
  });

  const [liabilities, setLiabilities] = useState<ZakatLiabilities>({
    debtsOwed: 0,
    billsDue: 0,
    businessExpenses: 0,
  });

  // Manual metal rate overrides
  const [useCustomRates, setUseCustomRates] = useState<boolean>(false);
  const [customGoldPrice, setCustomGoldPrice] = useState<string>("");
  const [customSilverPrice, setCustomSilverPrice] = useState<string>("");

  // Chatbot states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState<string>("");
  const [sendingChat, setSendingChat] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"calculator" | "guide" | "advisor" | "drive">("calculator");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Quick Chat questions
  const SUGGESTED_QUESTIONS = [
    "Do I owe Zakat on gold jewelry I wear daily?",
    "How do I compute Zakat on my crypto and stocks?",
    "Should I calculate Nisab based on Gold or Silver?",
    "Can I deduct my long-term home mortgage?",
    "What if my wealth dropped below Nisab mid-year?"
  ];

  // Fetch Gold & Silver rates + exchange rates
  const fetchRates = async () => {
    try {
      setSyncing(true);
      const res = await fetch("/api/rates");
      const data = await res.json();
      setRatesData(data);
    } catch (err) {
      console.error("Error fetching market rates:", err);
    } finally {
      setLoadingRates(false);
      setSyncing(false);
    }
  };

  // Run initial fetch
  useEffect(() => {
    fetchRates();
    
    // Add welcome message to chat advisor
    setChatMessages([
      {
        id: "welcome",
        role: "model",
        text: "Assalamu Alaikum! I am your AI Zakat Scholar Advisor. I can help guide you on Zakat rules, how different asset classes are handled, or any specific circumstances you might have. Ask me anything!",
        timestamp: new Date(),
      }
    ]);
  }, []);

  // Handle automatic currency conversion of inputs when user switches selected currency
  useEffect(() => {
    if (!ratesData || currency === prevCurrency) return;

    const rates = ratesData.rates;
    const oldRate = rates[prevCurrency] || 1;
    const newRate = rates[currency] || 1;
    const conversionFactor = newRate / oldRate;

    // Convert all values in assets and liabilities
    setAssets((prev) => ({
      ...prev,
      cashOnHand: parseFloat((prev.cashOnHand * conversionFactor).toFixed(2)),
      cashInBanks: parseFloat((prev.cashInBanks * conversionFactor).toFixed(2)),
      investments: parseFloat((prev.investments * conversionFactor).toFixed(2)),
      businessInventory: parseFloat((prev.businessInventory * conversionFactor).toFixed(2)),
      receivables: parseFloat((prev.receivables * conversionFactor).toFixed(2)),
      // Note: Gold and Silver weights are in grams, so they remain unchanged!
    }));

    setLiabilities((prev) => ({
      ...prev,
      debtsOwed: parseFloat((prev.debtsOwed * conversionFactor).toFixed(2)),
      billsDue: parseFloat((prev.billsDue * conversionFactor).toFixed(2)),
      businessExpenses: parseFloat((prev.businessExpenses * conversionFactor).toFixed(2)),
    }));

    // Reset manual overrides as they are specific to currency
    setUseCustomRates(false);
    setCustomGoldPrice("");
    setCustomSilverPrice("");

    setPrevCurrency(currency);
  }, [currency, ratesData, prevCurrency]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, sendingChat]);

  // Handle asset numeric changes safely
  const handleAssetChange = (field: keyof ZakatAssets, value: string) => {
    const numValue = parseFloat(value) || 0;
    setAssets((prev) => ({
      ...prev,
      [field]: numValue >= 0 ? numValue : 0,
    }));
  };

  const handleGoldWeightChange = (karat: keyof GoldAssetInput, value: string) => {
    const numValue = parseFloat(value) || 0;
    setAssets((prev) => ({
      ...prev,
      gold: {
        ...prev.gold,
        [karat]: numValue >= 0 ? numValue : 0,
      },
    }));
  };

  const handleLiabilityChange = (field: keyof ZakatLiabilities, value: string) => {
    const numValue = parseFloat(value) || 0;
    setLiabilities((prev) => ({
      ...prev,
      [field]: numValue >= 0 ? numValue : 0,
    }));
  };

  // Get active gold and silver prices in selected currency
  const activeRates = ratesData || {
    goldPriceUsdPerGram: 77.50,
    silverPriceUsdPerGram: 0.92,
    rates: { USD: 1.0, [currency]: 1.0 }
  };
  const currentRate = activeRates.rates[currency] || 1;

  const fetchedGoldPriceSelected = activeRates.goldPriceUsdPerGram * currentRate;
  const fetchedSilverPriceSelected = activeRates.silverPriceUsdPerGram * currentRate;

  const goldPriceSelected = useCustomRates && parseFloat(customGoldPrice) > 0
    ? parseFloat(customGoldPrice)
    : fetchedGoldPriceSelected;

  const silverPriceSelected = useCustomRates && parseFloat(customSilverPrice) > 0
    ? parseFloat(customSilverPrice)
    : fetchedSilverPriceSelected;

  // Perform calculations
  const calculateZakat = (): CalculationResult => {
    // Gold Equivalent purity factors
    // 24K: 1.0, 22K: 22/24, 21K: 21/24, 18K: 18/24
    const totalGoldValue =
      (assets.gold.weight24k * goldPriceSelected) +
      (assets.gold.weight22k * goldPriceSelected * (22 / 24)) +
      (assets.gold.weight21k * goldPriceSelected * (21 / 24)) +
      (assets.gold.weight18k * goldPriceSelected * (18 / 24));

    // Silver Value
    const totalSilverValue = assets.silverWeight * silverPriceSelected;

    // Cash and general values
    const totalCash = assets.cashOnHand + assets.cashInBanks;
    const totalOtherAssets = assets.investments + assets.businessInventory + assets.receivables;

    const totalAssetsVal = totalCash + totalGoldValue + totalSilverValue + totalOtherAssets;
    const totalLiabilitiesVal = liabilities.debtsOwed + liabilities.billsDue + liabilities.businessExpenses;

    const netAssetsVal = Math.max(0, totalAssetsVal - totalLiabilitiesVal);

    // Nisab thresholds in USD
    const goldPriceUsd = goldPriceSelected / currentRate;
    const silverPriceUsd = silverPriceSelected / currentRate;

    const nisabGoldUsd = 85 * goldPriceUsd;
    const nisabSilverUsd = 595 * silverPriceUsd;

    // Nisab in selected currency
    const nisabGoldSelected = 85 * goldPriceSelected;
    const nisabSilverSelected = 595 * silverPriceSelected;

    const isEligibleGold = netAssetsVal >= nisabGoldSelected;
    const isEligibleSilver = netAssetsVal >= nisabSilverSelected;

    const meetsNisab = nisabStandard === "gold" ? isEligibleGold : isEligibleSilver;
    const zakatOwedVal = meetsNisab ? netAssetsVal * 0.025 : 0;

    return {
      totalCash,
      totalGoldValue,
      totalSilverValue,
      totalOtherAssets,
      totalAssets: totalAssetsVal,
      totalLiabilities: totalLiabilitiesVal,
      netAssets: netAssetsVal,
      nisabGoldUsd,
      nisabSilverUsd,
      nisabGoldSelected,
      nisabSilverSelected,
      isEligibleGold,
      isEligibleSilver,
      zakatOwed: zakatOwedVal,
    };
  };

  const results = calculateZakat();
  const activeNisabThreshold = nisabStandard === "gold" ? results.nisabGoldSelected : results.nisabSilverSelected;
  const isZakatDue = results.netAssets >= activeNisabThreshold && activeNisabThreshold > 0;
  const progressToNisab = activeNisabThreshold > 0 ? Math.min(100, (results.netAssets / activeNisabThreshold) * 100) : 0;

  // Format currency output nicely
  const formatMoney = (amount: number, code: string = currency) => {
    const details = CURRENCY_DETAILS[code] || { symbol: "$", locale: "en-US" };
    return new Intl.NumberFormat(details.locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format gram weights beautifully
  const formatGram = (weight: number) => {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(weight) + " g";
  };

  // Send message to AI Advisor
  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || userInput;
    if (!query.trim() || sendingChat) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: "user",
      text: query,
      timestamp: new Date(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setUserInput("");
    setSendingChat(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          history: chatMessages.slice(-8).map(m => ({ role: m.role, text: m.text })),
          totalAssets: results.netAssets,
          currency: currency,
        }),
      });

      const data = await response.json();
      
      if (!response.ok || !data || !data.reply) {
        throw new Error(data?.error || "We are experiencing high traffic/quota limits. Please try again in a few moments.");
      }
      
      const modelMsg: ChatMessage = {
        id: Math.random().toString(),
        role: "model",
        text: data.reply,
        timestamp: new Date(),
      };

      setChatMessages((prev) => [...prev, modelMsg]);
    } catch (err: any) {
      console.error("AI chat error:", err);
      const errorMessage = err?.message && err.message.includes("quota")
        ? "I apologize, but my scholarly database is currently experiencing very high demand (quota exceeded). Please try again in a minute, or use the Zakat Fiqh Guide tab for offline references!"
        : "I apologize, but I am having trouble connecting to my scholarly database right now. Please try again, or use the Zakat Fiqh Guide tab for offline references!";
      
      setChatMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          role: "model",
          text: errorMessage,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setSendingChat(false);
    }
  };

  // Helper to clear all inputs
  const resetCalculator = () => {
    setAssets({
      cashOnHand: 0,
      cashInBanks: 0,
      gold: {
        weight24k: 0,
        weight22k: 0,
        weight21k: 0,
        weight18k: 0,
      },
      silverWeight: 0,
      investments: 0,
      businessInventory: 0,
      receivables: 0,
    });
    setLiabilities({
      debtsOwed: 0,
      billsDue: 0,
      businessExpenses: 0,
    });
  };

  const currentCurrencyInfo = CURRENCY_DETAILS[currency] || { symbol: "$", name: "USD", flag: "🇺🇸" };

  const downloadPdfSummary = () => {
    const doc = new jsPDF();
    
    // Header Colors
    const primaryGreen = [16, 47, 34]; // Emerald
    const lightGreen = [240, 253, 244]; // Soft green background
    const accentAmber = [217, 119, 6]; // Amber
    const darkText = [30, 41, 59]; // Slate 800
    const lightText = [100, 116, 139]; // Slate 500
    
    // Page borders and helpers
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 15;
    
    // Helper to start a new page if table overflows
    const checkPageOverflow = (neededHeight: number) => {
      if (y + neededHeight > 275) {
        doc.addPage();
        y = 20; // reset y to top of new page
        // Draw a subtle mini-header on new page
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
        doc.text("ZAKAT ASSESSMENT REPORT (CONTINUED)", margin, y);
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.line(margin, y + 2, pageWidth - margin, y + 2);
        y += 10;
      }
    };

    // 1. Header Banner
    doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.rect(0, 0, pageWidth, 42, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.text("ZAKAT ASSESSMENT REPORT", margin, 20);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(190, 242, 190);
    doc.text("COMPREHENSIVE FINANCIAL PURIFICATION ASSESSMENT", margin, 27);
    doc.text(`Generated on: ${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })} at ${new Date().toLocaleTimeString(undefined, { timeStyle: 'short' })}`, margin, 34);
    
    y = 52;
    
    // 2. Metadata Grid (Nisab, Currency, etc.)
    doc.setFillColor(lightGreen[0], lightGreen[1], lightGreen[2]);
    doc.rect(margin, y, pageWidth - (margin * 2), 24, "F");
    doc.setDrawColor(209, 250, 229);
    doc.rect(margin, y, pageWidth - (margin * 2), 24, "S");
    
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Assessment Parameters:", margin + 5, y + 6);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(darkText[0], darkText[1], darkText[2]);
    doc.text(`Selected Currency: ${currency} (${CURRENCY_DETAILS[currency]?.name || ""})`, margin + 5, y + 13);
    doc.text(`Nisab Standard Selected: ${nisabStandard.toUpperCase()}`, margin + 5, y + 19);
    
    doc.text(`Nisab Threshold: ${formatMoney(activeNisabThreshold)}`, margin + 100, y + 13);
    doc.text(`Metal Market Price (Gold/g): ${formatMoney(goldPriceSelected)}`, margin + 100, y + 19);
    
    y += 32;
    
    // 3. Status Box
    if (isZakatDue) {
      doc.setFillColor(254, 243, 199); // Amber 100
      doc.rect(margin, y, pageWidth - (margin * 2), 22, "F");
      doc.setDrawColor(245, 158, 11); // Amber 500
      doc.rect(margin, y, pageWidth - (margin * 2), 22, "S");
      
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(accentAmber[0], accentAmber[1], accentAmber[2]);
      doc.text("STATUS: ZAKAT IS OBLIGATORY (DUES PAYABLE)", margin + 6, y + 8);
      
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text(`Your net assets meet or exceed the Nisab limit. Your total due Zakat is: `, margin + 6, y + 15);
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.text(`${formatMoney(results.zakatOwed)}`, margin + 115, y + 15);
    } else {
      doc.setFillColor(241, 245, 249); // Slate 100
      doc.rect(margin, y, pageWidth - (margin * 2), 22, "F");
      doc.setDrawColor(203, 213, 225); // Slate 300
      doc.rect(margin, y, pageWidth - (margin * 2), 22, "S");
      
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.text("STATUS: BELOW NISAB LIMIT (NO ZAKAT DUE)", margin + 6, y + 8);
      
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(lightText[0], lightText[1], lightText[2]);
      doc.text(`Your net eligible wealth (${formatMoney(results.netAssets)}) is below the required Nisab threshold (${formatMoney(activeNisabThreshold)}).`, margin + 6, y + 15);
    }
    
    y += 32;
    
    // 4. Asset Details Header
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("DETAILED ASSETS & LIABILITIES STATEMENT", margin, y);
    doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 2, pageWidth - margin, y + 2);
    
    y += 10;
    
    // Table Helper
    const drawRow = (label: string, value: string, isTotal = false) => {
      checkPageOverflow(8);
      doc.setFont("Helvetica", isTotal ? "bold" : "normal");
      doc.setFontSize(isTotal ? 10 : 9);
      doc.setTextColor(isTotal ? primaryGreen[0] : darkText[0], isTotal ? primaryGreen[1] : darkText[1], isTotal ? primaryGreen[2] : darkText[2]);
      
      if (isTotal) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 4, pageWidth - (margin * 2), 6.5, "F");
      }
      
      doc.text(label, margin + 4, y);
      doc.text(value, pageWidth - margin - 4, y, { align: "right" });
      
      // Draw subline
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(margin, y + 2, pageWidth - margin, y + 2);
      
      y += 7.5;
    };
    
    // 4a. Cash & Bank
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("Cash & Bank Savings", margin + 2, y);
    y += 6;
    drawRow("Cash on Hand / Personal Liquidity", formatMoney(assets.cashOnHand));
    drawRow("Cash in Bank Accounts (Checking, Savings, Deposit)", formatMoney(assets.cashInBanks));
    drawRow("Subtotal Cash & Liquidity", formatMoney(results.totalCash), true);
    y += 4;
    
    // 4b. Precious Metals
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("Precious Metals", margin + 2, y);
    y += 6;
    if (assets.gold.weight24k > 0) drawRow(`Gold 24K (${formatGram(assets.gold.weight24k)})`, formatMoney(assets.gold.weight24k * goldPriceSelected));
    if (assets.gold.weight22k > 0) drawRow(`Gold 22K (${formatGram(assets.gold.weight22k)})`, formatMoney(assets.gold.weight22k * goldPriceSelected * (22 / 24)));
    if (assets.gold.weight21k > 0) drawRow(`Gold 21K (${formatGram(assets.gold.weight21k)})`, formatMoney(assets.gold.weight21k * goldPriceSelected * (21 / 24)));
    if (assets.gold.weight18k > 0) drawRow(`Gold 18K (${formatGram(assets.gold.weight18k)})`, formatMoney(assets.gold.weight18k * goldPriceSelected * (18 / 24)));
    if (assets.silverWeight > 0) drawRow(`Silver (${formatGram(assets.silverWeight)})`, formatMoney(assets.silverWeight * silverPriceSelected));
    drawRow("Subtotal Precious Metals", formatMoney(results.totalGoldValue + results.totalSilverValue), true);
    y += 4;
    
    // 4c. Other Assets & Investments
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("Investments & Business Merchandise", margin + 2, y);
    y += 6;
    drawRow("Stocks, Crypto, Mutual Funds & Pensions", formatMoney(assets.investments));
    drawRow("Business Inventory / Trade Merchandise Goods", formatMoney(assets.businessInventory));
    drawRow("Receivables / Active Cash Loans Owed To You", formatMoney(assets.receivables));
    drawRow("Subtotal Other Assets & Investments", formatMoney(results.totalOtherAssets), true);
    y += 4;
    
    // 4d. Liabilities
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("Deductible Liabilities & Bills Due", margin + 2, y);
    y += 6;
    drawRow("Immediate Personal Debts & Outstanding Loans", formatMoney(liabilities.debtsOwed));
    drawRow("Rent, Utilities, Active Taxes & Bills Due", formatMoney(liabilities.billsDue));
    drawRow("Total Deductible Liabilities", formatMoney(results.totalLiabilities), true);
    y += 6;
    
    // 5. Final Summary Calculation Block
    checkPageOverflow(30);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, pageWidth - (margin * 2), 28, "F");
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, pageWidth - (margin * 2), 28, "S");
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(darkText[0], darkText[1], darkText[2]);
    doc.text("Total Valued Assets:", margin + 6, y + 8);
    doc.text(formatMoney(results.totalAssets), pageWidth - margin - 6, y + 8, { align: "right" });
    
    doc.text("(-) Total Deductible Liabilities:", margin + 6, y + 14);
    doc.text(`- ${formatMoney(results.totalLiabilities)}`, pageWidth - margin - 6, y + 14, { align: "right" });
    
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.line(margin + 4, y + 18, pageWidth - margin - 4, y + 18);
    
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("NET ELIGIBLE WEALTH SUBJECT TO ZAKAT:", margin + 6, y + 23);
    doc.text(formatMoney(results.netAssets), pageWidth - margin - 6, y + 23, { align: "right" });
    
    y += 36;
    
    // 6. Zakat Calculation Outcome
    checkPageOverflow(20);
    doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.rect(margin, y, pageWidth - (margin * 2), 16, "F");
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text("FINAL CALCULATED ZAKAT DUE (2.5%):", margin + 6, y + 10);
    doc.setFontSize(13);
    doc.setTextColor(253, 224, 71); // Yellow 300
    doc.text(formatMoney(results.zakatOwed), pageWidth - margin - 6, y + 10, { align: "right" });
    
    y += 24;
    
    // 7. Spiritual and legal disclaimer
    checkPageOverflow(25);
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(lightText[0], lightText[1], lightText[2]);
    const disclaimerLines = [
      `Disclaimer: This report is an automated assessment based on current metal rates (Gold: ${formatMoney(goldPriceSelected)}/g, Silver: ${formatMoney(silverPriceSelected)}/g) and exchange rate conversion metrics.`,
      "Zakat is a sacred spiritual obligation. Users with complex assets (e.g. business partnerships, real estate holdings, or complex investments)",
      "are strongly encouraged to verify their calculations with a certified local Islamic scholar or qualified authority.",
      "May Allah accept your charity and bless your wealth. Ameen."
    ];
    disclaimerLines.forEach((line) => {
      doc.text(line, pageWidth / 2, y, { align: "center" });
      y += 4.5;
    });
    
    doc.save(`Zakat-Summary-Report-${currency}.pdf`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col antialiased">
      {/* Visual background flourishes */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-emerald-800 via-emerald-950 to-slate-900 -z-10" />
      
      {/* Header Container */}
      <header className="max-w-7xl mx-auto w-full px-6 py-5 mt-6 bg-gradient-to-r from-emerald-900 via-emerald-950 to-[#022c22] rounded-3xl border border-emerald-800/30 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 text-white z-10">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-2.5 rounded-xl shadow-lg border border-emerald-400/30">
            <Wallet className="h-7 w-7 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-amber-200 via-amber-100 to-emerald-100 bg-clip-text text-transparent">
              Zakat Al-Mal Calculator
            </h1>
            <p className="text-xs text-emerald-200/80 font-medium">
              Interactive Gold, Silver, & Wealth Purification Calculator
            </p>
          </div>
        </div>

        {/* Live Market Rate / Currency Selection */}
        <div className="flex flex-wrap items-center gap-3 bg-emerald-900/40 backdrop-blur-md p-2 rounded-2xl border border-emerald-800/40 shadow-inner">
          {/* Rate Tracker Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-700/30 text-xs">
            <span className={`h-2.5 w-2.5 rounded-full ${ratesData?.isFallback ? "bg-amber-400 animate-pulse" : "bg-emerald-400 animate-pulse"}`} />
            <span className="text-emerald-100 font-medium">
              {ratesData?.isFallback ? "Default Market Rates" : "Live Market Rates"}
            </span>
            <button 
              onClick={fetchRates} 
              disabled={syncing}
              className="ml-1 text-emerald-300 hover:text-white transition-colors"
              title="Sync live prices"
            >
              <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Currency Dropdown Selector */}
          <div className="relative">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-emerald-950/80 border border-emerald-700/40 text-emerald-50 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer pr-8 appearance-none font-medium"
            >
              {Object.entries(CURRENCY_DETAILS).map(([code, det]) => (
                <option key={code} value={code} className="bg-emerald-950 text-white">
                  {det.flag} {code} ({det.symbol})
                </option>
              ))}
            </select>
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-300 pointer-events-none text-[10px]">▼</span>
          </div>
        </div>
      </header>

      {/* Main Layout Container */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-12 flex-grow grid grid-cols-1 lg:grid-cols-12 gap-8 z-10">
        
        {/* Controls, summary display, navigation tabs (visible on all breakpoints) */}
        <div className="lg:col-span-12 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80">
          <div className="flex bg-emerald-50/60 p-1.5 rounded-xl self-start border border-emerald-100">
            <button
              onClick={() => setActiveTab("calculator")}
              className={`flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium rounded-lg transition-all ${
                activeTab === "calculator"
                  ? "bg-emerald-600 text-white shadow-sm font-semibold"
                  : "text-emerald-800 hover:text-emerald-950 hover:bg-emerald-100/40"
              }`}
            >
              <Calculator className="h-4 w-4" />
              Calculator
            </button>
            <button
              onClick={() => setActiveTab("advisor")}
              className={`flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium rounded-lg transition-all ${
                activeTab === "advisor"
                  ? "bg-emerald-600 text-white shadow-sm font-semibold"
                  : "text-emerald-800 hover:text-emerald-950 hover:bg-emerald-100/40"
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              AI Zakat Scholar
            </button>
            <button
              onClick={() => setActiveTab("guide")}
              className={`flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium rounded-lg transition-all ${
                activeTab === "guide"
                  ? "bg-emerald-600 text-white shadow-sm font-semibold"
                  : "text-emerald-800 hover:text-emerald-950 hover:bg-emerald-100/40"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Zakat Fiqh Guide
            </button>
            <button
              onClick={() => setActiveTab("drive")}
              className={`flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium rounded-lg transition-all ${
                activeTab === "drive"
                  ? "bg-emerald-600 text-white shadow-sm font-semibold"
                  : "text-emerald-800 hover:text-emerald-950 hover:bg-emerald-100/40"
              }`}
              id="drive-nav-tab"
            >
              <Cloud className="h-4 w-4" />
              Drive Backup
            </button>
          </div>

          {/* Nisab threshold toggle bar */}
          <div className="flex items-center gap-3 justify-end">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Scale className="h-3.5 w-3.5" /> Nisab Base:
            </span>
            <div className="bg-slate-100 p-1 rounded-xl flex border border-slate-200">
              <button
                onClick={() => setNisabStandard("gold")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  nisabStandard === "gold"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="85 Grams of pure 24K Gold standard"
              >
                Gold (85g)
              </button>
              <button
                onClick={() => setNisabStandard("silver")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  nisabStandard === "silver"
                    ? "bg-slate-400 text-slate-950 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="595 Grams of pure Silver standard"
              >
                Silver (595g)
              </button>
            </div>
          </div>
        </div>

        {/* Tab 1: Calculator Panel */}
        {activeTab === "calculator" && (
          <div className="lg:col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Input form - spans 7 cols */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Cash & Liquidity Module */}
              <div className="bg-gradient-to-br from-emerald-50/30 via-white to-white rounded-3xl p-6 shadow-sm border border-slate-150 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
                <div className="flex items-center gap-3 mb-5">
                  <div className="bg-emerald-100/50 p-2 rounded-xl text-emerald-700">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-display font-bold text-slate-800">Cash & Liquid Assets</h2>
                    <p className="text-xs text-slate-400">Specify money held in hand, banks, and savings</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Cash On Hand */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 flex justify-between">
                      <span>Cash on Hand & Home Savings</span>
                      <span className="text-slate-400 font-normal">({currency})</span>
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <span className="text-slate-400 text-sm font-semibold">{currentCurrencyInfo.symbol}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={assets.cashOnHand || ""}
                        onChange={(e) => handleAssetChange("cashOnHand", e.target.value)}
                        placeholder="0.00"
                        className="block w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-slate-800 bg-slate-50/30"
                      />
                    </div>
                  </div>

                  {/* Cash in Banks */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 flex justify-between">
                      <span>Checking & Savings Accounts</span>
                      <span className="text-slate-400 font-normal">({currency})</span>
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <span className="text-slate-400 text-sm font-semibold">{currentCurrencyInfo.symbol}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={assets.cashInBanks || ""}
                        onChange={(e) => handleAssetChange("cashInBanks", e.target.value)}
                        placeholder="0.00"
                        className="block w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-slate-800 bg-slate-50/30"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Precious Metals Module */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-150 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-50 p-2 rounded-xl text-amber-700">
                      <Scale className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-display font-bold text-slate-800">Precious Metals (Gold & Silver)</h2>
                      <p className="text-xs text-slate-400">
                        Specify weights in grams. Rate: Gold {formatMoney(goldPriceSelected)}/g, Silver {formatMoney(silverPriceSelected)}/g
                      </p>
                    </div>
                  </div>
                </div>

                {/* Custom Rates Override Card */}
                <div className="mb-6 p-4 rounded-2xl bg-amber-50/30 border border-amber-200/50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-600 animate-pulse" />
                      <div>
                        <span className="text-xs font-bold text-slate-700 block">Configure Gold & Silver Rates</span>
                        <span className="text-[10px] text-slate-400">Set rates manually according to your local jeweler</span>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useCustomRates}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setUseCustomRates(checked);
                          if (checked) {
                            // Populate with currently converted live rates
                            setCustomGoldPrice(fetchedGoldPriceSelected.toFixed(2));
                            setCustomSilverPrice(fetchedSilverPriceSelected.toFixed(2));
                          } else {
                            setCustomGoldPrice("");
                            setCustomSilverPrice("");
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500" />
                      <span className="ml-2 text-[11px] font-semibold text-slate-600 whitespace-nowrap">Manual Rate</span>
                    </label>
                  </div>

                  {useCustomRates && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 pt-4 border-t border-amber-200/30 space-y-4 overflow-hidden"
                    >
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Specify rates in <strong>{currency}</strong>. Entering rate in one format automatically updates the other. (1 Tola = 11.66g)
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Gold customization inputs */}
                        <div className="space-y-2 bg-white/70 p-2.5 rounded-xl border border-amber-100">
                          <span className="text-[11px] font-bold text-amber-900 block border-b border-amber-50 pb-1 mb-1">
                            Gold Price ({currency})
                          </span>
                          <div className="space-y-2">
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase">Per Gram</label>
                              <div className="relative mt-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{currentCurrencyInfo.symbol}</span>
                                <input
                                  type="number"
                                  step="any"
                                  value={customGoldPrice}
                                  onChange={(e) => setCustomGoldPrice(e.target.value)}
                                  placeholder="0.00"
                                  className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase">Per Tola (11.66g)</label>
                              <div className="relative mt-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{currentCurrencyInfo.symbol}</span>
                                <input
                                  type="number"
                                  step="any"
                                  value={customGoldPrice ? (parseFloat(customGoldPrice) * 11.6638).toFixed(2) : ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustomGoldPrice(val ? (parseFloat(val) / 11.6638).toFixed(4) : "");
                                  }}
                                  placeholder="0.00"
                                  className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Silver customization inputs */}
                        <div className="space-y-2 bg-white/70 p-2.5 rounded-xl border border-slate-100">
                          <span className="text-[11px] font-bold text-slate-700 block border-b border-slate-50 pb-1 mb-1">
                            Silver Price ({currency})
                          </span>
                          <div className="space-y-2">
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase">Per Gram</label>
                              <div className="relative mt-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{currentCurrencyInfo.symbol}</span>
                                <input
                                  type="number"
                                  step="any"
                                  value={customSilverPrice}
                                  onChange={(e) => setCustomSilverPrice(e.target.value)}
                                  placeholder="0.00"
                                  className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase">Per Tola (11.66g)</label>
                              <div className="relative mt-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{currentCurrencyInfo.symbol}</span>
                                <input
                                  type="number"
                                  step="any"
                                  value={customSilverPrice ? (parseFloat(customSilverPrice) * 11.6638).toFixed(2) : ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustomSilverPrice(val ? (parseFloat(val) / 11.6638).toFixed(4) : "");
                                  }}
                                  placeholder="0.00"
                                  className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="space-y-4">
                  {/* Gold Purity Karat breakdown */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">Gold Weight (in Grams)</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {/* 24K */}
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                          24K Gold (Pure)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={assets.gold.weight24k || ""}
                            onChange={(e) => handleGoldWeightChange("weight24k", e.target.value)}
                            placeholder="0g"
                            className="block w-full pr-8 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-white font-medium text-slate-800 px-3"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase">g</span>
                        </div>
                        <div className="text-[10px] text-amber-700 font-semibold mt-1.5">
                          ~ {formatMoney(assets.gold.weight24k * goldPriceSelected)}
                        </div>
                      </div>

                      {/* 22K */}
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                          22K Gold (Jewelry)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={assets.gold.weight22k || ""}
                            onChange={(e) => handleGoldWeightChange("weight22k", e.target.value)}
                            placeholder="0g"
                            className="block w-full pr-8 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-white font-medium text-slate-800 px-3"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase">g</span>
                        </div>
                        <div className="text-[10px] text-amber-700 font-semibold mt-1.5">
                          ~ {formatMoney(assets.gold.weight22k * goldPriceSelected * (22 / 24))}
                        </div>
                      </div>

                      {/* 21K */}
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                          21K Gold (Standard)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={assets.gold.weight21k || ""}
                            onChange={(e) => handleGoldWeightChange("weight21k", e.target.value)}
                            placeholder="0g"
                            className="block w-full pr-8 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-white font-medium text-slate-800 px-3"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase">g</span>
                        </div>
                        <div className="text-[10px] text-amber-700 font-semibold mt-1.5">
                          ~ {formatMoney(assets.gold.weight21k * goldPriceSelected * (21 / 24))}
                        </div>
                      </div>

                      {/* 18K */}
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                          18K Gold (Light)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={assets.gold.weight18k || ""}
                            onChange={(e) => handleGoldWeightChange("weight18k", e.target.value)}
                            placeholder="0g"
                            className="block w-full pr-8 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none bg-white font-medium text-slate-800 px-3"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase">g</span>
                        </div>
                        <div className="text-[10px] text-amber-700 font-semibold mt-1.5">
                          ~ {formatMoney(assets.gold.weight18k * goldPriceSelected * (18 / 24))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Silver */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 flex justify-between">
                      <span>Total Silver Weight</span>
                      <span className="text-slate-400 font-normal">(grams)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={assets.silverWeight || ""}
                        onChange={(e) => handleAssetChange("silverWeight", e.target.value)}
                        placeholder="0g"
                        className="block w-full pr-8 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none bg-white font-medium text-slate-800 px-3"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase">g</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-2 font-medium flex justify-between">
                      <span>Computed Silver Value:</span>
                      <span className="font-semibold text-slate-700">
                        {formatMoney(assets.silverWeight * silverPriceSelected)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Investments, Receivables, Stock holdings */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-150 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
                <div className="flex items-center gap-3 mb-5">
                  <div className="bg-indigo-50 p-2 rounded-xl text-indigo-700">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-display font-bold text-slate-800">Investments, Business & Other Assets</h2>
                    <p className="text-xs text-slate-400">Speculative/trade assets subject to purification</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Investments */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 flex justify-between">
                      <span>Stocks, Crypto, Funds & Pensions (Withdrawable Share)</span>
                      <span className="text-slate-400 font-normal">({currency})</span>
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <span className="text-slate-400 text-sm font-semibold">{currentCurrencyInfo.symbol}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={assets.investments || ""}
                        onChange={(e) => handleAssetChange("investments", e.target.value)}
                        placeholder="0.00"
                        className="block w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 bg-slate-50/30"
                      />
                    </div>
                  </div>

                  {/* Business Inventory */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 flex justify-between">
                      <span>Business Merchandise Value / Trade Stock</span>
                      <span className="text-slate-400 font-normal">({currency})</span>
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <span className="text-slate-400 text-sm font-semibold">{currentCurrencyInfo.symbol}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={assets.businessInventory || ""}
                        onChange={(e) => handleAssetChange("businessInventory", e.target.value)}
                        placeholder="0.00"
                        className="block w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 bg-slate-50/30"
                      />
                    </div>
                  </div>

                  {/* Receivables */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 flex justify-between">
                      <span>Loans/Debts expectantly owed back to you</span>
                      <span className="text-slate-400 font-normal">({currency})</span>
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <span className="text-slate-400 text-sm font-semibold">{currentCurrencyInfo.symbol}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={assets.receivables || ""}
                        onChange={(e) => handleAssetChange("receivables", e.target.value)}
                        placeholder="0.00"
                        className="block w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800 bg-slate-50/30"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Liabilities Module */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-150 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500" />
                <div className="flex items-center gap-3 mb-5">
                  <div className="bg-rose-50 p-2 rounded-xl text-rose-700">
                    <Scale className="h-5 w-5 rotate-180" />
                  </div>
                  <div>
                    <h2 className="text-lg font-display font-bold text-slate-800">Deductible Liabilities</h2>
                    <p className="text-xs text-slate-400">Debts and expenses due immediately or in this year</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Debts Owed */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 flex justify-between">
                      <span>Immediate Personal Debts & Loans</span>
                      <span className="text-slate-400 font-normal">({currency})</span>
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <span className="text-slate-400 text-sm font-semibold">{currentCurrencyInfo.symbol}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={liabilities.debtsOwed || ""}
                        onChange={(e) => handleLiabilityChange("debtsOwed", e.target.value)}
                        placeholder="0.00"
                        className="block w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-medium text-slate-800 bg-slate-50/30"
                      />
                    </div>
                  </div>

                  {/* Bills Due */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 flex justify-between">
                      <span>Outstanding Rent, Utilities & Tax Liabilities</span>
                      <span className="text-slate-400 font-normal">({currency})</span>
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <span className="text-slate-400 text-sm font-semibold">{currentCurrencyInfo.symbol}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={liabilities.billsDue || ""}
                        onChange={(e) => handleLiabilityChange("billsDue", e.target.value)}
                        placeholder="0.00"
                        className="block w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-medium text-slate-800 bg-slate-50/30"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Reset button */}
              <div className="flex justify-end">
                <button
                  onClick={resetCalculator}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-200/50 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Clear All Values
                </button>
              </div>

            </div>

            {/* Calculations and outcome panel - spans 5 cols */}
            <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-36">
              
              {/* Dynamic Summary Panel */}
              <div className={`rounded-3xl p-6 border transition-all ${
                isZakatDue 
                  ? "bg-gradient-to-br from-emerald-900 to-teal-950 text-white border-emerald-700/50 shadow-xl"
                  : "bg-white text-slate-800 border-slate-200 shadow-sm"
              }`}>
                <div className="flex items-center justify-between mb-6">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${
                    isZakatDue ? "bg-amber-400 text-emerald-950 font-bold" : "bg-slate-100 text-slate-500"
                  }`}>
                    {isZakatDue ? "Zakat is obligatory" : "Below Nisab limit"}
                  </span>
                  <div className={isZakatDue ? "text-amber-300" : "text-emerald-600"}>
                    {isZakatDue ? <Sparkles className="h-5 w-5 animate-pulse" /> : <Info className="h-5 w-5" />}
                  </div>
                </div>

                {/* Zakat Owed Box */}
                <div className="mb-6">
                  <h3 className={`text-xs font-bold tracking-wider uppercase ${isZakatDue ? "text-emerald-200/90" : "text-slate-500"}`}>
                    Your Calculated Zakat (2.5%)
                  </h3>
                  <p className={`text-4xl md:text-5xl font-display font-black tracking-tight mt-1 ${isZakatDue ? "text-amber-300" : "text-slate-400"}`}>
                    {formatMoney(results.zakatOwed)}
                  </p>
                  <p className={`text-xs mt-1.5 font-medium ${isZakatDue ? "text-emerald-100/70" : "text-slate-400"}`}>
                    {isZakatDue 
                      ? `Based on net wealth of ${formatMoney(results.netAssets)}`
                      : `Your net wealth is ${formatMoney(results.netAssets)} which is below the threshold.`}
                  </p>
                </div>

                {/* Meter/Progress bar to Nisab */}
                <div className="mb-6">
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span className={isZakatDue ? "text-emerald-200" : "text-slate-500"}>Nisab Progress</span>
                    <span className={isZakatDue ? "text-amber-300" : "text-emerald-700"}>{Math.round(progressToNisab)}%</span>
                  </div>
                  <div className={`h-3 w-full rounded-full overflow-hidden ${isZakatDue ? "bg-emerald-950" : "bg-slate-100"}`}>
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isZakatDue ? "bg-gradient-to-r from-amber-400 to-amber-500" : "bg-emerald-600"
                      }`}
                      style={{ width: `${progressToNisab}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] mt-1.5 font-semibold text-slate-400">
                    <span>Net Wealth</span>
                    <span className={isZakatDue ? "text-emerald-200" : "text-slate-600"}>Nisab Threshold ({formatMoney(activeNisabThreshold)})</span>
                  </div>
                </div>

                {/* Details list */}
                <div className={`space-y-3.5 border-t pt-5 ${isZakatDue ? "border-emerald-800" : "border-slate-100"}`}>
                  <div className="flex justify-between text-xs font-medium">
                    <span className={isZakatDue ? "text-emerald-200" : "text-slate-500"}>Total Valued Assets</span>
                    <span className="font-semibold">{formatMoney(results.totalAssets)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span className={isZakatDue ? "text-emerald-200" : "text-slate-500"}>Total Deductions / Liabilities</span>
                    <span className="font-semibold">{formatMoney(results.totalLiabilities)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold border-b pb-4 border-dashed border-emerald-800">
                    <span className={isZakatDue ? "text-emerald-100" : "text-slate-700"}>Net Eligible Wealth</span>
                    <span className="text-sm">{formatMoney(results.netAssets)}</span>
                  </div>

                  {/* Multi-currency breakdown grid */}
                  {isZakatDue && (
                    <div className="mt-4">
                      <h4 className="text-[10px] uppercase font-bold tracking-wider text-emerald-200/70 mb-2">
                        Automatic Conversion Converter Grid
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        {["USD", "EUR", "GBP", "SAR", "AED", "PKR", "INR", "TRY"].filter(c => c !== currency).slice(0, 6).map((c) => {
                          const rateFactor = (ratesData?.rates[c] || 1) / (ratesData?.rates[currency] || 1);
                          return (
                            <div key={c} className="flex justify-between bg-emerald-950/40 p-1.5 rounded-lg border border-emerald-800/30">
                              <span className="text-emerald-200 font-semibold">{c}</span>
                              <span className="text-white font-bold">{formatMoney(results.zakatOwed * rateFactor, c)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Download PDF Button */}
                  <div className={`mt-5 pt-4 border-t ${isZakatDue ? "border-emerald-800" : "border-slate-100"}`}>
                    <button
                      onClick={downloadPdfSummary}
                      className={`w-full py-3 px-4 rounded-xl font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.98] ${
                        isZakatDue
                          ? "bg-amber-400 hover:bg-amber-300 text-emerald-950 font-bold"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      }`}
                      id="download-pdf-summary-btn"
                    >
                      <Download className="h-4 w-4" />
                      Download Summary as PDF
                    </button>
                  </div>
                </div>

                {/* Actions / Next Steps */}
                {isZakatDue && (
                  <div className="mt-6 bg-emerald-950/50 p-4 rounded-2xl border border-emerald-800 flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-bold text-amber-300">How to pay Zakat?</p>
                      <p className="text-emerald-100/90 leading-relaxed mt-0.5">
                        Zakat can be paid directly to eligible charities or people in need (the 8 categories defined in Surah At-Tawbah, verse 60). You should make intention (Niyyah) when paying.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Zakat Assets Distribution Mini-Bento */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
                  Asset Distribution Breakdown
                </h3>
                <div className="space-y-3">
                  {/* Cash */}
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span className="text-slate-600 flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Cash & Bank Savings
                      </span>
                      <span className="font-bold text-slate-800">{formatMoney(results.totalCash)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${results.totalAssets > 0 ? (results.totalCash / results.totalAssets) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Gold & Silver */}
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span className="text-slate-600 flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Precious Metals
                      </span>
                      <span className="font-bold text-slate-800">{formatMoney(results.totalGoldValue + results.totalSilverValue)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${results.totalAssets > 0 ? ((results.totalGoldValue + results.totalSilverValue) / results.totalAssets) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Other */}
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1">
                      <span className="text-slate-600 flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" /> Other Assets & Investments
                      </span>
                      <span className="font-bold text-slate-800">{formatMoney(results.totalOtherAssets)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${results.totalAssets > 0 ? (results.totalOtherAssets / results.totalAssets) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Tab 2: AI Zakat Scholar Chat Advisor */}
        {activeTab === "advisor" && (
          <div className="lg:col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            
            {/* Quick Helper Sidebar (Hidden/styled responsive) */}
            <div className="lg:col-span-4 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-emerald-50 p-2.5 rounded-xl text-emerald-700">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-slate-800">AI Zakat Scholar</h3>
                    <p className="text-xs text-slate-400">Authentic Fatwa & Wealth Purification Expert</p>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mb-6">
                  Get custom scholarly answers to complex situations such as calculating Zakat on combined incomes, business stock values, mixed karat gold, or long-term liabilities based on classical Islamic jurisprudence.
                </p>

                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Suggested Questions
                </h4>
                <div className="space-y-2">
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(q)}
                      disabled={sendingChat}
                      className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/40 text-xs font-semibold text-emerald-900 transition-all flex items-center justify-between gap-2 group cursor-pointer"
                    >
                      <span>{q}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-emerald-600 shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100 text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                Jurisprudence sources verified live
              </div>
            </div>

            {/* Chat Screen */}
            <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col min-h-[500px]">
              
              {/* Chat Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Live Scholarly Guidance Session</span>
                </div>
                <span className="text-[10px] font-semibold text-slate-400">
                  Current Assets: {formatMoney(results.netAssets)}
                </span>
              </div>

              {/* Message Log */}
              <div className="flex-grow overflow-y-auto p-6 space-y-4 max-h-[450px]">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[85%] rounded-2xl p-4 shadow-xs border ${
                      msg.role === "user"
                        ? "bg-emerald-800 text-white border-emerald-700 rounded-tr-none"
                        : "bg-slate-50 text-slate-800 border-slate-150 rounded-tl-none"
                    }`}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                          msg.role === "user" ? "text-emerald-200" : "text-emerald-800"
                        }`}>
                          {msg.role === "user" ? "You" : "Zakat Scholar AI"}
                        </span>
                        <span className={`text-[9px] ${
                          msg.role === "user" ? "text-emerald-300" : "text-slate-400"
                        }`}>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      
                      <div className="space-y-1">
                        {msg.role === "user" ? (
                          <p className="text-sm leading-relaxed">{msg.text}</p>
                        ) : (
                          renderMessageText(msg.text)
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {sendingChat && (
                  <div className="flex justify-start">
                    <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 rounded-tl-none max-w-[85%]">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Zakat Scholar AI</span>
                        <span className="text-[9px] text-slate-400">writing response...</span>
                      </div>
                      <div className="flex gap-1 mt-3">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input form */}
              <div className="p-4 border-t border-slate-100">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="Type your question about Zakat rules, jewelry, business assets..."
                    className="flex-grow px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-800"
                  />
                  <button
                    type="submit"
                    disabled={!userInput.trim() || sendingChat}
                    className="bg-emerald-800 hover:bg-emerald-950 text-white p-3 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer disabled:opacity-50"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </form>
              </div>

            </div>
          </div>
        )}

        {/* Tab 3: Zakat Fiqh Knowledge Accordion */}
        {activeTab === "guide" && (
          <div className="lg:col-span-12 space-y-6">
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-emerald-50 p-2.5 rounded-xl text-emerald-700">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-display font-bold text-slate-800">Comprehensive Zakat Fiqh Guide</h2>
                  <p className="text-xs text-slate-500">Essential rules, categories, and classical definitions of wealth purification</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Accordion Item 1 */}
                <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                  <div className="p-5 font-bold text-sm text-slate-800 flex justify-between items-center bg-slate-50 border-b border-slate-100">
                    <span>What is Zakat and who is obligated to pay it?</span>
                  </div>
                  <div className="p-5 text-xs text-slate-600 leading-relaxed space-y-2">
                    <p>
                      <strong>Zakat</strong> is the third pillar of Islam. It is an obligatory annual payment made by qualifying Muslims to purify their wealth and assist the needy.
                    </p>
                    <p>
                      An individual is obligated to pay Zakat if they meet the following conditions:
                    </p>
                    <ul className="list-disc pl-4 space-y-1 mt-1">
                      <li><strong>Muslim:</strong> The obligation applies only to practicing Muslims.</li>
                      <li><strong>Sane & Mature:</strong> Possesses mental capacity and of age (many scholars include the wealth of orphans/minors, handled by guardians).</li>
                      <li><strong>Nisab threshold:</strong> Possesses qualifying net assets exceeding the Nisab threshold.</li>
                      <li><strong>Hawl (1 lunar year):</strong> Possesses that wealth for a continuous lunar year.</li>
                    </ul>
                  </div>
                </div>

                {/* Accordion Item 2 */}
                <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                  <div className="p-5 font-bold text-sm text-slate-800 flex justify-between items-center bg-slate-50 border-b border-slate-100">
                    <span>What is Nisab? Gold vs. Silver standards explained</span>
                  </div>
                  <div className="p-5 text-xs text-slate-600 leading-relaxed space-y-2">
                    <p>
                      <strong>Nisab</strong> is the absolute minimum amount of wealth a Muslim must own before they are obligated to pay Zakat.
                    </p>
                    <p>
                      The standard limits established by the Prophet Muhammad (PBUH) are:
                    </p>
                    <ul className="list-disc pl-4 space-y-1 mt-1">
                      <li><strong>Gold standard:</strong> 85 grams of pure (24 karat) gold.</li>
                      <li><strong>Silver standard:</strong> 595 grams of pure silver.</li>
                    </ul>
                    <p>
                      <strong>Scholarly Opinions:</strong> In the Hanafi school of thought, the Silver standard is often preferred for cash assets because it has a lower currency value in today's markets, making more people eligible to contribute and providing greater aid to the poor. Other schools (Shafi'i, Maliki, Hanbali) and modern jurists generally advise using the Gold Nisab as the default standard to avoid premature obligations on lower income earners.
                    </p>
                  </div>
                </div>

                {/* Accordion Item 3 */}
                <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                  <div className="p-5 font-bold text-sm text-slate-800 flex justify-between items-center bg-slate-50 border-b border-slate-100">
                    <span>How is Zakat calculated on jewelry (Gold / Silver)?</span>
                  </div>
                  <div className="p-5 text-xs text-slate-600 leading-relaxed space-y-2">
                    <p>
                      The rules depend on the purpose of owning the jewelry:
                    </p>
                    <ul className="list-disc pl-4 space-y-1 mt-1">
                      <li><strong>Investment/Savings Gold:</strong> If gold jewelry or bullion is kept as an investment, store of value, or safety asset, Zakat is obligatorily due on it (2.5% value).</li>
                      <li><strong>Personal-use Wearable Jewelry:</strong> There is a valid difference of opinion. The Shafi'i, Maliki, and Hanbali schools state that wearable jewelry used for personal adornment is exempt from Zakat. The Hanafi school, however, states that ALL gold and silver items—regardless of purpose or wearable status—are subject to Zakat if their total weight meets the Nisab limit.</li>
                    </ul>
                  </div>
                </div>

                {/* Accordion Item 4 */}
                <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                  <div className="p-5 font-bold text-sm text-slate-800 flex justify-between items-center bg-slate-50 border-b border-slate-100">
                    <span>Who is eligible to receive Zakat?</span>
                  </div>
                  <div className="p-5 text-xs text-slate-600 leading-relaxed space-y-2">
                    <p>
                      According to the Holy Qur'an (Surah At-Tawbah, verse 60), there are 8 specific categories of people who can receive Zakat:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1.5 mt-2">
                      <li><strong>Al-Fuqara (The Poor):</strong> Those who possess very little or no wealth.</li>
                      <li><strong>Al-Masakin (The Needy):</strong> Those who have basic livelihoods but struggle to meet core requirements.</li>
                      <li><strong>Al-Amilina (The Zakat Administrators):</strong> Those employed to collect and distribute the funds.</li>
                      <li><strong>Al-Mu'allafatu Qulubuhum (Those whose hearts are to be reconciled):</strong> New Muslims or those supportive of the community.</li>
                      <li><strong>Fir-Riqab (In freeing slaves):</strong> Historically to free individuals from captivity or slavery.</li>
                      <li><strong>Al-Gharimin (Those in Debt):</strong> Those who are burdened by debts they cannot repay.</li>
                      <li><strong>Fi-Sabilillah (In the path of Allah):</strong> For those defending or promoting positive work in the cause of God.</li>
                      <li><strong>Ibnus-Sabil (The Wayfarer):</strong> Travelers stranded far from home who need help to return.</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Google Drive Backup & Recovery */}
        {activeTab === "drive" && (
          <DriveBackupTab
            currentAssets={assets}
            currentLiabilities={liabilities}
            currentCurrency={currency}
            currentNisabStandard={nisabStandard}
            currentResults={results}
            onLoadCalculation={(loadedAssets, loadedLiabilities, loadedCurrency, loadedNisabStandard) => {
              setAssets(loadedAssets);
              setLiabilities(loadedLiabilities);
              setCurrency(loadedCurrency);
              setPrevCurrency(loadedCurrency);
              setNisabStandard(loadedNisabStandard);
              setActiveTab("calculator");
            }}
          />
        )}

      </main>

      {/* Footer block */}
      <footer className="bg-emerald-950 text-emerald-100/70 border-t border-emerald-900 mt-auto py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-400" />
            <span className="font-semibold text-white font-display">Zakat Al-Mal Calculator</span>
            <span>| Authentic Wealth Purification Engine</span>
          </div>
          <div>
            Calculated in accordance with classical jurisprudence and live market rates.
          </div>
          <div>
            © {new Date().getFullYear()} AI Studio Applet. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
