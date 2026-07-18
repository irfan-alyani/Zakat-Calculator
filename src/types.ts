export interface CurrencyRates {
  [currencyCode: string]: number;
}

export interface ZakatRatesResponse {
  goldPriceUsdPerGram: number;
  silverPriceUsdPerGram: number;
  rates: CurrencyRates;
  lastUpdated: string;
  isFallback: boolean;
}

export interface GoldAssetInput {
  weight24k: number;
  weight22k: number;
  weight21k: number;
  weight18k: number;
}

export interface ZakatAssets {
  cashOnHand: number;
  cashInBanks: number;
  gold: GoldAssetInput;
  silverWeight: number; // in grams
  investments: number; // stocks, crypto, pensions, etc.
  businessInventory: number;
  receivables: number; // money owed to the user
}

export interface ZakatLiabilities {
  debtsOwed: number;
  billsDue: number;
  businessExpenses: number;
}

export interface CalculationResult {
  totalCash: number;
  totalGoldValue: number;
  totalSilverValue: number;
  totalOtherAssets: number;
  totalAssets: number;
  totalLiabilities: number;
  netAssets: number;
  nisabGoldUsd: number;
  nisabSilverUsd: number;
  nisabGoldSelected: number;
  nisabSilverSelected: number;
  isEligibleGold: boolean;
  isEligibleSilver: boolean;
  zakatOwed: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model" | "system";
  text: string;
  timestamp: Date;
}
