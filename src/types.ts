export type TransactionType = 'income' | 'expense';
export type WalletType = 'Cash' | 'Bank' | 'Credit Card' | 'Online';
export type CategoryType = 
  | 'Salary' | 'Freelance' | 'Business' | 'Gift' | 'Investment' | 'Refund'
  | 'Food' | 'Transport' | 'Rent' | 'Shopping' | 'Health' | 'Entertainment' | 'Other';

export interface Transaction {
  id: string;
  name: string;
  amount: number;
  date: string; // ISO string YYYY-MM-DD
  type: TransactionType;
  wallet: WalletType;
  category: CategoryType;
  currency?: string;
  exchangeRate?: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  color: string;
}

export interface Debt {
  id: string;
  person: string;
  amount: number;
  type: 'owe' | 'owed';
  dueDate?: string;
  description?: string;
}

export interface Investment {
  id: string;
  name: string;
  type: 'Stock' | 'Crypto' | 'Gold' | 'Real Estate' | 'Other';
  investedAmount: number;
  currentValue: number;
  lastUpdated: string;
}

export interface RecurringTransaction {
  id: string;
  name: string;
  amount: number;
  type: TransactionType;
  category: CategoryType;
  wallet: WalletType;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  startDate: string;
  lastApplied?: string;
}

export type FilterType = 'all' | 'week' | 'month' | 'year';
export type ViewType = 'dashboard' | 'reports' | 'advisor' | 'goals' | 'debts' | 'investments' | 'recurring';
