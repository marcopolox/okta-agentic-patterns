export type ThemeId = "default" | "healthcare" | "retail" | "manufacturing" | "government" | "education";

interface Budget {
  id: string;
  department: string;
  allocated: number;
  spent: number;
  currency: string;
  fiscalYear: string;
}

interface Invoice {
  id: string;
  vendor: string;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "overdue";
  dueDate: string;
  category: string;
}

interface CostCenter {
  id: string;
  name: string;
  manager: string;
  budget: number;
  ytdSpend: number;
}

interface ThemeData {
  budgets: Budget[];
  invoices: Invoice[];
  costCenters: CostCenter[];
}

const DEFAULT_DATA: ThemeData = {
  budgets: [
    { id: "B001", department: "Engineering", allocated: 2400000, spent: 1850000, currency: "USD", fiscalYear: "2025" },
    { id: "B002", department: "Marketing", allocated: 800000, spent: 620000, currency: "USD", fiscalYear: "2025" },
    { id: "B003", department: "Sales", allocated: 1200000, spent: 940000, currency: "USD", fiscalYear: "2025" },
    { id: "B004", department: "Operations", allocated: 500000, spent: 380000, currency: "USD", fiscalYear: "2025" },
  ],
  invoices: [
    { id: "INV-1001", vendor: "AWS", amount: 48200, currency: "USD", status: "paid", dueDate: "2025-01-15", category: "Cloud Infrastructure" },
    { id: "INV-1002", vendor: "GitHub", amount: 12400, currency: "USD", status: "paid", dueDate: "2025-01-20", category: "Developer Tools" },
    { id: "INV-1003", vendor: "Salesforce", amount: 86000, currency: "USD", status: "pending", dueDate: "2025-02-01", category: "CRM" },
    { id: "INV-1004", vendor: "Okta", amount: 34500, currency: "USD", status: "paid", dueDate: "2025-01-10", category: "Identity & Security" },
    { id: "INV-1005", vendor: "DataDog", amount: 22100, currency: "USD", status: "overdue", dueDate: "2025-01-05", category: "Monitoring" },
    { id: "INV-1006", vendor: "Snowflake", amount: 18700, currency: "USD", status: "pending", dueDate: "2025-02-10", category: "Data Warehouse" },
  ],
  costCenters: [
    { id: "CC001", name: "Engineering Core", manager: "Alice Chen", budget: 1500000, ytdSpend: 1180000 },
    { id: "CC002", name: "Marketing", manager: "Marketing Director", budget: 800000, ytdSpend: 620000 },
    { id: "CC003", name: "Sales Enablement", manager: "Sales Director", budget: 400000, ytdSpend: 315000 },
    { id: "CC004", name: "Infrastructure", manager: "DevOps Lead", budget: 900000, ytdSpend: 670000 },
  ],
};

const HEALTHCARE_DATA: ThemeData = {
  budgets: [
    { id: "B001", department: "Cardiology", allocated: 3200000, spent: 2650000, currency: "USD", fiscalYear: "2025" },
    { id: "B002", department: "Oncology", allocated: 4100000, spent: 3280000, currency: "USD", fiscalYear: "2025" },
    { id: "B003", department: "Emergency", allocated: 2800000, spent: 2340000, currency: "USD", fiscalYear: "2025" },
    { id: "B004", department: "Research", allocated: 1600000, spent: 890000, currency: "USD", fiscalYear: "2025" },
  ],
  invoices: [
    { id: "INV-2001", vendor: "Medtronic", amount: 142000, currency: "USD", status: "paid", dueDate: "2025-01-15", category: "Medical Devices" },
    { id: "INV-2002", vendor: "Cardinal Health", amount: 89500, currency: "USD", status: "paid", dueDate: "2025-01-22", category: "Medical Supplies" },
    { id: "INV-2003", vendor: "Epic Systems", amount: 215000, currency: "USD", status: "pending", dueDate: "2025-02-05", category: "Healthcare IT" },
    { id: "INV-2004", vendor: "Pfizer", amount: 67800, currency: "USD", status: "paid", dueDate: "2025-01-18", category: "Pharmaceuticals" },
    { id: "INV-2005", vendor: "Siemens Healthineers", amount: 380000, currency: "USD", status: "overdue", dueDate: "2025-01-03", category: "Imaging Equipment" },
    { id: "INV-2006", vendor: "Stryker", amount: 93200, currency: "USD", status: "pending", dueDate: "2025-02-12", category: "Surgical Equipment" },
  ],
  costCenters: [
    { id: "CC001", name: "Patient Care", manager: "Dr. Sarah Chen", budget: 6000000, ytdSpend: 4870000 },
    { id: "CC002", name: "Research & Clinical Trials", manager: "Research Director", budget: 1600000, ytdSpend: 890000 },
    { id: "CC003", name: "Medical Equipment", manager: "Facilities Director", budget: 2200000, ytdSpend: 1750000 },
    { id: "CC004", name: "Pharmacy Operations", manager: "Dr. Aisha Okonkwo", budget: 1100000, ytdSpend: 980000 },
  ],
};

