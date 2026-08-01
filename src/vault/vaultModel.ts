/**
 * FIELD TYPES are shared and reused across every account template, rather
 * than each account type inventing its own "password field" from scratch.
 * This is what makes the Passwords view, Codes view, and Renewals
 * dashboard possible as simple queries across all items, instead of
 * separate stored copies of the same data:
 *
 *   "Passwords" view  = every field of type 'password' across every item
 *   "Codes & PINs"     = every field of type 'pin' across every item
 *   "Renewals" view    = every field of type 'renewalDate' across every item
 *
 * Editing the field in its home record is the only place it's stored;
 * every other view is a live read of the same data, never a copy.
 */
export type FieldType =
  | 'text'
  | 'password'
  | 'pin'
  | 'number'
  | 'date'
  | 'renewalDate'
  | 'phone'
  | 'notes';

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

export type Region = 'UK' | 'US' | 'ALL';

export type CurrentCategoryId =
  | 'projects'
  | 'money'
  | 'household'
  | 'digital'
  | 'identity'
  | 'health'
  | 'people'
  | 'vehicles'
  | 'subscriptions'
  | 'business'
  | 'custom';

// Legacy values remain accepted so an existing encrypted vault is never
// invalidated by the interface redesign. They are normalised for display.
export type LegacyCategoryId =
  | 'home_bills'
  | 'phone_tech'
  | 'government_id'
  | 'health_family'
  | 'codes_access';

export type CategoryId = CurrentCategoryId | LegacyCategoryId;

export interface CategoryDefinition {
  id: CurrentCategoryId;
  label: string;
  shortLabel: string;
  description: string;
}

export const CATEGORIES: CategoryDefinition[] = [
  { id: 'projects', label: 'Projects & Collections', shortLabel: 'Projects', description: 'Projects, households, people and businesses used as containers.' },
  { id: 'money', label: 'Money', shortLabel: 'Money', description: 'Banks, cards, loans, pensions, investments and wallets.' },
  { id: 'household', label: 'Household & Property', shortLabel: 'Home', description: 'Utilities, property, insurance, maintenance and home services.' },
  { id: 'digital', label: 'Digital & Communications', shortLabel: 'Digital', description: 'Email, mobile, cloud, devices and online accounts.' },
  { id: 'identity', label: 'Identity & Government', shortLabel: 'ID', description: 'Passports, licences, tax, certificates and government records.' },
  { id: 'health', label: 'Health & Care', shortLabel: 'Health', description: 'Health identifiers, providers, insurance and essential care records.' },
  { id: 'people', label: 'People & Family', shortLabel: 'Family', description: 'Dependants, education, childcare and family legal records.' },
  { id: 'vehicles', label: 'Vehicles & Travel', shortLabel: 'Vehicles', description: 'Vehicles, cover, inspections, travel accounts and documents.' },
  { id: 'subscriptions', label: 'Subscriptions & Memberships', shortLabel: 'Subs', description: 'Streaming, software, gyms, clubs, news and memberships.' },
  { id: 'business', label: 'Work & Business', shortLabel: 'Business', description: 'Company, banking, tax, insurance, suppliers and business software.' },
  { id: 'custom', label: 'Custom', shortLabel: 'Custom', description: 'Anything that does not fit the supplied structures.' },
];

const LEGACY_CATEGORY_MAP: Record<LegacyCategoryId, CurrentCategoryId> = {
  home_bills: 'household',
  phone_tech: 'digital',
  government_id: 'identity',
  health_family: 'health',
  codes_access: 'custom',
};

export function normaliseCategory(category: string): CurrentCategoryId {
  if (category in LEGACY_CATEGORY_MAP) return LEGACY_CATEGORY_MAP[category as LegacyCategoryId];
  if (CATEGORIES.some((entry) => entry.id === category)) return category as CurrentCategoryId;
  return 'custom';
}

export function categoryLabel(category: string, short = false): string {
  const normalised = normaliseCategory(category);
  const definition = CATEGORIES.find((entry) => entry.id === normalised);
  return short ? (definition?.shortLabel ?? 'Custom') : (definition?.label ?? 'Custom');
}

