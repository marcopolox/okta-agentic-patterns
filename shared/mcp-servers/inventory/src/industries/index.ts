export type ThemeId = "default" | "healthcare" | "retail" | "manufacturing" | "government" | "education";

interface Product {
  sku: string;
  name: string;
  category: string;
  price: number;
  description: string;
}

interface InventoryRecord {
  sku: string;
  inStock: number;
  reserved: number;
  available: number;
  status: "in_stock" | "low_stock" | "out_of_stock";
}

interface Order {
  orderId: string;
  customerId: string;
  items: { sku: string; quantity: number }[];
  status: "processing" | "shipped" | "delivered" | "cancelled";
  estimatedDelivery: string;
  trackingNumber: string;
}

interface ThemeData {
  products: Product[];
  inventory: InventoryRecord[];
  orders: Order[];
  categories: string[];
}

const DEFAULT_DATA: ThemeData = {
  products: [
    { sku: "WPH-X3", name: "WirelessPro Headphones X3", category: "Audio", price: 149.99, description: "Premium noise-cancelling wireless headphones with 30h battery" },
    { sku: "SWU-2", name: "SmartWatch Ultra 2", category: "Wearables", price: 349.99, description: "Advanced fitness smartwatch with health monitoring" },
    { sku: "WCP-4K", name: "4K Webcam Pro", category: "Peripherals", price: 129.99, description: "Ultra HD webcam for professional video calls" },
    { sku: "MKB-TKL", name: "Mechanical Keyboard TKL", category: "Peripherals", price: 89.99, description: "Tenkeyless mechanical keyboard with RGB backlighting" },
    { sku: "SSD-1TB", name: "Portable SSD 1TB", category: "Storage", price: 109.99, description: "Ultra-fast portable SSD with USB-C connectivity" },
    { sku: "HUB-7P", name: "USB-C Hub 7-in-1", category: "Peripherals", price: 49.99, description: "7-port USB-C hub with HDMI, SD card, and USB-A ports" },
  ],
  inventory: [
    { sku: "WPH-X3", inStock: 240, reserved: 45, available: 195, status: "in_stock" },
    { sku: "SWU-2", inStock: 85, reserved: 22, available: 63, status: "in_stock" },
    { sku: "WCP-4K", inStock: 0, reserved: 0, available: 0, status: "out_of_stock" },
    { sku: "MKB-TKL", inStock: 18, reserved: 6, available: 12, status: "low_stock" },
    { sku: "SSD-1TB", inStock: 320, reserved: 80, available: 240, status: "in_stock" },
    { sku: "HUB-7P", inStock: 150, reserved: 30, available: 120, status: "in_stock" },
  ],
  orders: [
    { orderId: "ORD-10041", customerId: "CUST-501", items: [{ sku: "WPH-X3", quantity: 2 }], status: "shipped", estimatedDelivery: "2025-02-03", trackingNumber: "TRK-8821004" },
    { orderId: "ORD-10042", customerId: "CUST-502", items: [{ sku: "SWU-2", quantity: 1 }, { sku: "HUB-7P", quantity: 1 }], status: "processing", estimatedDelivery: "2025-02-05", trackingNumber: "TRK-8821005" },
    { orderId: "ORD-10043", customerId: "CUST-503", items: [{ sku: "SSD-1TB", quantity: 3 }], status: "delivered", estimatedDelivery: "2025-01-28", trackingNumber: "TRK-8821006" },
  ],
  categories: ["Audio", "Wearables", "Peripherals", "Storage"],
};

