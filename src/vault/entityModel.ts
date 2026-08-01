import { CategoryId, CurrentCategoryId, FieldDefinition, Region } from './vaultModel';

export type EntityType = 'project' | 'platform' | 'account' | 'resource' | 'record';

export type CredentialType =
  | 'login'
  | 'password'
  | 'pin'
  | 'totp'
  | 'recovery_code'
  | 'api_key'
  | 'secret'
  | 'security_answer'
  | 'other';

export type RelationshipType =
  | 'used_by_project'
  | 'account_on_platform'
  | 'controls_resource'
  | 'paid_from'
  | 'uses_email'
  | 'hosted_on'
  | 'domain_points_to'
  | 'login_owned_by'
  | 'production_of'
  | 'sandbox_of'
  | 'related';

export interface EntityAttribute {
  id: string;
  key: string;
  label: string;
  value: string;
  valueType: 'text' | 'url' | 'email' | 'phone' | 'date' | 'notes' | 'number';
  sensitive: boolean;
  searchable: boolean;
  sortOrder: number;
}

export interface EntityCredential {
  id: string;
  type: CredentialType;
  label: string;
  username: string;
  secret: string;
  notes: string;
  sortOrder: number;
}

export interface EntityIdentifier {
  id: string;
  type: string;
  label: string;
  value: string;
  sensitive: boolean;
  searchable: boolean;
  sortOrder: number;
}

export interface EntityRenewal {
  id: string;
  label: string;
  date: string;
  recurrence: string;
  notes: string;
}

export interface EntityRelationship {
  id: string;
  type: RelationshipType;
  toEntityId: string;
  label: string;
  notes: string;
}

export interface IncomingEntityRelationship extends EntityRelationship {
  fromEntityId: string;
}