const RETAIL_DATA: ThemeData = {
  budgets: [
    { id: "B001", department: "Flagship Stores", allocated: 5200000, spent: 4100000, currency: "USD", fiscalYear: "2025" },
    { id: "B002", department: "E-commerce", allocated: 2100000, spent: 1650000, currency: "USD", fiscalYear: "2025" },
    { id: "B003", department: "Marketing", allocated: 1800000, spent: 1420000, currency: "USD", fiscalYear: "2025" },
    { id: "B004", department: "Supply Chain", allocated: 3400000, spent: 2780000, currency: "USD", fiscalYear: "2025" },
  ],
  invoices: [
    { id: "INV-3001", vendor: "Nike Wholesale", amount: 284000, currency: "USD", status: "paid", dueDate: "2025-01-14", category: "Merchandise" },
    { id: "INV-3002", vendor: "Apple Resale", amount: 512000, currency: "USD", status: "pending", dueDate: "2025-02-01", category: "Electronics" },
    { id: "INV-3003", vendor: "Procter & Gamble", amount: 96400, currency: "USD", status: "paid", dueDate: "2025-01-20", category: "Consumer Goods" },
    { id: "INV-3004", vendor: "FedEx", amount: 38900, currency: "USD", status: "paid", dueDate: "2025-01-11", category: "Logistics" },
    { id: "INV-3005", vendor: "Shopify", amount: 14200, currency: "USD", status: "overdue", dueDate: "2025-01-04", category: "E-commerce Platform" },
    { id: "INV-3006", vendor: "Unilever", amount: 72600, currency: "USD", status: "pending", dueDate: "2025-02-08", category: "Consumer Goods" },
  ],
  costCenters: [
    { id: "CC001", name: "Flagship Stores", manager: "Maria Gonzalez", budget: 5200000, ytdSpend: 4100000 },
    { id: "CC002", name: "E-commerce Operations", manager: "Digital Director", budget: 2100000, ytdSpend: 1650000 },
    { id: "CC003", name: "Supply Chain", manager: "Logistics Director", budget: 3400000, ytdSpend: 2780000 },
    { id: "CC004", name: "Brand & Marketing", manager: "CMO", budget: 1800000, ytdSpend: 1420000 },
  ],
};

const MANUFACTURING_DATA: ThemeData = {
  budgets: [
    { id: "B001", department: "Production Line A", allocated: 4800000, spent: 3920000, currency: "USD", fiscalYear: "2025" },
    { id: "B002", department: "Quality Control", allocated: 1200000, spent: 960000, currency: "USD", fiscalYear: "2025" },
    { id: "B003", department: "R&D", allocated: 2600000, spent: 1840000, currency: "USD", fiscalYear: "2025" },
    { id: "B004", department: "Facilities", allocated: 900000, spent: 720000, currency: "USD", fiscalYear: "2025" },
  ],
  invoices: [
    { id: "INV-4001", vendor: "Bosch", amount: 348000, currency: "USD", status: "paid", dueDate: "2025-01-16", category: "Industrial Components" },
    { id: "INV-4002", vendor: "SKF Bearings", amount: 127400, currency: "USD", status: "paid", dueDate: "2025-01-23", category: "Mechanical Parts" },
    { id: "INV-4003", vendor: "Siemens", amount: 490000, currency: "USD", status: "pending", dueDate: "2025-02-03", category: "Automation Systems" },
    { id: "INV-4004", vendor: "FANUC", amount: 218000, currency: "USD", status: "paid", dueDate: "2025-01-09", category: "Robotics" },
    { id: "INV-4005", vendor: "Parker Hannifin", amount: 84600, currency: "USD", status: "overdue", dueDate: "2025-01-02", category: "Hydraulics" },
    { id: "INV-4006", vendor: "3M Industrial", amount: 42100, currency: "USD", status: "pending", dueDate: "2025-02-14", category: "Safety & PPE" },
  ],
  costCenters: [
    { id: "CC001", name: "Production Line A", manager: "Robert Chang", budget: 4800000, ytdSpend: 3920000 },
    { id: "CC002", name: "Quality Control", manager: "Sandra Kowalski", budget: 1200000, ytdSpend: 960000 },
    { id: "CC003", name: "Research & Development", manager: "Wei Zhang", budget: 2600000, ytdSpend: 1840000 },
    { id: "CC004", name: "Maintenance & Facilities", manager: "Brian O'Neill", budget: 900000, ytdSpend: 720000 },
  ],
};