export interface AccountTemplate {
  id: string;
  label: string;
  category: CategoryId;
  region: Region; // 'ALL' = shown regardless of user's chosen region
  fields: FieldDefinition[];
}

// Shared field shorthand helpers keep templates readable below.
const f = (key: string, label: string, type: FieldType, required = false): FieldDefinition => ({
  key,
  label,
  type,
  required,
});

export const ACCOUNT_TEMPLATES: AccountTemplate[] = [
  // ---- Money ----
  {
    id: 'bank_account',
    label: 'Bank Account',
    category: 'money',
    region: 'ALL',
    fields: [
      f('bankName', 'Bank name', 'text', true),
      f('accountHolder', 'Account holder', 'text'),
      f('sortCode', 'Sort code / routing number', 'text'),
      f('accountNumber', 'Account number', 'text'),
      f('onlineUsername', 'Online banking username', 'text'),
      f('onlinePassword', 'Online banking password', 'password'),
      f('cardPin', 'Card PIN', 'pin'),
      f('lostCardNumber', 'Lost/stolen card number', 'phone'),
    ],
  },
  {
    id: 'credit_card',
    label: 'Credit Card',
    category: 'money',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('cardNumber', 'Card number', 'text'),
      f('expiryDate', 'Expiry date', 'renewalDate'),
      f('cvv', 'CVV', 'pin'),
      f('cardPin', 'PIN', 'pin'),
      f('onlineLogin', 'Online account login', 'password'),
      f('customerService', 'Customer service number', 'phone'),
    ],
  },
  {
    id: 'loan_mortgage',
    label: 'Loan / Mortgage',
    category: 'money',
    region: 'ALL',
    fields: [
      f('lender', 'Lender', 'text', true),
      f('referenceNumber', 'Account/reference number', 'text'),
      f('onlineLogin', 'Online login', 'password'),
      f('termEndDate', 'Term end date', 'renewalDate'),
      f('customerService', 'Customer service number', 'phone'),
    ],
  },
  {
    id: 'pension',
    label: 'Pension',
    category: 'money',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('referenceNumber', 'Reference/policy number', 'text'),
      f('onlineLogin', 'Online login', 'password'),
    ],
  },
  {
    id: 'investment',
    label: 'Investment / Trading Account',
    category: 'money',
    region: 'ALL',
    fields: [
      f('platform', 'Platform', 'text', true),
      f('accountNumber', 'Account number', 'text'),
      f('onlineLogin', 'Login', 'password'),
    ],
  },
  {
    id: 'digital_wallet',
    label: 'Digital Wallet',
    category: 'money',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('linkedEmailPhone', 'Linked email/phone', 'text'),
      f('onlineLogin', 'Login', 'password'),
    ],
  },

  // ---- Home & Bills ----
  {
    id: 'council_tax',
    label: 'Council Tax',
    category: 'home_bills',
    region: 'UK',
    fields: [
      f('council', 'Council/authority name', 'text', true),
      f('accountReference', 'Account reference', 'text'),
      f('onlineLogin', 'Online login', 'password'),
      f('directDebitDetails', 'Direct debit details', 'notes'),
    ],
  },
  {
    id: 'property_tax',
    label: 'Property Tax',
    category: 'home_bills',
    region: 'US',
    fields: [
      f('authority', 'Taxing authority', 'text', true),
      f('accountReference', 'Account reference', 'text'),
      f('onlineLogin', 'Online login', 'password'),
    ],
  },
  {
    id: 'utility',
    label: 'Utility (Gas / Electric / Water)',
    category: 'home_bills',
    region: 'ALL',
    fields: [
      f('supplier', 'Supplier', 'text', true),
      f('accountNumber', 'Account number', 'text'),
      f('meterNumber', 'Meter number', 'text'),
      f('onlineLogin', 'Online login', 'password'),
      f('emergencyNumber', 'Emergency/customer service number', 'phone'),
      f('tariffEndDate', 'Tariff end date', 'renewalDate'),
    ],
  },
  {
    id: 'broadband',
    label: 'Broadband / Router',
    category: 'home_bills',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('accountNumber', 'Account number', 'text'),
      f('routerAdminLogin', 'Router admin login', 'password'),
      f('wifiPassword', 'WiFi password', 'password'),
      f('contractEndDate', 'Contract end date', 'renewalDate'),
      f('customerService', 'Customer service number', 'phone'),
    ],
  },
  {
    id: 'landline',
    label: 'Landline',
    category: 'home_bills',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('accountNumber', 'Account number', 'text'),
      f('number', 'Number', 'phone'),
    ],
  },
  {
    id: 'tv_licence',
    label: 'TV Licence',
    category: 'home_bills',
    region: 'UK',
    fields: [
      f('referenceNumber', 'Reference number', 'text', true),
      f('renewalDate', 'Renewal date', 'renewalDate'),
    ],
  },
  {
    id: 'home_insurance',
    label: 'Home / Contents Insurance',
    category: 'home_bills',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('policyNumber', 'Policy number', 'text'),
      f('onlineLogin', 'Online login', 'password'),
      f('renewalDate', 'Renewal date', 'renewalDate'),
      f('claimsNumber', 'Claims number', 'phone'),
    ],
  },

  // ---- Phone & Tech ----
  {
    id: 'mobile_account',
    label: 'Mobile Account',
    category: 'phone_tech',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('accountNumber', 'Account number', 'text'),
      f('onlineLogin', 'Login', 'password'),
      f('simPin', 'SIM PIN', 'pin'),
      f('customerService', 'Customer service number', 'phone'),
      f('contractEndDate', 'Contract end date', 'renewalDate'),
    ],
  },
  {
    id: 'cloud_storage',
    label: 'Cloud Storage',
    category: 'phone_tech',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('email', 'Email', 'text'),
      f('login', 'Login', 'password'),
      f('recoveryCodes', 'Recovery codes', 'notes'),
    ],
  },
  {
    id: 'email_account',
    label: 'Email Account',
    category: 'phone_tech',
    region: 'ALL',
    fields: [
      f('address', 'Address', 'text', true),
      f('login', 'Login', 'password'),
      f('recoveryCodes', 'Recovery codes', 'notes'),
    ],
  },
  {
    id: 'app_store_account',
    label: 'App Store / Play Account',
    category: 'phone_tech',
    region: 'ALL',
    fields: [
      f('login', 'Login', 'password', true),
      f('paymentMethod', 'Payment method on file', 'text'),
    ],
  },

  // ---- Government & ID ----
  {
    id: 'passport',
    label: 'Passport',
    category: 'government_id',
    region: 'ALL',
    fields: [
      f('passportNumber', 'Passport number', 'text', true),
      f('issueDate', 'Issue date', 'date'),
      f('expiryDate', 'Expiry date', 'renewalDate'),
      f('issuingCountry', 'Issuing country', 'text'),
    ],
  },
  {
    id: 'driving_licence',
    label: 'Driving Licence',
    category: 'government_id',
    region: 'ALL',
    fields: [
      f('licenceNumber', 'Licence number', 'text', true),
      f('expiryDate', 'Expiry date', 'renewalDate'),
    ],
  },
  {
    id: 'national_insurance',
    label: 'National Insurance Number',
    category: 'government_id',
    region: 'UK',
    fields: [f('number', 'NI number', 'text', true)],
  },
  {
    id: 'ssn',
    label: 'Social Security Number',
    category: 'government_id',
    region: 'US',
    fields: [f('number', 'SSN', 'text', true)],
  },
  {
    id: 'hmrc',
    label: 'HMRC / Tax Account',
    category: 'government_id',
    region: 'UK',
    fields: [
      f('utr', 'UTR / reference', 'text', true),
      f('onlineLogin', 'Online login', 'password'),
    ],
  },
  {
    id: 'irs',
    label: 'IRS / Tax Account',
    category: 'government_id',
    region: 'US',
    fields: [
      f('ein', 'EIN / reference', 'text', true),
      f('onlineLogin', 'Online login', 'password'),
    ],
  },

  // ---- Health & Family ----
  {
    id: 'nhs_gp',
    label: 'NHS / GP Registration',
    category: 'health_family',
    region: 'UK',
    fields: [
      f('nhsNumber', 'NHS number', 'text', true),
      f('practiceName', 'Practice name', 'text'),
      f('onlineLogin', 'Online login', 'password'),
    ],
  },
  {
    id: 'health_insurance',
    label: 'Health Insurance',
    category: 'health_family',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('memberId', 'Member ID / policy number', 'text'),
      f('onlineLogin', 'Online login', 'password'),
      f('renewalDate', 'Renewal date', 'renewalDate'),
      f('claimsNumber', 'Claims number', 'phone'),
    ],
  },
  {
    id: 'dental_optical',
    label: 'Dental / Opticians',
    category: 'health_family',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('onlineLogin', 'Online login', 'password'),
    ],
  },
  {
    id: 'life_insurance',
    label: 'Life Insurance',
    category: 'health_family',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('policyNumber', 'Policy number', 'text'),
      f('renewalDate', 'Renewal date', 'renewalDate'),
    ],
  },
  {
    id: 'pet_insurance',
    label: 'Pet Insurance / Vet',
    category: 'health_family',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('policyNumber', 'Policy number', 'text'),
      f('renewalDate', 'Renewal date', 'renewalDate'),
    ],
  },
  {
    id: 'school_nursery',
    label: 'School / Nursery',
    category: 'health_family',
    region: 'ALL',
    fields: [
      f('institution', 'Institution name', 'text', true),
      f('portalLogin', 'Portal login', 'password'),
      f('accountReference', 'Account reference', 'text'),
    ],
  },

  // ---- Business / Self-Employed ----
  {
    id: 'business_saas',
    label: 'Business Tool / SaaS',
    category: 'business',
    region: 'ALL',
    fields: [
      f('serviceName', 'Service name', 'text', true),
      f('login', 'Login', 'password'),
      f('plan', 'Plan/tier', 'text'),
      f('renewalDate', 'Renewal / billing date', 'renewalDate'),
    ],
  },
  {
    id: 'payment_processor',
    label: 'Payment Processor',
    category: 'business',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('login', 'Login', 'password'),
      f('linkedBankRef', 'Linked bank account (reference)', 'text'),
    ],
  },
  {
    id: 'accounting_software',
    label: 'Accounting / Invoicing',
    category: 'business',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('login', 'Login', 'password'),
    ],
  },
  {
    id: 'business_bank',
    label: 'Business Bank Account',
    category: 'business',
    region: 'ALL',
    fields: [
      f('bankName', 'Bank name', 'text', true),
      f('sortCode', 'Sort code / routing number', 'text'),
      f('accountNumber', 'Account number', 'text'),
      f('onlineLogin', 'Online login', 'password'),
      f('cardPin', 'Card PIN', 'pin'),
    ],
  },
  {
    id: 'business_tax',
    label: 'Business Tax / Registration',
    category: 'business',
    region: 'ALL',
    fields: [
      f('registrationNumber', 'VAT number / EIN', 'text', true),
      f('login', 'Login', 'password'),
      f('filingDeadline', 'Filing deadline', 'renewalDate'),
    ],
  },
  {
    id: 'business_insurance',
    label: 'Business Insurance',
    category: 'business',
    region: 'ALL',
    fields: [
      f('provider', 'Provider', 'text', true),
      f('policyNumber', 'Policy number', 'text'),
      f('renewalDate', 'Renewal date', 'renewalDate'),
    ],
  },

  // ---- Codes & Access (deliberately minimal - no login, no provider) ----
  {
    id: 'access_code',
    label: 'Code / Access',
    category: 'codes_access',
    region: 'ALL',
    fields: [
      f('whatFor', 'What it\u2019s for', 'text', true),
      f('code', 'Code / PIN', 'pin'),
      f('notes', 'Notes', 'notes'),
    ],
  },

  // ---- Vehicle (consolidated - one asset, several renewal dates) ----
  {
    id: 'vehicle',
    label: 'Vehicle',
    category: 'money', // shown under Money/Assets; could also surface under Government
    region: 'ALL',
    fields: [
      f('regNumber', 'Registration number', 'text', true),
      f('motExpiry', 'MOT expiry', 'renewalDate'),
      f('taxRenewal', 'Tax renewal date', 'renewalDate'),
      f('insuranceProvider', 'Insurance provider', 'text'),
      f('insurancePolicyNumber', 'Insurance policy number', 'text'),
      f('insuranceRenewal', 'Insurance renewal date', 'renewalDate'),
      f('breakdownProvider', 'Breakdown cover provider', 'text'),
      f('breakdownMembershipNumber', 'Breakdown membership number', 'text'),
      f('breakdownRenewal', 'Breakdown renewal date', 'renewalDate'),
      f('breakdownCalloutNumber', 'Breakdown callout number', 'phone'),
    ],
  },

  // ---- Custom fallback ----
  {
    id: 'custom',
    label: 'Custom',
    category: 'custom',
    region: 'ALL',
    fields: [], // user builds the field list entirely themselves
  },
];

