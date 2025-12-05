import { collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { auth, db } from '../firebase';
import { addUsageForUser, getUserProfile } from '../firebaseUtils';

export default function Kitchen() {
  const [snapshot] = useCollection(collection(db, 'users', auth.currentUser!.uid, 'items'));
  const [profile, setProfile] = useState<{ username?: string; photoURL?: string } | null>(null);

  const [editVisible, setEditVisible] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState<string>('1');
  const [editUnit, setEditUnit] = useState('pcs');
  const [editNotes, setEditNotes] = useState('');

  const [consumeVisible, setConsumeVisible] = useState(false);
  const [consumeQty, setConsumeQty] = useState<string>('0.25');
  const [consumeUnit, setConsumeUnit] = useState<string>('pcs');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await getUserProfile(auth.currentUser!.uid);
        if (mounted) setProfile(p as any);
      } catch (e) {
        console.warn('Failed to load profile', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const openEditModal = (item: any) => {
    setSelected({ id: item.id, ...item.data() });
    setEditName(item.data().name);
    setEditQty(String(item.data().quantity ?? 1));
    setEditUnit(item.data().unit ?? 'pcs');
    setEditNotes(item.data().notes ?? '');
    setConsumeQty('0.25');
    setConsumeUnit(item.data().unit ?? 'pcs');
    setConsumeVisible(false);
    setEditVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Kitchen Items</Text>
        {profile?.photoURL && <Image source={{ uri: profile.photoURL }} style={styles.avatar} />}
      </View>

      {/* List */}
      <FlatList
        data={snapshot?.docs}
        keyExtractor={d => d.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => openEditModal(item)}>
            <View style={styles.card}>
              {item.data().photoURL || item.data().localPath ? (
                <Image source={{ uri: item.data().photoURL || item.data().localPath }} style={styles.thumb} />
              ) : (
                <View style={styles.thumbPlaceholder}><Text style={{ fontSize: 24 }}>🍽️</Text></View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.itemName}>{item.data().name}</Text>
                <Text style={styles.itemSubText}>Added recently</Text>
              </View>
              <Text style={styles.itemQty}>{item.data().quantity ?? 0} {item.data().unit ?? 'pcs'}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🍳</Text>
            <Text style={styles.emptyText}>Your kitchen is empty. Add some items to start tracking!</Text>
          </View>
        }
      />

      {/* Edit Modal */}
      <Modal visible={editVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Item</Text>

            <TextInput value={editName} onChangeText={setEditName} placeholder="Name" style={styles.input} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput value={editQty} onChangeText={setEditQty} placeholder="Qty" keyboardType="numeric" style={[styles.input, { flex: 1 }]} />
              <TextInput value={editUnit} onChangeText={setEditUnit} placeholder="Unit" style={[styles.input, { flex: 1 }]} />
            </View>
            <TextInput value={editNotes} onChangeText={setEditNotes} placeholder="Notes" style={[styles.input, { height: 80 }]} multiline />

            {/* Actions */}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: '#0ea5e9' }]}
                onPress={async () => {
                  if (!selected) return;
                  try {
                    const ref = doc(db, 'users', auth.currentUser!.uid, 'items', selected.id);
                    await updateDoc(ref, {
                      name: editName,
                      quantity: Number(editQty) || 1,
                      unit: editUnit,
                      notes: editNotes,
                      updatedAt: serverTimestamp(),
                    });
                    setEditVisible(false);
                    setSelected(null);
                  } catch (e) {
                    console.error('Update failed', e);
                    Alert.alert('Update failed');
                  }
                }}
              >
                <Text style={styles.modalBtnText}>Save</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtn, { backgroundColor: '#fee2e2' }]}
                onPress={async () => {
                  if (!selected) return;
                  Alert.alert('Delete item', 'Are you sure?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          const ref = doc(db, 'users', auth.currentUser!.uid, 'items', selected.id);
                          await deleteDoc(ref);
                          setEditVisible(false);
                          setSelected(null);
                        } catch (e) {
                          console.error('Delete failed', e);
                          Alert.alert('Delete failed');
                        }
                      }
                    }
                  ]);
                }}
              >
                <Text style={[styles.modalBtnText, { color: '#b91c1c' }]}>Delete</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtn, { backgroundColor: '#fde68a' }]}
                onPress={() => setConsumeVisible(true)}
              >
                <Text style={[styles.modalBtnText, { color: '#92400e' }]}>Consumed</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtn, { backgroundColor: '#e5e7eb' }]}
                onPress={() => { setEditVisible(false); setSelected(null); setConsumeVisible(false); }}
              >
                <Text style={[styles.modalBtnText, { color: '#0f172a' }]}>Close</Text>
              </Pressable>
            </View>

            {/* Consume Section */}
            {consumeVisible && selected && (
              <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 12 }}>
                <Text style={{ fontWeight: '700', marginBottom: 8 }}>How much consumed?</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput value={consumeQty} onChangeText={setConsumeQty} keyboardType="decimal-pad" style={[styles.input, { flex: 1 }]} />
                  <TextInput value={consumeUnit} onChangeText={setConsumeUnit} style={[styles.input, { width: 100 }]} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <Pressable style={[styles.modalBtn, { backgroundColor: '#e5e7eb' }]} onPress={() => setConsumeVisible(false)}>
                    <Text style={[styles.modalBtnText, { color: '#0f172a' }]}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[styles.modalBtn, { backgroundColor: '#16a34a' }]} onPress={async () => {
                    if (!selected) return;
                    const c = Number(consumeQty);
                    if (isNaN(c) || c <= 0) { Alert.alert('Invalid amount', 'Enter valid quantity.'); return; }
                    try {
                      const prevQty = Number(selected.quantity ?? 0);
                      const newQty = Math.max(0, prevQty - c);
                      const ref = doc(db, 'users', auth.currentUser!.uid, 'items', selected.id);
                      await updateDoc(ref, { quantity: newQty, updatedAt: serverTimestamp() });

                      await addUsageForUser(auth.currentUser!.uid, {
                        itemId: selected.id,
                        name: selected.name ?? '',
                        qty: c,
                        unit: consumeUnit || selected.unit || 'pcs',
                        type: 'consumption',
                        previousQuantity: prevQty,
                        newQuantity: newQty,
                      });

                      Alert.alert('Recorded', `Consumed ${c} ${consumeUnit}. New qty: ${newQty}`);
                      setConsumeVisible(false);
                      setEditVisible(false);
                      setSelected(null);
                    } catch (e) {
                      console.error('Consume failed', e);
                      Alert.alert('Failed', 'Could not record consumption.');
                    }
                  }}>
                    <Text style={styles.modalBtnText}>Confirm</Text>
                  </Pressable>
                </View>
              </View>
            )}

          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: '#fff', marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  thumbPlaceholder: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  itemSubText: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  itemQty: { fontSize: 14, fontWeight: '700', color: '#0ea5e9' },
  emptyState: { alignItems: 'center', marginTop: 40, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 16, color: '#6b7280', textAlign: 'center', marginTop: 12 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { width: '92%', backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, color: '#0f172a' },
  input: { borderWidth: 1, borderColor: '#e6e7eb', borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 16, backgroundColor: '#f8fafc' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