const HEALTHCARE_DATA: ThemeData = {
  products: [
    { sku: "N95-STD", name: "N95 Respirator Mask", category: "PPE", price: 2.50, description: "NIOSH-approved N95 filtering facepiece respirator" },
    { sku: "GLV-MED", name: "Surgical Gloves (Medium)", category: "PPE", price: 0.45, description: "Latex-free sterile surgical gloves, size medium, box of 100" },
    { sku: "IVF-1L", name: "IV Fluid Bags 1L Normal Saline", category: "Consumables", price: 3.80, description: "0.9% NaCl IV fluid bag, 1-litre, sterile" },
    { sku: "AED-P10", name: "Portable Defibrillator AED", category: "Medical Equipment", price: 1499.00, description: "Automated external defibrillator with voice guidance" },
    { sku: "MSK-SRG", name: "Surgical Masks (50 pack)", category: "PPE", price: 12.99, description: "3-layer ASTM Level 3 surgical masks" },
    { sku: "BPM-DIG", name: "Digital Blood Pressure Monitor", category: "Diagnostic", price: 89.99, description: "Automatic upper-arm BP monitor with arrhythmia detection" },
  ],
  inventory: [
    { sku: "N95-STD", inStock: 4800, reserved: 600, available: 4200, status: "in_stock" },
    { sku: "GLV-MED", inStock: 320, reserved: 80, available: 240, status: "in_stock" },
    { sku: "IVF-1L", inStock: 42, reserved: 30, available: 12, status: "low_stock" },
    { sku: "AED-P10", inStock: 0, reserved: 0, available: 0, status: "out_of_stock" },
    { sku: "MSK-SRG", inStock: 1200, reserved: 200, available: 1000, status: "in_stock" },
    { sku: "BPM-DIG", inStock: 64, reserved: 8, available: 56, status: "in_stock" },
  ],
  orders: [
    { orderId: "MED-10041", customerId: "WARD-3B", items: [{ sku: "N95-STD", quantity: 200 }], status: "shipped", estimatedDelivery: "2025-02-03", trackingNumber: "MED-TRK-0041" },
    { orderId: "MED-10042", customerId: "WARD-ICU", items: [{ sku: "IVF-1L", quantity: 100 }, { sku: "GLV-MED", quantity: 10 }], status: "processing", estimatedDelivery: "2025-02-05", trackingNumber: "MED-TRK-0042" },
    { orderId: "MED-10043", customerId: "WARD-ER", items: [{ sku: "MSK-SRG", quantity: 5 }], status: "delivered", estimatedDelivery: "2025-01-28", trackingNumber: "MED-TRK-0043" },
  ],
  categories: ["PPE", "Medical Equipment", "Consumables", "Diagnostic"],
};

const RETAIL_DATA: ThemeData = {
  products: [
    { sku: "LPT-P15", name: "Laptop Pro 15\"", category: "Electronics", price: 1299.99, description: "15-inch laptop with Intel i7, 16GB RAM, 512GB SSD" },
    { sku: "WHP-BT5", name: "Wireless Headphones BT", category: "Electronics", price: 79.99, description: "Bluetooth 5.0 over-ear headphones with 20h battery" },
    { sku: "CMK-DLX", name: "Coffee Maker Deluxe", category: "Kitchen", price: 89.99, description: "12-cup programmable drip coffee maker with thermal carafe" },
    { sku: "RSH-10", name: "Running Shoes (Size 10)", category: "Fitness", price: 129.99, description: "Lightweight performance running shoes with cushioned sole" },
    { sku: "YGM-PRM", name: "Yoga Mat Premium", category: "Fitness", price: 44.99, description: "6mm eco-friendly non-slip yoga and exercise mat" },
    { sku: "ICM-KIT", name: "Instant Camera Kit", category: "Photography", price: 99.99, description: "Instant film camera with 20-pack of film included" },
  ],
  inventory: [
    { sku: "LPT-P15", inStock: 34, reserved: 12, available: 22, status: "low_stock" },
    { sku: "WHP-BT5", inStock: 180, reserved: 40, available: 140, status: "in_stock" },
    { sku: "CMK-DLX", inStock: 95, reserved: 15, available: 80, status: "in_stock" },
    { sku: "RSH-10", inStock: 0, reserved: 0, available: 0, status: "out_of_stock" },
    { sku: "YGM-PRM", inStock: 210, reserved: 25, available: 185, status: "in_stock" },
    { sku: "ICM-KIT", inStock: 47, reserved: 8, available: 39, status: "in_stock" },
  ],
  orders: [
    { orderId: "ORD-20041", customerId: "CUST-R101", items: [{ sku: "LPT-P15", quantity: 1 }], status: "shipped", estimatedDelivery: "2025-02-04", trackingNumber: "RET-TRK-2041" },
    { orderId: "ORD-20042", customerId: "CUST-R102", items: [{ sku: "WHP-BT5", quantity: 2 }, { sku: "YGM-PRM", quantity: 1 }], status: "processing", estimatedDelivery: "2025-02-06", trackingNumber: "RET-TRK-2042" },
    { orderId: "ORD-20043", customerId: "CUST-R103", items: [{ sku: "CMK-DLX", quantity: 1 }], status: "delivered", estimatedDelivery: "2025-01-30", trackingNumber: "RET-TRK-2043" },
  ],
  categories: ["Electronics", "Kitchen", "Fitness", "Photography"],
};

