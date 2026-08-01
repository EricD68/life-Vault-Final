import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { vaultManager, userMessage } from '../vault/vaultManager';
import { useVault } from '../context/VaultContext';
import { androidButtonFontFamily } from '../utils/androidFontFix';
import {
  ADD_GROUPS,
  AddGroupId,
  EntityAttribute,
  EntityCredential,
  EntityIdentifier,
  EntityRelationship,
  EntityRenewal,
  EntitySummary,
  RELATIONSHIP_TYPES,
  VaultEntityBundle,
  entityKindLabel,
  entityTypeLabel,
  getEntityTemplate,
  isContainerType,
  relationshipLabel,
  templateUsesWebFields,
  templatesForAddGroup,
} from '../vault/entityModel';
import {
  createEntityFromTemplate,
  createRelationship,
  emptyAttribute,
  emptyCredential,
  emptyIdentifier,
  emptyRenewal,
} from '../vault/entityFactory';

const FIELD_TYPES: EntityAttribute['valueType'][] = ['text', 'url', 'email', 'phone', 'date', 'number', 'notes'];
const CREDENTIAL_TYPES: EntityCredential['type'][] = ['login', 'password', 'pin', 'totp', 'recovery_code', 'api_key', 'secret', 'security_answer', 'other'];

function Input({ label, value, onChangeText, placeholder, multiline = false, secure = false, keyboardType = 'default' }: any) {
  const { recordActivity } = useVault();
  const effectiveMultiline = multiline && !secure;
  const handleChange = (next: string) => {
    recordActivity();
    onChangeText(next);
  };
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[styles.input, effectiveMultiline && styles.multiline]}
        value={value}
        onChangeText={handleChange}
        placeholder={placeholder ?? label}
        placeholderTextColor="#8A90A0"
        multiline={effectiveMultiline}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        textContentType="none"
        contextMenuHidden={secure}
        importantForAutofill="noExcludeDescendants"
      />
    </View>
  );
}

