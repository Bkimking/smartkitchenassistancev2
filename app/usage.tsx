import { collection } from 'firebase/firestore';
import React, { useMemo, useState } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../firebase';
import { addUsageForUser } from '../firebaseUtils';
import { subDays, startOfDay, format } from 'date-fns';

export default function Usage() {
  const [snap] = useCollection(
    collection(db, 'users', auth.currentUser!.uid, 'usage')
  );

  const [note, setNote] = useState('');

  const usage = useMemo(() => {
    return snap?.docs?.map(d => ({ id: d.id, ...(d.data() as any) })) ?? [];
  }, [snap]);

  const chartData = useMemo(() => {
    const today = new Date();
    const dataByDay: { [key: string]: number } = {};
    const dayLabels: string[] = [];

    for (let i = 6; i >= 0; i--) {
      const day = subDays(today, i);
      const dayKey = format(startOfDay(day), 'yyyy-MM-dd');
      dataByDay[dayKey] = 0;
      dayLabels.push(format(day, 'EEE'));
    }

    usage.forEach(item => {
      if (item.type === 'consumption' && item.at && item.at.toDate) {
        const itemDate = item.at.toDate();
        const itemDayKey = format(startOfDay(itemDate), 'yyyy-MM-dd');
        if (dataByDay.hasOwnProperty(itemDayKey)) {
          dataByDay[itemDayKey] += item.qty || 0;
        }
      }
    });

    const values = Object.values(dataByDay);
    const maxVal = Math.max(...values, 1);
    const scaledValues = values.map(val => (val / maxVal) * 80);

    return { labels: dayLabels, values: scaledValues, rawValues: values, maxVal };
  }, [usage]);

  const addNote = async () => {
    if (!note.trim()) return;
    await addUsageForUser(auth.currentUser!.uid, { name: 'Note', qty: 0, unit: null, type: 'note', note: note.trim() });
    setNote('');
  };

  const ListHeader = (
    <View style={styles.headerContent}>
      <Text style={styles.title}>Usage & Activity</Text>

      {/* Consumption Chart */}
      <View style={styles.chartWrap}>
        <Text style={styles.chartLabel}>Consumption (last 7 days)</Text>
        <View style={styles.chartRow}>
          {chartData.values.map((value, i) => (
            <View key={i} style={{ alignItems: 'center' }}>
              <View style={[styles.chartBar, { height: Math.max(6, value) }]} />
              <Text style={styles.chartDayText}>{chartData.labels[i]}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.chartHint}>Amounts are summed per day (mixed units)</Text>
      </View>

      {/* Add Note Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add a quick note</Text>
        <TextInput
          placeholder="Write a note about your cooking..."
          value={note}
          onChangeText={setNote}
          style={styles.input}
          multiline
        />
        <TouchableOpacity style={styles.btn} onPress={addNote}>
          <Text style={styles.btnText}>Add Note</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.recentTitle}>Recent Activity</Text>
    </View>
  );

  return (
    <FlatList
      data={usage}
      keyExtractor={i => i.id}
      ListHeaderComponent={ListHeader}
      contentContainerStyle={styles.container}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle}>
              {item.type === 'note' ? 'Note' : item.name}
              {item.type === 'consumption' && item.note && (
                <Text style={styles.rowNote}> - {item.note}</Text>
              )}
            </Text>
            {item.type === 'consumption' && (
              <Text style={styles.rowQty}>{item.qty} {item.unit ?? ''}</Text>
            )}
          </View>
          {item.type === 'note' && <Text style={styles.rowNoteFull}>{item.note}</Text>}
          <Text style={styles.rowDate}>
            {item.at && item.at.toDate ? new Date(item.at.toDate()).toLocaleString() : ''}
          </Text>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>👀</Text>
          <Text style={styles.emptyText}>No recent activity yet. Add a note above!</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', flexGrow: 1 },
  headerContent: { marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '900', marginBottom: 16, color: '#0f172a' },

  // Chart
  chartWrap: {
    marginTop: 8,
    marginBottom: 24,
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  chartLabel: { color: '#6b7280', fontSize: 14, marginBottom: 12, fontWeight: '700' },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', height: 100, justifyContent: 'space-between', paddingHorizontal: 4 },
  chartBar: { width: 16, borderRadius: 8, backgroundColor: '#38bdf8', marginHorizontal: 2, shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  chartDayText: { fontSize: 12, color: '#6b7280', marginTop: 6, fontWeight: '500' },
  chartHint: { color: '#9ca3af', fontSize: 12, marginTop: 12, textAlign: 'center' },

  // Add Note Card
  card: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 16, marginBottom: 16 },
  cardTitle: { fontWeight: '800', marginBottom: 8, fontSize: 16, color: '#0f172a' },
  input: { backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e6e7eb', marginBottom: 12, fontSize: 16 },
  btn: { backgroundColor: '#0ea5e9', padding: 12, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  // Recent Activity
  recentTitle: { fontSize: 20, fontWeight: '800', marginVertical: 12, color: '#0f172a' },
  row: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#fff', borderRadius: 12, marginBottom: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontWeight: '700', fontSize: 16, color: '#0f172a' },
  rowNote: { fontWeight: '400', fontStyle: 'italic', fontSize: 13, color: '#6b7280' },
  rowNoteFull: { color: '#6b7280', fontSize: 14, marginTop: 4 },
  rowQty: { fontWeight: '700', fontSize: 16, color: '#0ea5e9' },
  rowDate: { color: '#9ca3af', fontSize: 12, marginTop: 4 },

  // Empty state
  emptyState: { alignItems: 'center', marginTop: 20, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 10, fontSize: 16 },
});
