import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { vaultManager, userMessage } from '../vault/vaultManager';
import { useVault } from '../context/VaultContext';
import { androidButtonFontFamily } from '../utils/androidFontFix';
import { CATEGORIES, CurrentCategoryId, categoryLabel, normaliseCategory } from '../vault/vaultModel';
import {
  ENTITY_TYPES,
  EntitySearchResult,
  EntitySummary,
  EntityType,
  entityKindLabel,
  entityTypeShortLabel,
} from '../vault/entityModel';

type DisplayEntity = EntitySummary | EntitySearchResult;
type TypeFilter = 'all' | EntityType;
type CategoryFilter = 'all' | CurrentCategoryId;

const TYPE_FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'all', label: 'All' },
  ...ENTITY_TYPES.map((type) => ({ id: type.id, label: type.shortLabel })),
];

const CATEGORY_FILTERS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'Everything' },
  ...CATEGORIES.map((category) => ({ id: category.id, label: category.shortLabel })),
];

const CATEGORY_ACCENTS: Record<CurrentCategoryId, string> = {
  projects: '#6677D8',
  money: '#2F8B70',
  household: '#C57942',
  digital: '#4B77B8',
  identity: '#7663A9',
  health: '#B45D72',
  people: '#A16F45',
  vehicles: '#527D8A',
  subscriptions: '#8A65A7',
  business: '#546172',
  custom: '#777F8D',
};