const MANUFACTURING_DATA: ThemeData = {
  products: [
    { sku: "HYD-B2", name: "Hydraulic Actuator Type-B", category: "Motors", price: 1240.00, description: "High-pressure hydraulic linear actuator, 250kN force" },
    { sku: "CNC-SPM", name: "CNC Spindle Motor", category: "Motors", price: 2890.00, description: "15kW high-speed CNC spindle motor, 24000 RPM" },
    { sku: "BRG-ASM", name: "Bearing Assembly Kit", category: "Hardware", price: 340.00, description: "Precision deep-groove ball bearing assembly set" },
    { sku: "STL-12MM", name: "Steel Rod 12mm x 3m", category: "Raw Materials", price: 28.50, description: "Cold-rolled steel rod, 12mm diameter, 3-metre length" },
    { sku: "PNF-SET", name: "Pneumatic Fittings Set (50pc)", category: "Hardware", price: 89.00, description: "Assorted push-in pneumatic fittings, 4mm-12mm" },
    { sku: "CTL-PCB", name: "Control Module PCB", category: "Electronics", price: 420.00, description: "Industrial PLC control board, Modbus/EtherNet IP" },
  ],
  inventory: [
    { sku: "HYD-B2", inStock: 28, reserved: 6, available: 22, status: "low_stock" },
    { sku: "CNC-SPM", inStock: 12, reserved: 4, available: 8, status: "low_stock" },
    { sku: "BRG-ASM", inStock: 140, reserved: 30, available: 110, status: "in_stock" },
    { sku: "STL-12MM", inStock: 0, reserved: 0, available: 0, status: "out_of_stock" },
    { sku: "PNF-SET", inStock: 85, reserved: 10, available: 75, status: "in_stock" },
    { sku: "CTL-PCB", inStock: 56, reserved: 12, available: 44, status: "in_stock" },
  ],
  orders: [
    { orderId: "MFG-10041", customerId: "LINE-A", items: [{ sku: "HYD-B2", quantity: 4 }], status: "shipped", estimatedDelivery: "2025-02-04", trackingNumber: "MFG-TRK-1041" },
    { orderId: "MFG-10042", customerId: "LINE-B", items: [{ sku: "BRG-ASM", quantity: 20 }, { sku: "PNF-SET", quantity: 5 }], status: "processing", estimatedDelivery: "2025-02-07", trackingNumber: "MFG-TRK-1042" },
    { orderId: "MFG-10043", customerId: "QC-LAB", items: [{ sku: "CTL-PCB", quantity: 3 }], status: "delivered", estimatedDelivery: "2025-01-29", trackingNumber: "MFG-TRK-1043" },
  ],
  categories: ["Motors", "Hardware", "Electronics", "Raw Materials"],
};

const GOVERNMENT_DATA: ThemeData = {
  products: [
    { sku: "LPT-GOV", name: "Laptop Workstation (Gov)", category: "IT Equipment", price: 1849.00, description: "FedRAMP-compliant government laptop, encrypted SSD, TPM 2.0" },
    { sku: "USB-SEC", name: "Secure USB Drive 64GB", category: "IT Equipment", price: 79.00, description: "FIPS 140-2 Level 3 encrypted USB flash drive" },
    { sku: "IDP-GOV", name: "ID Card Printer", category: "Security", price: 3200.00, description: "Desktop HID card printer for secure ID issuance" },
    { sku: "CAM-BOD", name: "Body Camera Unit", category: "Field Equipment", price: 649.00, description: "Law enforcement body camera, 4K, 8h battery" },
    { sku: "RAD-SET", name: "Digital Radio Set", category: "Communications", price: 920.00, description: "Encrypted P25 digital portable radio transceiver" },
    { sku: "MED-FLD", name: "Field Medical Kit", category: "Field Equipment", price: 189.00, description: "Tactical first aid kit, IFAK standard, 50-piece" },
  ],
  inventory: [
    { sku: "LPT-GOV", inStock: 48, reserved: 12, available: 36, status: "in_stock" },
    { sku: "USB-SEC", inStock: 320, reserved: 60, available: 260, status: "in_stock" },
    { sku: "IDP-GOV", inStock: 0, reserved: 0, available: 0, status: "out_of_stock" },
    { sku: "CAM-BOD", inStock: 22, reserved: 8, available: 14, status: "low_stock" },
    { sku: "RAD-SET", inStock: 15, reserved: 5, available: 10, status: "low_stock" },
    { sku: "MED-FLD", inStock: 94, reserved: 16, available: 78, status: "in_stock" },
  ],
  orders: [
    { orderId: "GOV-10041", customerId: "DEPT-IT", items: [{ sku: "LPT-GOV", quantity: 10 }], status: "shipped", estimatedDelivery: "2025-02-05", trackingNumber: "GOV-TRK-0041" },
    { orderId: "GOV-10042", customerId: "DEPT-SEC", items: [{ sku: "CAM-BOD", quantity: 5 }, { sku: "RAD-SET", quantity: 5 }], status: "processing", estimatedDelivery: "2025-02-08", trackingNumber: "GOV-TRK-0042" },
    { orderId: "GOV-10043", customerId: "DEPT-FLD", items: [{ sku: "MED-FLD", quantity: 20 }], status: "delivered", estimatedDelivery: "2025-01-31", trackingNumber: "GOV-TRK-0043" },
  ],
  categories: ["IT Equipment", "Security", "Communications", "Field Equipment"],
};

