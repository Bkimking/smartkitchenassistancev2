import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../firebase';
// Removed theme dependency — using static colors

export default function Auth() {
  // Theme removed — use a simple static color palette here
  const colors = {
    background: '#ffffff',
    card: '#ffffff',
    border: '#e5e7eb',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    placeholder: '#9ca3af',
    primary: '#2563eb',
    buttonText: '#ffffff',
    surface: '#f8fafc',
  };
  const styles = makeStyles(colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  const handle = async () => {
    // Basic client-side validation
    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters');
      return;
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      // Log full error to console (check Metro / device logs)
      console.error('Auth error', err);

      // Prefer firebase error codes/messages when available
      const code = err?.code || '';
      let message = 'Check email/password';

      if (code.includes('auth/email-already-in-use')) message = 'That email is already in use.';
      else if (code.includes('auth/invalid-email')) message = 'Invalid email address.';
      else if (code.includes('auth/wrong-password')) message = 'Incorrect password.';
      else if (code.includes('auth/user-not-found')) message = 'No account found for this email.';
      else if (code.includes('auth/weak-password')) message = 'Password is too weak (min 6 characters).';
      else if (err?.message) message = err.message;

      Alert.alert('Authentication error', message);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }] }>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }] }>
        <View style={styles.logoWrap}>
          <Text style={styles.logoEmoji}>🍳</Text>
        </View>
        <Text style={[styles.appTitle, { color: colors.textPrimary }]}>Smart Kitchen</Text>
        <Text style={[styles.appSubtitle, { color: colors.textSecondary }]}>Organize ingredients and get recipe ideas</Text>

        <TextInput style={[styles.input, { backgroundColor: colors.surface }]} placeholder="Email" placeholderTextColor={colors.placeholder} value={email} onChangeText={setEmail} autoCapitalize="none" />
        <TextInput style={[styles.input, { backgroundColor: colors.surface }]} placeholder="Password" placeholderTextColor={colors.placeholder} value={password} onChangeText={setPassword} secureTextEntry />

        <TouchableOpacity onPress={handle} style={[styles.primaryButton, { backgroundColor: colors.primary }] }>
          <Text style={[styles.primaryButtonText, { color: colors.buttonText }]}>{isLogin ? 'Login' : 'Sign Up'}</Text>
        </TouchableOpacity>

        <Text onPress={() => setIsLogin(!isLogin)} style={[styles.switchText, { color: colors.primary }] }>
          {isLogin ? 'No account? Sign up' : 'Have account? Login'}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 },
    card: { width: '100%', maxWidth: 420, padding: 20, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 4, alignItems: 'center', borderWidth: 1 },
    logoWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    logoEmoji: { fontSize: 34 },
    appTitle: { fontSize: 22, fontWeight: '800' },
    appSubtitle: { marginBottom: 12 },
    input: { width: '100%', padding: 12, borderRadius: 12, marginBottom: 12 },
    primaryButton: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, width: '100%', alignItems: 'center', marginTop: 6 },
    primaryButtonText: { fontWeight: '700', fontSize: 16 },
    switchText: { marginTop: 12 },
  });
}