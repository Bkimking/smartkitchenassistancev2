import { format, startOfDay, subDays } from 'date-fns'; // Import date-fns utilities
import { Link, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { collection, query, Timestamp, where } from 'firebase/firestore'; // Added query, where, Timestamp
import { BookOpen, Camera, Utensils, X } from 'lucide-react-native'; // Added X icon
import { useEffect, useMemo, useState } from 'react'; // Added useMemo
import { useCollection } from 'react-firebase-hooks/firestore';
import {
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { auth, db } from '../firebase';
import { getUserProfile } from '../firebaseUtils';

export default function Home() {
  const router = useRouter();
  const userId = auth.currentUser?.uid; // Safely get userId

  const [snapshot] = useCollection(
    userId ? collection(db, 'users', userId, 'items') : undefined
  );
  const [recipesSnap] = useCollection(
    userId ? collection(db, 'users', userId, 'recipes') : undefined
  );

  // Fetch favorited recipes count
  const [favoriteRecipesSnap] = useCollection(
    userId
      ? query(
        collection(db, 'users', userId, 'recipes'),
        where('isFavorite', '==', true)
      )
      : undefined
  );

  // Fetch usage data for the chart
  const [usageSnap] = useCollection(
    userId
      ? query(
        collection(db, 'users', userId, 'usage'),
        where('type', '==', 'consumption'),
        // You might want to add a `where('at', '>=', startOfDay(subDays(new Date(), 7)))`
        // clause here if your usage collection grows very large, but for 7 days
        // client-side filtering is often fine.
      )
      : undefined
  );

  const [profile, setProfile] = useState<{
    username?: string;
    photoURL?: string;
    localPath?: string;
  } | null>(null);

  // Modal state for viewing an item
  const [showItemModal, setShowItemModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);


  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!userId) return; // Only fetch profile if userId is available
        const p = await getUserProfile(userId);
        if (mounted) setProfile(p);
      } catch (e) {
        console.warn('Failed to load profile', e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]); // Depend on userId


  const itemsCount = snapshot?.docs?.length ?? 0;
  const recipesCount = recipesSnap?.docs?.length ?? 0;
  const favoriteRecipesCount = favoriteRecipesSnap?.docs?.length ?? 0; // New count for favorite recipes


  // Process usage data for the chart (last 7 days, similar to Usage page)
  const chartData = useMemo(() => {
    const usage = usageSnap?.docs?.map(d => d.data()) ?? [];
    const today = new Date();
    const dataByDay: { [key: string]: number } = {};
    const dayLabels: string[] = [];

    // Initialize data for last 7 days
    for (let i = 6; i >= 0; i--) {
      const day = subDays(today, i);
      const dayKey = format(startOfDay(day), 'yyyy-MM-dd');
      dataByDay[dayKey] = 0;
      dayLabels.push(format(day, 'EEE')); // Mon, Tue, etc.
    }

    // Aggregate consumption
    usage.forEach(item => {
      if (item.type === 'consumption' && item.at instanceof Timestamp) {
        const itemDate = item.at.toDate();
        const itemDayKey = format(startOfDay(itemDate), 'yyyy-MM-dd');
        if (dataByDay.hasOwnProperty(itemDayKey)) {
          dataByDay[itemDayKey] += item.qty || 0;
        }
      }
    });

    const values = Object.values(dataByDay);
    const maxVal = Math.max(...values, 1); // Avoid division by zero

    // Scale values for chart bars
    const scaledValues = values.map(val => (val / maxVal) * 80); // Max bar height 80

    return {
      labels: dayLabels,
      values: scaledValues,
    };
  }, [usageSnap]);


  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace('/auth');
    } catch (e) {
      console.warn('Sign out failed', e);
    }
  };

  const openItemModal = (itemData: any) => {
    setSelectedItem(itemData);
    setShowItemModal(true);
  };


  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.headerLarge}>
        <View style={styles.headerLeft}>
          <Text style={styles.welcome}>Good day,</Text>
          <Text style={styles.welcomeName}>
            {profile?.username ??
              auth.currentUser?.email?.split('@')[0]}
          </Text>
          <Text style={styles.headerSubtitle}>
            Your pantry — glanceable, actionable
          </Text>
        </View>

        <Link href="/profile" asChild>
          <TouchableOpacity style={styles.avatarLarge}>
            {profile?.photoURL || profile?.localPath ? (
              <Image
                source={{ uri: profile.photoURL ?? profile.localPath! }}
                style={styles.avatarLargeImage}
              />
            ) : (
              <Text style={styles.avatarTextLarge}>
                {(auth.currentUser?.email || 'U').charAt(0).toUpperCase()}
              </Text>
            )}
          </TouchableOpacity>
        </Link>
      </View>

      {/* DASHBOARD */}
      <View style={styles.dashboardRow}>
        <View style={styles.bigCard}>
          <Text style={styles.bigCardTitle}>Pantry Overview</Text>

          <View style={styles.overviewRow}>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewNumber}>{String(itemsCount)}</Text>
              <Text style={styles.overviewLabel}>Items</Text>
            </View>

            <View style={styles.overviewItem}>
              <Text style={styles.overviewNumber}>{String(recipesCount)}</Text>
              <Text style={styles.overviewLabel}>Recipes</Text>
            </View>

            <View style={styles.overviewItem}>
              <Text style={styles.overviewNumber}>
                {String(favoriteRecipesCount)}
              </Text>
              <Text style={styles.overviewLabel}>Favorite Recipes</Text>
            </View>
          </View>

          {/* DYNAMIC USAGE CHART */}
          <TouchableOpacity
            style={styles.chartWrap}
            onPress={() => router.push('/usage')}
          >
            <Text style={styles.chartLabel}>Usage (last 7 days)</Text>
            <View style={styles.chartRow}>
              {chartData.values.map((value, i) => (
                <View key={i} style={{ alignItems: 'center' }}>
                  <View
                    style={[
                      styles.chartBar,
                      { height: Math.max(6, value) }
                    ]}
                  />
                  <Text style={styles.chartDayText}>{chartData.labels[i]}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.chartHint}>
              Tap to view detailed consumption
            </Text>
          </TouchableOpacity>
        </View>

      </View>

      {/* RECENT ITEMS */}
      <Text style={styles.sectionTitle}>Recent items</Text>

      <FlatList
        contentContainerStyle={{
          paddingBottom: 130,
          paddingHorizontal: 18
        }}
        data={snapshot?.docs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            {item.data().photoURL || item.data().localPath ? (
              <Image
                source={{
                  uri:
                    item.data().photoURL ??
                    item.data().localPath
                }}
                style={styles.itemThumb}
              />
            ) : (
              <View style={styles.itemThumbPlaceholder}>
                <Text style={{ fontSize: 20 }}>🍽️</Text>
              </View>
            )}

            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.itemName}>{String(item.data().name)}</Text>
              <Text style={styles.itemTime}>
                {item.data().expiry instanceof Timestamp
                  ? `Expires: ${format(item.data().expiry.toDate(), 'MM dd, yyyy')}`
                  : 'No expiry'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.itemAction}
              onPress={() => openItemModal(item.data())}
            >
              <Text style={styles.itemActionText}>View</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🥕</Text>
            <Text style={styles.emptyText}>
              Tap Scan to add ingredients to your kitchen
            </Text>
          </View>
        }
      />

      {/* SINGLE FLOATING ACTION SECTION */}
      <View style={[styles.ctaRow, { gap: 16 }]}>
        <Link href="/kitchen" asChild>
          <TouchableOpacity style={styles.ctaBtnPrimary}>
            <Utensils color="#fff" size={32} />
            <Text style={[styles.ctaText, { fontSize: 12, marginTop: 4 }]}>Kitchen</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/scan" asChild>
          <TouchableOpacity style={[styles.ctaBtnCenter, { backgroundColor: '#0ea5e9' }]}>
            <Camera color="#fff" size={32} />
            <Text style={[styles.ctaText, { fontSize: 12, marginTop: 4 }]}>Scan</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/recipes" asChild>
          <TouchableOpacity style={styles.ctaBtnSecondary}>
            <BookOpen color="#fff" size={32} />
            <Text style={[styles.ctaTextSecondary, { fontSize: 12, marginTop: 4 }]}>Recipes</Text>
          </TouchableOpacity>
        </Link>
      </View>

      {/* Item View Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showItemModal}
        onRequestClose={() => setShowItemModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowItemModal(false)}>
              <X color="#6b7280" size={24} />
            </TouchableOpacity>

            {selectedItem?.photoURL || selectedItem?.localPath ? (
              <Image
                source={{
                  uri: selectedItem.photoURL ?? selectedItem.localPath,
                }}
                style={styles.modalImage}
              />
            ) : (
              <View style={styles.modalImagePlaceholder}>
                <Text style={{ fontSize: 40, color: '#9ca3af' }}>🍽️</Text>
              </View>
            )}

            <Text style={styles.modalTitle}>{String(selectedItem?.name ?? '')}</Text>
            <Text style={styles.modalDetail}>
              Quantity: {String(selectedItem?.quantity ?? '')} {String(selectedItem?.unit ?? 'pcs')}
            </Text>
            {selectedItem?.expiry instanceof Timestamp && (
              <Text style={styles.modalDetail}>
                Expires: {format(selectedItem.expiry.toDate(), 'MMM dd, yyyy')}
              </Text>
            )}
            {selectedItem?.notes && (
              <Text style={styles.modalDetail}>
                Notes: {String(selectedItem.notes)}
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EFF6FF' },

  /* HEADER */
  headerLarge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 12
  },
  headerLeft: { flex: 1 },
  welcome: { color: '#6b7280', fontSize: 14 },
  welcomeName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 4
  },
  headerSubtitle: { color: '#6b7280', marginTop: 6 },

  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarLargeImage: {
    width: 64,
    height: 64,
    borderRadius: 32
  },
  avatarTextLarge: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 20
  },

  /* DASHBOARD */
  dashboardRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    marginTop: 12,
    gap: 12
  },

  bigCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },

  bigCardTitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 8,
    fontWeight: '700'
  },

  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },

  overviewItem: {
    alignItems: 'center',
    flex: 1
  },
  overviewNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a'
  },
  overviewLabel: { color: '#6b7280', marginTop: 4 },

  chartWrap: {
    marginTop: 8,
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0.5 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  chartLabel: { color: '#6b7280', fontSize: 12, marginBottom: 8, fontWeight: '700' },

  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 80,
    justifyContent: 'space-between'
  },
  chartBar: {
    width: 10,
    borderRadius: 4,
    backgroundColor: '#38bdf8', // Updated color for consistency
    marginHorizontal: 4
  },
  chartDayText: { // New style for day labels
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 4,
  },
  chartHint: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },

  /* QUICK ACTIONS */
  actionsCard: {
    width: 120,
    justifyContent: 'space-between'
  },

  actionBtnPrimary: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10
  },
  actionBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e6e7eb',
    marginBottom: 10
  },

  actionText: { color: '#fff', fontWeight: '800' },
  actionTextAlt: { color: '#0f172a', fontWeight: '700' },

  /* SECTION TITLE */
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 20,
    marginLeft: 18,
    marginBottom: 8
  },

  /* RECENT ITEMS */
  itemRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0.5 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  itemThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#f1f5f9', // Placeholder background for loading
  },
  itemThumbPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  itemTime: {
    color: '#6b7280',
    marginTop: 4,
    fontSize: 12
  },

  itemAction: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0ea5e9',
    borderRadius: 10
  },
  itemActionText: { color: '#fff', fontWeight: '700' },

  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyEmoji: { fontSize: 56 },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 16,
    marginTop: 12,
    paddingHorizontal: 24
  },

  /* BOTTOM CTA */
  ctaRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 18,
    marginTop: 18,
    marginBottom: 28
  },

  ctaBtnPrimary: {
    flex: 1,
    marginHorizontal: 6,
    backgroundColor: '#0ea5e9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },

  ctaBtnSecondary: {
    flex: 1,
    marginHorizontal: 6,
    backgroundColor: '#ff7a59',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },

  ctaBtnCenter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center'
  },

  ctaText: { color: '#fff', fontWeight: '800' },
  ctaTextSecondary: { color: '#fff', fontWeight: '800' },

  /* MODAL STYLES */
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Semi-transparent dark background
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 10,
    zIndex: 1, // Ensure it's tappable
  },
  modalImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 15,
    backgroundColor: '#f1f5f9', // Placeholder
  },
  modalImagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 15,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalDetail: {
    fontSize: 16,
    color: '#334155',
    marginBottom: 5,
    textAlign: 'center',
  },
});