export function getTemplate(id: string): AccountTemplate | undefined {
  return ACCOUNT_TEMPLATES.find((t) => t.id === id);
}

export function templatesForRegion(region: Region): AccountTemplate[] {
  return ACCOUNT_TEMPLATES.filter((t) => t.region === 'ALL' || t.region === region);
}

// ---- The actual saved item ----

export interface VaultItem {
  id: string;
  templateId: string;
  category: CategoryId;
  name: string; // user-facing title, e.g. "Barclays Current Account"
  tags: string[];
  fields: Record<string, string>; // fieldKey -> value
  customFields?: FieldDefinition[]; // extra fields added beyond the template
  favourite: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface VaultData {
  version: 1;
  region: Region;
  items: VaultItem[];
}

// ---- Linked/indexed views: computed from the single source of truth ----

export interface LinkedFieldResult {
  itemId: string;
  itemName: string;
  category: CategoryId;
  fieldKey: string;
  fieldLabel: string;
  value: string;
}

function fieldDefsForItem(item: VaultItem): FieldDefinition[] {
  const template = getTemplate(item.templateId);
  return [...(template?.fields ?? []), ...(item.customFields ?? [])];
}

export function collectFieldsByType(vault: VaultData, type: FieldType): LinkedFieldResult[] {
  const results: LinkedFieldResult[] = [];
  for (const item of vault.items) {
    for (const def of fieldDefsForItem(item)) {
      if (def.type === type && item.fields[def.key]) {
        results.push({
          itemId: item.id,
          itemName: item.name,
          category: item.category,
          fieldKey: def.key,
          fieldLabel: def.label,
          value: item.fields[def.key],
        });
      }
    }
  }
  return results;
}

export function passwordsView(vault: VaultData): LinkedFieldResult[] {
  return collectFieldsByType(vault, 'password');
}

export function codesView(vault: VaultData): LinkedFieldResult[] {
  return collectFieldsByType(vault, 'pin');
}

export interface RenewalResult extends LinkedFieldResult {
  daysUntil: number;
}

export function renewalsView(vault: VaultData): RenewalResult[] {
  const results = collectFieldsByType(vault, 'renewalDate');
  const now = Date.now();
  return results
    .map((r) => {
      const date = new Date(r.value).getTime();
      const daysUntil = Number.isNaN(date) ? Infinity : Math.ceil((date - now) / 86_400_000);
      return { ...r, daysUntil };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

export function searchItems(vault: VaultData, query: string): VaultItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return vault.items;
  return vault.items.filter((item) => {
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.tags.some((t) => t.toLowerCase().includes(q))) return true;
    // Deliberately does NOT search field values (passwords/PINs) — you
    // don't want a screenshot of search results leaking a secret via a
    // matched value string.
    return false;
  });
}
