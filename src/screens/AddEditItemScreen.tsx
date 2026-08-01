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
  EntityAttribute,
  EntityCredential,
  EntityIdentifier,
  EntityRelationship,
  EntityRenewal,
  EntitySummary,
  EntityType,
  ENTITY_TEMPLATES,
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  VaultEntityBundle,
  entityTypeLabel,
  getEntityTemplate,
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

function Section({ title, subtitle, onAdd, children }: any) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
        </View>
        {!!onAdd && <Pressable style={styles.addSmall} onPress={onAdd}><Text style={styles.addSmallText}>+ Add</Text></Pressable>}
      </View>
      {children}
    </View>
  );
}

function ChoiceChips({ values, selected, onSelect }: { values: readonly string[]; selected: string; onSelect: (value: any) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
      {values.map((value) => (
        <Pressable key={value} style={[styles.choiceChip, selected === value && styles.choiceChipSelected]} onPress={() => onSelect(value)}>
          <Text style={[styles.choiceChipText, selected === value && styles.choiceChipTextSelected]}>{value.replaceAll('_', ' ')}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export default function AddEditItemScreen({ route, navigation }: any) {
  const { recordActivity } = useVault();
  const existingId: string | undefined = route.params?.entityId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState<EntityType | null>(null);
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
        setSelectedType(existing.entityType);
      }
    }).catch((error) => Alert.alert('Could not load', userMessage(error))).finally(() => setLoading(false));
  }, [existingId]);

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
    setBundle(createEntityFromTemplate(template));
    setSelectedType(template.entityType);
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
      Alert.alert('Name required', 'Give this project, platform, account or resource a clear name.');
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
    if (!selectedType) {
      return (
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={styles.pageEyebrow}>NEW VAULT ENTRY</Text>
          <Text style={styles.pageTitle}>What are you organising?</Text>
          <Text style={styles.pageIntro}>This choice defines how the record links and appears in ecosystem search. It does not lock the visual design.</Text>
          {ENTITY_TYPES.map((type) => (
            <Pressable key={type.id} style={styles.typeCard} onPress={() => setSelectedType(type.id)}>
              <Text style={styles.typeCardTitle}>{type.label}</Text>
              <Text style={styles.typeCardText}>{type.description}</Text>
            </Pressable>
          ))}
        </ScrollView>
      );
    }

    const templates = ENTITY_TEMPLATES.filter((template) => template.entityType === selectedType);
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable onPress={() => setSelectedType(null)}><Text style={styles.backLink}>‹ Change type</Text></Pressable>
        <Text style={styles.pageTitle}>Choose a starting template</Text>
        <Text style={styles.pageIntro}>Templates only pre-fill useful fields. You can add or remove fields, identifiers, credentials and links.</Text>
        {templates.map((template) => (
          <Pressable key={template.id} style={styles.templateCard} onPress={() => chooseTemplate(template.id)}>
            <Text style={styles.templateTitle}>{template.label}</Text>
            <Text style={styles.templateText}>{template.description}</Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.pageEyebrow}>{existingId ? 'EDIT' : 'NEW'} {entityTypeLabel(bundle.entityType).toUpperCase()}</Text>
        <Text style={styles.pageTitle}>{existingId ? bundle.name : 'Add the core details'}</Text>

        <Section title="Identity" subtitle="The information used for navigation and project-wide search.">
          <Input label="Name *" value={bundle.name} onChangeText={(name: string) => patch({ name })} placeholder="e.g. Guidance Paddle production" />
          <Input label="Description" value={bundle.description} onChangeText={(description: string) => patch({ description })} multiline />
          <Input label="Aliases" value={bundle.aliases.join(', ')} onChangeText={(value: string) => patch({ aliases: value.split(',') })} placeholder="Alternative names, comma separated" />
          <Input label="Tags" value={bundle.tags.join(', ')} onChangeText={(value: string) => patch({ tags: value.split(',') })} placeholder="billing, production, social" />
          <Input label="Status" value={bundle.status} onChangeText={(status: string) => patch({ status })} placeholder="Active, archived, pending" />
          <Input label="Environment" value={bundle.environment} onChangeText={(environment: string) => patch({ environment })} placeholder="Production, sandbox, personal" />
          <Input label="Website" value={bundle.website} onChangeText={(website: string) => patch({ website })} keyboardType="url" />
          <Input label="Login URL" value={bundle.loginUrl} onChangeText={(loginUrl: string) => patch({ loginUrl })} keyboardType="url" />
          <Input label="Notes" value={bundle.notes} onChangeText={(notes: string) => patch({ notes })} multiline />
          <Pressable style={styles.toggleRow} onPress={() => patch({ favourite: !bundle.favourite })}>
            <Text style={styles.toggleText}>{bundle.favourite ? '★ Pinned to the top' : '☆ Pin to the top'}</Text>
          </Pressable>
        </Section>

        <Section
          title="Links"
          subtitle="Connect this to projects, platforms, accounts and resources. These links power searches such as Guidance."
          onAdd={() => setLinkModalOpen(true)}
        >
          {bundle.relationships.length === 0 && <Text style={styles.blankText}>No links yet.</Text>}
          {bundle.relationships.map((relationship) => {
            const target = allEntities.find((entity) => entity.id === relationship.toEntityId);
            return (
              <View key={relationship.id} style={styles.subCard}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subCardTitle}>{target?.name ?? 'Missing linked record'}</Text>
                    <Text style={styles.subCardMeta}>{target ? entityTypeLabel(target.entityType) : ''}</Text>
                  </View>
                  <Pressable onPress={() => patch({ relationships: bundle.relationships.filter((row) => row.id !== relationship.id) })}>
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
                <ChoiceChips values={RELATIONSHIP_TYPES.map((entry) => entry.id)} selected={relationship.type} onSelect={(type) => patchRelationship(relationship.id, { type })} />
                <Input label="Link note" value={relationship.label} onChangeText={(label: string) => patchRelationship(relationship.id, { label })} placeholder="Optional description of this link" />
              </View>
            );
          })}
        </Section>

        <Section title="Identifiers" subtitle="Account, customer, merchant, project and external IDs. Searchable values can find this record." onAdd={() => patch({ identifiers: [...bundle.identifiers, emptyIdentifier(bundle.identifiers.length)] })}>
          {bundle.identifiers.map((row) => (
            <View key={row.id} style={styles.subCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.subCardTitle}>Identifier</Text>
                <Pressable onPress={() => patch({ identifiers: bundle.identifiers.filter((item) => item.id !== row.id) })}><Text style={styles.removeText}>Remove</Text></Pressable>
              </View>
              <Input label="Label" value={row.label} onChangeText={(label: string) => patchIdentifier(row.id, { label })} placeholder="Merchant ID, account number, project ID" />
              <Input label="Value" value={row.value} onChangeText={(value: string) => patchIdentifier(row.id, { value })} secure={row.sensitive} />
              <Input label="Identifier type" value={row.type} onChangeText={(type: string) => patchIdentifier(row.id, { type })} />
              <View style={styles.inlineToggles}>
                <Pressable style={[styles.toggleChip, row.sensitive && styles.toggleChipOn]} onPress={() => patchIdentifier(row.id, { sensitive: !row.sensitive })}>
                  <Text style={[styles.toggleChipText, row.sensitive && styles.toggleChipTextOn]}>Sensitive</Text>
                </Pressable>
                <Pressable style={[styles.toggleChip, row.searchable && styles.toggleChipOn]} onPress={() => patchIdentifier(row.id, { searchable: !row.searchable })}>
                  <Text style={[styles.toggleChipText, row.searchable && styles.toggleChipTextOn]}>Searchable</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </Section>

        <Section title="Credentials" subtitle="Multiple logins, passwords, PINs, recovery codes and API keys can belong to one account." onAdd={() => patch({ credentials: [...bundle.credentials, emptyCredential(bundle.credentials.length)] })}>
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

        <Section title="Additional fields" subtitle="Searchable non-secret facts such as support URLs, phone numbers, plan names or email addresses." onAdd={() => patch({ attributes: [...bundle.attributes, emptyAttribute(bundle.attributes.length)] })}>
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

        <Section title="Renewals and dates" subtitle="Contracts, domains, insurance, tariffs and subscriptions appear in the Renewals view." onAdd={() => patch({ renewals: [...bundle.renewals, emptyRenewal()] })}>
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

        <Pressable style={styles.saveButton} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save encrypted record</Text>}
        </Pressable>
      </ScrollView>

      <Modal visible={linkModalOpen} animationType="slide" onRequestClose={() => setLinkModalOpen(false)}>
        <View style={styles.modalPage}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Link another record</Text>
            <Pressable onPress={() => setLinkModalOpen(false)}><Text style={styles.closeText}>Close</Text></Pressable>
          </View>
          <TextInput
            style={styles.modalSearch}
            value={linkSearch}
            onChangeText={(value) => { recordActivity(); setLinkSearch(value); }}
            placeholder="Search projects, platforms or accounts"
            placeholderTextColor="#8A90A0"
            autoCorrect={false}
            autoCapitalize="none"
            importantForAutofill="no"
          />
          <FlatList
            data={linkOptions}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.blankText}>No available records. Save this one, then create the record you want to link.</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.linkOption} onPress={() => addLink(item)}>
                <Text style={styles.linkOptionTitle}>{item.name}</Text>
                <Text style={styles.linkOptionMeta}>{entityTypeLabel(item.entityType)}{item.projectNames.length ? ` · ${item.projectNames.join(', ')}` : ''}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FB' },
  page: { padding: 18, paddingTop: 28, paddingBottom: 80, backgroundColor: '#F7F8FB', flexGrow: 1 },
  pageEyebrow: { color: '#6E7690', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  pageTitle: { color: '#171A23', fontSize: 26, fontWeight: '800', marginTop: 5, fontFamily: androidButtonFontFamily() },
  pageIntro: { color: '#687083', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  backLink: { color: '#4D6BFF', fontWeight: '600', marginBottom: 18 },
  typeCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E7EF', borderRadius: 16, padding: 17, marginBottom: 11 },
  typeCardTitle: { color: '#171A23', fontSize: 18, fontWeight: '700' },
  typeCardText: { color: '#6D7484', lineHeight: 19, marginTop: 5 },
  templateCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E7EF', borderRadius: 14, padding: 15, marginBottom: 10 },
  templateTitle: { color: '#171A23', fontSize: 16, fontWeight: '700' },
  templateText: { color: '#707789', fontSize: 13, lineHeight: 18, marginTop: 4 },
  section: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E8EF', borderRadius: 17, padding: 15, marginTop: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 13 },
  sectionTitle: { color: '#171A23', fontSize: 18, fontWeight: '700' },
  sectionSubtitle: { color: '#747B8C', fontSize: 12, lineHeight: 17, marginTop: 3, paddingRight: 8 },
  addSmall: { backgroundColor: '#EDF0FF', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  addSmallText: { color: '#4D6BFF', fontSize: 12, fontWeight: '700' },
  inputGroup: { marginBottom: 11 },
  inputLabel: { color: '#565E70', fontSize: 12, fontWeight: '600', marginBottom: 5 },
  input: { backgroundColor: '#F6F7FA', color: '#171A23', borderRadius: 11, borderWidth: 1, borderColor: '#E0E3EA', paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  toggleRow: { paddingVertical: 7 },
  toggleText: { color: '#4D6BFF', fontWeight: '600' },
  subCard: { backgroundColor: '#FAFBFD', borderRadius: 13, borderWidth: 1, borderColor: '#E8EAF0', padding: 12, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  subCardTitle: { color: '#20242E', fontWeight: '700', fontSize: 14 },
  subCardMeta: { color: '#808697', fontSize: 11, marginTop: 2 },
  removeText: { color: '#C44545', fontSize: 12, fontWeight: '600' },
  blankText: { color: '#838A9A', fontSize: 13, lineHeight: 19 },
  choiceChip: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE0E9', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6, marginRight: 6 },
  choiceChipSelected: { backgroundColor: '#252B3D', borderColor: '#252B3D' },
  choiceChipText: { color: '#666E80', fontSize: 10, textTransform: 'capitalize' },
  choiceChipTextSelected: { color: '#FFFFFF' },
  inlineToggles: { flexDirection: 'row', marginTop: 2 },
  toggleChip: { borderWidth: 1, borderColor: '#DCE0E9', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginRight: 7 },
  toggleChipOn: { backgroundColor: '#EDF0FF', borderColor: '#AAB7FF' },
  toggleChipDisabled: { opacity: 0.4 },
  toggleChipText: { color: '#6B7280', fontSize: 11 },
  toggleChipTextOn: { color: '#4059D5', fontWeight: '700' },
  saveButton: { backgroundColor: '#4D6BFF', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 20 },
  saveButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, fontFamily: androidButtonFontFamily() },
  modalPage: { flex: 1, backgroundColor: '#F7F8FB', paddingTop: 54, paddingHorizontal: 18 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 24, color: '#171A23', fontWeight: '800' },
  closeText: { color: '#4D6BFF', fontWeight: '700' },
  modalSearch: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E5EC', borderRadius: 12, padding: 13, marginTop: 16, marginBottom: 12, color: '#171A23' },
  linkOption: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E9EF', borderRadius: 13, padding: 14, marginBottom: 9 },
  linkOptionTitle: { color: '#171A23', fontSize: 16, fontWeight: '700' },
  linkOptionMeta: { color: '#737A8A', fontSize: 12, marginTop: 3 },
});
