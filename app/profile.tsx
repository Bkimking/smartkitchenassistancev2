import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { deleteUser, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebase';
import { getUserProfile, updateUserProfile } from '../firebaseUtils';

export default function Profile() {
  const [username, setUsername] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const p = await getUserProfile(auth.currentUser!.uid);
        if (p) {
          setUsername(p.username ?? '');
          setPhotoUri(p.photoURL ?? p.localPath ?? null);
        }
      } catch (e) {
        console.warn('Could not load profile', e);
      }
    })();
  }, []);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled && res.assets && res.assets[0].uri) {
      setPhotoUri(res.assets[0].uri);
    }
  };

  const save = async () => {
    setLoading(true);
    try {
      await updateUserProfile(auth.currentUser!.uid, { username, photoUri });
      Alert.alert('Saved', 'Profile updated');
    } catch (e) {
      console.error('Save profile failed', e);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/auth');
    } catch (e) {
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  const handleDeleteAccount = () => setShowDeleteModal(true);

  const confirmDeleteAccount = async () => {
    if (!auth.currentUser) return Alert.alert('Not signed in');

    setDeleting(true);
    const user = auth.currentUser;
    const uid = user.uid;

    try {
      const itemsSnap = await getDocs(collection(db, 'users', uid, 'items'));
      for (const d of itemsSnap.docs) {
        await deleteDoc(doc(db, 'users', uid, 'items', d.id));
      }

      const recipesSnap = await getDocs(collection(db, 'users', uid, 'recipes'));
      for (const d of recipesSnap.docs) {
        await deleteDoc(doc(db, 'users', uid, 'recipes', d.id));
      }

      await deleteDoc(doc(db, 'users', uid));
      await deleteUser(user);

      Alert.alert('Deleted', 'Your account and data have been deleted');
      router.replace('/auth');
    } catch (e) {
      Alert.alert('Error', 'Failed to delete account.');
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <View style={styles.container}>

      <Text style={styles.header}>Profile</Text>

      <View style={styles.card}>
        <TouchableOpacity onPress={pickImage} style={styles.avatarWrap}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>Add Photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Display name"
          placeholderTextColor="#94a3b8"
          value={username}
          onChangeText={setUsername}
        />

        <TouchableOpacity
          onPress={save}
          style={[styles.saveBtn, loading && { opacity: 0.6 }]}
          disabled={loading}
        >
          <Text style={styles.saveBtnText}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleDeleteAccount} style={styles.deleteBtn}>
        <Text style={styles.deleteText}>Delete Account</Text>
      </TouchableOpacity>

      {/* Delete Modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Delete Account?</Text>
            <Text style={styles.modalBody}>
              This will permanently remove your account and all kitchen data.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowDeleteModal(false)}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={confirmDeleteAccount}
                style={styles.modalDelete}
                disabled={deleting}
              >
                <Text style={styles.modalDeleteText}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 20,
    paddingTop: 50,
  },

  header: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 20,
  },

  card: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    padding: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },

  avatarWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },

  avatar: {
    width: 130,
    height: 130,
    borderRadius: 80,
    borderWidth: 3,
    borderColor: '#ffe2d6',
  },

  avatarPlaceholder: {
    width: 130,
    height: 130,
    borderRadius: 80,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fecaca',
  },

  avatarPlaceholderText: {
    color: '#b91c1c',
    fontSize: 16,
    fontWeight: '600',
  },

  input: {
    backgroundColor: '#f1f5f9',
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    color: '#0f172a',
  },

  saveBtn: {
    backgroundColor: '#ff7a59',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },

  saveBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },

  logoutBtn: {
    marginTop: 20,
    paddingVertical: 14,
    backgroundColor: '#e2e8f0',
    borderRadius: 16,
    alignItems: 'center',
  },

  logoutText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 16,
  },

  deleteBtn: {
    marginTop: 12,
    paddingVertical: 14,
    backgroundColor: '#f87171',
    borderRadius: 16,
    alignItems: 'center',
  },

  deleteText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalBox: {
    width: '88%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
    color: '#0f172a',
  },

  modalBody: {
    color: '#475569',
    marginBottom: 18,
  },

  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },

  modalCancel: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    marginRight: 10,
  },

  modalCancelText: {
    fontWeight: '700',
    color: '#334155',
  },

  modalDelete: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#ef4444',
    borderRadius: 10,
  },

  modalDeleteText: {
    color: '#fff',
    fontWeight: '700',
  },
});