export default function VaultListScreen({ navigation }: any) {
  const { recordActivity } = useVault();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [items, setItems] = useState<DisplayEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    try {
      setLoadError('');
      const next = query.trim()
        ? await vaultManager.searchEntities(query)
        : await vaultManager.listEntities();
      if (generation === loadGeneration.current) setItems(next);
    } catch (error) {
      if (generation === loadGeneration.current) {
        setItems([]);
        setLoadError(userMessage(error) || 'The encrypted entries could not be loaded.');
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [query]);

  useFocusEffect(useCallback(() => {
    const timer = setTimeout(() => { void load(); }, query.trim() ? 220 : 0);
    return () => {
      clearTimeout(timer);
      loadGeneration.current += 1;
    };
  }, [load, query]));

  const displayedItems = useMemo(() => items.filter((item) => (
    (typeFilter === 'all' || item.entityType === typeFilter)
      && (categoryFilter === 'all' || normaliseCategory(item.category) === categoryFilter)
  )), [items, typeFilter, categoryFilter]);

  const summary = useMemo(() => ({
    containers: items.filter((item) => item.entityType === 'project').length,
    assets: items.filter((item) => item.entityType === 'resource').length,
    renewals: items.reduce((total, item) => total + item.renewalCount, 0),
  }), [items]);

  function selectCategory(category: CategoryFilter) {
    recordActivity();
    setCategoryFilter(category);
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>ENCRYPTED ORGANISER</Text>
            <Text style={styles.title}>Life Vault</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => navigation.navigate('Renewals')}><Text style={styles.headerLink}>Renewals</Text></Pressable>
            <Pressable onPress={() => navigation.navigate('Settings')}><Text style={styles.headerLink}>Settings</Text></Pressable>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}><Text style={styles.summaryNumber}>{summary.containers}</Text><Text style={styles.summaryLabel}>Containers</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryNumber}>{summary.assets}</Text><Text style={styles.summaryLabel}>Assets</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryNumber}>{summary.renewals}</Text><Text style={styles.summaryLabel}>Renewals</Text></View>
        </View>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search Guidance, Netflix, a provider or account ID"
        placeholderTextColor="#7B8190"
        value={query}
        onChangeText={(value) => { recordActivity(); setQuery(value); }}
        autoCorrect={false}
        autoCapitalize="none"
        importantForAutofill="no"
      />
      <Text style={styles.searchHint}>Search follows links between containers, assets, providers and accounts. Secrets are never searched.</Text>
      {!!loadError && <Text style={styles.loadError}>{loadError}</Text>}

      <Text style={styles.filterHeading}>AREA</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryContent}>
        {CATEGORY_FILTERS.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.categoryChip, categoryFilter === item.id && styles.categoryChipSelected]}
            onPress={() => selectCategory(item.id)}
          >
            <Text numberOfLines={1} style={[styles.categoryChipText, categoryFilter === item.id && styles.categoryChipTextSelected]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.filterHeading}>TYPE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll} contentContainerStyle={styles.typeContent}>
        {TYPE_FILTERS.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.typeChip, typeFilter === item.id && styles.typeChipSelected]}
            onPress={() => setTypeFilter(item.id)}
          >
            <Text numberOfLines={1} style={[styles.typeChipText, typeFilter === item.id && styles.typeChipTextSelected]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? <ActivityIndicator color="#4D6BFF" style={{ marginTop: 44 }} /> : (
        <FlatList
          data={displayedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{query.trim() ? 'Nothing connected to that search' : 'No entries in this view'}</Text>
              <Text style={styles.emptyText}>Use the + button to add a project, household, account, asset, subscription or record.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const category = normaliseCategory(item.category);
            return (
              <Pressable style={styles.itemCard} onPress={() => navigation.navigate('ItemDetail', { entityId: item.id })}>
                <View style={[styles.itemAccent, { backgroundColor: CATEGORY_ACCENTS[category] }]} />
                <View style={styles.itemBody}>
                  <View style={styles.itemTopRow}>
                    <View style={styles.itemTextBlock}>
                      <View style={styles.metaRow}>
                        <Text style={styles.typeLabel}>{entityKindLabel(item.entityType, item.subtype).toUpperCase()}</Text>
                        <Text style={styles.categoryLabel}>{categoryLabel(item.category, true).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.itemName}>{item.name}</Text>
                      {!!item.description && <Text numberOfLines={2} style={styles.itemDescription}>{item.description}</Text>}
                    </View>
                    {item.favourite && <Text style={styles.pin}>★</Text>}
                  </View>

                  {item.projectNames?.length > 0 && item.entityType !== 'project' && (
                    <Text style={styles.connectionText}>In: {item.projectNames.join(' · ')}</Text>
                  )}
                  {item.platformNames?.length > 0 && item.entityType !== 'platform' && (
                    <Text style={styles.connectionText}>Provider: {item.platformNames.join(' · ')}</Text>
                  )}
                  {'connectedVia' in item && item.connectedVia?.length > 0 && !item.directMatch && (
                    <Text style={styles.matchText}>Connected through {item.connectedVia.join(', ')}</Text>
                  )}
                  {'matchReasons' in item && item.matchReasons?.length > 0 && (
                    <Text style={styles.matchText}>Matched: {item.matchReasons.join(', ')}</Text>
                  )}

                  <View style={styles.countRow}>
                    {item.credentialCount > 0 && <Text style={styles.countPill}>{item.credentialCount} access</Text>}
                    {item.identifierCount > 0 && <Text style={styles.countPill}>{item.identifierCount} ID{item.identifierCount === 1 ? '' : 's'}</Text>}
                    {item.relationshipCount > 0 && <Text style={styles.countPill}>{item.relationshipCount} link{item.relationshipCount === 1 ? '' : 's'}</Text>}
                    {item.renewalCount > 0 && <Text style={styles.countPill}>{item.renewalCount} renewal{item.renewalCount === 1 ? '' : 's'}</Text>}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable style={styles.fab} onPress={() => navigation.navigate('AddEdit')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA', paddingTop: 48, paddingHorizontal: 16 },
  hero: { backgroundColor: '#20263A', borderRadius: 22, padding: 18, paddingBottom: 15 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  eyebrow: { color: '#AEB8DE', fontSize: 10, letterSpacing: 1.6, fontWeight: '800' },
  title: { fontSize: 30, fontWeight: '800', color: '#FFFFFF', fontFamily: androidButtonFontFamily() },
  headerActions: { flexDirection: 'row', paddingBottom: 5 },
  headerLink: { color: '#D9DEFF', fontSize: 13, marginLeft: 15, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', marginTop: 16 },
  summaryCard: { flex: 1, backgroundColor: '#2D354E', borderRadius: 13, paddingVertical: 10, paddingHorizontal: 11, marginRight: 8 },
  summaryNumber: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  summaryLabel: { color: '#BFC7E6', fontSize: 10, fontWeight: '700', marginTop: 1 },
  search: { backgroundColor: '#FFFFFF', color: '#171A23', borderRadius: 15, paddingHorizontal: 15, paddingVertical: 14, marginTop: 14, fontSize: 15, borderWidth: 1, borderColor: '#E1E5EE' },
  loadError: { color: '#B42318', fontSize: 12, lineHeight: 17, marginTop: 7 },
  searchHint: { color: '#7B8190', fontSize: 11, lineHeight: 16, marginTop: 6, marginHorizontal: 2 },
  filterHeading: { color: '#858C9C', fontSize: 9, fontWeight: '800', letterSpacing: 1.3, marginTop: 11, marginLeft: 2 },
  categoryScroll: { flexGrow: 0, marginTop: 5, maxHeight: 39 },
  categoryContent: { paddingRight: 18, alignItems: 'center' },
  categoryChip: { flexShrink: 0, minWidth: 50, alignItems: 'center', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, marginRight: 7, backgroundColor: '#E9ECF2', borderWidth: 1, borderColor: '#E0E4EC' },
  categoryChipSelected: { backgroundColor: '#DDE3FF', borderColor: '#BFC9FF' },
  categoryChipText: { color: '#626A7B', fontSize: 12, fontWeight: '700' },
  categoryChipTextSelected: { color: '#4059D5' },
  typeScroll: { flexGrow: 0, marginTop: 5, maxHeight: 39 },
  typeContent: { paddingRight: 18, alignItems: 'center' },
  typeChip: { flexShrink: 0, minWidth: 44, alignItems: 'center', borderWidth: 1, borderColor: '#DCE1EA', backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, marginRight: 7 },
  typeChipSelected: { backgroundColor: '#20263A', borderColor: '#20263A' },
  typeChipText: { color: '#646B7D', fontSize: 12, fontWeight: '700' },
  typeChipTextSelected: { color: '#FFFFFF' },
  listContent: { paddingTop: 12, paddingBottom: 110 },
  itemCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 17, marginBottom: 11, borderWidth: 1, borderColor: '#E4E8EF', overflow: 'hidden' },
  itemAccent: { width: 5 },
  itemBody: { flex: 1, padding: 15 },
  itemTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemTextBlock: { flex: 1, paddingRight: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  typeLabel: { color: '#737B91', fontSize: 9, letterSpacing: 1.05, fontWeight: '800' },
  categoryLabel: { color: '#9A7A4C', fontSize: 9, letterSpacing: 0.8, fontWeight: '800', marginLeft: 9 },
  itemName: { color: '#171A23', fontSize: 18, fontWeight: '800', marginTop: 4 },
  itemDescription: { color: '#6B7280', fontSize: 13, lineHeight: 18, marginTop: 5 },
  pin: { color: '#C08019', fontSize: 18 },
  connectionText: { color: '#4B5563', fontSize: 12, marginTop: 9 },
  matchText: { color: '#4D6BFF', fontSize: 11, marginTop: 6 },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  countPill: { color: '#626A7B', backgroundColor: '#F1F3F7', fontSize: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, marginRight: 6, marginBottom: 4 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 17, padding: 24, marginTop: 10, borderWidth: 1, borderColor: '#E4E8EF' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#171A23' },
  emptyText: { color: '#707789', lineHeight: 20, marginTop: 8 },
  fab: { position: 'absolute', right: 20, bottom: 28, width: 60, height: 60, borderRadius: 21, backgroundColor: '#4D6BFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 7 },
  fabText: { color: '#FFFFFF', fontSize: 31, marginTop: -2 },
});
