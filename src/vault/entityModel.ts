import { ACCOUNT_TEMPLATES, CategoryId, FieldDefinition } from './vaultModel';

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
  category: CategoryId | 'projects' | 'platforms' | 'resources';
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

export const ENTITY_TYPES: { id: EntityType; label: string; description: string }[] = [
  { id: 'project', label: 'Project / App', description: 'Guidance, SpeechMe or another product or area of work' },
  { id: 'platform', label: 'Platform / Provider', description: 'Paddle, Meta, Pinterest, Barclays or a utility supplier' },
  { id: 'account', label: 'Account', description: 'One specific login, bank account, utility account or platform account' },
  { id: 'resource', label: 'Resource / Asset', description: 'Domain, app, page, repository, project, ad account or product' },
  { id: 'record', label: 'Other record', description: 'Identity, health, household or other standalone information' },
];

export const RELATIONSHIP_TYPES: { id: RelationshipType; label: string }[] = [
  { id: 'used_by_project', label: 'Used by project' },
  { id: 'account_on_platform', label: 'Account on platform' },
  { id: 'controls_resource', label: 'Controls resource' },
  { id: 'paid_from', label: 'Paid from / paid into' },
  { id: 'uses_email', label: 'Uses email account' },
  { id: 'hosted_on', label: 'Hosted on' },
  { id: 'domain_points_to', label: 'Domain points to' },
  { id: 'login_owned_by', label: 'Login owned by' },
  { id: 'production_of', label: 'Production version of' },
  { id: 'sandbox_of', label: 'Sandbox / test version of' },
  { id: 'related', label: 'Related to' },
];

export interface EntityTemplate {
  id: string;
  label: string;
  entityType: EntityType;
  subtype: string;
  category: VaultEntity['category'];
  description: string;
  fields: FieldDefinition[];
}

const CORE_TEMPLATES: EntityTemplate[] = [
  {
    id: 'project_app',
    label: 'Project / App',
    entityType: 'project',
    subtype: 'project_app',
    category: 'projects',
    description: 'A product, app, website or business project such as Guidance or SpeechMe.',
    fields: [],
  },
  {
    id: 'platform_provider',
    label: 'Platform / Provider',
    entityType: 'platform',
    subtype: 'platform_provider',
    category: 'platforms',
    description: 'The provider itself, such as Paddle, Meta, Pinterest, Supabase or British Gas.',
    fields: [],
  },
  {
    id: 'platform_account',
    label: 'Platform Account',
    entityType: 'account',
    subtype: 'platform_account',
    category: 'business',
    description: 'One specific account on a platform. Multiple accounts can link to the same platform.',
    fields: [
      { key: 'accountId', label: 'Account / customer ID', type: 'text' },
      { key: 'ownerEmail', label: 'Owner email', type: 'text' },
      { key: 'supportUrl', label: 'Support URL', type: 'text' },
    ],
  },
  {
    id: 'digital_resource',
    label: 'Digital Resource / Asset',
    entityType: 'resource',
    subtype: 'digital_resource',
    category: 'resources',
    description: 'A domain, page, repository, Supabase project, ad account, Paddle product or similar asset.',
    fields: [
      { key: 'externalId', label: 'External ID', type: 'text' },
      { key: 'dashboardUrl', label: 'Dashboard URL', type: 'text' },
    ],
  },
  {
    id: 'custom_record',
    label: 'Custom Record',
    entityType: 'record',
    subtype: 'custom_record',
    category: 'custom',
    description: 'A standalone personal, household, identity or other record.',
    fields: [],
  },
];

const LEGACY_ACCOUNT_TEMPLATES: EntityTemplate[] = ACCOUNT_TEMPLATES
  .filter((template) => template.id !== 'custom')
  .map((template) => ({
    id: `account_${template.id}`,
    label: template.label,
    entityType: 'account' as const,
    subtype: template.id,
    category: template.category,
    description: `Account template: ${template.label}`,
    fields: template.fields,
  }));

export const ENTITY_TEMPLATES: EntityTemplate[] = [...CORE_TEMPLATES, ...LEGACY_ACCOUNT_TEMPLATES];

export function getEntityTemplate(id: string): EntityTemplate | undefined {
  return ENTITY_TEMPLATES.find((template) => template.id === id);
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

export function isSecretField(definition: FieldDefinition): boolean {
  return definition.type === 'password' || definition.type === 'pin';
}

export function isRenewalField(definition: FieldDefinition): boolean {
  return definition.type === 'renewalDate';
}
