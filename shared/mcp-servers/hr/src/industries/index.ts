export type ThemeId = "default" | "healthcare" | "retail" | "manufacturing" | "government" | "education";

interface Employee {
  id: string;
  name: string;
  title: string;
  department: string;
  email: string;
  manager?: string;
  startDate: string;
}

interface Department {
  id: string;
  name: string;
  head: string;
  headcount: number;
}

interface ThemeData {
  employees: Employee[];
  departments: Department[];
}

const DEFAULT_DATA: ThemeData = {
  employees: [
    { id: "E001", name: "Alice Chen", title: "Senior Engineer", department: "Engineering", email: "alice.chen@acme.com", startDate: "2019-03-12" },
    { id: "E002", name: "Bob Martinez", title: "CFO", department: "Finance", email: "bob.martinez@acme.com", startDate: "2017-06-01" },
    { id: "E003", name: "Carol Smith", title: "CHRO", department: "HR", email: "carol.smith@acme.com", startDate: "2018-09-15" },
    { id: "E004", name: "David Lee", title: "Staff Engineer", department: "Engineering", email: "david.lee@acme.com", startDate: "2020-01-20" },
    { id: "E005", name: "Emma Wilson", title: "Product Manager", department: "Engineering", email: "emma.wilson@acme.com", startDate: "2021-04-05" },
    { id: "E006", name: "Frank Johnson", title: "Financial Analyst", department: "Finance", email: "frank.johnson@acme.com", startDate: "2022-02-14" },
    { id: "E007", name: "Grace Kim", title: "HR Business Partner", department: "HR", email: "grace.kim@acme.com", startDate: "2021-11-01" },
    { id: "E008", name: "Henry Brown", title: "Engineering Manager", department: "Engineering", email: "henry.brown@acme.com", manager: "E001", startDate: "2018-07-22" },
  ],
  departments: [
    { id: "D001", name: "Engineering", head: "Alice Chen", headcount: 4 },
    { id: "D002", name: "Finance", head: "Bob Martinez", headcount: 2 },
    { id: "D003", name: "HR", head: "Carol Smith", headcount: 2 },
  ],
};

const HEALTHCARE_DATA: ThemeData = {
  employees: [
    { id: "C001", name: "Dr. Sarah Chen", title: "Chief of Medicine", department: "Administration", email: "s.chen@cityhospital.org", startDate: "2015-01-10" },
    { id: "C002", name: "Dr. James Patel", title: "Attending Physician", department: "Cardiology", email: "j.patel@cityhospital.org", manager: "C001", startDate: "2018-03-01" },
    { id: "C003", name: "Dr. Maria Lopez", title: "Attending Physician", department: "Oncology", email: "m.lopez@cityhospital.org", manager: "C001", startDate: "2019-06-15" },
    { id: "C004", name: "Dr. Kevin Williams", title: "Emergency Medicine Physician", department: "Emergency", email: "k.williams@cityhospital.org", startDate: "2020-08-01" },
    { id: "C005", name: "Nurse Rebecca Johnson", title: "Nurse Practitioner", department: "Cardiology", email: "r.johnson@cityhospital.org", manager: "C002", startDate: "2021-02-20" },
    { id: "C006", name: "Nurse David Kim", title: "Registered Nurse", department: "Emergency", email: "d.kim@cityhospital.org", manager: "C004", startDate: "2022-04-10" },
    { id: "C007", name: "Dr. Aisha Okonkwo", title: "Clinical Pharmacist", department: "Pharmacy", email: "a.okonkwo@cityhospital.org", startDate: "2020-11-05" },
    { id: "C008", name: "Thomas Reed", title: "Hospital Administrator", department: "Administration", email: "t.reed@cityhospital.org", startDate: "2016-07-18" },
  ],
  departments: [
    { id: "D001", name: "Cardiology", head: "Dr. James Patel", headcount: 12 },
    { id: "D002", name: "Oncology", head: "Dr. Maria Lopez", headcount: 9 },
    { id: "D003", name: "Emergency", head: "Dr. Kevin Williams", headcount: 18 },
    { id: "D004", name: "Pharmacy", head: "Dr. Aisha Okonkwo", headcount: 6 },
    { id: "D005", name: "Administration", head: "Dr. Sarah Chen", headcount: 4 },
  ],
};