const GOVERNMENT_DATA: ThemeData = {
  budgets: [
    { id: "B001", department: "Public Services", allocated: 8400000, spent: 7120000, currency: "USD", fiscalYear: "2025" },
    { id: "B002", department: "IT Infrastructure", allocated: 3200000, spent: 2650000, currency: "USD", fiscalYear: "2025" },
    { id: "B003", department: "Policy & Research", allocated: 1400000, spent: 980000, currency: "USD", fiscalYear: "2025" },
    { id: "B004", department: "Federal Compliance", allocated: 700000, spent: 520000, currency: "USD", fiscalYear: "2025" },
  ],
  invoices: [
    { id: "INV-5001", vendor: "Microsoft (Gov)", amount: 186000, currency: "USD", status: "paid", dueDate: "2025-01-17", category: "Software Licenses" },
    { id: "INV-5002", vendor: "Leidos", amount: 420000, currency: "USD", status: "paid", dueDate: "2025-01-24", category: "IT Services" },
    { id: "INV-5003", vendor: "SAIC", amount: 635000, currency: "USD", status: "pending", dueDate: "2025-02-06", category: "Systems Integration" },
    { id: "INV-5004", vendor: "Dell Federal", amount: 97400, currency: "USD", status: "paid", dueDate: "2025-01-13", category: "Hardware" },
    { id: "INV-5005", vendor: "Cisco", amount: 142000, currency: "USD", status: "overdue", dueDate: "2025-01-06", category: "Networking" },
    { id: "INV-5006", vendor: "Accenture Federal", amount: 284000, currency: "USD", status: "pending", dueDate: "2025-02-11", category: "Consulting" },
  ],
  costCenters: [
    { id: "CC001", name: "District 1 Operations", manager: "Patricia Williams", budget: 8400000, ytdSpend: 7120000 },
    { id: "CC002", name: "Federal Compliance", manager: "Aaron Brooks", budget: 700000, ytdSpend: 520000 },
    { id: "CC003", name: "IT Infrastructure", manager: "Raj Patel", budget: 3200000, ytdSpend: 2650000 },
    { id: "CC004", name: "Policy & Research", manager: "Angela Foster", budget: 1400000, ytdSpend: 980000 },
  ],
};

const EDUCATION_DATA: ThemeData = {
  budgets: [
    { id: "B001", department: "Graduate Programs", allocated: 3600000, spent: 2940000, currency: "USD", fiscalYear: "2025" },
    { id: "B002", department: "Research Grants", allocated: 5200000, spent: 3860000, currency: "USD", fiscalYear: "2025" },
    { id: "B003", department: "Athletics", allocated: 1100000, spent: 890000, currency: "USD", fiscalYear: "2025" },
    { id: "B004", department: "Campus Operations", allocated: 2400000, spent: 2010000, currency: "USD", fiscalYear: "2025" },
  ],
  invoices: [
    { id: "INV-6001", vendor: "Pearson Education", amount: 124000, currency: "USD", status: "paid", dueDate: "2025-01-18", category: "Academic Materials" },
    { id: "INV-6002", vendor: "McGraw-Hill", amount: 88600, currency: "USD", status: "paid", dueDate: "2025-01-25", category: "Academic Materials" },
    { id: "INV-6003", vendor: "AWS Educate", amount: 34200, currency: "USD", status: "pending", dueDate: "2025-02-04", category: "Cloud Services" },
    { id: "INV-6004", vendor: "Canvas LMS", amount: 52800, currency: "USD", status: "paid", dueDate: "2025-01-12", category: "Learning Platform" },
    { id: "INV-6005", vendor: "Follett", amount: 71400, currency: "USD", status: "overdue", dueDate: "2025-01-07", category: "Campus Store" },
    { id: "INV-6006", vendor: "Elsevier", amount: 186000, currency: "USD", status: "pending", dueDate: "2025-02-09", category: "Research Journals" },
  ],
  costCenters: [
    { id: "CC001", name: "Graduate Programs", manager: "Dr. Michael Okafor", budget: 3600000, ytdSpend: 2940000 },
    { id: "CC002", name: "Research Grants", manager: "Dr. Carlos Vega", budget: 5200000, ytdSpend: 3860000 },
    { id: "CC003", name: "Athletics Department", manager: "Coach David Harris", budget: 1100000, ytdSpend: 890000 },
    { id: "CC004", name: "Campus Operations", manager: "Sarah McKenzie", budget: 2400000, ytdSpend: 2010000 },
  ],
};

export const FINANCE_THEMES: Record<ThemeId, ThemeData> = {
  default: DEFAULT_DATA,
  healthcare: HEALTHCARE_DATA,
  retail: RETAIL_DATA,
  manufacturing: MANUFACTURING_DATA,
  government: GOVERNMENT_DATA,
  education: EDUCATION_DATA,
};
