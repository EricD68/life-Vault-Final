import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { vaultManager, userMessage } from '../vault/vaultManager';
import { RenewalSummary } from '../vault/entityModel';

function dueLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

export default function RenewalsScreen({ navigation }: any) {
  const [items, setItems] = useState<RenewalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useFocusEffect(useCallback(() => {
    setLoading(true);
    setLoadError('');
    vaultManager.listRenewals()
      .then(setItems)
      .catch((error) => { setItems([]); setLoadError(userMessage(error) || 'Renewals could not be loaded.'); })
      .finally(() => setLoading(false));
  }, []));

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Renewals</Text>
      <Text style={styles.intro}>Contracts, domains, insurance, tariffs and subscriptions from every linked record.</Text>
      {!!loadError && <Text style={styles.error}>{loadError}</Text>}
      {loading ? <ActivityIndicator color="#4D6BFF" style={{ marginTop: 40 }} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 70 }}
          ListEmptyComponent={<Text style={styles.empty}>No renewal dates have been added.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => navigation.navigate('ItemDetail', { entityId: item.entityId })}>
              <Text style={styles.entity}>{item.entityName}</Text>
              <Text style={styles.label}>{item.label}</Text>
              <View style={styles.row}>
                <Text style={styles.date}>{item.date}</Text>
                <Text style={[styles.due, item.daysUntil < 0 && styles.overdue]}>{dueLabel(item.daysUntil)}</Text>
              </View>
              {!!item.recurrence && <Text style={styles.meta}>{item.recurrence}</Text>}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FB', padding: 18, paddingTop: 24 },
  title: { color: '#171A23', fontSize: 27, fontWeight: '800' },
  intro: { color: '#6D7485', lineHeight: 20, marginTop: 6, marginBottom: 12 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 15, borderWidth: 1, borderColor: '#E5E8EF', padding: 15, marginBottom: 10 },
  entity: { color: '#4D6BFF', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  label: { color: '#171A23', fontSize: 17, fontWeight: '700', marginTop: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  date: { color: '#4F5667', fontSize: 13 },
  due: { color: '#596175', fontSize: 12, fontWeight: '700' },
  overdue: { color: '#C44545' },
  meta: { color: '#7A8190', fontSize: 11, marginTop: 5 },
  error: { color: '#B42318', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  empty: { color: '#777F90', textAlign: 'center', marginTop: 42 },
});