const RETAIL_DATA: ThemeData = {
  employees: [
    { id: "S001", name: "Maria Gonzalez", title: "Store Manager", department: "Store Operations", email: "m.gonzalez@shopco.com", startDate: "2016-05-01" },
    { id: "S002", name: "Jake Thompson", title: "District Manager", department: "Store Operations", email: "j.thompson@shopco.com", startDate: "2014-09-15" },
    { id: "S003", name: "Priya Sharma", title: "Senior Sales Associate", department: "Sales", email: "p.sharma@shopco.com", manager: "S001", startDate: "2020-06-10" },
    { id: "S004", name: "Carlos Rivera", title: "Inventory Specialist", department: "Inventory", email: "c.rivera@shopco.com", manager: "S001", startDate: "2021-03-22" },
    { id: "S005", name: "Lisa Park", title: "Customer Service Lead", department: "Customer Service", email: "l.park@shopco.com", startDate: "2019-11-01" },
    { id: "S006", name: "Tom Bradford", title: "Sales Associate", department: "Sales", email: "t.bradford@shopco.com", manager: "S003", startDate: "2022-07-18" },
    { id: "S007", name: "Rachel Moore", title: "Finance Coordinator", department: "Finance", email: "r.moore@shopco.com", startDate: "2021-01-12" },
    { id: "S008", name: "Dani Kim", title: "Assistant Store Manager", department: "Store Operations", email: "d.kim@shopco.com", manager: "S001", startDate: "2020-09-05" },
  ],
  departments: [
    { id: "D001", name: "Sales", head: "Priya Sharma", headcount: 24 },
    { id: "D002", name: "Store Operations", head: "Maria Gonzalez", headcount: 8 },
    { id: "D003", name: "Inventory", head: "Carlos Rivera", headcount: 6 },
    { id: "D004", name: "Customer Service", head: "Lisa Park", headcount: 12 },
    { id: "D005", name: "Finance", head: "Rachel Moore", headcount: 3 },
  ],
};

const MANUFACTURING_DATA: ThemeData = {
  employees: [
    { id: "M001", name: "Robert Chang", title: "Plant Manager", department: "Operations", email: "r.chang@precisionmfg.com", startDate: "2013-02-01" },
    { id: "M002", name: "James Martinez", title: "Process Engineer", department: "Engineering", email: "j.martinez@precisionmfg.com", manager: "M001", startDate: "2017-04-15" },
    { id: "M003", name: "Sandra Kowalski", title: "Quality Control Manager", department: "Quality Control", email: "s.kowalski@precisionmfg.com", startDate: "2016-08-20" },
    { id: "M004", name: "Omar Hassan", title: "Assembly Technician", department: "Assembly", email: "o.hassan@precisionmfg.com", manager: "M001", startDate: "2020-01-13" },
    { id: "M005", name: "Wei Zhang", title: "Senior Process Engineer", department: "Engineering", email: "w.zhang@precisionmfg.com", manager: "M002", startDate: "2019-05-06" },
    { id: "M006", name: "Diana Torres", title: "Quality Inspector", department: "Quality Control", email: "d.torres@precisionmfg.com", manager: "M003", startDate: "2021-11-01" },
    { id: "M007", name: "Brian O'Neill", title: "Maintenance Supervisor", department: "Operations", email: "b.oneill@precisionmfg.com", startDate: "2018-03-25" },
    { id: "M008", name: "Keiko Yamamoto", title: "Production Line Lead", department: "Assembly", email: "k.yamamoto@precisionmfg.com", startDate: "2020-07-07" },
  ],
  departments: [
    { id: "D001", name: "Assembly", head: "Keiko Yamamoto", headcount: 32 },
    { id: "D002", name: "Quality Control", head: "Sandra Kowalski", headcount: 11 },
    { id: "D003", name: "Engineering", head: "James Martinez", headcount: 14 },
    { id: "D004", name: "Operations", head: "Robert Chang", headcount: 8 },
  ],
};