type SectionProps = {
  title: string;
  subtitle?: string;
  onAdd?: () => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

function Section({ title, subtitle, onAdd, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Pressable style={styles.sectionToggle} onPress={() => setOpen((value) => !value)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
          </View>
          <Text style={styles.chevron}>{open ? '−' : '+'}</Text>
        </Pressable>
        {!!onAdd && (
          <Pressable
            style={styles.addSmall}
            onPress={() => {
              setOpen(true);
              onAdd();
            }}
          >
            <Text style={styles.addSmallText}>+ Add</Text>
          </Pressable>
        )}
      </View>
      {open && children}
    </View>
  );
}

function ChoiceChips({
  values,
  selected,
  onSelect,
  labelFor = (value: string) => value.replaceAll('_', ' '),
}: {
  values: readonly string[];
  selected: string;
  onSelect: (value: any) => void;
  labelFor?: (value: string) => string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.choiceScroll} contentContainerStyle={styles.choiceContent}>
      {values.map((value) => (
        <Pressable key={value} style={[styles.choiceChip, selected === value && styles.choiceChipSelected]} onPress={() => onSelect(value)}>
          <Text numberOfLines={1} style={[styles.choiceChipText, selected === value && styles.choiceChipTextSelected]}>{labelFor(value)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export default function AddEditItemScreen({ route, navigation }: any) {
  const { recordActivity, state } = useVault();
  const existingId: string | undefined = route.params?.entityId;
  const parentEntityId: string | undefined = route.params?.parentEntityId;
  const initialGroup: AddGroupId | null = route.params?.addGroup ?? null;
  const preferredTemplateId: string | undefined = route.params?.templateId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<AddGroupId | null>(initialGroup);
  const [bundle, setBundle] = useState<VaultEntityBundle | null>(null);
  const [allEntities, setAllEntities] = useState<EntitySummary[]>([]);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');

  useEffect(() => {
    Promise.all([
      existingId ? vaultManager.getEntity(existingId) : Promise.resolve(null),
      vaultManager.listEntities(),
    ]).then(([existing, entities]) => {
      setAllEntities(entities);
      if (existing) {
        setBundle(existing);
      } else if (preferredTemplateId) {
        const template = getEntityTemplate(preferredTemplateId);
        if (template) {
          const next = createEntityFromTemplate(template);
          const parent = parentEntityId ? entities.find((entity) => entity.id === parentEntityId) : undefined;
          if (parent) next.relationships = [createRelationship(next, parent)];
          setBundle(next);
          setSelectedGroup(template.groupId);
        }
      }
    }).catch((error) => Alert.alert('Could not load', userMessage(error))).finally(() => setLoading(false));
  }, [existingId, parentEntityId, preferredTemplateId]);

  const parentEntity = useMemo(
    () => parentEntityId ? allEntities.find((entity) => entity.id === parentEntityId) : undefined,
    [allEntities, parentEntityId],
  );

  const linkOptions = useMemo(() => {
    const q = linkSearch.trim().toLowerCase();
    const linked = new Set(bundle?.relationships.map((relationship) => relationship.toEntityId) ?? []);
    return allEntities.filter((entity) => {
      if (entity.id === bundle?.id || linked.has(entity.id)) return false;
      return !q || entity.name.toLowerCase().includes(q) || entity.tags.some((tag) => tag.toLowerCase().includes(q));
    });
  }, [allEntities, bundle, linkSearch]);

  function chooseTemplate(templateId: string) {
    const template = getEntityTemplate(templateId);
    if (!template) return;
    const next = createEntityFromTemplate(template);
    if (parentEntity) next.relationships = [createRelationship(next, parentEntity)];
    setBundle(next);
    setSelectedGroup(template.groupId);
  }

  function patch(patchValue: Partial<VaultEntityBundle>) {
    setBundle((current) => current ? { ...current, ...patchValue } : current);
  }

  function patchAttribute(id: string, value: Partial<EntityAttribute>) {
    if (!bundle) return;
    patch({ attributes: bundle.attributes.map((row) => row.id === id ? { ...row, ...value } : row) });
  }

  function patchCredential(id: string, value: Partial<EntityCredential>) {
    if (!bundle) return;
    patch({ credentials: bundle.credentials.map((row) => row.id === id ? { ...row, ...value } : row) });
  }

  function patchIdentifier(id: string, value: Partial<EntityIdentifier>) {
    if (!bundle) return;
    patch({ identifiers: bundle.identifiers.map((row) => row.id === id ? { ...row, ...value } : row) });
  }

  function patchRenewal(id: string, value: Partial<EntityRenewal>) {
    if (!bundle) return;
    patch({ renewals: bundle.renewals.map((row) => row.id === id ? { ...row, ...value } : row) });
  }

  function patchRelationship(id: string, value: Partial<EntityRelationship>) {
    if (!bundle) return;
    patch({ relationships: bundle.relationships.map((row) => row.id === id ? { ...row, ...value } : row) });
  }

  function addLink(target: EntitySummary) {
    if (!bundle) return;
    patch({ relationships: [...bundle.relationships, createRelationship(bundle, target)] });
    setLinkModalOpen(false);
    setLinkSearch('');
  }

  async function save() {
    if (!bundle) return;
    if (!bundle.name.trim()) {
      Alert.alert('Name required', 'Give this entry a clear name.');
      return;
    }
    const invalidRenewal = bundle.renewals.find((renewal) => renewal.date && !/^\d{4}-\d{2}-\d{2}$/.test(renewal.date));
    if (invalidRenewal) {
      Alert.alert('Invalid date', `${invalidRenewal.label || 'Renewal'} must use YYYY-MM-DD.`);
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await vaultManager.saveEntity({
        ...bundle,
        name: bundle.name.trim(),
        aliases: bundle.aliases.map((value) => value.trim()).filter(Boolean),
        tags: bundle.tags.map((value) => value.trim()).filter(Boolean),
        updatedAt: now,
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not save', userMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color="#4D6BFF" /></View>;

  if (!bundle) {
    if (!selectedGroup) {
      return (
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={styles.pageEyebrow}>NEW VAULT ENTRY</Text>
          <Text style={styles.pageTitle}>{parentEntity ? `Add to ${parentEntity.name}` : 'What are you adding?'}</Text>
          <Text style={styles.pageIntro}>Choose the real-world area first. The next screen shows individual options instead of generic database types.</Text>
          <View style={styles.groupGrid}>
            {ADD_GROUPS.filter((group) => !group.hiddenFromMain).map((group) => (
              <Pressable key={group.id} style={styles.groupCard} onPress={() => setSelectedGroup(group.id)}>
                <Text style={styles.groupCardTitle}>{group.label}</Text>
                <Text style={styles.groupCardText}>{group.description}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      );
    }

    const templates = templatesForAddGroup(selectedGroup, state.region ?? 'ALL');
    const group = ADD_GROUPS.find((entry) => entry.id === selectedGroup);
    return (
      <ScrollView contentContainerStyle={styles.page}>
        {!initialGroup && <Pressable onPress={() => setSelectedGroup(null)}><Text style={styles.backLink}>‹ Change category</Text></Pressable>}
        <Text style={styles.pageEyebrow}>{group?.shortLabel?.toUpperCase() ?? 'NEW ENTRY'}</Text>
        <Text style={styles.pageTitle}>{parentEntity ? `Add to ${parentEntity.name}` : group?.label}</Text>
        <Text style={styles.pageIntro}>Choose the specific item. Its form will start with the relevant fields, and you can still add custom details later.</Text>
        {templates.map((template) => (
          <Pressable key={template.id} style={styles.templateCard} onPress={() => chooseTemplate(template.id)}>
            <View style={styles.templateHeader}>
              <Text style={styles.templateTitle}>{template.label}</Text>
              <Text style={styles.templateType}>{entityKindLabel(template.entityType, template.subtype)}</Text>
            </View>
            <Text style={styles.templateText}>{template.description}</Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  const container = isContainerType(bundle.entityType);
  const showWebFields = !container && (templateUsesWebFields(bundle.subtype) || !!bundle.website || !!bundle.loginUrl);
  const hasLegacyContainerWeb = container && (!!bundle.website || !!bundle.loginUrl);

  return (
    <>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.pageEyebrow}>{existingId ? 'EDIT' : 'NEW'} {entityKindLabel(bundle.entityType, bundle.subtype).toUpperCase()}</Text>
        <Text style={styles.pageTitle}>{existingId ? bundle.name : 'Add the essential details'}</Text>
        {!!parentEntity && <Text style={styles.parentBanner}>This will be linked to {parentEntity.name} automatically.</Text>}

        <Section title="Essential details" subtitle={container ? 'A container only needs a clear identity. Add its assets and accounts after saving.' : 'The main information used to identify this item.'}>
          <Input label="Name *" value={bundle.name} onChangeText={(name: string) => patch({ name })} placeholder={container ? 'e.g. Guidance, Home or Compact Science' : 'A clear name for this item'} />
          <Input label="Description" value={bundle.description} onChangeText={(description: string) => patch({ description })} multiline />
          {showWebFields && <Input label="Public / website URL" value={bundle.website} onChangeText={(website: string) => patch({ website })} keyboardType="url" />}
          {showWebFields && <Input label="Login / admin URL" value={bundle.loginUrl} onChangeText={(loginUrl: string) => patch({ loginUrl })} keyboardType="url" />}
          {container && <Input label="Status" value={bundle.status} onChangeText={(status: string) => patch({ status })} placeholder="Active, paused, archived" />}
          {container && <Input label="Notes" value={bundle.notes} onChangeText={(notes: string) => patch({ notes })} multiline />}
          <Pressable style={styles.toggleRow} onPress={() => patch({ favourite: !bundle.favourite })}>
            <Text style={styles.toggleText}>{bundle.favourite ? '★ Pinned to the top' : '☆ Pin to the top'}</Text>
          </Pressable>
        </Section>

        <Section
          title={container ? 'Contents and links' : 'Belongs to / Related items'}
          subtitle={container ? 'Items linked to this container appear on its detail page. New assets are normally added from that page.' : 'Connect this item to a project, household, person, business, provider or another record.'}
          onAdd={() => setLinkModalOpen(true)}
          defaultOpen={bundle.relationships.length > 0}
        >
          {bundle.relationships.length === 0 && <Text style={styles.blankText}>No links yet.</Text>}
          {bundle.relationships.map((relationship) => {
            const target = allEntities.find((entity) => entity.id === relationship.toEntityId);
            return (
              <View key={relationship.id} style={styles.subCard}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subCardTitle}>{target?.name ?? 'Missing linked record'}</Text>
                    <Text style={styles.subCardMeta}>{target ? entityKindLabel(target.entityType, target.subtype) : ''}</Text>
                  </View>
                  <Pressable onPress={() => patch({ relationships: bundle.relationships.filter((row) => row.id !== relationship.id) })}>
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
                <ChoiceChips
                  values={RELATIONSHIP_TYPES.map((entry) => entry.id)}
                  selected={relationship.type}
                  onSelect={(type) => patchRelationship(relationship.id, { type })}
                  labelFor={(value) => relationshipLabel(value as any)}
                />
                <Input label="Link note" value={relationship.label} onChangeText={(label: string) => patchRelationship(relationship.id, { label })} placeholder="Optional description of this link" />
              </View>
            );
          })}
        </Section>

        {!container && (
          <Section
            title="Login and access"
            subtitle="Passwords, PINs, recovery codes and API keys are stored here rather than as a category of their own."
            onAdd={() => patch({ credentials: [...bundle.credentials, emptyCredential(bundle.credentials.length)] })}
            defaultOpen={bundle.credentials.length > 0}
          >
            {bundle.credentials.length === 0 && <Text style={styles.blankText}>No login or secret details.</Text>}
            {bundle.credentials.map((row) => (
              <View key={row.id} style={styles.subCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.subCardTitle}>{row.label || 'Credential'}</Text>
                  <Pressable onPress={() => patch({ credentials: bundle.credentials.filter((item) => item.id !== row.id) })}><Text style={styles.removeText}>Remove</Text></Pressable>
                </View>
                <ChoiceChips values={CREDENTIAL_TYPES} selected={row.type} onSelect={(type) => patchCredential(row.id, { type })} />
                <Input label="Label" value={row.label} onChangeText={(label: string) => patchCredential(row.id, { label })} placeholder="Primary login, API key, recovery codes" />
                <Input label="Username / email" value={row.username} onChangeText={(username: string) => patchCredential(row.id, { username })} />
                <Input label="Secret" value={row.secret} onChangeText={(secret: string) => patchCredential(row.id, { secret })} secure multiline={row.type === 'recovery_code'} />
                <Input label="Credential notes" value={row.notes} onChangeText={(notes: string) => patchCredential(row.id, { notes })} multiline />
              </View>
            ))}
          </Section>
        )}

        {!container && (
          <Section
            title="Account identifiers"
            subtitle="Account, customer, policy, membership, document and external IDs. Sensitive identifiers are excluded from search."
            onAdd={() => patch({ identifiers: [...bundle.identifiers, emptyIdentifier(bundle.identifiers.length)] })}
            defaultOpen={bundle.identifiers.length > 0}
          >
            {bundle.identifiers.length === 0 && <Text style={styles.blankText}>No identifiers.</Text>}
            {bundle.identifiers.map((row) => (
              <View key={row.id} style={styles.subCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.subCardTitle}>{row.label || 'Identifier'}</Text>
                  <Pressable onPress={() => patch({ identifiers: bundle.identifiers.filter((item) => item.id !== row.id) })}><Text style={styles.removeText}>Remove</Text></Pressable>
                </View>
                <Input label="Label" value={row.label} onChangeText={(label: string) => patchIdentifier(row.id, { label })} placeholder="Account number, policy number, document ID" />
                <Input label="Value" value={row.value} onChangeText={(value: string) => patchIdentifier(row.id, { value })} secure={row.sensitive} />
                <Input label="Identifier type" value={row.type} onChangeText={(type: string) => patchIdentifier(row.id, { type })} />
                <View style={styles.inlineToggles}>
                  <Pressable style={[styles.toggleChip, row.sensitive && styles.toggleChipOn]} onPress={() => patchIdentifier(row.id, { sensitive: !row.sensitive, searchable: row.sensitive ? row.searchable : false })}>
                    <Text style={[styles.toggleChipText, row.sensitive && styles.toggleChipTextOn]}>Sensitive</Text>
                  </Pressable>
                  <Pressable disabled={row.sensitive} style={[styles.toggleChip, row.searchable && !row.sensitive && styles.toggleChipOn, row.sensitive && styles.toggleChipDisabled]} onPress={() => patchIdentifier(row.id, { searchable: !row.searchable })}>
                    <Text style={[styles.toggleChipText, row.searchable && !row.sensitive && styles.toggleChipTextOn]}>Searchable</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </Section>
        )}

        {!container && (
          <Section
            title="Details"
            subtitle="Template-specific facts such as provider, address, phone, plan or equipment details."
            onAdd={() => patch({ attributes: [...bundle.attributes, emptyAttribute(bundle.attributes.length)] })}
            defaultOpen={bundle.attributes.length > 0}
          >
            {bundle.attributes.length === 0 && <Text style={styles.blankText}>No additional details.</Text>}
            {bundle.attributes.map((row) => (
              <View key={row.id} style={styles.subCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.subCardTitle}>{row.label || 'Field'}</Text>
                  <Pressable onPress={() => patch({ attributes: bundle.attributes.filter((item) => item.id !== row.id) })}><Text style={styles.removeText}>Remove</Text></Pressable>
                </View>
                <ChoiceChips values={FIELD_TYPES} selected={row.valueType} onSelect={(valueType) => patchAttribute(row.id, { valueType })} />
                <Input label="Label" value={row.label} onChangeText={(label: string) => patchAttribute(row.id, { label })} />
                <Input label="Value" value={row.value} onChangeText={(value: string) => patchAttribute(row.id, { value })} multiline={row.valueType === 'notes'} secure={row.sensitive} />
                <View style={styles.inlineToggles}>
                  <Pressable style={[styles.toggleChip, row.sensitive && styles.toggleChipOn]} onPress={() => patchAttribute(row.id, { sensitive: !row.sensitive, searchable: row.sensitive ? row.searchable : false })}>
                    <Text style={[styles.toggleChipText, row.sensitive && styles.toggleChipTextOn]}>Sensitive</Text>
                  </Pressable>
                  <Pressable disabled={row.sensitive} style={[styles.toggleChip, row.searchable && !row.sensitive && styles.toggleChipOn, row.sensitive && styles.toggleChipDisabled]} onPress={() => patchAttribute(row.id, { searchable: !row.searchable })}>
                    <Text style={[styles.toggleChipText, row.searchable && !row.sensitive && styles.toggleChipTextOn]}>Searchable</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </Section>
        )}

        {!container && (
          <Section
            title="Billing, renewals and important dates"
            subtitle="Contracts, domains, insurance, tariffs and subscriptions appear in the Renewals view."
            onAdd={() => patch({ renewals: [...bundle.renewals, emptyRenewal()] })}
            defaultOpen={bundle.renewals.length > 0}
          >
            {bundle.renewals.length === 0 && <Text style={styles.blankText}>No renewals or dated reminders.</Text>}
            {bundle.renewals.map((row) => (
              <View key={row.id} style={styles.subCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.subCardTitle}>{row.label || 'Renewal'}</Text>
                  <Pressable onPress={() => patch({ renewals: bundle.renewals.filter((item) => item.id !== row.id) })}><Text style={styles.removeText}>Remove</Text></Pressable>
                </View>
                <Input label="Label" value={row.label} onChangeText={(label: string) => patchRenewal(row.id, { label })} />
                <Input label="Date" value={row.date} onChangeText={(date: string) => patchRenewal(row.id, { date })} placeholder="YYYY-MM-DD" />
                <Input label="Recurrence" value={row.recurrence} onChangeText={(recurrence: string) => patchRenewal(row.id, { recurrence })} placeholder="Annual, monthly, one-off" />
                <Input label="Notes" value={row.notes} onChangeText={(notes: string) => patchRenewal(row.id, { notes })} multiline />
              </View>
            ))}
          </Section>
        )}

        <Section title="Advanced" subtitle="Aliases, tags, environment and extra notes." defaultOpen={false}>
          <Input label="Aliases" value={bundle.aliases.join(', ')} onChangeText={(value: string) => patch({ aliases: value.split(',') })} placeholder="Alternative names, comma separated" />
          <Input label="Tags" value={bundle.tags.join(', ')} onChangeText={(value: string) => patch({ tags: value.split(',') })} placeholder="billing, production, personal" />
          {!container && <Input label="Status" value={bundle.status} onChangeText={(status: string) => patch({ status })} placeholder="Active, archived, pending" />}
          {!container && <Input label="Environment" value={bundle.environment} onChangeText={(environment: string) => patch({ environment })} placeholder="Production, sandbox, personal" />}
          {!container && <Input label="Notes" value={bundle.notes} onChangeText={(notes: string) => patch({ notes })} multiline />}
          {hasLegacyContainerWeb && (
            <View style={styles.legacyBox}>
              <Text style={styles.legacyTitle}>Legacy project web details</Text>
              <Text style={styles.legacyText}>These values are preserved from the earlier structure. New projects should use a Website asset instead.</Text>
              <Input label="Legacy website" value={bundle.website} onChangeText={(website: string) => patch({ website })} keyboardType="url" />
              <Input label="Legacy login URL" value={bundle.loginUrl} onChangeText={(loginUrl: string) => patch({ loginUrl })} keyboardType="url" />
            </View>
          )}
        </Section>

        <Pressable style={styles.saveButton} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save encrypted entry</Text>}
        </Pressable>
      </ScrollView>

      <Modal visible={linkModalOpen} animationType="slide" onRequestClose={() => setLinkModalOpen(false)}>
        <View style={styles.modalPage}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Link another item</Text>
            <Pressable onPress={() => setLinkModalOpen(false)}><Text style={styles.closeText}>Close</Text></Pressable>
          </View>
          <TextInput
            style={styles.modalSearch}
            value={linkSearch}
            onChangeText={(value) => { recordActivity(); setLinkSearch(value); }}
            placeholder="Search containers, providers, accounts or assets"
            placeholderTextColor="#8A90A0"
            autoCorrect={false}
            autoCapitalize="none"
            importantForAutofill="no"
          />
          <FlatList
            data={linkOptions}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.blankText}>No available items. Save this one, then create the item you want to link.</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.linkOption} onPress={() => addLink(item)}>
                <Text style={styles.linkOptionTitle}>{item.name}</Text>
                <Text style={styles.linkOptionMeta}>{entityKindLabel(item.entityType, item.subtype)}{item.projectNames.length ? ` · ${item.projectNames.join(', ')}` : ''}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6FA' },
  page: { padding: 18, paddingTop: 28, paddingBottom: 80, backgroundColor: '#F5F6FA', flexGrow: 1 },
  pageEyebrow: { color: '#68718B', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  pageTitle: { color: '#171A23', fontSize: 27, fontWeight: '800', marginTop: 5, fontFamily: androidButtonFontFamily() },
  pageIntro: { color: '#687083', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  parentBanner: { backgroundColor: '#E9EDFF', color: '#3E55C7', borderRadius: 12, padding: 11, marginTop: 12, fontWeight: '700', fontSize: 12 },
  backLink: { color: '#4D6BFF', fontWeight: '700', marginBottom: 18 },
  groupGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  groupCard: { width: '48.5%', minHeight: 142, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E5EF', borderRadius: 18, padding: 15, marginBottom: 11 },
  groupCardTitle: { color: '#171A23', fontSize: 17, lineHeight: 21, fontWeight: '800' },
  groupCardText: { color: '#6D7484', fontSize: 12, lineHeight: 17, marginTop: 7 },
  templateCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E5EF', borderRadius: 15, padding: 15, marginBottom: 10 },
  templateHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  templateTitle: { color: '#171A23', fontSize: 16, fontWeight: '800', flex: 1, paddingRight: 10 },
  templateType: { color: '#5364B7', backgroundColor: '#EEF0FF', fontSize: 9, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  templateText: { color: '#707789', fontSize: 13, lineHeight: 18, marginTop: 5 },
  section: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E6EF', borderRadius: 18, padding: 15, marginTop: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  sectionToggle: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', paddingBottom: 11 },
  sectionTitle: { color: '#171A23', fontSize: 18, fontWeight: '800' },
  sectionSubtitle: { color: '#747B8C', fontSize: 12, lineHeight: 17, marginTop: 3, paddingRight: 8 },
  chevron: { color: '#6B7390', fontSize: 22, lineHeight: 24, fontWeight: '400', paddingLeft: 8 },
  addSmall: { backgroundColor: '#EDF0FF', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, marginLeft: 8 },
  addSmallText: { color: '#4D6BFF', fontSize: 12, fontWeight: '800' },
  inputGroup: { marginBottom: 11 },
  inputLabel: { color: '#565E70', fontSize: 12, fontWeight: '700', marginBottom: 5 },
  input: { backgroundColor: '#F6F7FA', color: '#171A23', borderRadius: 11, borderWidth: 1, borderColor: '#DFE3EB', paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  toggleRow: { paddingVertical: 7 },
  toggleText: { color: '#4D6BFF', fontWeight: '700' },
  subCard: { backgroundColor: '#FAFBFD', borderRadius: 13, borderWidth: 1, borderColor: '#E8EAF0', padding: 12, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  subCardTitle: { color: '#20242E', fontWeight: '700', fontSize: 14 },
  subCardMeta: { color: '#808697', fontSize: 11, marginTop: 2 },
  removeText: { color: '#C44545', fontSize: 12, fontWeight: '700' },
  blankText: { color: '#838A9A', fontSize: 13, lineHeight: 19 },
  choiceScroll: { marginBottom: 8, flexGrow: 0 },
  choiceContent: { paddingRight: 4 },
  choiceChip: { flexShrink: 0, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE0E9', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, marginRight: 7 },
  choiceChipSelected: { backgroundColor: '#252B3D', borderColor: '#252B3D' },
  choiceChipText: { color: '#666E80', fontSize: 10, textTransform: 'capitalize' },
  choiceChipTextSelected: { color: '#FFFFFF' },
  inlineToggles: { flexDirection: 'row', marginTop: 2 },
  toggleChip: { flexShrink: 0, borderWidth: 1, borderColor: '#DCE0E9', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginRight: 7 },
  toggleChipOn: { backgroundColor: '#EDF0FF', borderColor: '#AAB7FF' },
  toggleChipDisabled: { opacity: 0.4 },
  toggleChipText: { color: '#6B7280', fontSize: 11 },
  toggleChipTextOn: { color: '#4059D5', fontWeight: '700' },
  legacyBox: { backgroundColor: '#FFF8E8', borderWidth: 1, borderColor: '#F2D99B', borderRadius: 12, padding: 12 },
  legacyTitle: { color: '#6B4B00', fontWeight: '800', fontSize: 13 },
  legacyText: { color: '#7A6330', fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: 10 },
  saveButton: { backgroundColor: '#4D6BFF', borderRadius: 15, padding: 17, alignItems: 'center', marginTop: 20 },
  saveButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, fontFamily: androidButtonFontFamily() },
  modalPage: { flex: 1, backgroundColor: '#F5F6FA', paddingTop: 54, paddingHorizontal: 18 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 24, color: '#171A23', fontWeight: '800' },
  closeText: { color: '#4D6BFF', fontWeight: '700' },
  modalSearch: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E5EC', borderRadius: 12, padding: 13, marginTop: 16, marginBottom: 12, color: '#171A23' },
  linkOption: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E9EF', borderRadius: 13, padding: 14, marginBottom: 9 },
  linkOptionTitle: { color: '#171A23', fontSize: 16, fontWeight: '700' },
  linkOptionMeta: { color: '#737A8A', fontSize: 12, marginTop: 3 },
});
