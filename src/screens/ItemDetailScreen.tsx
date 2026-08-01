import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { vaultManager, userMessage } from '../vault/vaultManager';
import { androidButtonFontFamily } from '../utils/androidFontFix';
import { categoryLabel } from '../vault/vaultModel';
import {
  AddGroupId,
  ConnectedEntity,
  EntityRelationship,
  EntitySummary,
  VaultEntityBundle,
  defaultAddGroupForContainer,
  entityKindLabel,
  entityTypeLabel,
  isContainerType,
  relationshipLabel,
} from '../vault/entityModel';

const CLIPBOARD_CLEAR_SECONDS = 30;

type RelationWithDisplay = EntityRelationship & {
  fromEntityId?: string;
  linkedEntityName?: string;
  linkedEntityType?: string;
};

function Section({ title, actionLabel, onAction, children }: any) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!onAction && <Pressable style={styles.sectionAction} onPress={onAction}><Text style={styles.sectionActionText}>{actionLabel}</Text></Pressable>}
      </View>
      {children}
    </View>
  );
}

export default function ItemDetailScreen({ route, navigation }: any) {
  const entityId: string = route.params.entityId;
  const [entity, setEntity] = useState<VaultEntityBundle | null>(null);
  const [connected, setConnected] = useState<ConnectedEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useFocusEffect(useCallback(() => {
    setLoading(true);
    setLoadError('');
    Promise.all([
      vaultManager.getEntity(entityId),
      vaultManager.connectedEntities(entityId, 3),
    ]).then(([record, ecosystem]) => {
      setEntity(record);
      setConnected(ecosystem);
    }).catch((error) => {
      setEntity(null);
      setConnected([]);
      setLoadError(userMessage(error) || 'The encrypted entry could not be loaded.');
    }).finally(() => setLoading(false));
    return () => {
      setRevealed({});
      setEntity(null);
      setConnected([]);
    };
  }, [entityId]));

  const connectedGroups = useMemo(() => {
    const result: Record<string, ConnectedEntity[]> = {};
    connected.forEach((item) => {
      (result[item.entityType] ??= []).push(item);
    });
    return result;
  }, [connected]);

  const connectedById = useMemo(() => new Map(connected.map((item) => [item.id, item])), [connected]);

  async function copyValue(value: string) {
    try {
      await vaultManager.copySensitive(value, CLIPBOARD_CLEAR_SECONDS);
      Alert.alert('Copied', 'Android will treat this as sensitive clipboard content and clear it after 30 seconds if unchanged.');
    } catch (error) {
      Alert.alert('Could not copy', userMessage(error));
    }
  }

  function confirmDelete() {
    if (!entity) return;
    Alert.alert('Delete this entry?', 'Its outgoing links and stored details will be removed. Linked entries remain.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await vaultManager.deleteEntity(entity.id);
            navigation.goBack();
          } catch (error) {
            Alert.alert('Could not delete', userMessage(error));
          }
        },
      },
    ]);
  }

  function SecretValue({ id, value }: { id: string; value: string }) {
    const visible = !!revealed[id];
    return (
      <View style={styles.valueRow}>
        <Text style={styles.valueText}>{visible ? value : '••••••••••'}</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => setRevealed((previous) => ({ ...previous, [id]: !visible }))}><Text style={styles.actionText}>{visible ? 'Hide' : 'Show'}</Text></Pressable>
          <Pressable onPress={() => copyValue(value)}><Text style={styles.actionText}>Copy</Text></Pressable>
        </View>
      </View>
    );
  }

  function PlainValue({ value }: { value: string }) {
    return (
      <View style={styles.valueRow}>
        <Text style={styles.valueText}>{value}</Text>
        <Pressable onPress={() => copyValue(value)}><Text style={styles.actionText}>Copy</Text></Pressable>
      </View>
    );
  }

  function openLinked(relation: RelationWithDisplay, incoming = false) {
    const id = incoming ? relation.fromEntityId : relation.toEntityId;
    if (id) navigation.push('ItemDetail', { entityId: id });
  }

  function openSummary(summary: Pick<EntitySummary, 'id'>) {
    navigation.push('ItemDetail', { entityId: summary.id });
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color="#4D6BFF" /></View>;
  if (!entity) return <View style={styles.center}><Text style={styles.title}>{loadError || 'Entry not found'}</Text></View>;

  const outgoing = entity.relationships as RelationWithDisplay[];
  const incoming = (entity.incomingRelationships ?? []) as RelationWithDisplay[];
  const container = isContainerType(entity.entityType);

  const directIds = new Set<string>();
  outgoing.forEach((relation) => directIds.add(relation.toEntityId));
  incoming.forEach((relation) => relation.fromEntityId && directIds.add(relation.fromEntityId));
  const directEntries = Array.from(directIds).map((id) => connectedById.get(id)).filter(Boolean) as ConnectedEntity[];
  const directAssets = directEntries.filter((item) => item.entityType === 'resource');
  const directAccounts = directEntries.filter((item) => item.entityType === 'account' || item.entityType === 'platform');
  const directRecords = directEntries.filter((item) => item.entityType === 'record');
  const directContainers = directEntries.filter((item) => item.entityType === 'project');

  const containerDefaultGroup = defaultAddGroupForContainer(entity);
  const isProjectContainer = containerDefaultGroup === 'projects';
  const isHouseholdContainer = containerDefaultGroup === 'household';
  const isPersonContainer = containerDefaultGroup === 'people';
  const isBusinessContainer = containerDefaultGroup === 'business';

  const primaryContainerAction: { label: string; group?: AddGroupId } = isProjectContainer
    ? { label: '+ Add asset', group: 'project_assets' }
    : isHouseholdContainer
      ? { label: '+ Add household item', group: 'household' }
      : isPersonContainer
        ? { label: '+ Add family item', group: 'people' }
        : { label: '+ Add business item', group: 'business' };

  const secondaryContainerAction: { label: string; group?: AddGroupId } = isProjectContainer
    ? { label: '+ Add linked item' }
    : isHouseholdContainer
      ? { label: '+ Add subscription', group: 'subscriptions' }
      : isPersonContainer
        ? { label: '+ Add health item', group: 'health' }
        : { label: '+ Add asset', group: 'project_assets' };

  const assetAddGroup: AddGroupId = (isProjectContainer || isBusinessContainer) ? 'project_assets' : containerDefaultGroup;

  function addToContainer(group?: AddGroupId) {
    navigation.navigate('AddEdit', { parentEntityId: entityId, addGroup: group });
  }

  const renderDirectEntries = (items: ConnectedEntity[], empty: string) => (
    items.length ? items.map((item) => (
      <Pressable key={item.id} style={styles.linkCard} onPress={() => openSummary(item)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>{item.name}</Text>
          <Text style={styles.linkMeta}>{entityKindLabel(item.entityType, item.subtype)} · {categoryLabel(item.category)}</Text>
        </View>
        <Text style={styles.linkArrow}>›</Text>
      </Pressable>
    )) : <Text style={styles.emptySectionText}>{empty}</Text>
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>{entityKindLabel(entity.entityType, entity.subtype).toUpperCase()}</Text>
      <Text style={styles.title}>{entity.name}</Text>
      {!!entity.description && <Text style={styles.description}>{entity.description}</Text>}
      <View style={styles.badges}>
        <Text style={styles.categoryBadge}>{categoryLabel(entity.category)}</Text>
        {!!entity.status && <Text style={styles.badge}>{entity.status}</Text>}
        {!!entity.environment && <Text style={styles.badge}>{entity.environment}</Text>}
        {entity.favourite && <Text style={styles.badge}>★ Pinned</Text>}
      </View>

      {container && (
        <View style={styles.containerActions}>
          <Pressable style={styles.primaryAction} onPress={() => addToContainer(primaryContainerAction.group)}>
            <Text numberOfLines={2} style={styles.primaryActionText}>{primaryContainerAction.label}</Text>
          </Pressable>
          <Pressable style={styles.secondaryAction} onPress={() => addToContainer(secondaryContainerAction.group)}>
            <Text numberOfLines={2} style={styles.secondaryActionText}>{secondaryContainerAction.label}</Text>
          </Pressable>
        </View>
      )}

      {(entity.website || entity.loginUrl || entity.aliases.length || entity.tags.length || entity.notes) && (
        <Section title={container && (entity.website || entity.loginUrl) ? 'Overview and legacy web details' : 'Overview'}>
          {!!entity.website && <View style={styles.detailRow}><Text style={styles.label}>Website</Text><PlainValue value={entity.website} /></View>}
          {!!entity.loginUrl && <View style={styles.detailRow}><Text style={styles.label}>Login URL</Text><PlainValue value={entity.loginUrl} /></View>}
          {entity.aliases.length > 0 && <View style={styles.detailRow}><Text style={styles.label}>Aliases</Text><Text style={styles.valueText}>{entity.aliases.join(' · ')}</Text></View>}
          {entity.tags.length > 0 && <View style={styles.detailRow}><Text style={styles.label}>Tags</Text><Text style={styles.valueText}>{entity.tags.join(' · ')}</Text></View>}
          {!!entity.notes && <View style={styles.detailRow}><Text style={styles.label}>Notes</Text><Text style={styles.valueText}>{entity.notes}</Text></View>}
        </Section>
      )}

      {container && (
        <>
          <Section title="Assets" actionLabel="+ Add" onAction={() => addToContainer(assetAddGroup)}>
            {renderDirectEntries(
              directAssets,
              isProjectContainer
                ? 'No assets yet. Add the app, website, community, domain or other owned assets here.'
                : 'No linked physical or digital assets yet.',
            )}
          </Section>
          <Section title="Accounts and services" actionLabel="+ Add" onAction={() => addToContainer(isProjectContainer ? undefined : containerDefaultGroup)}>
            {renderDirectEntries(directAccounts, 'No linked accounts or providers yet.')}
          </Section>
          <Section title="Documents and records" actionLabel="+ Add" onAction={() => addToContainer(isProjectContainer ? undefined : containerDefaultGroup)}>
            {renderDirectEntries(directRecords, 'No linked documents or records yet.')}
          </Section>
          {directContainers.length > 0 && <Section title="Related containers">{renderDirectEntries(directContainers, '')}</Section>}
        </>
      )}

      {entity.identifiers.length > 0 && (
        <Section title="Identifiers">
          {entity.identifiers.map((identifier) => (
            <View key={identifier.id} style={styles.detailRow}>
              <Text style={styles.label}>{identifier.label}</Text>
              {identifier.sensitive ? <SecretValue id={identifier.id} value={identifier.value} /> : <PlainValue value={identifier.value} />}
            </View>
          ))}
        </Section>
      )}

      {entity.credentials.length > 0 && (
        <Section title="Login and access">
          {entity.credentials.map((credential) => (
            <View key={credential.id} style={styles.credentialCard}>
              <Text style={styles.credentialTitle}>{credential.label}</Text>
              <Text style={styles.credentialType}>{credential.type.replaceAll('_', ' ')}</Text>
              {!!credential.username && <View style={styles.detailRow}><Text style={styles.label}>Username / email</Text><PlainValue value={credential.username} /></View>}
              {!!credential.secret && <View style={styles.detailRow}><Text style={styles.label}>Secret</Text><SecretValue id={credential.id} value={credential.secret} /></View>}
              {!!credential.notes && <View style={styles.detailRow}><Text style={styles.label}>Notes</Text><Text style={styles.valueText}>{credential.notes}</Text></View>}
            </View>
          ))}
        </Section>
      )}

      {entity.attributes.length > 0 && (
        <Section title="Details">
          {entity.attributes.map((attribute) => (
            <View key={attribute.id} style={styles.detailRow}>
              <Text style={styles.label}>{attribute.label}</Text>
              {attribute.sensitive ? <SecretValue id={attribute.id} value={attribute.value} /> : <PlainValue value={attribute.value} />}
            </View>
          ))}
        </Section>
      )}

      {entity.renewals.length > 0 && (
        <Section title="Renewals and dates">
          {entity.renewals.map((renewal) => (
            <View key={renewal.id} style={styles.detailRow}>
              <Text style={styles.label}>{renewal.label}</Text>
              <Text style={styles.valueText}>{renewal.date}{renewal.recurrence ? ` · ${renewal.recurrence}` : ''}</Text>
              {!!renewal.notes && <Text style={styles.secondaryText}>{renewal.notes}</Text>}
            </View>
          ))}
        </Section>
      )}

      {!container && (outgoing.length > 0 || incoming.length > 0) && (
        <Section title="Links">
          {outgoing.map((relation) => (
            <Pressable key={relation.id} style={styles.linkCard} onPress={() => openLinked(relation)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>{relation.linkedEntityName ?? relation.toEntityId}</Text>
                <Text style={styles.linkMeta}>{relationshipLabel(relation.type)}{relation.label ? ` · ${relation.label}` : ''}</Text>
              </View>
              <Text style={styles.linkArrow}>›</Text>
            </Pressable>
          ))}
          {incoming.map((relation) => (
            <Pressable key={relation.id} style={styles.linkCard} onPress={() => openLinked(relation, true)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>{relation.linkedEntityName ?? relation.fromEntityId}</Text>
                <Text style={styles.linkMeta}>Links here via {relationshipLabel(relation.type)}</Text>
              </View>
              <Text style={styles.linkArrow}>›</Text>
            </Pressable>
          ))}
        </Section>
      )}

      {!container && (entity.entityType === 'platform') && connected.length > 0 && (
        <Section title="Connected items">
          {(Object.entries(connectedGroups) as Array<[string, ConnectedEntity[]]>).map(([type, records]) => (
            <View key={type} style={{ marginBottom: 12 }}>
              <Text style={styles.groupTitle}>{entityTypeLabel(type as any)}s</Text>
              {records.map((record) => (
                <Pressable key={record.id} style={styles.linkCard} onPress={() => navigation.push('ItemDetail', { entityId: record.id })}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkTitle}>{record.name}</Text>
                    <Text style={styles.linkMeta}>{record.connectionDepth === 1 ? 'Directly linked' : `${record.connectionDepth} links away`}</Text>
                  </View>
                  <Text style={styles.linkArrow}>›</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </Section>
      )}

      <Pressable style={styles.editButton} onPress={() => navigation.navigate('AddEdit', { entityId: entity.id })}>
        <Text style={styles.editButtonText}>Edit entry and links</Text>
      </Pressable>
      <Pressable style={styles.deleteButton} onPress={confirmDelete}><Text style={styles.deleteButtonText}>Delete entry</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6FA' },
  page: { padding: 18, paddingTop: 28, paddingBottom: 80, backgroundColor: '#F5F6FA', flexGrow: 1 },
  eyebrow: { color: '#70788E', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 29, fontWeight: '800', color: '#171A23', marginTop: 4, fontFamily: androidButtonFontFamily() },
  description: { color: '#687083', fontSize: 14, lineHeight: 21, marginTop: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  badge: { backgroundColor: '#EDEFFF', color: '#465DD3', fontSize: 11, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, marginRight: 7, marginBottom: 5 },
  categoryBadge: { backgroundColor: '#20263A', color: '#FFFFFF', fontSize: 11, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, marginRight: 7, marginBottom: 5 },
  containerActions: { flexDirection: 'row', marginTop: 12 },
  primaryAction: { flex: 1, backgroundColor: '#4D6BFF', borderRadius: 13, paddingVertical: 13, alignItems: 'center', marginRight: 7 },
  primaryActionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  secondaryAction: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CCD3E4', borderRadius: 13, paddingVertical: 13, alignItems: 'center', marginLeft: 7 },
  secondaryActionText: { color: '#4059D5', fontWeight: '800', fontSize: 13 },
  section: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E7EF', borderRadius: 18, padding: 15, marginTop: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: '#171A23', fontSize: 18, fontWeight: '800', flex: 1 },
  sectionAction: { backgroundColor: '#EDF0FF', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, marginLeft: 8 },
  sectionActionText: { color: '#4D6BFF', fontSize: 11, fontWeight: '800' },
  detailRow: { borderTopWidth: 1, borderTopColor: '#EEF0F4', paddingVertical: 10 },
  label: { color: '#6F7686', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  valueText: { color: '#1F2430', fontSize: 14, lineHeight: 20, flex: 1, paddingRight: 10 },
  secondaryText: { color: '#747B8B', fontSize: 12, lineHeight: 17, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 13 },
  actionText: { color: '#4D6BFF', fontSize: 12, fontWeight: '700' },
  credentialCard: { backgroundColor: '#FAFBFD', borderRadius: 12, padding: 11, marginBottom: 9, borderWidth: 1, borderColor: '#E9EBF0' },
  credentialTitle: { color: '#20242E', fontWeight: '700', fontSize: 15 },
  credentialType: { color: '#7C8291', fontSize: 10, textTransform: 'uppercase', marginTop: 2, marginBottom: 4 },
  linkCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7F8FB', borderRadius: 12, borderWidth: 1, borderColor: '#E6E8EF', padding: 12, marginBottom: 8 },
  linkTitle: { color: '#1E2330', fontWeight: '700', fontSize: 14 },
  linkMeta: { color: '#6F7687', fontSize: 11, marginTop: 3 },
  linkArrow: { color: '#8990A0', fontSize: 23, marginLeft: 10 },
  emptySectionText: { color: '#7C8393', fontSize: 13, lineHeight: 19, paddingVertical: 4 },
  groupTitle: { color: '#626A7D', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 },
  editButton: { backgroundColor: '#4D6BFF', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 20 },
  editButtonText: { color: '#FFFFFF', fontWeight: '800', fontFamily: androidButtonFontFamily() },
  deleteButton: { padding: 15, alignItems: 'center', marginTop: 4 },
  deleteButtonText: { color: '#C44545', fontWeight: '700' },
});