const GOVERNMENT_DATA: ThemeData = {
  employees: [
    { id: "G001", name: "Director Patricia Williams", title: "Agency Director", department: "Executive", email: "p.williams@agency.gov", startDate: "2012-06-01" },
    { id: "G002", name: "Marcus Thompson", title: "Deputy Director", department: "Executive", email: "m.thompson@agency.gov", manager: "G001", startDate: "2015-09-14" },
    { id: "G003", name: "Angela Foster", title: "Senior Policy Analyst", department: "Policy", email: "a.foster@agency.gov", manager: "G002", startDate: "2018-03-01" },
    { id: "G004", name: "Raj Patel", title: "IT Systems Specialist", department: "IT", email: "r.patel@agency.gov", startDate: "2019-07-22" },
    { id: "G005", name: "Susan Clarke", title: "Public Service Officer", department: "Public Services", email: "s.clarke@agency.gov", startDate: "2020-01-06" },
    { id: "G006", name: "Aaron Brooks", title: "Compliance Officer", department: "Legal", email: "a.brooks@agency.gov", startDate: "2017-11-15" },
    { id: "G007", name: "Linda Nguyen", title: "Budget Analyst", department: "Finance", email: "l.nguyen@agency.gov", startDate: "2021-04-19" },
    { id: "G008", name: "Chris Okafor", title: "Policy Analyst", department: "Policy", email: "c.okafor@agency.gov", manager: "G003", startDate: "2022-08-01" },
  ],
  departments: [
    { id: "D001", name: "Policy", head: "Angela Foster", headcount: 9 },
    { id: "D002", name: "Public Services", head: "Susan Clarke", headcount: 22 },
    { id: "D003", name: "IT", head: "Raj Patel", headcount: 14 },
    { id: "D004", name: "Finance", head: "Linda Nguyen", headcount: 5 },
    { id: "D005", name: "Legal", head: "Aaron Brooks", headcount: 4 },
  ],
};

const EDUCATION_DATA: ThemeData = {
  employees: [
    { id: "U001", name: "Dr. Michael Okafor", title: "Dean of Faculty", department: "Administration", email: "m.okafor@university.edu", startDate: "2010-08-01" },
    { id: "U002", name: "Dr. Amrita Patel", title: "Full Professor", department: "STEM", email: "a.patel@university.edu", manager: "U001", startDate: "2014-09-01" },
    { id: "U003", name: "Dr. James Liu", title: "Department Chair", department: "STEM", email: "j.liu@university.edu", startDate: "2016-01-15" },
    { id: "U004", name: "Dr. Elena Romanova", title: "Associate Professor", department: "Humanities", email: "e.romanova@university.edu", startDate: "2019-09-01" },
    { id: "U005", name: "Dr. Carlos Vega", title: "Research Director", department: "Research", email: "c.vega@university.edu", startDate: "2015-03-01" },
    { id: "U006", name: "Dr. Yuki Tanaka", title: "Assistant Professor", department: "STEM", email: "y.tanaka@university.edu", manager: "U003", startDate: "2021-08-15" },
    { id: "U007", name: "Sarah McKenzie", title: "Registrar", department: "Administration", email: "s.mckenzie@university.edu", startDate: "2018-06-01" },
    { id: "U008", name: "Coach David Harris", title: "Athletic Director", department: "Athletics", email: "d.harris@university.edu", startDate: "2020-01-10" },
  ],
  departments: [
    { id: "D001", name: "STEM", head: "Dr. James Liu", headcount: 38 },
    { id: "D002", name: "Humanities", head: "Dr. Elena Romanova", headcount: 22 },
    { id: "D003", name: "Administration", head: "Dr. Michael Okafor", headcount: 11 },
    { id: "D004", name: "Athletics", head: "Coach David Harris", headcount: 15 },
    { id: "D005", name: "Research", head: "Dr. Carlos Vega", headcount: 18 },
  ],
};

export const HR_THEMES: Record<ThemeId, ThemeData> = {
  default: DEFAULT_DATA,
  healthcare: HEALTHCARE_DATA,
  retail: RETAIL_DATA,
  manufacturing: MANUFACTURING_DATA,
  government: GOVERNMENT_DATA,
  education: EDUCATION_DATA,
};
