import { useState, useEffect, useMemo, FormEvent, useRef } from 'react';
import { 
  Trash2, Calendar, Filter, Wallet, TrendingDown, Clock, 
  BarChart3, Plus, Search, Download, Moon, Sun, Upload, Database,
  TrendingUp, PieChart as PieChartIcon, LayoutDashboard, CreditCard, Banknote, Coins, Smartphone,
  FileText, Camera, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart as RePieChart, Pie, Cell 
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Transaction, FilterType, ViewType, CategoryType, WalletType, TransactionType,
  SavingsGoal, Debt, Investment, RecurringTransaction
} from './types';

const EXPENSE_CATEGORIES: CategoryType[] = ['Food', 'Transport', 'Rent', 'Shopping', 'Health', 'Entertainment', 'Other'];
const INCOME_CATEGORIES: CategoryType[] = ['Salary', 'Freelance', 'Business', 'Gift', 'Investment', 'Refund', 'Other'];
const EXPENSE_WALLETS: WalletType[] = ['Cash', 'Bank', 'Credit Card', 'Online'];
const INCOME_WALLETS: WalletType[] = ['Cash', 'Bank', 'Online'];
const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'];

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState<CategoryType>('Food');
  const [wallet, setWallet] = useState<WalletType>('Cash');
  const [filter, setFilter] = useState<FilterType>('all');
  const [view, setView] = useState<ViewType>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [budget, setBudget] = useState(30000);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState(budget.toString());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // New Advanced States
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [aiChat, setAiChat] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [prediction, setPrediction] = useState<string | null>(null);
  const [currency, setCurrency] = useState('INR');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [reminders, setReminders] = useState<string[]>([]);

  useEffect(() => {
    const applyRecurring = () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      let updated = false;
      const newTransactions = [...transactions];
      const updatedRecurring = recurring.map(r => {
        const lastDate = r.lastApplied ? new Date(r.lastApplied) : new Date(r.startDate);
        let nextDate = new Date(lastDate);
        
        if (r.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
        else if (r.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
        else if (r.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
        else if (r.frequency === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);

        if (nextDate <= now) {
          updated = true;
          const newT: Transaction = {
            id: crypto.randomUUID(),
            name: r.name,
            amount: r.amount,
            type: r.type,
            category: r.category,
            wallet: r.wallet,
            date: todayStr
          };
          newTransactions.unshift(newT);
          return { ...r, lastApplied: todayStr };
        }
        return r;
      });

      if (updated) {
        setTransactions(newTransactions);
        setRecurring(updatedRecurring);
      }
    };
    
    if (recurring.length > 0) applyRecurring();
  }, [recurring, transactions]);

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    return transactions.filter((t) => {
      const tDate = new Date(t.date);
      const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           t.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      if (filter === 'week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        return tDate >= oneWeekAgo;
      } else if (filter === 'month') {
        return (
          tDate.getMonth() === now.getMonth() &&
          tDate.getFullYear() === now.getFullYear()
        );
      } else if (filter === 'year') {
        return tDate.getFullYear() === now.getFullYear();
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filter, searchQuery]);

  const stats = useMemo(() => {
    const income = filteredTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = filteredTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { income, expense, balance: income - expense };
  }, [filteredTransactions]);

  useEffect(() => {
    const checkReminders = () => {
      const newReminders = [];
      if (stats.expense > budget * 0.9) {
        newReminders.push(`Warning: You have spent ${Math.round((stats.expense/budget)*100)}% of your budget!`);
      }
      const today = new Date().toISOString().split('T')[0];
      const hasToday = transactions.some(t => t.date === today);
      if (!hasToday && new Date().getHours() > 20) {
        newReminders.push("Don't forget to log your expenses for today!");
      }
      setReminders(newReminders);
    };
    checkReminders();
  }, [transactions, budget, stats.expense]);

  const allCategories = useMemo(() => {
    const base = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    return [...base, ...customCategories];
  }, [type, customCategories]);

  // Reset category and wallet when type changes
  useEffect(() => {
    if (type === 'income') {
      setCategory('Salary');
      setWallet('Bank');
    } else {
      setCategory('Food');
      setWallet('Cash');
    }
  }, [type]);

  // Load data
  useEffect(() => {
    const savedTransactions = localStorage.getItem('spendwise_transactions');
    const savedOldExpenses = localStorage.getItem('spendwise_expenses');
    const savedBudget = localStorage.getItem('spendwise_budget');
    const savedTheme = localStorage.getItem('spendwise_theme');
    const savedGoals = localStorage.getItem('spendwise_goals');
    const savedDebts = localStorage.getItem('spendwise_debts');
    const savedInvestments = localStorage.getItem('spendwise_investments');
    const savedRecurring = localStorage.getItem('spendwise_recurring');
    
    if (savedTransactions) {
      setTransactions(JSON.parse(savedTransactions));
    } else if (savedOldExpenses) {
      // Migrate old data
      const oldData = JSON.parse(savedOldExpenses);
      const migratedData: Transaction[] = oldData.map((e: any) => ({
        ...e,
        type: 'expense',
        category: 'Other',
        wallet: 'Cash'
      }));
      setTransactions(migratedData);
      localStorage.setItem('spendwise_transactions', JSON.stringify(migratedData));
      localStorage.removeItem('spendwise_expenses');
    }

    if (savedBudget) setBudget(Number(savedBudget));
    if (savedTheme) setIsDarkMode(savedTheme === 'dark');
    if (savedGoals) setGoals(JSON.parse(savedGoals));
    if (savedDebts) setDebts(JSON.parse(savedDebts));
    if (savedInvestments) setInvestments(JSON.parse(savedInvestments));
    if (savedRecurring) setRecurring(JSON.parse(savedRecurring));
    
    const savedCurrency = localStorage.getItem('spendwise_currency');
    const savedCustomCats = localStorage.getItem('spendwise_custom_cats');
    if (savedCurrency) setCurrency(savedCurrency);
    if (savedCustomCats) setCustomCategories(JSON.parse(savedCustomCats));
  }, []);

  // Save data
  useEffect(() => {
    localStorage.setItem('spendwise_transactions', JSON.stringify(transactions));
    localStorage.setItem('spendwise_budget', budget.toString());
    localStorage.setItem('spendwise_theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('spendwise_goals', JSON.stringify(goals));
    localStorage.setItem('spendwise_debts', JSON.stringify(debts));
    localStorage.setItem('spendwise_investments', JSON.stringify(investments));
    localStorage.setItem('spendwise_recurring', JSON.stringify(recurring));
    localStorage.setItem('spendwise_currency', currency);
    localStorage.setItem('spendwise_custom_cats', JSON.stringify(customCategories));
    
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [transactions, budget, isDarkMode]);

  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions.");
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "receipt.jpg", { type: "image/jpeg" });
            scanReceipt(file);
            stopCamera();
          }
        }, 'image/jpeg');
      }
    }
  };

  const addTransaction = (e: FormEvent) => {
    e.preventDefault();
    if (!name || !amount || !date) return;

    const newTransaction: Transaction = {
      id: crypto.randomUUID(),
      name,
      amount: parseFloat(amount),
      date,
      type,
      category,
      wallet,
    };

    setTransactions([newTransaction, ...transactions]);
    setName('');
    setAmount('');
    setShowAddModal(false);
  };

  const deleteTransaction = (id: string) => {
    setTransactions(transactions.filter((t) => t.id !== id));
  };

  const groupedTransactions = useMemo(() => {
    const groups: { [key: string]: Transaction[] } = {};
    filteredTransactions.forEach((t) => {
      const date = new Date(t.date);
      const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!groups[monthYear]) groups[monthYear] = [];
      groups[monthYear].push(t);
    });
    return groups;
  }, [filteredTransactions]);

  const chartData = useMemo(() => {
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return {
        month: d.toLocaleString('default', { month: 'short' }),
        year: d.getFullYear(),
        key: `${d.getMonth()}-${d.getFullYear()}`
      };
    }).reverse();

    return last6Months.map(m => {
      const monthTransactions = transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === (m.key.split('-')[0] as any * 1) && d.getFullYear() === m.year;
      });
      return {
        name: m.month,
        income: monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        expense: monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      };
    });
  }, [transactions]);

  const [reportType, setReportType] = useState<TransactionType>('expense');

  const categoryData = useMemo(() => {
    const filtered = transactions.filter(t => t.type === reportType);
    const data: { [key: string]: number } = {};
    filtered.forEach(t => {
      data[t.category] = (data[t.category] || 0) + t.amount;
    });
    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, reportType]);

  const topTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [transactions]);

  const reportStats = useMemo(() => {
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
    const topCategory = categoryData[0]?.name || 'N/A';
    
    return { totalIncome, totalExpense, savingsRate, topCategory };
  }, [transactions, categoryData]);

  const exportToCSV = () => {
    const headers = ['Name', 'Amount', 'Date', 'Type', 'Category', 'Wallet'];
    const rows = transactions.map(t => [
      t.name,
      t.amount.toString(),
      t.date,
      t.type,
      t.category,
      t.wallet
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    
    // Add BOM for Excel UTF-8 compatibility
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `spendwise_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Add Title
    doc.setFontSize(22);
    doc.setTextColor(99, 102, 241);
    doc.text('SpendWise Financial Report', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: ${filter.toUpperCase()} | Generated: ${new Date().toLocaleString()}`, 14, 30);
    
    // Summary Box
    doc.setFillColor(248, 250, 252);
    doc.rect(14, 35, 182, 35, 'F');
    
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Financial Summary', 20, 45);
    
    doc.setFontSize(10);
    doc.setTextColor(16, 185, 129); // Emerald
    doc.text(`Total Income: ${currency} ${stats.income.toLocaleString()}`, 20, 55);
    doc.setTextColor(225, 29, 72); // Rose
    doc.text(`Total Expense: ${currency} ${stats.expense.toLocaleString()}`, 80, 55);
    doc.setTextColor(99, 102, 241); // Indigo
    doc.text(`Net Balance: ${currency} ${stats.balance.toLocaleString()}`, 140, 55);
    
    doc.setTextColor(100);
    doc.text(`Budget Utilization: ${Math.round((stats.expense/budget)*100)}%`, 20, 65);

    // Add Table
    const tableData = transactions.map(t => [
      t.date,
      t.name,
      t.category,
      t.wallet,
      t.type.toUpperCase(),
      `${currency} ${t.amount.toLocaleString()}`
    ]);
    
    autoTable(doc, {
      startY: 80,
      head: [['Date', 'Description', 'Category', 'Wallet', 'Type', 'Amount']],
      body: tableData,
      headStyles: { fillColor: [99, 102, 241] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 80 },
    });
    
    doc.save(`spendwise_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const backupData = () => {
    const data = {
      transactions,
      budget,
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spendwise_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const restoreData = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.transactions && Array.isArray(data.transactions)) {
          setTransactions(data.transactions);
          if (data.budget) setBudget(data.budget);
          alert('Data restored successfully!');
        } else {
          alert('Invalid backup file format.');
        }
      } catch (err) {
        alert('Error reading backup file.');
      }
    };
    reader.readAsText(file);
  };

  const clearAllData = () => {
    if (confirm('Are you sure you want to clear ALL data? This cannot be undone.')) {
      setTransactions([]);
      setGoals([]);
      setDebts([]);
      setInvestments([]);
      setRecurring([]);
      setAiChat([]);
      setPrediction(null);
      setCurrency('INR');
      setCustomCategories([]);
      setReminders([]);
      localStorage.clear();
      alert('All data cleared.');
    }
  };

  // Local Features (Offline)
  const askAiAdvisor = (message: string) => {
    if (!message.trim()) return;
    
    const newChat = [...aiChat, { role: 'user' as const, text: message }];
    setAiChat(newChat);
    setIsAiLoading(true);

    // Simple rule-based local advisor
    setTimeout(() => {
      let response = "I'm analyzing your data locally. ";
      const msg = message.toLowerCase();

      if (msg.includes('budget') || msg.includes('spend')) {
        if (stats.expense > budget) {
          response += `You are currently ${currency} ${(stats.expense - budget).toLocaleString()} over your budget. Consider reducing non-essential spending in categories like ${reportStats.topCategory}.`;
        } else {
          response += `You are doing great! You have ${currency} ${(budget - stats.expense).toLocaleString()} left in your budget for this period.`;
        }
      } else if (msg.includes('save') || msg.includes('goal')) {
        if (goals.length > 0) {
          const topGoal = goals[0];
          response += `Your goal '${topGoal.name}' is ${Math.round((topGoal.currentAmount / topGoal.targetAmount) * 100)}% complete. Keep it up!`;
        } else {
          response += "You haven't set any savings goals yet. Setting a goal is the first step to financial freedom!";
        }
      } else if (msg.includes('debt')) {
        const totalOwe = debts.filter(d => d.type === 'owe').reduce((s, d) => s + d.amount, 0);
        if (totalOwe > 0) {
          response += `You currently owe a total of ${currency} ${totalOwe.toLocaleString()}. Try to prioritize high-interest debts first.`;
        } else {
          response += "You have no recorded debts. That's excellent!";
        }
      } else {
        response += "I'm your local SpendWise assistant. I can help you with budget tracking, savings goals, and debt management tips based on your local data.";
      }

      setAiChat([...newChat, { role: 'model', text: response }]);
      setIsAiLoading(false);
    }, 600);
  };

  const scanReceipt = async (file: File) => {
    if (!process.env.GEMINI_API_KEY) {
      alert("AI API Key is missing. Please check your settings.");
      return;
    }
    
    setIsAiLoading(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64Data = await base64Promise;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { inlineData: { data: base64Data, mimeType: file.type || "image/jpeg" } },
              { text: "Extract transaction details from this receipt." }
            ]
          }
        ],
        config: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Name of the store or item" },
              amount: { type: Type.NUMBER, description: "Total amount on the receipt" },
              date: { type: Type.STRING, description: "Date of transaction in YYYY-MM-DD format" },
              type: { type: Type.STRING, enum: ["expense"], description: "Always 'expense'" },
              category: { 
                type: Type.STRING, 
                enum: ["Food", "Transport", "Rent", "Shopping", "Health", "Entertainment", "Other"],
                description: "Category of expense"
              },
              wallet: { 
                type: Type.STRING, 
                enum: ["Cash", "Bank", "Credit Card", "Online"],
                description: "Estimated payment method"
              }
            },
            required: ["name", "amount"]
          }
        }
      });

      const text = response.text?.trim() || "{}";
      const result = JSON.parse(text);
      
      if (result.name && result.amount) {
        const newT: Transaction = {
          id: crypto.randomUUID(),
          name: result.name,
          amount: Math.abs(result.amount),
          type: 'expense',
          category: result.category || 'Other',
          wallet: result.wallet || 'Cash',
          date: result.date || new Date().toISOString().split('T')[0],
        };
        
        setTransactions(prev => [newT, ...prev]);
        setShowAddModal(false); // Close modal on success
        alert(`Successfully added: ${newT.name} - ${currency} ${newT.amount}`);
      } else {
        alert("Could not extract clear information from the receipt. Please try again or enter manually.");
      }
    } catch (error) {
      console.error("Receipt Scan Error:", error);
      alert("Error scanning receipt. Please make sure you have an internet connection and the file is an image.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const getSmartPrediction = () => {
    setIsAiLoading(true);
    
    // Simple linear projection for offline mode
    setTimeout(() => {
      const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
      const currentDay = new Date().getDate();
      const dailyAverage = stats.expense / currentDay;
      const projectedExpense = dailyAverage * daysInMonth;
      
      let msg = `Based on your average daily spending of ${currency} ${dailyAverage.toFixed(2)}, your projected monthly expense is ${currency} ${projectedExpense.toLocaleString()}. `;
      
      if (projectedExpense > budget) {
        msg += `Warning: You are likely to exceed your budget by ${currency} ${(projectedExpense - budget).toLocaleString()}!`;
      } else {
        msg += "You are on track to stay within your budget.";
      }
      
      setPrediction(msg);
      setIsAiLoading(false);
    }, 500);
  };

  const budgetProgress = Math.min((stats.expense / budget) * 100, 100);
  const isOverBudget = stats.expense > budget;

  const getWalletIcon = (w: WalletType) => {
    switch(w) {
      case 'Cash': return <Coins className="w-4 h-4" />;
      case 'Bank': return <Banknote className="w-4 h-4" />;
      case 'Credit Card': return <CreditCard className="w-4 h-4" />;
      case 'Online': return <Smartphone className="w-4 h-4" />;
    }
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'} flex flex-col lg:flex-row overflow-hidden transition-colors duration-300`}>
      {/* Mobile Header */}
      <header className="lg:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-between items-center sticky top-0 z-40">
        <div className="logo text-xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          SpendWise
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
          >
            <Database className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Sidebar (Desktop) / Drawer (Mobile) */}
      <AnimatePresence>
        {(isSidebarOpen || window.innerWidth >= 1024) && (
          <>
            {/* Mobile Overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 lg:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed lg:static inset-y-0 left-0 w-80 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 p-8 flex flex-col gap-8 overflow-y-auto no-scrollbar z-50 lg:z-0"
            >
              <div className="flex justify-between items-center">
                <div className="logo text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight flex items-center gap-2">
                  <Wallet className="w-6 h-6" />
                  SpendWise
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="hidden lg:block p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  </button>
                  <button 
                    onClick={() => setIsSidebarOpen(false)}
                    className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                  >
                    <Plus className="w-5 h-5 rotate-45" />
                  </button>
                </div>
              </div>

              {/* Navigation */}
              <nav className="flex flex-col gap-2">
                <button 
                  onClick={() => { setView('dashboard'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${view === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <LayoutDashboard className="w-5 h-5" />
                  Dashboard
                </button>
                <button 
                  onClick={() => { setView('reports'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${view === 'reports' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <PieChartIcon className="w-5 h-5" />
                  Reports & Analytics
                </button>
                <button 
                  onClick={() => { setView('advisor'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${view === 'advisor' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <Smartphone className="w-5 h-5" />
                  AI Advisor
                </button>
                <button 
                  onClick={() => { setView('goals'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${view === 'goals' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <TrendingUp className="w-5 h-5" />
                  Savings Goals
                </button>
                <button 
                  onClick={() => { setView('debts'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${view === 'debts' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <CreditCard className="w-5 h-5" />
                  Debt Tracker
                </button>
                <button 
                  onClick={() => { setView('investments'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${view === 'investments' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <BarChart3 className="w-5 h-5" />
                  Investments
                </button>
                <button 
                  onClick={() => { setView('recurring'); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${view === 'recurring' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <Clock className="w-5 h-5" />
                  Recurring
                </button>
                <button 
                  onClick={exportToCSV}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                >
                  <Download className="w-5 h-5" />
                  Export Data (CSV)
                </button>

                <button 
                  onClick={exportToPDF}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                >
                  <FileText className="w-5 h-5" />
                  Export Report (PDF)
                </button>
                
                <div className="h-px bg-slate-100 dark:bg-slate-700 my-2" />
                
                <button 
                  onClick={backupData}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                >
                  <Database className="w-5 h-5" />
                  Backup to File
                </button>
                
                <label className="flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer">
                  <Upload className="w-5 h-5" />
                  Restore from File
                  <input type="file" accept=".json" onChange={restoreData} className="hidden" />
                </label>

                <button 
                  onClick={clearAllData}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all mt-auto"
                >
                  <Trash2 className="w-5 h-5" />
                  Clear All Data
                </button>
              </nav>

              {/* Budgeting */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Monthly Budget</h4>
                  <button 
                    onClick={() => {
                      if (isEditingBudget) {
                        setBudget(Number(tempBudget));
                      } else {
                        setTempBudget(budget.toString());
                      }
                      setIsEditingBudget(!isEditingBudget);
                    }}
                    className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                  >
                    {isEditingBudget ? 'SAVE' : 'EDIT'}
                  </button>
                </div>
                <div className="flex justify-between items-end mb-2">
                  {isEditingBudget ? (
                    <input 
                      type="number"
                      value={tempBudget}
                      onChange={(e) => setTempBudget(e.target.value)}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-indigo-500 rounded text-sm outline-none"
                      autoFocus
                    />
                  ) : (
                    <>
                      <span className="text-xl font-bold">{currency} {stats.expense.toLocaleString()}</span>
                      <span className="text-xs text-slate-400">of {currency} {budget.toLocaleString()}</span>
                    </>
                  )}
                </div>
                {!isEditingBudget && (
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${budgetProgress}%` }}
                      className={`h-full transition-all duration-500 ${isOverBudget ? 'bg-rose-500' : budgetProgress > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    />
                  </div>
                )}
                {isOverBudget && !isEditingBudget && <p className="text-[10px] text-rose-500 font-bold mt-2 flex items-center gap-1">⚠️ Budget Exceeded!</p>}
              </div>

              {/* Advanced Settings */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
                <div>
                  <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Currency</h4>
                  <select 
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                  >
                    <option value="INR">₹ INR</option>
                    <option value="USD">$ USD</option>
                    <option value="EUR">€ EUR</option>
                    <option value="GBP">£ GBP</option>
                  </select>
                </div>
                <div>
                  <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Custom Categories</h4>
                  <div className="flex gap-2 mb-2">
                    <input 
                      type="text"
                      placeholder="New category..."
                      className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setCustomCategories([...customCategories, e.currentTarget.value]);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {customCategories.map(cat => (
                      <span key={cat} className="text-[8px] px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full font-bold flex items-center gap-1">
                        {cat}
                        <Plus className="w-2 h-2 rotate-45 cursor-pointer" onClick={() => setCustomCategories(customCategories.filter(c => c !== cat))} />
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Add Transaction Form (Desktop) */}
              <div className={`hidden lg:block form-section p-4 rounded-2xl border transition-all duration-300 ${
                type === 'income' 
                  ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' 
                  : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700'
              }`}>
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4">Add Transaction</h3>
                <form onSubmit={addTransaction} className="flex flex-col gap-3">
                  <div className="flex bg-slate-200 dark:bg-slate-700 p-1 rounded-xl gap-1">
                    <button 
                      type="button"
                      onClick={() => setType('expense')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${type === 'expense' ? 'bg-white dark:bg-slate-600 text-rose-500 shadow-sm' : 'text-slate-500'}`}
                    >
                      Expense
                    </button>
                    <button 
                      type="button"
                      onClick={() => setType('income')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${type === 'income' ? 'bg-white dark:bg-slate-600 text-emerald-500 shadow-sm' : 'text-slate-500'}`}
                    >
                      Income
                    </button>
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={type === 'income' ? "Income Source" : "Description"}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Amount (${currency})`}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select 
                      value={category}
                      onChange={(e) => setCategory(e.target.value as CategoryType)}
                      className="px-3 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                    >
                      {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select 
                      value={wallet}
                      onChange={(e) => setWallet(e.target.value as WalletType)}
                      className="px-3 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                    >
                      {(type === 'income' ? INCOME_WALLETS : EXPENSE_WALLETS).map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                  />
                  <button
                    type="submit"
                    className={`py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 mt-2 shadow-lg ${
                      type === 'income' 
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 dark:shadow-none' 
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 dark:shadow-none'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    Add {type === 'income' ? 'Income' : 'Expense'}
                  </button>
                </form>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-10 flex flex-col gap-6 sm:gap-8 overflow-y-auto no-scrollbar pb-24 lg:pb-10">
        {/* Top Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transactions..."
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:border-indigo-500 transition-all"
            />
          </div>
          <div className="tabs flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl gap-1">
            {(['week', 'month', 'year', 'all'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-[13px] font-bold transition-all ${filter === f ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {view === 'dashboard' ? (
          <>
            {/* Smart Reminders */}
            {reminders.length > 0 && (
              <div className="space-y-2">
                {reminders.map((rem, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 p-3 rounded-xl flex items-center gap-3 text-rose-600 dark:text-rose-400 text-xs font-bold"
                  >
                    <Clock className="w-4 h-4" />
                    {rem}
                  </motion.div>
                ))}
              </div>
            )}

            {/* Smart Prediction Banner */}
            {prediction && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 p-4 rounded-2xl flex items-center gap-4"
              >
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Smart Prediction (Local)</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{prediction}</p>
                </div>
                <button onClick={() => setPrediction(null)} className="text-slate-400 hover:text-slate-600">
                  <Plus className="w-4 h-4 rotate-45" />
                </button>
              </motion.div>
            )}

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Income</span>
                </div>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{currency} {stats.income.toLocaleString()}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-rose-50 dark:bg-rose-900/30 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400">
                    <TrendingDown className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Expense</span>
                </div>
                <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{currency} {stats.expense.toLocaleString()}</p>
              </div>
              <div className="bg-indigo-600 p-6 rounded-3xl shadow-xl shadow-indigo-200 dark:shadow-none">
                <div className="flex items-center gap-3 mb-4 text-white/80">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">Net Balance</span>
                </div>
                <p className="text-2xl font-black text-white">{currency} {stats.balance.toLocaleString()}</p>
              </div>
            </div>

            {/* Heatmap Section */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Spending Heatmap</h3>
                <button onClick={getSmartPrediction} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Refresh Prediction</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 30 }).map((_, i) => {
                  const date = new Date();
                  date.setDate(date.getDate() - (29 - i));
                  const dateStr = date.toISOString().split('T')[0];
                  const dayTotal = transactions
                    .filter(t => t.date === dateStr && t.type === 'expense')
                    .reduce((sum, t) => sum + t.amount, 0);
                  
                  let color = 'bg-slate-100 dark:bg-slate-700';
                  if (dayTotal > 0) color = 'bg-indigo-200 dark:bg-indigo-900';
                  if (dayTotal > 500) color = 'bg-indigo-400 dark:bg-indigo-700';
                  if (dayTotal > 2000) color = 'bg-indigo-600 dark:bg-indigo-500';
                  
                  return (
                    <div 
                      key={i} 
                      title={`${dateStr}: ${currency} ${dayTotal}`}
                      className={`w-4 h-4 rounded-sm ${color} transition-all hover:scale-125 cursor-pointer`} 
                    />
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-4 italic">* Showing last 30 days of activity</p>
            </div>

            {/* History List */}
            <div className="space-y-8">
              <AnimatePresence mode="popLayout">
                {Object.entries(groupedTransactions).length > 0 ? (
                  (Object.entries(groupedTransactions) as [string, Transaction[]][]).map(([month, items]) => (
                    <motion.div 
                      key={month}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex justify-between items-center px-2">
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">{month}</h3>
                        <div className="h-px flex-1 mx-4 bg-slate-200 dark:bg-slate-700" />
                        <span className="text-xs font-bold text-slate-400">{currency} {items.reduce((s, i) => s + (i.type === 'expense' ? -i.amount : i.amount), 0).toLocaleString()}</span>
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {items.map((t) => (
                          <motion.div
                            key={t.id}
                            layout
                            className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex justify-between items-center group hover:border-indigo-500 transition-all"
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${t.type === 'income' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-600'}`}>
                                {t.type === 'income' ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <b className="text-sm">{t.name}</b>
                                  <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full font-bold uppercase">{t.category}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(t.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                  </span>
                                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                    {getWalletIcon(t.wallet)}
                                    {t.wallet}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className={`font-black text-base ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {t.type === 'income' ? '+' : '-'}{currency} {t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                              <button 
                                onClick={() => deleteTransaction(t.id)}
                                className="p-2 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-[2.5rem] border border-dashed border-slate-200 dark:border-slate-700">
                    <div className="bg-slate-50 dark:bg-slate-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-300 mb-4">
                      <Clock className="w-8 h-8" />
                    </div>
                    <p className="text-slate-400 font-bold">No transactions found</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </>
        ) : view === 'reports' ? (
          <div className="space-y-8 pb-10">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black">Reports & Analytics</h2>
                <p className="text-sm text-slate-500 font-medium">Deep dive into your financial habits</p>
              </div>
              <button 
                onClick={() => setView('dashboard')}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2 shadow-sm"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </button>
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-[2.5rem] border border-dashed border-slate-200 dark:border-slate-700">
                <div className="bg-slate-50 dark:bg-slate-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-300 mb-4">
                  <BarChart3 className="w-8 h-8" />
                </div>
                <p className="text-slate-400 font-bold">Add some transactions to see analytics</p>
              </div>
            ) : (
              <>
                {/* Report Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Income</span>
                    <p className="text-xl font-black text-emerald-600">{currency} {reportStats.totalIncome.toLocaleString()}</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Expense</span>
                    <p className="text-xl font-black text-rose-600">{currency} {reportStats.totalExpense.toLocaleString()}</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Savings Rate</span>
                    <p className="text-xl font-black text-indigo-600">{reportStats.savingsRate.toFixed(1)}%</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Top Category</span>
                    <p className="text-xl font-black text-slate-700 dark:text-slate-200 truncate">{reportStats.topCategory}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {/* Spending Trends */}
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="text-lg font-black flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-600" />
                        Income vs Expense
                      </h3>
                      <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" /> Income
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-rose-500" /> Expense
                        </div>
                      </div>
                    </div>
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: isDarkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                            cursor={{ fill: isDarkMode ? '#334155' : '#f1f5f9' }}
                          />
                          <Bar dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="expense" fill="#EF4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Category Breakdown */}
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="text-lg font-black flex items-center gap-2">
                        <PieChartIcon className="w-5 h-5 text-indigo-600" />
                        Category Breakdown
                      </h3>
                      <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg gap-1">
                        <button 
                          onClick={() => setReportType('expense')}
                          className={`px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${reportType === 'expense' ? 'bg-white dark:bg-slate-600 text-rose-500 shadow-sm' : 'text-slate-400'}`}
                        >
                          Exp
                        </button>
                        <button 
                          onClick={() => setReportType('income')}
                          className={`px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${reportType === 'income' ? 'bg-white dark:bg-slate-600 text-emerald-500 shadow-sm' : 'text-slate-400'}`}
                        >
                          Inc
                        </button>
                      </div>
                    </div>
                    <div className="h-80 w-full flex flex-col sm:flex-row items-center justify-center gap-8">
                      <div className="w-full h-full max-w-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={categoryData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {categoryData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ backgroundColor: isDarkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                            />
                          </RePieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap sm:flex-col gap-3 justify-center max-h-60 overflow-y-auto no-scrollbar pr-2">
                        {categoryData.map((entry, index) => (
                          <div key={entry.name} className="flex items-center justify-between gap-4 text-xs font-bold text-slate-500 min-w-[120px]">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                              <span className="whitespace-nowrap">{entry.name}</span>
                            </div>
                            <span className="text-slate-400">{currency} {entry.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Transactions */}
                <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-sm">
                  <h3 className="text-lg font-black mb-6 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    Highest Transactions
                  </h3>
                  <div className="space-y-3">
                    {topTransactions.map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.type === 'income' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-600'}`}>
                            {t.type === 'income' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold">{t.name}</p>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{t.category} • {new Date(t.date).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <span className={`font-black ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {t.type === 'income' ? '+' : '-'}{currency} {t.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : view === 'advisor' ? (
          <div className="flex-1 flex flex-col gap-6 max-w-4xl mx-auto w-full">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Local Financial Advisor</h3>
                  <p className="text-xs text-slate-400">Offline Mode</p>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-2 no-scrollbar">
                {aiChat.length === 0 && (
                  <div className="text-center py-10 text-slate-400">
                    <p className="text-sm mb-2">Hello! I'm your SpendWise assistant.</p>
                    <p className="text-xs">Ask me about your spending habits, budget tips, or savings goals.</p>
                  </div>
                )}
                {aiChat.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-4 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-tl-none'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isAiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-2xl rounded-tl-none flex gap-1">
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Ask something..."
                  className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-indigo-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      askAiAdvisor(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
                <button 
                  onClick={() => {
                    const input = document.querySelector('input[placeholder="Ask something..."]') as HTMLInputElement;
                    askAiAdvisor(input.value);
                    input.value = '';
                  }}
                  className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ) : view === 'goals' ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Savings Goals</h3>
              <button 
                onClick={() => {
                  const name = prompt('Goal Name (e.g., New iPhone):');
                  const target = Number(prompt('Target Amount:'));
                  const deadline = prompt('Deadline (YYYY-MM-DD):');
                  if (name && target) {
                    setGoals([...goals, { id: crypto.randomUUID(), name, targetAmount: target, currentAmount: 0, deadline: deadline || '', color: 'bg-indigo-500' }]);
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
              >
                + New Goal
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {goals.map(goal => (
                <div key={goal.id} className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-black text-lg">{goal.name}</h4>
                      <p className="text-xs text-slate-400">Target: ₹{goal.targetAmount.toLocaleString('en-IN')}</p>
                    </div>
                    <button 
                      onClick={() => {
                        const amount = Number(prompt('Add amount to goal:'));
                        if (amount) {
                          setGoals(goals.map(g => g.id === goal.id ? { ...g, currentAmount: g.currentAmount + amount } : g));
                        }
                      }}
                      className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-1000" 
                      style={{ width: `${Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                    <span>{Math.round((goal.currentAmount / goal.targetAmount) * 100)}% Reached</span>
                    <span>₹{(goal.targetAmount - goal.currentAmount).toLocaleString('en-IN')} Left</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : view === 'debts' ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Debt Tracker</h3>
              <button 
                onClick={() => {
                  const person = prompt('Person Name:');
                  const amount = Number(prompt('Amount:'));
                  const type = confirm('Do you OWE this money? (Cancel if they owe YOU)') ? 'owe' : 'owed';
                  if (person && amount) {
                    setDebts([...debts, { id: crypto.randomUUID(), person, amount, type }]);
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
              >
                + Add Debt
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {debts.map(debt => (
                <div key={debt.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${debt.type === 'owe' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600'}`}>
                      {debt.type === 'owe' ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{debt.person}</h4>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">{debt.type === 'owe' ? 'You Owe' : 'Owes You'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`font-black ${debt.type === 'owe' ? 'text-rose-600' : 'text-emerald-600'}`}>₹{debt.amount.toLocaleString('en-IN')}</span>
                    <button onClick={() => setDebts(debts.filter(d => d.id !== debt.id))} className="text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : view === 'investments' ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Investment Portfolio</h3>
              <button 
                onClick={() => {
                  const name = prompt('Asset Name (e.g., Bitcoin, Apple Stock):');
                  const amount = Number(prompt('Invested Amount:'));
                  if (name && amount) {
                    setInvestments([...investments, { id: crypto.randomUUID(), name, type: 'Other', investedAmount: amount, currentValue: amount, lastUpdated: new Date().toISOString() }]);
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
              >
                + Add Asset
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {investments.map(inv => {
                const profit = inv.currentValue - inv.investedAmount;
                const profitPercent = (profit / inv.investedAmount) * 100;
                return (
                  <div key={inv.id} className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-black text-lg">{inv.name}</h4>
                        <p className="text-xs text-slate-400">Invested: ₹{inv.investedAmount.toLocaleString('en-IN')}</p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black ${profit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {profit >= 0 ? '+' : ''}{profitPercent.toFixed(2)}%
                      </div>
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Current Value</p>
                        <p className="text-2xl font-black text-slate-900 dark:text-white">₹{inv.currentValue.toLocaleString('en-IN')}</p>
                      </div>
                      <button 
                        onClick={() => {
                          const val = Number(prompt('New current value:'));
                          if (val) {
                            setInvestments(investments.map(i => i.id === inv.id ? { ...i, currentValue: val, lastUpdated: new Date().toISOString() } : i));
                          }
                        }}
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Update Value
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : view === 'recurring' ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Recurring Transactions</h3>
              <button 
                onClick={() => {
                  const name = prompt('Name:');
                  const amount = Number(prompt('Amount:'));
                  const freq = prompt('Frequency (daily, weekly, monthly, yearly):') as any;
                  if (name && amount && freq) {
                    setRecurring([...recurring, { 
                      id: crypto.randomUUID(), 
                      name, 
                      amount, 
                      type: 'expense', 
                      category: 'Other', 
                      wallet: 'Bank', 
                      frequency: freq, 
                      startDate: new Date().toISOString().split('T')[0] 
                    }]);
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
              >
                + Add Recurring
              </button>
            </div>
            <div className="space-y-4">
              {recurring.map(rec => (
                <div key={rec.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center text-slate-500">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{rec.name}</h4>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">{rec.frequency} • {rec.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-black text-slate-900 dark:text-white">{currency} {rec.amount.toLocaleString()}</span>
                    <button onClick={() => setRecurring(recurring.filter(r => r.id !== rec.id))} className="text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-3 flex justify-between items-center z-40 pb-safe">
        <button 
          onClick={() => setView('dashboard')}
          className={`flex flex-col items-center gap-1 ${view === 'dashboard' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Home</span>
        </button>
        
        <button 
          onClick={() => setShowAddModal(true)}
          className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none -mt-10 border-4 border-slate-50 dark:border-slate-900"
        >
          <Plus className="w-7 h-7" />
        </button>

        <button 
          onClick={() => setView('reports')}
          className={`flex flex-col items-center gap-1 ${view === 'reports' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}
        >
          <PieChartIcon className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Reports</span>
        </button>
      </nav>

      {/* Mobile Add Transaction Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black">Add Transaction</h3>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500"
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>

              <form onSubmit={addTransaction} className="flex flex-col gap-4 relative">
                {isAiLoading && (
                  <div className="absolute inset-0 z-10 bg-white/80 dark:bg-slate-800/80 backdrop-blur-[2px] rounded-2xl flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-bold text-indigo-600">AI scanning receipt...</p>
                  </div>
                )}
                <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl gap-1">
                  <button 
                    type="button"
                    onClick={() => setType('expense')}
                    className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${type === 'expense' ? 'bg-white dark:bg-slate-600 text-rose-500 shadow-sm' : 'text-slate-500'}`}
                  >
                    Expense
                  </button>
                  <button 
                    type="button"
                    onClick={() => setType('income')}
                    className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${type === 'income' ? 'bg-white dark:bg-slate-600 text-emerald-500 shadow-sm' : 'text-slate-500'}`}
                  >
                    Income
                  </button>
                </div>

                {/* Receipt Scanner (AI Powered) */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={type === 'income' ? "Income Source" : "Description"}
                    className="flex-1 px-5 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-base outline-none focus:border-indigo-500 transition-colors"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="p-4 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl hover:bg-indigo-100 transition-colors"
                      title="Take Photo"
                    >
                      <Camera className="w-6 h-6" />
                    </button>
                    <label className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors" title="Upload File">
                      <Upload className="w-6 h-6" />
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files?.[0]) scanReceipt(e.target.files[0]);
                        }} 
                      />
                    </label>
                  </div>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Amount (${currency})`}
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-base outline-none focus:border-indigo-500 transition-colors"
                />
                <div className="grid grid-cols-2 gap-3">
                  <select 
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CategoryType)}
                    className="px-4 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:border-indigo-500 transition-colors"
                  >
                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select 
                    value={wallet}
                    onChange={(e) => setWallet(e.target.value as WalletType)}
                    className="px-4 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:border-indigo-500 transition-colors"
                  >
                    {(type === 'income' ? INCOME_WALLETS : EXPENSE_WALLETS).map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-base outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  type="submit"
                  className={`py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2 mt-2 shadow-xl ${
                    type === 'income' 
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 dark:shadow-none' 
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 dark:shadow-none'
                  }`}
                >
                  <Plus className="w-5 h-5" />
                  Add {type === 'income' ? 'Income' : 'Expense'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Camera Modal */}
      <AnimatePresence>
        {isCameraOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative w-full h-full flex flex-col"
            >
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              
              {/* Camera Controls */}
              <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-10 px-6">
                <button 
                  onClick={stopCamera}
                  className="p-4 bg-white/20 backdrop-blur-md text-white rounded-full hover:bg-white/30 transition-all"
                >
                  <X className="w-8 h-8" />
                </button>
                
                <button 
                  onClick={capturePhoto}
                  className="w-20 h-20 bg-white rounded-full border-4 border-white/50 shadow-xl active:scale-95 transition-all"
                />
                
                <div className="w-16" /> {/* Spacer for symmetry */}
              </div>
              
              <div className="absolute top-10 left-0 right-0 text-center">
                <p className="text-white/80 text-sm font-bold drop-shadow-md">Align receipt within frame</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
