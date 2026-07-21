import type { PatternId } from "./patterns";

export type IndustryId =
  | "default"
  | "healthcare"
  | "retail"
  | "manufacturing"
  | "government"
  | "education";

export const DEFAULT_INDUSTRY_ID: IndustryId = "default";

export interface DemoIndustry {
  id: IndustryId;
  label: string;
  icon: string;
  accent: { hex: string; rgb: string };
  backgroundImage?: string;
  serverLabels: Record<string, string>;
  presetPrompts: Partial<Record<PatternId, string[]>>;
  presetGroups: Partial<Record<PatternId, { label: string; prompts: string[] }[]>>;
}

export interface IndustryOverrides {
  id: IndustryId;
  icon: string;
  accent: { hex: string; rgb: string };
  backgroundImage?: string;
  serverNameOverrides: Record<string, string>;
  presetPrompts: Partial<Record<PatternId, string[]>>;
  presetGroups: Partial<Record<PatternId, { label: string; prompts: string[] }[]>>;
}

export const INDUSTRIES: DemoIndustry[] = [
  {
    id: "default",
    label: "Tech / ACME",
    icon: "🔷",
    accent: { hex: "#22d3ee", rgb: "34 211 238" },
    serverLabels: {
      "HR Server": "HR Server",
      "Finance Server": "Finance Server",
      "Inventory Server": "Inventory Server",
    },
    presetPrompts: {
      p2: [
        "What products do you have available?",
        "Check stock for WirelessPro Headphones X3",
        "What's the status of order ORD-10041?",
        "Show me details for the SmartWatch Ultra 2",
      ],
      p5: [
        "What products are in your inventory?",
        "Check stock for WirelessPro Headphones X3",
        "The 4K webcam is out of stock — restock it with 100 units",
        "Add 50 units to the Portable SSD inventory",
      ],
    },
    presetGroups: {
      p3: [
        {
          label: "HR & Finance",
          prompts: [
            "List all employees in Engineering and show the department budget",
            "What's the total budget across all departments?",
            "Update Alice Chen's title to Principal Engineer",
            "Show the org chart and the Finance budget for the Engineering team",
          ],
        },
      ],
      p4: [
        {
          label: "GitHub",
          prompts: [
            "List my GitHub repositories",
            "Search GitHub repos related to authentication",
            "Show details for a specific repo",
          ],
        },
        {
          label: "Slack",
          prompts: [
            "List Slack channels in my workspace",
            "Show recent messages in a Slack channel",
            "Post a message to the #general channel saying hello from the Okta demo",
          ],
        },
      ],
    },
  },
  {
    id: "healthcare",
    label: "Healthcare",
    icon: "🏥",
    accent: { hex: "#34d399", rgb: "52 211 153" },
    backgroundImage: "/industries/healthcare-bg.svg",
    serverLabels: {
      "HR Server": "Clinical Records System",
      "Finance Server": "Healthcare Finance",
      "Inventory Server": "Medical Supply System",
    },
    presetPrompts: {
      p2: [
        "What medical supplies do you have?",
        "Check stock for N95 Respirators",
        "What's the status of order MED-10041?",
        "Show me details for the Portable Defibrillator AED",
      ],
      p5: [
        "What's in the medical supply inventory?",
        "Check stock for Surgical Gloves (Medium)",
        "We're out of IV Fluid Bags — restock with 500 units",
        "Add 200 units of Surgical Masks to inventory",
      ],
    },
    presetGroups: {
      p3: [
        {
          label: "Clinical Records & Finance",
          prompts: [
            "List all attending physicians in Cardiology",
            "What's the total budget for the Emergency department?",
            "Update Dr. Sarah Chen's title to Chief of Cardiology",
            "Show the clinical org chart and departmental spend",
          ],
        },
      ],
      p4: [
        {
          label: "GitHub",
          prompts: [
            "List my repositories",
            "Search repos related to FHIR or patient data",
            "Show the patient-portal repository",
          ],
        },
        {
          label: "Slack",
          prompts: [
            "List Slack channels",
            "Post to #clinical-ops: Patient data sync complete",
            "Show recent messages in #on-call",
          ],
        },
      ],
    },
  },
  {
    id: "retail",
    label: "Retail",
    icon: "🛍️",
    accent: { hex: "#fb7185", rgb: "251 113 133" },
    backgroundImage: "/industries/retail-bg.svg",
    serverLabels: {
      "HR Server": "Store HR System",
      "Finance Server": "Retail Finance",
      "Inventory Server": "Store Inventory",
    },
    presetPrompts: {
      p2: [
        "What products do you carry?",
        "Check stock for Laptop Pro 15\"",
        "What's the status of order ORD-20041?",
        "Show me details for the Wireless Headphones BT",
      ],
      p5: [
        "What's in the store inventory?",
        "Check stock for Coffee Maker Deluxe",
        "Running Shoes size 10 are sold out — restock 50 units",
        "Add 30 units of Yoga Mat Premium to inventory",
      ],
    },
    presetGroups: {
      p3: [
        {
          label: "Store HR & Finance",
          prompts: [
            "List all store associates in the Flagship location",
            "What's the total payroll budget for Store Operations?",
            "Promote Maria Gonzalez to District Manager",
            "Show the org chart and the marketing budget",
          ],
        },
      ],
      p4: [
        {
          label: "GitHub",
          prompts: [
            "List my repositories",
            "Search repos related to e-commerce or Shopify",
            "Show the storefront repository",
          ],
        },
        {
          label: "Slack",
          prompts: [
            "List Slack channels",
            "Post to #store-ops: Weekly inventory sync complete",
            "Show recent messages in #promotions",
          ],
        },
      ],
    },
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    icon: "🏭",
    accent: { hex: "#f59e0b", rgb: "245 158 11" },
    backgroundImage: "/industries/manufacturing-bg.svg",
    serverLabels: {
      "HR Server": "Plant HR System",
      "Finance Server": "Operations Finance",
      "Inventory Server": "Parts & Materials",
    },
    presetPrompts: {
      p2: [
        "What parts and materials do you have?",
        "Check stock for Hydraulic Actuator Type-B",
        "What's the status of order MFG-10041?",
        "Show details for the CNC Spindle Motor",
      ],
      p5: [
        "What's in the parts inventory?",
        "Check stock for Bearing Assembly Kit",
        "Pneumatic Fittings are low — restock 200 units",
        "Add 100 units of Steel Rod 12mm to inventory",
      ],
    },
    presetGroups: {
      p3: [
        {
          label: "Plant HR & Operations Finance",
          prompts: [
            "List all engineers in the Production Line A team",
            "What's the total budget for Quality Control?",
            "Promote James Martinez to Senior Process Engineer",
            "Show the plant org chart and the R&D budget",
          ],
        },
      ],
      p4: [
        {
          label: "GitHub",
          prompts: [
            "List my repositories",
            "Search repos related to SCADA or industrial automation",
            "Show the MES integration repository",
          ],
        },
        {
          label: "Slack",
          prompts: [
            "List Slack channels",
            "Post to #production-floor: Shift handover complete",
            "Show recent messages in #quality-alerts",
          ],
        },
      ],
    },
  },
  {
    id: "government",
    label: "Government",
    icon: "🏛️",
    accent: { hex: "#6366f1", rgb: "99 102 241" },
    backgroundImage: "/industries/government-bg.svg",
    serverLabels: {
      "HR Server": "Civil Service Records",
      "Finance Server": "Public Sector Finance",
      "Inventory Server": "Government Equipment",
    },
    presetPrompts: {
      p2: [
        "What government equipment do you have?",
        "Check stock for Laptop Workstation (Gov)",
        "What's the status of order GOV-10041?",
        "Show me details for the Secure USB 64GB",
      ],
      p5: [
        "What equipment is in inventory?",
        "Check stock for Body Camera Units",
        "Radio Sets are low — restock 50 units",
        "Add 25 Field Medical Kits to inventory",
      ],
    },
    presetGroups: {
      p3: [
        {
          label: "Civil Service & Public Finance",
          prompts: [
            "List all policy analysts in the Policy department",
            "What's the total IT infrastructure budget?",
            "Update Director Williams' title to Deputy Director General",
            "Show the agency org chart and District 1 budget",
          ],
        },
      ],
      p4: [
        {
          label: "GitHub",
          prompts: [
            "List my repositories",
            "Search repos related to FedRAMP or compliance",
            "Show the citizen-portal repository",
          ],
        },
        {
          label: "Slack",
          prompts: [
            "List Slack channels",
            "Post to #it-operations: Security patch deployment complete",
            "Show recent messages in #compliance-alerts",
          ],
        },
      ],
    },
  },
  {
    id: "education",
    label: "Education",
    icon: "🎓",
    accent: { hex: "#8b5cf6", rgb: "139 92 246" },
    backgroundImage: "/industries/education-bg.svg",
    serverLabels: {
      "HR Server": "Faculty & Staff Records",
      "Finance Server": "Academic Finance",
      "Inventory Server": "Campus Supply System",
    },
    presetPrompts: {
      p2: [
        "What campus supplies do you have?",
        "Check stock for TI-84 Calculators",
        "What's the status of order EDU-10041?",
        "Show me details for the Lab-Grade Microscope",
      ],
      p5: [
        "What's in the campus supply inventory?",
        "Check stock for Student Laptops",
        "3D Printer Kits are out of stock — restock 10 units",
        "Add 20 VR Headset EDU units to inventory",
      ],
    },
    presetGroups: {
      p3: [
        {
          label: "Faculty Records & Academic Finance",
          prompts: [
            "List all professors in the STEM department",
            "What's the total research grants budget?",
            "Update Dr. Patel's title to Full Professor",
            "Show the academic org chart and Graduate Programs budget",
          ],
        },
      ],
      p4: [
        {
          label: "GitHub",
          prompts: [
            "List my repositories",
            "Search repos related to LMS or Canvas",
            "Show the student-portal repository",
          ],
        },
        {
          label: "Slack",
          prompts: [
            "List Slack channels",
            "Post to #faculty-announcements: Semester kick-off complete",
            "Show recent messages in #research-collaboration",
          ],
        },
      ],
    },
  },
];

export function getIndustry(id: string): DemoIndustry {
  return INDUSTRIES.find((t) => t.id === id) ?? INDUSTRIES[0];
}

export function isValidIndustryId(id: string): id is IndustryId {
  return INDUSTRIES.some((t) => t.id === id);
}

export function getIndustryOverrides(id: string): IndustryOverrides {
  const industry = getIndustry(id);
  return {
    id: industry.id,
    icon: industry.icon,
    accent: industry.accent,
    backgroundImage: industry.backgroundImage,
    serverNameOverrides: industry.serverLabels,
    presetPrompts: industry.presetPrompts,
    presetGroups: industry.presetGroups,
  };
}
