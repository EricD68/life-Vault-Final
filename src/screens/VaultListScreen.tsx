import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { vaultManager, userMessage } from '../vault/vaultManager';
import { androidButtonFontFamily } from '../utils/androidFontFix';
import { EntitySearchResult, EntitySummary, EntityType, ENTITY_TYPES, VaultEntity, entityTypeLabel } from '../vault/entityModel';
import { CATEGORIES } from '../vault/vaultModel';
import { useVault } from '../context/VaultContext';

type TypeFilter = EntityType | 'all';
type CategoryFilter = VaultEntity['category'] | 'all';

const CATEGORY_FILTERS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All categories' },
  { id: 'projects', label: 'Projects' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'resources', label: 'Resources' },
  ...CATEGORIES.map((category) => ({ id: category.id, label: category.label })),
];

type DisplayEntity = EntitySummary & Partial<Pick<EntitySearchResult, 'directMatch' | 'matchReasons' | 'connectionDepth' | 'connectedVia'>>;

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
      const type = typeFilter === 'all' ? undefined : typeFilter;
      const next = query.trim()
        ? await vaultManager.searchEntities(query, type)
        : await vaultManager.listEntities(type);
      if (generation === loadGeneration.current) setItems(next);
    } catch (error) {
      if (generation === loadGeneration.current) {
        setItems([]);
        setLoadError(userMessage(error) || 'The encrypted records could not be loaded.');
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [query, typeFilter]);

  useFocusEffect(useCallback(() => {
    const timer = setTimeout(() => { void load(); }, query.trim() ? 220 : 0);
    return () => {
      clearTimeout(timer);
      loadGeneration.current += 1;
    };
  }, [load, query]));

  const displayedItems = useMemo(() => (
    categoryFilter === 'all' ? items : items.filter((item) => item.category === categoryFilter)
  ), [items, categoryFilter]);

  return (
    <View style={styles.container}>
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

      <TextInput
        style={styles.search}
        placeholder="Search Guidance, Paddle, an email or account ID"
        placeholderTextColor="#7B8190"
        value={query}
        onChangeText={(value) => { recordActivity(); setQuery(value); }}
        autoCorrect={false}
        autoCapitalize="none"
        importantForAutofill="no"
      />
      <Text style={styles.searchHint}>Search follows links between projects, platforms, accounts and resources. Secrets are never searched.</Text>
      {!!loadError && <Text style={styles.loadError}>{loadError}</Text>}

      <FlatList
        horizontal
        data={[{ id: 'all', label: 'Everything' }, ...ENTITY_TYPES]}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.chip, typeFilter === item.id && styles.chipSelected]}
            onPress={() => setTypeFilter(item.id as TypeFilter)}
          >
            <Text style={[styles.chipText, typeFilter === item.id && styles.chipTextSelected]}>{item.label}</Text>
          </Pressable>
        )}
      />

      <FlatList
        horizontal
        data={CATEGORY_FILTERS}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        style={styles.categoryRow}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.categoryChip, categoryFilter === item.id && styles.categoryChipSelected]}
            onPress={() => setCategoryFilter(item.id)}
          >
            <Text style={[styles.categoryChipText, categoryFilter === item.id && styles.categoryChipTextSelected]}>{item.label}</Text>
          </Pressable>
        )}
      />

      {loading ? <ActivityIndicator color="#4D6BFF" style={{ marginTop: 44 }} /> : (
        <FlatList
          data={displayedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{query.trim() ? 'Nothing connected to that search' : 'Your vault is empty'}</Text>
              <Text style={styles.emptyText}>Add a project, platform, account or resource. Link them once and project-wide search will work automatically.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.itemCard} onPress={() => navigation.navigate('ItemDetail', { entityId: item.id })}>
              <View style={styles.itemTopRow}>
                <View style={styles.itemTextBlock}>
                  <Text style={styles.typeLabel}>{entityTypeLabel(item.entityType).toUpperCase()}</Text>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {!!item.description && <Text numberOfLines={2} style={styles.itemDescription}>{item.description}</Text>}
                </View>
                {item.favourite && <Text style={styles.pin}>★</Text>}
              </View>

              {item.projectNames?.length > 0 && (
                <Text style={styles.connectionText}>Projects: {item.projectNames.join(' · ')}</Text>
              )}
              {item.platformNames?.length > 0 && item.entityType !== 'platform' && (
                <Text style={styles.connectionText}>Platforms: {item.platformNames.join(' · ')}</Text>
              )}
              {item.connectedVia && item.connectedVia.length > 0 && !item.directMatch && (
                <Text style={styles.matchText}>Connected through {item.connectedVia.join(', ')}</Text>
              )}
              {item.matchReasons && item.matchReasons.length > 0 && (
                <Text style={styles.matchText}>Matched: {item.matchReasons.join(', ')}</Text>
              )}

              <View style={styles.countRow}>
                {item.credentialCount > 0 && <Text style={styles.countPill}>{item.credentialCount} login{item.credentialCount === 1 ? '' : 's'}</Text>}
                {item.identifierCount > 0 && <Text style={styles.countPill}>{item.identifierCount} ID{item.identifierCount === 1 ? '' : 's'}</Text>}
                {item.relationshipCount > 0 && <Text style={styles.countPill}>{item.relationshipCount} link{item.relationshipCount === 1 ? '' : 's'}</Text>}
                {item.renewalCount > 0 && <Text style={styles.countPill}>{item.renewalCount} renewal{item.renewalCount === 1 ? '' : 's'}</Text>}
              </View>
            </Pressable>
          )}
        />
      )}

      <Pressable style={styles.fab} onPress={() => navigation.navigate('AddEdit')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FB', paddingTop: 54, paddingHorizontal: 18 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  eyebrow: { color: '#6F7690', fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  title: { fontSize: 30, fontWeight: '800', color: '#171A23', fontFamily: androidButtonFontFamily() },
  headerActions: { flexDirection: 'row', paddingBottom: 5 },
  headerLink: { color: '#4D6BFF', fontSize: 14, marginLeft: 16, fontWeight: '600' },
  search: { backgroundColor: '#FFFFFF', color: '#171A23', borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, marginTop: 18, fontSize: 15, borderWidth: 1, borderColor: '#E4E7EF' },
  loadError: { color: '#B42318', fontSize: 12, lineHeight: 17, marginTop: 7 },
  searchHint: { color: '#7B8190', fontSize: 11, lineHeight: 16, marginTop: 6, marginHorizontal: 2 },
  chipRow: { marginTop: 14, maxHeight: 42 },
  chip: { borderWidth: 1, borderColor: '#DDE1EB', backgroundColor: '#FFFFFF', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9, marginRight: 8 },
  chipSelected: { backgroundColor: '#20263A', borderColor: '#20263A' },
  chipText: { color: '#646B7D', fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: '#FFFFFF' },
  categoryRow: { marginTop: 8, maxHeight: 34 },
  categoryChip: { borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6, marginRight: 7, backgroundColor: '#ECEFF4' },
  categoryChipSelected: { backgroundColor: '#DDE3FF' },
  categoryChipText: { color: '#6A7182', fontSize: 11, fontWeight: '600' },
  categoryChipTextSelected: { color: '#4059D5' },
  listContent: { paddingTop: 12, paddingBottom: 110 },
  itemCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 11, borderWidth: 1, borderColor: '#E8EAF0' },
  itemTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemTextBlock: { flex: 1, paddingRight: 12 },
  typeLabel: { color: '#798097', fontSize: 9, letterSpacing: 1.2, fontWeight: '800' },
  itemName: { color: '#171A23', fontSize: 18, fontWeight: '700', marginTop: 3 },
  itemDescription: { color: '#6B7280', fontSize: 13, lineHeight: 18, marginTop: 5 },
  pin: { color: '#C08019', fontSize: 18 },
  connectionText: { color: '#4B5563', fontSize: 12, marginTop: 10 },
  matchText: { color: '#4D6BFF', fontSize: 11, marginTop: 6 },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 11 },
  countPill: { color: '#626A7B', backgroundColor: '#F1F3F7', fontSize: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, marginRight: 6, marginBottom: 4 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, marginTop: 20, borderWidth: 1, borderColor: '#E8EAF0' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#171A23' },
  emptyText: { color: '#707789', lineHeight: 20, marginTop: 8 },
  fab: { position: 'absolute', right: 20, bottom: 30, width: 58, height: 58, borderRadius: 20, backgroundColor: '#4D6BFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 9, elevation: 6 },
  fabText: { color: '#FFFFFF', fontSize: 30, marginTop: -2 },
});
