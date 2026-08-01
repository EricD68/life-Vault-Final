import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { vaultManager, userMessage } from '../vault/vaultManager';
import { androidButtonFontFamily } from '../utils/androidFontFix';
import {
  ConnectedEntity,
  EntityRelationship,
  EntitySummary,
  VaultEntityBundle,
  entityTypeLabel,
  relationshipLabel,
} from '../vault/entityModel';

const CLIPBOARD_CLEAR_SECONDS = 30;

type RelationWithDisplay = EntityRelationship & {
  fromEntityId?: string;
  linkedEntityName?: string;
  linkedEntityType?: string;
};

function Section({ title, children }: any) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
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
      setLoadError(userMessage(error) || 'The encrypted record could not be loaded.');
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
    Alert.alert('Delete this record?', 'Its outgoing links and stored details will be removed. Linked records remain.', [
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

  if (loading) return <View style={styles.center}><ActivityIndicator color="#4D6BFF" /></View>;
  if (!entity) return <View style={styles.center}><Text style={styles.title}>{loadError || 'Record not found'}</Text></View>;

  const outgoing = entity.relationships as RelationWithDisplay[];
  const incoming = (entity.incomingRelationships ?? []) as RelationWithDisplay[];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>{entityTypeLabel(entity.entityType).toUpperCase()}</Text>
      <Text style={styles.title}>{entity.name}</Text>
      {!!entity.description && <Text style={styles.description}>{entity.description}</Text>}
      <View style={styles.badges}>
        {!!entity.status && <Text style={styles.badge}>{entity.status}</Text>}
        {!!entity.environment && <Text style={styles.badge}>{entity.environment}</Text>}
        {entity.favourite && <Text style={styles.badge}>★ Pinned</Text>}
      </View>

      {(entity.website || entity.loginUrl || entity.aliases.length || entity.tags.length || entity.notes) && (
        <Section title="Overview">
          {!!entity.website && <View style={styles.detailRow}><Text style={styles.label}>Website</Text><PlainValue value={entity.website} /></View>}
          {!!entity.loginUrl && <View style={styles.detailRow}><Text style={styles.label}>Login URL</Text><PlainValue value={entity.loginUrl} /></View>}
          {entity.aliases.length > 0 && <View style={styles.detailRow}><Text style={styles.label}>Aliases</Text><Text style={styles.valueText}>{entity.aliases.join(' · ')}</Text></View>}
          {entity.tags.length > 0 && <View style={styles.detailRow}><Text style={styles.label}>Tags</Text><Text style={styles.valueText}>{entity.tags.join(' · ')}</Text></View>}
          {!!entity.notes && <View style={styles.detailRow}><Text style={styles.label}>Notes</Text><Text style={styles.valueText}>{entity.notes}</Text></View>}
        </Section>
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
        <Section title="Credentials">
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
        <Section title="Renewals">
          {entity.renewals.map((renewal) => (
            <View key={renewal.id} style={styles.detailRow}>
              <Text style={styles.label}>{renewal.label}</Text>
              <Text style={styles.valueText}>{renewal.date}{renewal.recurrence ? ` · ${renewal.recurrence}` : ''}</Text>
              {!!renewal.notes && <Text style={styles.secondaryText}>{renewal.notes}</Text>}
            </View>
          ))}
        </Section>
      )}

      {(outgoing.length > 0 || incoming.length > 0) && (
        <Section title="Direct links">
          {outgoing.map((relation) => (
            <Pressable key={relation.id} style={styles.linkCard} onPress={() => openLinked(relation)}>
              <Text style={styles.linkTitle}>{relation.linkedEntityName ?? relation.toEntityId}</Text>
              <Text style={styles.linkMeta}>{relationshipLabel(relation.type)}{relation.label ? ` · ${relation.label}` : ''}</Text>
            </Pressable>
          ))}
          {incoming.map((relation) => (
            <Pressable key={relation.id} style={styles.linkCard} onPress={() => openLinked(relation, true)}>
              <Text style={styles.linkTitle}>{relation.linkedEntityName ?? relation.fromEntityId}</Text>
              <Text style={styles.linkMeta}>Links here via {relationshipLabel(relation.type)}</Text>
            </Pressable>
          ))}
        </Section>
      )}

      {(entity.entityType === 'project' || entity.entityType === 'platform') && connected.length > 0 && (
        <Section title="Connected ecosystem">
          {(Object.entries(connectedGroups) as Array<[string, ConnectedEntity[]]>).map(([type, records]) => (
            <View key={type} style={{ marginBottom: 12 }}>
              <Text style={styles.groupTitle}>{entityTypeLabel(type as any)}s</Text>
              {records.map((record) => (
                <Pressable key={record.id} style={styles.linkCard} onPress={() => navigation.push('ItemDetail', { entityId: record.id })}>
                  <Text style={styles.linkTitle}>{record.name}</Text>
                  <Text style={styles.linkMeta}>{record.connectionDepth === 1 ? 'Directly linked' : `${record.connectionDepth} links away`}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </Section>
      )}

      <Pressable style={styles.editButton} onPress={() => navigation.navigate('AddEdit', { entityId: entity.id })}>
        <Text style={styles.editButtonText}>Edit record and links</Text>
      </Pressable>
      <Pressable style={styles.deleteButton} onPress={confirmDelete}><Text style={styles.deleteButtonText}>Delete record</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FB' },
  page: { padding: 18, paddingTop: 28, paddingBottom: 80, backgroundColor: '#F7F8FB', flexGrow: 1 },
  eyebrow: { color: '#70788E', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { fontSize: 28, fontWeight: '800', color: '#171A23', marginTop: 4, fontFamily: androidButtonFontFamily() },
  description: { color: '#687083', fontSize: 14, lineHeight: 21, marginTop: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  badge: { backgroundColor: '#EDEFFF', color: '#465DD3', fontSize: 11, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, marginRight: 7, marginBottom: 5 },
  section: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E8EF', borderRadius: 17, padding: 15, marginTop: 14 },
  sectionTitle: { color: '#171A23', fontSize: 18, fontWeight: '700', marginBottom: 10 },
  detailRow: { borderTopWidth: 1, borderTopColor: '#EEF0F4', paddingVertical: 10 },
  label: { color: '#6F7686', fontSize: 11, fontWeight: '600', marginBottom: 4 },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  valueText: { color: '#1F2430', fontSize: 14, lineHeight: 20, flex: 1, paddingRight: 10 },
  secondaryText: { color: '#747B8B', fontSize: 12, lineHeight: 17, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 13 },
  actionText: { color: '#4D6BFF', fontSize: 12, fontWeight: '700' },
  credentialCard: { backgroundColor: '#FAFBFD', borderRadius: 12, padding: 11, marginBottom: 9, borderWidth: 1, borderColor: '#E9EBF0' },
  credentialTitle: { color: '#20242E', fontWeight: '700', fontSize: 15 },
  credentialType: { color: '#7C8291', fontSize: 10, textTransform: 'uppercase', marginTop: 2, marginBottom: 4 },
  linkCard: { backgroundColor: '#F7F8FB', borderRadius: 12, borderWidth: 1, borderColor: '#E6E8EF', padding: 12, marginBottom: 8 },
  linkTitle: { color: '#1E2330', fontWeight: '700', fontSize: 14 },
  linkMeta: { color: '#6F7687', fontSize: 11, marginTop: 3 },
  groupTitle: { color: '#626A7D', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 },
  editButton: { backgroundColor: '#4D6BFF', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 20 },
  editButtonText: { color: '#FFFFFF', fontWeight: '800', fontFamily: androidButtonFontFamily() },
  deleteButton: { padding: 15, alignItems: 'center', marginTop: 4 },
  deleteButtonText: { color: '#C44545', fontWeight: '700' },
});