const EDUCATION_DATA: ThemeData = {
  products: [
    { sku: "CALC-84", name: "Scientific Calculator TI-84 Plus", category: "STEM", price: 89.99, description: "Texas Instruments TI-84 Plus CE graphing calculator" },
    { sku: "MIC-LAB", name: "Microscope Lab Grade", category: "STEM", price: 420.00, description: "Binocular compound microscope, 40x-1000x, LED illumination" },
    { sku: "PRJ-4KS", name: "Projector 4K Smart", category: "Display", price: 749.00, description: "4K laser projector with Android TV and wireless casting" },
    { sku: "LPT-STU", name: "Student Chromebook", category: "Computing", price: 349.99, description: "11-inch Chromebook for classroom use, 12h battery" },
    { sku: "PRT-3D", name: "3D Printer Kit", category: "Specialized", price: 299.00, description: "Desktop FDM 3D printer kit for educational use" },
    { sku: "VRH-EDU", name: "VR Headset EDU", category: "Specialized", price: 349.00, description: "Standalone VR headset pre-loaded with educational content" },
  ],
  inventory: [
    { sku: "CALC-84", inStock: 0, reserved: 0, available: 0, status: "out_of_stock" },
    { sku: "MIC-LAB", inStock: 24, reserved: 4, available: 20, status: "in_stock" },
    { sku: "PRJ-4KS", inStock: 18, reserved: 6, available: 12, status: "low_stock" },
    { sku: "LPT-STU", inStock: 145, reserved: 30, available: 115, status: "in_stock" },
    { sku: "PRT-3D", inStock: 0, reserved: 0, available: 0, status: "out_of_stock" },
    { sku: "VRH-EDU", inStock: 32, reserved: 8, available: 24, status: "in_stock" },
  ],
  orders: [
    { orderId: "EDU-10041", customerId: "DEPT-SCI", items: [{ sku: "MIC-LAB", quantity: 6 }], status: "shipped", estimatedDelivery: "2025-02-06", trackingNumber: "EDU-TRK-0041" },
    { orderId: "EDU-10042", customerId: "DEPT-IT", items: [{ sku: "LPT-STU", quantity: 30 }, { sku: "VRH-EDU", quantity: 5 }], status: "processing", estimatedDelivery: "2025-02-09", trackingNumber: "EDU-TRK-0042" },
    { orderId: "EDU-10043", customerId: "DEPT-PHYS", items: [{ sku: "PRJ-4KS", quantity: 2 }], status: "delivered", estimatedDelivery: "2025-02-01", trackingNumber: "EDU-TRK-0043" },
  ],
  categories: ["STEM", "Computing", "Display", "Specialized"],
};

export const INVENTORY_THEMES: Record<ThemeId, ThemeData> = {
  default: DEFAULT_DATA,
  healthcare: HEALTHCARE_DATA,
  retail: RETAIL_DATA,
  manufacturing: MANUFACTURING_DATA,
  government: GOVERNMENT_DATA,
  education: EDUCATION_DATA,
};