export interface VaultEntity {
  id: string;
  entityType: EntityType;
  subtype: string;
  category: CategoryId | 'platforms' | 'resources';
  name: string;
  description: string;
  status: string;
  environment: string;
  website: string;
  loginUrl: string;
  notes: string;
  aliases: string[];
  tags: string[];
  favourite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VaultEntityBundle extends VaultEntity {
  attributes: EntityAttribute[];
  credentials: EntityCredential[];
  identifiers: EntityIdentifier[];
  renewals: EntityRenewal[];
  relationships: EntityRelationship[];
  incomingRelationships?: IncomingEntityRelationship[];
}

export interface EntitySummary {
  id: string;
  entityType: EntityType;
  subtype: string;
  category: VaultEntity['category'];
  name: string;
  description: string;
  status: string;
  environment: string;
  website: string;
  aliases: string[];
  tags: string[];
  favourite: boolean;
  createdAt: string;
  updatedAt: string;
  projectNames: string[];
  platformNames: string[];
  relationshipCount: number;
  credentialCount: number;
  identifierCount: number;
  renewalCount: number;
}

export interface EntitySearchResult extends EntitySummary {
  directMatch: boolean;
  matchReasons: string[];
  connectionDepth: number;
  connectedVia: string[];
}

export interface ConnectedEntity extends EntitySummary {
  connectionDepth: number;
}

export interface RenewalSummary extends EntityRenewal {
  entityId: string;
  entityName: string;
  entityType: EntityType;
  category: VaultEntity['category'];
  daysUntil: number;
}

export const ENTITY_TYPES: { id: EntityType; label: string; shortLabel: string; description: string }[] = [
  { id: 'project', label: 'Project / Container', shortLabel: 'Containers', description: 'A project, household, person or business that contains linked items.' },
  { id: 'resource', label: 'Asset', shortLabel: 'Assets', description: 'An app, website, domain, repository, vehicle or other owned asset.' },
  { id: 'account', label: 'Account / Subscription', shortLabel: 'Accounts', description: 'One specific account, service, subscription or membership.' },
  { id: 'platform', label: 'Provider', shortLabel: 'Providers', description: 'A company, service or organisation that operates an account or asset.' },
  { id: 'record', label: 'Document / Record', shortLabel: 'Records', description: 'Identity, health, family, vehicle or other standalone information.' },
];

export const RELATIONSHIP_TYPES: { id: RelationshipType; label: string }[] = [
  { id: 'used_by_project', label: 'Belongs to container' },
  { id: 'account_on_platform', label: 'Account with provider' },
  { id: 'controls_resource', label: 'Controls asset' },
  { id: 'paid_from', label: 'Paid from / paid into' },
  { id: 'uses_email', label: 'Uses email account' },
  { id: 'hosted_on', label: 'Hosted on' },
  { id: 'domain_points_to', label: 'Domain points to' },
  { id: 'login_owned_by', label: 'Login owned by' },
  { id: 'production_of', label: 'Production version of' },
  { id: 'sandbox_of', label: 'Sandbox / test version of' },
  { id: 'related', label: 'Related to' },
];

export type AddGroupId =
  | 'projects'
  | 'project_assets'
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

export interface AddGroupDefinition {
  id: AddGroupId;
  label: string;
  shortLabel: string;
  description: string;
  category?: CurrentCategoryId;
  hiddenFromMain?: boolean;
}

export const ADD_GROUPS: AddGroupDefinition[] = [
  { id: 'projects', label: 'Project or collection', shortLabel: 'Projects', description: 'Create a project, household, person or business container.', category: 'projects' },
  { id: 'project_assets', label: 'Project asset', shortLabel: 'Assets', description: 'Add an app, website, community, domain, repository or other project asset.', category: 'projects', hiddenFromMain: true },
  { id: 'money', label: 'Money', shortLabel: 'Money', description: 'Banks, cards, loans, pensions, investments and wallets.', category: 'money' },
  { id: 'household', label: 'Household & property', shortLabel: 'Home', description: 'Utilities, property, insurance, maintenance and household services.', category: 'household' },
  { id: 'digital', label: 'Digital & communications', shortLabel: 'Digital', description: 'Email, mobile, cloud, devices and personal online accounts.', category: 'digital' },
  { id: 'identity', label: 'Identity & government', shortLabel: 'ID', description: 'Passports, licences, tax, certificates and government records.', category: 'identity' },
  { id: 'health', label: 'Health & care', shortLabel: 'Health', description: 'Health identifiers, providers, insurance, medications and care records.', category: 'health' },
  { id: 'people', label: 'People & family', shortLabel: 'Family', description: 'Dependants, education, childcare and family legal records.', category: 'people' },
  { id: 'vehicles', label: 'Vehicles & travel', shortLabel: 'Vehicles', description: 'Vehicles, cover, inspections, travel accounts and documents.', category: 'vehicles' },
  { id: 'subscriptions', label: 'Subscriptions & memberships', shortLabel: 'Subs', description: 'Streaming, software, gyms, clubs, news and memberships.', category: 'subscriptions' },
  { id: 'business', label: 'Work & business', shortLabel: 'Business', description: 'Company, banking, tax, insurance, suppliers and business software.', category: 'business' },
  { id: 'custom', label: 'Custom', shortLabel: 'Custom', description: 'A provider, asset, account or record outside the supplied templates.', category: 'custom' },
];

export interface EntityTemplate {
  id: string;
  label: string;
  entityType: EntityType;
  subtype: string;
  category: VaultEntity['category'];
  groupId: AddGroupId;
  description: string;
  region?: Region;
  fields: FieldDefinition[];
}

const f = (key: string, label: string, type: FieldDefinition['type'], required = false): FieldDefinition => ({
  key,
  label,
  type,
  required,
});

const t = (
  id: string,
  label: string,
  entityType: EntityType,
  subtype: string,
  category: VaultEntity['category'],
  groupId: AddGroupId,
  description: string,
  fields: FieldDefinition[] = [],
  region: Region = 'ALL',
): EntityTemplate => ({ id, label, entityType, subtype, category, groupId, description, fields, region });

export const ENTITY_TEMPLATES: EntityTemplate[] = [
  // Containers: these hold a name, description, status, notes and linked items.
  t('project_container', 'Project', 'project', 'project_container', 'projects', 'projects', 'A project container such as Guidance or SpeechMe. Add apps, websites and services inside it.'),
  t('household_container', 'Household / Property', 'project', 'household_container', 'household', 'projects', 'A home, rental property or other household whose services and records belong together.'),
  t('person_container', 'Person / Dependant', 'project', 'person_container', 'people', 'projects', 'A person whose identity, health, education and care records belong together.'),
  t('business_container', 'Business', 'project', 'business_container', 'business', 'projects', 'A company or business container with linked accounts, services, assets and records.'),

  // Project assets.
  t('app_asset', 'App / Product', 'resource', 'app_asset', 'projects', 'project_assets', 'A web, mobile or desktop app/product.', [f('appType', 'App type', 'text'), f('dashboardUrl', 'Admin / dashboard URL', 'text')]),
  t('website_asset', 'Website', 'resource', 'website_asset', 'projects', 'project_assets', 'A website belonging to a project.', [f('publicUrl', 'Public website URL', 'text'), f('adminUrl', 'Admin URL', 'text')]),
  t('community_asset', 'Community', 'resource', 'community_asset', 'projects', 'project_assets', 'A Skool, Discord, Circle, forum or other community.', [f('communityUrl', 'Community URL', 'text'), f('memberCount', 'Member count', 'number')]),
  t('social_channel_asset', 'Social channel / Page', 'resource', 'social_channel_asset', 'projects', 'project_assets', 'A YouTube channel, Facebook page, Instagram profile or similar channel.', [f('network', 'Network / platform', 'text'), f('publicUrl', 'Public URL', 'text'), f('handle', 'Handle', 'text')]),
  t('domain_asset', 'Domain', 'resource', 'domain_asset', 'projects', 'project_assets', 'A domain name and its registrar details.', [f('domainName', 'Domain name', 'text', true), f('registrar', 'Registrar', 'text'), f('renewalDate', 'Renewal date', 'renewalDate')]),
  t('repository_asset', 'Code repository', 'resource', 'repository_asset', 'projects', 'project_assets', 'A GitHub, GitLab or other source repository.', [f('repositoryUrl', 'Repository URL', 'text'), f('defaultBranch', 'Default branch', 'text')]),
  t('database_asset', 'Database / Backend', 'resource', 'database_asset', 'projects', 'project_assets', 'A Supabase, Firebase, database or backend project.', [f('provider', 'Provider', 'text'), f('projectId', 'Project ID', 'text'), f('dashboardUrl', 'Dashboard URL', 'text')]),
  t('advertising_asset', 'Advertising account', 'resource', 'advertising_asset', 'projects', 'project_assets', 'A Google, Meta, Pinterest or other advertising account.', [f('provider', 'Advertising platform', 'text'), f('accountId', 'Account ID', 'text'), f('dashboardUrl', 'Dashboard URL', 'text')]),
  t('store_listing_asset', 'Store listing', 'resource', 'store_listing_asset', 'projects', 'project_assets', 'An app-store, marketplace or product listing.', [f('store', 'Store / marketplace', 'text'), f('listingId', 'Listing ID', 'text'), f('publicUrl', 'Public URL', 'text')]),
  t('payment_product_asset', 'Payment product / Plan', 'resource', 'payment_product_asset', 'projects', 'project_assets', 'A Paddle, Stripe or other payment product and its plans.', [f('provider', 'Payment provider', 'text'), f('productId', 'Product ID', 'text'), f('dashboardUrl', 'Dashboard URL', 'text')]),
  t('mailbox_asset', 'Project email / Mailbox', 'resource', 'mailbox_asset', 'projects', 'project_assets', 'A role mailbox or project email address.', [f('email', 'Email address', 'text'), f('provider', 'Mail provider', 'text')]),
  t('storage_asset', 'File storage / Drive', 'resource', 'storage_asset', 'projects', 'project_assets', 'A shared drive, cloud folder or digital asset library.', [f('provider', 'Provider', 'text'), f('folderUrl', 'Folder / drive URL', 'text')]),
  t('custom_project_asset', 'Other project asset', 'resource', 'custom_project_asset', 'projects', 'project_assets', 'Any other asset that belongs inside a project.'),

  // Money.
  t('current_account', 'Current / Checking account', 'account', 'current_account', 'money', 'money', 'A personal current or checking account.', [f('bankName', 'Bank name', 'text', true), f('accountHolder', 'Account holder', 'text'), f('sortCode', 'Sort code / routing number', 'text'), f('accountNumber', 'Account number', 'text'), f('onlinePassword', 'Online banking password', 'password'), f('cardPin', 'Card PIN', 'pin'), f('customerService', 'Customer service number', 'phone')]),
  t('savings_account', 'Savings account', 'account', 'savings_account', 'money', 'money', 'A savings, deposit or premium savings account.', [f('bankName', 'Bank / provider', 'text', true), f('accountNumber', 'Account number', 'text'), f('interestRate', 'Interest rate', 'text'), f('onlinePassword', 'Online password', 'password')]),
  t('joint_account', 'Joint account', 'account', 'joint_account', 'money', 'money', 'A bank account held by more than one person.', [f('bankName', 'Bank name', 'text', true), f('accountHolders', 'Account holders', 'text'), f('sortCode', 'Sort code / routing number', 'text'), f('accountNumber', 'Account number', 'text'), f('onlinePassword', 'Online password', 'password')]),
  t('credit_card', 'Credit card', 'account', 'credit_card', 'money', 'money', 'A credit card and its online account.', [f('provider', 'Provider', 'text', true), f('cardNumber', 'Card number', 'text'), f('expiryDate', 'Expiry date', 'renewalDate'), f('cvv', 'CVV', 'pin'), f('cardPin', 'PIN', 'pin'), f('onlinePassword', 'Online password', 'password'), f('customerService', 'Customer service number', 'phone')]),
  t('store_card', 'Store card', 'account', 'store_card', 'money', 'money', 'A retail or store credit account.', [f('provider', 'Provider', 'text', true), f('accountNumber', 'Account number', 'text'), f('onlinePassword', 'Online password', 'password')]),
  t('loan', 'Loan', 'account', 'loan', 'money', 'money', 'A personal, secured or other loan.', [f('lender', 'Lender', 'text', true), f('accountReference', 'Account / reference number', 'text'), f('termEndDate', 'Term end date', 'renewalDate'), f('onlinePassword', 'Online password', 'password')]),
  t('mortgage', 'Mortgage', 'account', 'mortgage', 'money', 'money', 'A mortgage linked to a property container.', [f('lender', 'Lender', 'text', true), f('accountReference', 'Account / reference number', 'text'), f('fixedRateEndDate', 'Fixed-rate end date', 'renewalDate'), f('termEndDate', 'Mortgage end date', 'renewalDate'), f('onlinePassword', 'Online password', 'password')]),
  t('vehicle_finance', 'Vehicle finance', 'account', 'vehicle_finance', 'money', 'money', 'Finance or lease for a vehicle.', [f('provider', 'Finance provider', 'text', true), f('agreementNumber', 'Agreement number', 'text'), f('agreementEndDate', 'Agreement end date', 'renewalDate'), f('onlinePassword', 'Online password', 'password')]),
  t('pension', 'Pension', 'account', 'pension', 'money', 'money', 'A workplace, personal or state-linked pension account.', [f('provider', 'Provider', 'text', true), f('policyNumber', 'Reference / policy number', 'text'), f('onlinePassword', 'Online password', 'password')]),
  t('investment_account', 'Investment / Trading account', 'account', 'investment_account', 'money', 'money', 'An investment, ISA, brokerage or trading account.', [f('provider', 'Platform / provider', 'text', true), f('accountNumber', 'Account number', 'text'), f('onlinePassword', 'Online password', 'password')]),
  t('digital_wallet', 'Digital wallet / Payment service', 'account', 'digital_wallet', 'money', 'money', 'PayPal, Revolut, Cash App or another digital wallet/payment account.', [f('provider', 'Provider', 'text', true), f('linkedEmailPhone', 'Linked email / phone', 'text'), f('onlinePassword', 'Password', 'password')]),
  t('crypto_wallet', 'Crypto account / Wallet', 'account', 'crypto_wallet', 'money', 'money', 'A crypto exchange account or wallet record.', [f('provider', 'Exchange / wallet', 'text'), f('walletAddress', 'Public wallet address', 'text'), f('password', 'Password', 'password'), f('recoveryCode', 'Recovery material', 'password')]),

  // Household & property.
  t('property_record', 'Property record', 'record', 'property_record', 'household', 'household', 'Address, ownership, tenancy or management details for a property.', [f('address', 'Address', 'notes', true), f('propertyType', 'Property type', 'text'), f('landlordAgent', 'Landlord / agent / manager', 'text'), f('tenancyEndDate', 'Tenancy end date', 'renewalDate')]),
  t('council_tax', 'Council tax', 'account', 'council_tax', 'household', 'household', 'A UK council-tax account.', [f('council', 'Council / authority', 'text', true), f('accountReference', 'Account reference', 'text'), f('onlinePassword', 'Online password', 'password')], 'UK'),
  t('property_tax', 'Property tax', 'account', 'property_tax', 'household', 'household', 'A US property-tax account.', [f('authority', 'Taxing authority', 'text', true), f('accountReference', 'Account reference', 'text'), f('onlinePassword', 'Online password', 'password')], 'US'),
  t('electricity_account', 'Electricity', 'account', 'electricity_account', 'household', 'household', 'An electricity supplier account.', [f('supplier', 'Supplier', 'text', true), f('accountNumber', 'Account number', 'text'), f('meterNumber', 'Meter / MPAN number', 'text'), f('tariffEndDate', 'Tariff end date', 'renewalDate'), f('onlinePassword', 'Online password', 'password'), f('emergencyNumber', 'Emergency / support number', 'phone')]),
  t('gas_account', 'Gas', 'account', 'gas_account', 'household', 'household', 'A gas supplier account.', [f('supplier', 'Supplier', 'text', true), f('accountNumber', 'Account number', 'text'), f('meterNumber', 'Meter / MPRN number', 'text'), f('tariffEndDate', 'Tariff end date', 'renewalDate'), f('onlinePassword', 'Online password', 'password'), f('emergencyNumber', 'Emergency / support number', 'phone')]),
  t('dual_fuel_account', 'Dual fuel', 'account', 'dual_fuel_account', 'household', 'household', 'A combined gas and electricity account.', [f('supplier', 'Supplier', 'text', true), f('accountNumber', 'Account number', 'text'), f('electricMeter', 'Electricity meter / MPAN', 'text'), f('gasMeter', 'Gas meter / MPRN', 'text'), f('tariffEndDate', 'Tariff end date', 'renewalDate'), f('onlinePassword', 'Online password', 'password')]),
  t('water_account', 'Water / Sewerage', 'account', 'water_account', 'household', 'household', 'A water and/or sewerage account.', [f('supplier', 'Supplier', 'text', true), f('accountNumber', 'Account number', 'text'), f('meterNumber', 'Meter number', 'text'), f('onlinePassword', 'Online password', 'password'), f('emergencyNumber', 'Emergency / support number', 'phone')]),
  t('heating_fuel_account', 'Heating oil / LPG', 'account', 'heating_fuel_account', 'household', 'household', 'A heating-oil, LPG or fuel-delivery account.', [f('supplier', 'Supplier', 'text', true), f('accountNumber', 'Account number', 'text'), f('customerService', 'Customer service number', 'phone')]),
  t('broadband_account', 'Broadband', 'account', 'broadband_account', 'household', 'household', 'A home broadband account.', [f('provider', 'Provider', 'text', true), f('accountNumber', 'Account number', 'text'), f('contractEndDate', 'Contract end date', 'renewalDate'), f('onlinePassword', 'Online password', 'password'), f('customerService', 'Customer service number', 'phone')]),
  t('landline_account', 'Landline / VoIP', 'account', 'landline_account', 'household', 'household', 'A landline or home VoIP account.', [f('provider', 'Provider', 'text', true), f('accountNumber', 'Account number', 'text'), f('phoneNumber', 'Phone number', 'phone'), f('onlinePassword', 'Online password', 'password')]),
  t('tv_licence', 'TV licence', 'account', 'tv_licence', 'household', 'household', 'A television licence.', [f('referenceNumber', 'Reference number', 'text', true), f('renewalDate', 'Renewal date', 'renewalDate')], 'UK'),
  t('home_insurance', 'Home / Contents insurance', 'account', 'home_insurance', 'household', 'household', 'Buildings, contents or combined home insurance.', [f('provider', 'Provider', 'text', true), f('policyNumber', 'Policy number', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('onlinePassword', 'Online password', 'password'), f('claimsNumber', 'Claims number', 'phone')]),
  t('home_emergency_cover', 'Home emergency / Appliance cover', 'account', 'home_emergency_cover', 'household', 'household', 'Home emergency, plumbing, electrical or appliance cover.', [f('provider', 'Provider', 'text', true), f('policyNumber', 'Policy / membership number', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('calloutNumber', 'Callout number', 'phone')]),
  t('boiler_service_plan', 'Boiler service plan', 'account', 'boiler_service_plan', 'household', 'household', 'A boiler maintenance or service contract.', [f('provider', 'Provider', 'text', true), f('planNumber', 'Plan / contract number', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('calloutNumber', 'Callout number', 'phone')]),
  t('home_security_account', 'Home security / Monitoring', 'account', 'home_security_account', 'household', 'household', 'Alarm, CCTV, smart-doorbell or monitoring account.', [f('provider', 'Provider', 'text', true), f('accountNumber', 'Account number', 'text'), f('alarmPin', 'Alarm PIN', 'pin'), f('renewalDate', 'Renewal date', 'renewalDate'), f('supportNumber', 'Support number', 'phone')]),
  t('household_service', 'Household service / Contractor', 'account', 'household_service', 'household', 'household', 'Cleaning, gardening, pest control, window cleaning or another recurring service.', [f('provider', 'Provider / contractor', 'text', true), f('serviceType', 'Service type', 'text'), f('contactNumber', 'Contact number', 'phone'), f('renewalDate', 'Contract renewal date', 'renewalDate')]),
  t('home_equipment_asset', 'Home equipment / Appliance', 'resource', 'home_equipment_asset', 'household', 'household', 'Boiler, router, alarm, solar installation, battery or major appliance.', [f('manufacturer', 'Manufacturer', 'text'), f('model', 'Model', 'text'), f('serialNumber', 'Serial number', 'text'), f('warrantyEndDate', 'Warranty end date', 'renewalDate')]),

  // Digital & communications.
  t('email_account', 'Email account', 'account', 'email_account', 'digital', 'digital', 'A personal or role email account.', [f('emailAddress', 'Email address', 'text', true), f('provider', 'Provider', 'text'), f('password', 'Password', 'password'), f('recoveryCode', 'Recovery codes', 'password')]),
  t('mobile_account', 'Mobile account', 'account', 'mobile_account', 'digital', 'digital', 'A mobile phone or SIM account.', [f('provider', 'Provider', 'text', true), f('mobileNumber', 'Mobile number', 'phone'), f('accountNumber', 'Account number', 'text'), f('simPin', 'SIM PIN', 'pin'), f('contractEndDate', 'Contract end date', 'renewalDate'), f('onlinePassword', 'Online password', 'password')]),
  t('cloud_storage', 'Cloud storage', 'account', 'cloud_storage', 'digital', 'digital', 'Google Drive, OneDrive, Dropbox, iCloud or another cloud-storage account.', [f('provider', 'Provider', 'text', true), f('email', 'Account email', 'text'), f('password', 'Password', 'password'), f('renewalDate', 'Renewal date', 'renewalDate')]),
  t('apple_account', 'Apple account', 'account', 'apple_account', 'digital', 'digital', 'An Apple Account / Apple ID.', [f('email', 'Account email', 'text', true), f('password', 'Password', 'password'), f('recoveryCode', 'Recovery key / codes', 'password')]),
  t('google_account', 'Google account', 'account', 'google_account', 'digital', 'digital', 'A Google account and its recovery details.', [f('email', 'Account email', 'text', true), f('password', 'Password', 'password'), f('recoveryEmail', 'Recovery email', 'text'), f('recoveryCode', 'Recovery codes', 'password')]),
  t('microsoft_account', 'Microsoft account', 'account', 'microsoft_account', 'digital', 'digital', 'A Microsoft account.', [f('email', 'Account email', 'text', true), f('password', 'Password', 'password'), f('recoveryCode', 'Recovery codes', 'password')]),
  t('social_account', 'Social media account', 'account', 'social_account', 'digital', 'digital', 'A personal social-media profile or login.', [f('platform', 'Platform', 'text', true), f('handle', 'Handle', 'text'), f('profileUrl', 'Profile URL', 'text'), f('password', 'Password', 'password'), f('recoveryCode', 'Recovery codes', 'password')]),
  t('messaging_account', 'Messaging account', 'account', 'messaging_account', 'digital', 'digital', 'WhatsApp, Signal, Telegram or another messaging account.', [f('platform', 'Platform', 'text', true), f('phoneOrEmail', 'Phone / email', 'text'), f('pin', 'PIN', 'pin'), f('recoveryCode', 'Recovery code', 'password')]),
  t('gaming_account', 'Gaming account', 'account', 'gaming_account', 'digital', 'digital', 'A console, platform or game account.', [f('platform', 'Platform', 'text', true), f('username', 'Username', 'text'), f('password', 'Password', 'password'), f('recoveryCode', 'Recovery codes', 'password')]),
  t('domain_hosting_account', 'Domain / Hosting account', 'account', 'domain_hosting_account', 'digital', 'digital', 'A registrar or hosting-provider account.', [f('provider', 'Provider', 'text', true), f('customerId', 'Customer ID', 'text'), f('password', 'Password', 'password'), f('renewalDate', 'Renewal date', 'renewalDate')]),
  t('password_manager', 'Password manager', 'account', 'password_manager', 'digital', 'digital', 'A password-manager account. Store recovery details carefully.', [f('provider', 'Provider', 'text', true), f('accountEmail', 'Account email', 'text'), f('masterPassword', 'Master password', 'password'), f('recoveryCode', 'Recovery key / codes', 'password'), f('renewalDate', 'Renewal date', 'renewalDate')]),
  t('router_wifi', 'Router / Wi-Fi', 'resource', 'router_wifi', 'digital', 'digital', 'A router and its local administration details.', [f('networkName', 'Wi-Fi network name', 'text'), f('adminAddress', 'Router admin address', 'text'), f('adminPassword', 'Router admin password', 'password'), f('wifiPassword', 'Wi-Fi password', 'password'), f('serialNumber', 'Serial number', 'text')]),
  t('device_record', 'Device', 'resource', 'device_record', 'digital', 'digital', 'A phone, computer, tablet or other device.', [f('deviceType', 'Device type', 'text'), f('manufacturer', 'Manufacturer', 'text'), f('model', 'Model', 'text'), f('serialNumber', 'Serial / IMEI', 'text'), f('warrantyEndDate', 'Warranty end date', 'renewalDate')]),
  t('software_licence', 'Software licence', 'account', 'software_licence', 'digital', 'digital', 'A software licence or non-recurring entitlement.', [f('software', 'Software', 'text', true), f('licenceKey', 'Licence key', 'password'), f('accountEmail', 'Account email', 'text'), f('renewalDate', 'Support / renewal date', 'renewalDate')]),

  // Identity & government.
  t('passport', 'Passport', 'record', 'passport', 'identity', 'identity', 'Passport number, issuing details and expiry.', [f('passportNumber', 'Passport number', 'text', true), f('issueDate', 'Issue date', 'date'), f('expiryDate', 'Expiry date', 'renewalDate'), f('issuingCountry', 'Issuing country', 'text')]),
  t('driving_licence', 'Driving licence', 'record', 'driving_licence', 'identity', 'identity', 'Driving-licence details and expiry.', [f('licenceNumber', 'Licence number', 'text', true), f('issueDate', 'Issue date', 'date'), f('expiryDate', 'Expiry date', 'renewalDate')]),
  t('national_id', 'National identity number', 'record', 'national_id', 'identity', 'identity', 'National insurance, social security or another national identifier.', [f('nationalId', 'National identity number', 'text', true), f('issuingAuthority', 'Issuing authority', 'text')]),
  t('birth_certificate', 'Birth certificate', 'record', 'birth_certificate', 'identity', 'identity', 'Birth certificate or registration details.', [f('certificateNumber', 'Certificate / registration number', 'text'), f('dateOfBirth', 'Date of birth', 'date'), f('placeOfBirth', 'Place of birth', 'text')]),
  t('tax_account_uk', 'HMRC / Tax account', 'account', 'tax_account_uk', 'identity', 'identity', 'A UK personal tax account.', [f('utr', 'UTR / tax reference', 'text'), f('nationalInsuranceNumber', 'National Insurance number', 'text'), f('onlinePassword', 'Online password', 'password')], 'UK'),
  t('tax_account_us', 'IRS / Tax account', 'account', 'tax_account_us', 'identity', 'identity', 'A US personal tax account.', [f('taxId', 'SSN / taxpayer reference', 'text'), f('onlinePassword', 'Online password', 'password')], 'US'),
  t('benefits_account', 'Benefits / Government portal', 'account', 'benefits_account', 'identity', 'identity', 'A benefits, pension or government-services portal.', [f('service', 'Service / department', 'text', true), f('claimReference', 'Claim / reference number', 'text'), f('onlinePassword', 'Online password', 'password')]),
  t('immigration_record', 'Visa / Immigration record', 'record', 'immigration_record', 'identity', 'identity', 'Visa, residency permit or immigration record.', [f('documentNumber', 'Document / case number', 'text'), f('status', 'Status / type', 'text'), f('expiryDate', 'Expiry date', 'renewalDate')]),
  t('legal_certificate', 'Certificate / Legal document', 'record', 'legal_certificate', 'identity', 'identity', 'A marriage, civil partnership, deed-poll or other certificate.', [f('documentType', 'Document type', 'text', true), f('referenceNumber', 'Reference number', 'text'), f('documentDate', 'Document date', 'date')]),

  // Health & care.
  t('health_identifier', 'Health identifier / Registration', 'record', 'health_identifier', 'health', 'health', 'NHS, health-service or insurance identifier and registration.', [f('healthNumber', 'Health / NHS number', 'text', true), f('providerOrPractice', 'Provider / practice', 'text'), f('portalUrl', 'Portal URL', 'text')]),
  t('gp_practice', 'GP / Primary care', 'record', 'gp_practice', 'health', 'health', 'Primary doctor or GP practice details.', [f('practiceName', 'Practice name', 'text', true), f('doctor', 'Doctor', 'text'), f('phone', 'Phone', 'phone'), f('address', 'Address', 'notes')]),
  t('care_provider', 'Care provider', 'record', 'care_provider', 'health', 'health', 'Dentist, optician, pharmacy, hospital, consultant, physiotherapist or other provider.', [f('providerType', 'Provider type', 'text', true), f('providerName', 'Provider name', 'text', true), f('phone', 'Phone', 'phone'), f('address', 'Address', 'notes')]),
  t('health_insurance', 'Health insurance / Medical plan', 'account', 'health_insurance', 'health', 'health', 'Private health insurance or medical membership.', [f('provider', 'Provider', 'text', true), f('memberId', 'Member / policy number', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('onlinePassword', 'Online password', 'password'), f('claimsNumber', 'Claims number', 'phone')]),
  t('dental_plan', 'Dental / Optical plan', 'account', 'dental_plan', 'health', 'health', 'Dental, optical or cash-plan membership.', [f('provider', 'Provider', 'text', true), f('memberId', 'Member number', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('onlinePassword', 'Online password', 'password')]),
  t('medication_record', 'Medication', 'record', 'medication_record', 'health', 'health', 'A current medication and its instructions.', [f('medication', 'Medication', 'text', true), f('dose', 'Dose', 'text'), f('schedule', 'Schedule', 'text'), f('prescriber', 'Prescriber', 'text'), f('notes', 'Important notes', 'notes')]),
  t('allergy_record', 'Allergy / Intolerance', 'record', 'allergy_record', 'health', 'health', 'An allergy, intolerance or adverse reaction.', [f('substance', 'Substance / trigger', 'text', true), f('reaction', 'Reaction', 'notes'), f('severity', 'Severity', 'text')]),
  t('medical_alert', 'Medical alert', 'record', 'medical_alert', 'health', 'health', 'Blood group, emergency alert or critical medical information.', [f('alertType', 'Alert type', 'text', true), f('details', 'Details', 'notes', true), f('emergencyInstruction', 'Emergency instruction', 'notes')]),
  t('vaccination_record', 'Vaccination record', 'record', 'vaccination_record', 'health', 'health', 'A vaccination and its date/provider.', [f('vaccine', 'Vaccine', 'text', true), f('dateGiven', 'Date given', 'date'), f('provider', 'Provider / clinic', 'text'), f('nextDueDate', 'Next due date', 'renewalDate')]),
  t('care_plan', 'Care plan', 'record', 'care_plan', 'health', 'health', 'A current care plan or treatment summary.', [f('planName', 'Plan name', 'text', true), f('provider', 'Responsible provider', 'text'), f('details', 'Plan details', 'notes'), f('reviewDate', 'Review date', 'renewalDate')]),
  t('medical_device', 'Medical device', 'resource', 'medical_device', 'health', 'health', 'A medical device, implant or monitoring device.', [f('deviceType', 'Device type', 'text', true), f('manufacturer', 'Manufacturer', 'text'), f('model', 'Model', 'text'), f('serialNumber', 'Serial number', 'text'), f('replacementDate', 'Replacement / review date', 'renewalDate')]),
  t('prescription_account', 'Prescription / Pharmacy account', 'account', 'prescription_account', 'health', 'health', 'Repeat-prescription or pharmacy portal details.', [f('provider', 'Pharmacy / service', 'text', true), f('patientNumber', 'Patient / account number', 'text'), f('onlinePassword', 'Online password', 'password'), f('phone', 'Phone', 'phone')]),

  // People & family.
  t('school_nursery', 'School / Nursery account', 'account', 'school_nursery', 'people', 'people', 'A school, nursery or education portal.', [f('institution', 'Institution', 'text', true), f('studentReference', 'Student / account reference', 'text'), f('portalPassword', 'Portal password', 'password'), f('phone', 'Phone', 'phone')]),
  t('childcare_account', 'Childcare account', 'account', 'childcare_account', 'people', 'people', 'Childcare, tax-free childcare or care-provider account.', [f('provider', 'Provider / service', 'text', true), f('accountReference', 'Account reference', 'text'), f('portalPassword', 'Portal password', 'password')]),
  t('family_insurance', 'Life / Family insurance', 'account', 'family_insurance', 'people', 'people', 'Life, income-protection or family insurance.', [f('provider', 'Provider', 'text', true), f('policyNumber', 'Policy number', 'text'), f('beneficiaries', 'Beneficiaries', 'notes'), f('renewalDate', 'Renewal / review date', 'renewalDate')]),
  t('guardianship_record', 'Guardianship / Care arrangement', 'record', 'guardianship_record', 'people', 'people', 'Guardianship, care or emergency arrangement.', [f('arrangementType', 'Arrangement type', 'text', true), f('people', 'People involved', 'notes'), f('details', 'Details', 'notes')]),
  t('power_of_attorney', 'Power of attorney', 'record', 'power_of_attorney', 'people', 'people', 'Power-of-attorney details and document references.', [f('documentType', 'Type', 'text'), f('referenceNumber', 'Reference number', 'text'), f('attorneys', 'Attorneys', 'notes'), f('documentLocation', 'Document location', 'text')]),
  t('executor_record', 'Will / Executor information', 'record', 'executor_record', 'people', 'people', 'Will, executor and document-location information.', [f('executorNames', 'Executor(s)', 'notes'), f('solicitor', 'Solicitor / provider', 'text'), f('documentLocation', 'Document location', 'text'), f('lastReviewed', 'Last reviewed', 'date')]),
  t('family_membership', 'Club / Activity membership', 'account', 'family_membership', 'people', 'people', 'A child or family club, class or activity membership.', [f('organisation', 'Organisation', 'text', true), f('memberNumber', 'Member number', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('portalPassword', 'Portal password', 'password')]),
  t('emergency_contact', 'Emergency contact', 'record', 'emergency_contact', 'people', 'people', 'An emergency contact linked to a person or household.', [f('contactName', 'Name', 'text', true), f('relationship', 'Relationship', 'text'), f('phone', 'Phone', 'phone'), f('email', 'Email', 'text')]),

  // Vehicles & travel.
  t('vehicle_asset', 'Vehicle', 'resource', 'vehicle_asset', 'vehicles', 'vehicles', 'A car, motorcycle, van or other vehicle asset.', [f('registrationNumber', 'Registration number', 'text', true), f('makeModel', 'Make / model', 'text'), f('vin', 'VIN / chassis number', 'text'), f('purchaseDate', 'Purchase date', 'date')]),
  t('vehicle_insurance', 'Vehicle insurance', 'account', 'vehicle_insurance', 'vehicles', 'vehicles', 'Insurance for a vehicle.', [f('provider', 'Provider', 'text', true), f('policyNumber', 'Policy number', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('onlinePassword', 'Online password', 'password'), f('claimsNumber', 'Claims number', 'phone')]),
  t('vehicle_tax', 'Vehicle tax / Registration', 'record', 'vehicle_tax', 'vehicles', 'vehicles', 'Vehicle tax or registration details.', [f('referenceNumber', 'Reference / registration number', 'text'), f('renewalDate', 'Renewal date', 'renewalDate')]),
  t('vehicle_inspection', 'MOT / Inspection', 'record', 'vehicle_inspection', 'vehicles', 'vehicles', 'MOT, roadworthiness or safety inspection.', [f('certificateNumber', 'Certificate number', 'text'), f('expiryDate', 'Expiry / due date', 'renewalDate'), f('testCentre', 'Test centre', 'text')]),
  t('breakdown_cover', 'Breakdown cover', 'account', 'breakdown_cover', 'vehicles', 'vehicles', 'Roadside assistance or breakdown membership.', [f('provider', 'Provider', 'text', true), f('membershipNumber', 'Membership number', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('calloutNumber', 'Callout number', 'phone')]),
  t('vehicle_service', 'Service / Warranty record', 'record', 'vehicle_service', 'vehicles', 'vehicles', 'Service history, warranty or maintenance record.', [f('provider', 'Garage / provider', 'text'), f('lastServiceDate', 'Last service date', 'date'), f('nextServiceDate', 'Next service due', 'renewalDate'), f('warrantyEndDate', 'Warranty end date', 'renewalDate')]),
  t('parking_toll_account', 'Parking / Toll account', 'account', 'parking_toll_account', 'vehicles', 'vehicles', 'Parking, toll-road or congestion-charge account.', [f('provider', 'Provider', 'text', true), f('accountNumber', 'Account number', 'text'), f('vehicleRegistration', 'Vehicle registration', 'text'), f('onlinePassword', 'Online password', 'password')]),
  t('charging_account', 'EV charging account', 'account', 'charging_account', 'vehicles', 'vehicles', 'Electric-vehicle charging account or card.', [f('provider', 'Provider', 'text', true), f('accountNumber', 'Account / card number', 'text'), f('onlinePassword', 'Online password', 'password')]),
  t('travel_insurance', 'Travel insurance', 'account', 'travel_insurance', 'vehicles', 'vehicles', 'Travel insurance policy.', [f('provider', 'Provider', 'text', true), f('policyNumber', 'Policy number', 'text'), f('renewalDate', 'Policy end / renewal date', 'renewalDate'), f('emergencyNumber', 'Emergency number', 'phone')]),
  t('airline_account', 'Airline / Frequent flyer', 'account', 'airline_account', 'vehicles', 'vehicles', 'Airline account or frequent-flyer membership.', [f('airline', 'Airline', 'text', true), f('memberNumber', 'Membership number', 'text'), f('onlinePassword', 'Online password', 'password')]),
  t('hotel_travel_account', 'Hotel / Booking / Rail account', 'account', 'hotel_travel_account', 'vehicles', 'vehicles', 'A hotel, booking, rail or travel platform account.', [f('provider', 'Provider', 'text', true), f('memberNumber', 'Member / account number', 'text'), f('onlinePassword', 'Online password', 'password')]),
  t('travel_document', 'Visa / Trusted traveller', 'record', 'travel_document', 'vehicles', 'vehicles', 'Visa, trusted-traveller or border programme details.', [f('programme', 'Programme / visa type', 'text', true), f('documentNumber', 'Document / membership number', 'text'), f('expiryDate', 'Expiry date', 'renewalDate')]),

  // Subscriptions & memberships.
  t('streaming_subscription', 'TV / Streaming subscription', 'account', 'streaming_subscription', 'subscriptions', 'subscriptions', 'Netflix, Prime Video, Disney+, Sky, NOW or another media subscription.', [f('provider', 'Provider', 'text', true), f('plan', 'Plan / package', 'text'), f('billingAmount', 'Billing amount', 'text'), f('renewalDate', 'Next billing / renewal date', 'renewalDate'), f('password', 'Password', 'password')]),
  t('software_subscription', 'Software subscription', 'account', 'software_subscription', 'subscriptions', 'subscriptions', 'A personal software or app subscription.', [f('provider', 'Service / software', 'text', true), f('plan', 'Plan / tier', 'text'), f('billingAmount', 'Billing amount', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('password', 'Password', 'password')]),
  t('gym_membership', 'Gym / Fitness membership', 'account', 'gym_membership', 'subscriptions', 'subscriptions', 'A gym, leisure or fitness membership.', [f('provider', 'Gym / provider', 'text', true), f('memberNumber', 'Member number', 'text'), f('renewalDate', 'Renewal / review date', 'renewalDate'), f('portalPassword', 'Portal password', 'password')]),
  t('club_membership', 'Club membership', 'account', 'club_membership', 'subscriptions', 'subscriptions', 'A social, sports or private club membership.', [f('organisation', 'Organisation', 'text', true), f('memberNumber', 'Member number', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('portalPassword', 'Portal password', 'password')]),
  t('news_subscription', 'News / Publication subscription', 'account', 'news_subscription', 'subscriptions', 'subscriptions', 'A newspaper, magazine or publication subscription.', [f('publication', 'Publication', 'text', true), f('accountReference', 'Account reference', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('password', 'Password', 'password')]),
  t('professional_membership', 'Professional membership', 'account', 'professional_membership', 'subscriptions', 'subscriptions', 'A professional body, accreditation or trade membership.', [f('organisation', 'Organisation', 'text', true), f('memberNumber', 'Member number', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('portalPassword', 'Portal password', 'password')]),
  t('custom_subscription', 'Other subscription / Membership', 'account', 'custom_subscription', 'subscriptions', 'subscriptions', 'Any other recurring subscription or membership.', [f('provider', 'Provider', 'text', true), f('accountReference', 'Account / member reference', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('password', 'Password', 'password')]),

  // Work & business.
  t('business_bank', 'Business bank account', 'account', 'business_bank', 'business', 'business', 'A business current, savings or merchant bank account.', [f('bankName', 'Bank name', 'text', true), f('businessName', 'Business name', 'text'), f('sortCode', 'Sort code / routing number', 'text'), f('accountNumber', 'Account number', 'text'), f('onlinePassword', 'Online password', 'password'), f('cardPin', 'Card PIN', 'pin')]),
  t('payment_processor', 'Payment processor', 'account', 'payment_processor', 'business', 'business', 'Paddle, Stripe, PayPal Business or another payment processor.', [f('provider', 'Provider', 'text', true), f('merchantId', 'Merchant / account ID', 'text'), f('onlinePassword', 'Online password', 'password'), f('supportUrl', 'Support URL', 'text')]),
  t('accounting_software', 'Accounting / Invoicing', 'account', 'accounting_software', 'business', 'business', 'Accounting, bookkeeping or invoicing software.', [f('provider', 'Provider', 'text', true), f('organisationId', 'Organisation ID', 'text'), f('onlinePassword', 'Online password', 'password'), f('renewalDate', 'Renewal date', 'renewalDate')]),
  t('payroll_account', 'Payroll / HR account', 'account', 'payroll_account', 'business', 'business', 'Payroll, pensions or HR service.', [f('provider', 'Provider', 'text', true), f('employerId', 'Employer / account ID', 'text'), f('onlinePassword', 'Online password', 'password'), f('renewalDate', 'Renewal date', 'renewalDate')]),
  t('business_tax', 'Business tax / Registration', 'record', 'business_tax', 'business', 'business', 'Company, VAT, EIN or tax-registration details.', [f('registrationNumber', 'Registration / tax number', 'text', true), f('authority', 'Authority', 'text'), f('filingDeadline', 'Filing / renewal date', 'renewalDate')]),
  t('business_insurance', 'Business insurance', 'account', 'business_insurance', 'business', 'business', 'Professional, public-liability or other business cover.', [f('provider', 'Provider', 'text', true), f('policyNumber', 'Policy number', 'text'), f('renewalDate', 'Renewal date', 'renewalDate'), f('claimsNumber', 'Claims number', 'phone')]),
  t('business_saas', 'Business tool / SaaS', 'account', 'business_saas', 'business', 'business', 'A business software service.', [f('serviceName', 'Service name', 'text', true), f('plan', 'Plan / tier', 'text'), f('renewalDate', 'Renewal / billing date', 'renewalDate'), f('password', 'Password', 'password')]),
  t('supplier_account', 'Supplier / Trade account', 'account', 'supplier_account', 'business', 'business', 'A supplier, wholesaler or trade account.', [f('supplier', 'Supplier', 'text', true), f('accountNumber', 'Account number', 'text'), f('creditTerms', 'Credit terms', 'text'), f('onlinePassword', 'Online password', 'password')]),
  t('business_provider', 'Business provider / Organisation', 'platform', 'business_provider', 'business', 'business', 'A provider or organisation used by the business.', [f('contactName', 'Contact name', 'text'), f('supportPhone', 'Support phone', 'phone'), f('supportUrl', 'Support URL', 'text')]),

  // Custom fallbacks.
  t('platform_provider', 'Provider / Organisation', 'platform', 'platform_provider', 'custom', 'custom', 'A company, service, authority or organisation that operates other records.', [f('supportPhone', 'Support phone', 'phone'), f('supportUrl', 'Support URL', 'text')]),
  t('custom_asset', 'Custom asset', 'resource', 'custom_asset', 'custom', 'custom', 'An asset that does not fit another template.'),
  t('custom_account', 'Custom account / Service', 'account', 'custom_account', 'custom', 'custom', 'An account or service that does not fit another template.'),
  t('custom_record', 'Custom document / Record', 'record', 'custom_record', 'custom', 'custom', 'A standalone record that does not fit another template.'),
];

export function getEntityTemplate(id: string): EntityTemplate | undefined {
  return ENTITY_TEMPLATES.find((template) => template.id === id);
}

export function templatesForAddGroup(groupId: AddGroupId, region: Region = 'ALL'): EntityTemplate[] {
  return ENTITY_TEMPLATES.filter((template) => (
    template.groupId === groupId && (template.region === 'ALL' || template.region === region || region === 'ALL')
  ));
}

export function templatesForEntityType(type: EntityType): EntityTemplate[] {
  return ENTITY_TEMPLATES.filter((template) => template.entityType === type);
}

export function relationshipLabel(type: RelationshipType): string {
  return RELATIONSHIP_TYPES.find((entry) => entry.id === type)?.label ?? type;
}

export function entityTypeLabel(type: EntityType): string {
  return ENTITY_TYPES.find((entry) => entry.id === type)?.label ?? type;
}

export function entityTypeShortLabel(type: EntityType): string {
  return ENTITY_TYPES.find((entry) => entry.id === type)?.shortLabel ?? type;
}

export function entityKindLabel(type: EntityType, subtype?: string): string {
  if (type === 'project') {
    if (subtype === 'household_container') return 'Household / Property';
    if (subtype === 'person_container') return 'Person / Dependant';
    if (subtype === 'business_container') return 'Business';
    return 'Project';
  }
  if (type === 'resource') return 'Asset';
  if (type === 'account') return 'Account / Subscription';
  if (type === 'platform') return 'Provider';
  return 'Document / Record';
}

export function isContainerType(type: EntityType): boolean {
  return type === 'project';
}

export function isAssetType(type: EntityType): boolean {
  return type === 'resource';
}

export function defaultAddGroupForContainer(entity: Pick<VaultEntity, 'subtype' | 'category'>): AddGroupId {
  if (entity.subtype === 'household_container' || entity.category === 'household') return 'household';
  if (entity.subtype === 'person_container' || entity.category === 'people') return 'people';
  if (entity.subtype === 'business_container' || entity.category === 'business') return 'business';
  return 'projects';
}

export function templateUsesWebFields(templateOrSubtype: EntityTemplate | string): boolean {
  const subtype = typeof templateOrSubtype === 'string' ? templateOrSubtype : templateOrSubtype.subtype;
  return [
    'website_asset', 'community_asset', 'social_channel_asset', 'repository_asset', 'database_asset',
    'advertising_asset', 'store_listing_asset', 'payment_product_asset', 'storage_asset', 'domain_hosting_account',
  ].includes(subtype);
}

export function isSecretField(definition: FieldDefinition): boolean {
  return definition.type === 'password' || definition.type === 'pin';
}

export function isRenewalField(definition: FieldDefinition): boolean {
  return definition.type === 'renewalDate';
}
