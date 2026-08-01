import { v4 as uuidv4 } from 'uuid';
import {
  EntityAttribute,
  EntityCredential,
  EntityIdentifier,
  EntityRelationship,
  EntityRenewal,
  EntitySummary,
  EntityTemplate,
  RelationshipType,
  VaultEntityBundle,
  isRenewalField,
  isSecretField,
} from './entityModel';

function isIdentifierKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes('accountnumber') ||
    lower.includes('reference') ||
    lower.includes('policy') ||
    lower.includes('merchant') ||
    lower.includes('projectid') ||
    lower.includes('externalid') ||
    lower.includes('sortcode') ||
    lower.includes('routing') ||
    lower.endsWith('id')
  );
}

export function emptyAttribute(order = 0): EntityAttribute {
  return {
    id: uuidv4(),
    key: `field_${uuidv4().slice(0, 8)}`,
    label: '',
    value: '',
    valueType: 'text',
    sensitive: false,
    searchable: true,
    sortOrder: order,
  };
}

export function emptyCredential(order = 0): EntityCredential {
  return {
    id: uuidv4(),
    type: 'login',
    label: 'Login',
    username: '',
    secret: '',
    notes: '',
    sortOrder: order,
  };
}

export function emptyIdentifier(order = 0): EntityIdentifier {
  return {
    id: uuidv4(),
    type: 'identifier',
    label: '',
    value: '',
    sensitive: false,
    searchable: true,
    sortOrder: order,
  };
}

export function emptyRenewal(): EntityRenewal {
  return {
    id: uuidv4(),
    label: 'Renewal',
    date: '',
    recurrence: '',
    notes: '',
  };
}

export function relationshipTypeFor(source: VaultEntityBundle, target: EntitySummary): RelationshipType {
  if (target.entityType === 'project') return 'used_by_project';
  if (source.entityType === 'account' && target.entityType === 'platform') return 'account_on_platform';
  if (source.entityType === 'account' && target.entityType === 'resource') return 'controls_resource';
  if (source.entityType === 'resource' && target.entityType === 'platform') return 'hosted_on';
  return 'related';
}

export function createRelationship(source: VaultEntityBundle, target: EntitySummary): EntityRelationship {
  return {
    id: uuidv4(),
    type: relationshipTypeFor(source, target),
    toEntityId: target.id,
    label: '',
    notes: '',
  };
}

export function createEntityFromTemplate(template: EntityTemplate): VaultEntityBundle {
  const now = new Date().toISOString();
  const attributes: EntityAttribute[] = [];
  const credentials: EntityCredential[] = [];
  const identifiers: EntityIdentifier[] = [];
  const renewals: EntityRenewal[] = [];

  template.fields.forEach((field, index) => {
    if (isSecretField(field)) {
      credentials.push({
        id: uuidv4(),
        type: field.type === 'pin' ? 'pin' : 'password',
        label: field.label,
        username: '',
        secret: '',
        notes: '',
        sortOrder: index,
      });
    } else if (isRenewalField(field)) {
      renewals.push({
        id: uuidv4(),
        label: field.label,
        date: '',
        recurrence: '',
        notes: '',
      });
    } else if (isIdentifierKey(field.key)) {
      identifiers.push({
        id: uuidv4(),
        type: field.key,
        label: field.label,
        value: '',
        sensitive: field.key.toLowerCase().includes('accountnumber'),
        searchable: true,
        sortOrder: index,
      });
    } else {
      attributes.push({
        id: uuidv4(),
        key: field.key,
        label: field.label,
        value: '',
        valueType:
          field.type === 'phone'
            ? 'phone'
            : field.type === 'date'
              ? 'date'
              : field.type === 'notes'
                ? 'notes'
                : field.type === 'number'
                  ? 'number'
                  : 'text',
        sensitive: false,
        searchable: true,
        sortOrder: index,
      });
    }
  });

  // All account templates need a place for the primary login even when the
  // original first-iteration template did not explicitly separate it.
  if (template.entityType === 'account' && credentials.length === 0) {
    credentials.push(emptyCredential(0));
  }

  return {
    id: uuidv4(),
    entityType: template.entityType,
    subtype: template.subtype,
    category: template.category,
    name: '',
    description: '',
    status: '',
    environment: '',
    website: '',
    loginUrl: '',
    notes: '',
    aliases: [],
    tags: [],
    favourite: false,
    createdAt: now,
    updatedAt: now,
    attributes,
    credentials,
    identifiers,
    renewals,
    relationships: [],
    incomingRelationships: [],
  };
}
