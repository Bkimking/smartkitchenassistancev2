import { manipulateAsync } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../firebase';
import { addItemForUser, addRecipeForUser } from '../firebaseUtils';

export default function Scan() {
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
    success: '#16a34a',
    accent: '#f97316',
  };
  const styles = makeStyles(colors);
  const [loading, setLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const processImageUri = async (uri: string) => {
    setPreviewUri(uri);
    setLoading(true);
    try {
      const resized = await manipulateAsync(uri, [], { compress: 0.7, base64: true });
      const gem = await import('../gemini');
      const res = await gem.default(resized.base64 as string);
      if (!res) throw new Error('No result returned from AI');

      // prefer 'primary' then best label
      const primary = res.primary || (res.labels && res.labels[0] && res.labels[0].name) || null;
      if (!primary) throw new Error('No primary ingredient found');

      // show modal/editor with suggested ingredients
      setDetectedName(primary);
      setDetectedPreviewUri(uri);
      setSuggestedIngredients((res.labels || []).map(l => l.name));
      setItemName(primary);
      setSaveType('kitchen');
      setModalVisible(true);
    } catch (error) {
      console.error('Processing error:', error);
      // Show a more descriptive error to the user so we can debug
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Failed to process image', message + '\n\nCheck device logs for details.');
    } finally {
      setLoading(false);
      // keep preview visible so user can choose action
    }
  };

  // --- State ---
  const [detectedName, setDetectedName] = useState<string | null>(null);
  const [detectedPreviewUri, setDetectedPreviewUri] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [saveType, setSaveType] = useState<'kitchen' | 'recipe'>('kitchen');
  const [itemName, setItemName] = useState('');
  const [expiryDate, setExpiryDate] = useState(''); // ISO string or yyyy-mm-dd
  const [recipeNotes, setRecipeNotes] = useState('');
  const [recipeServings, setRecipeServings] = useState<string>('');
  const [kitchenQuantity, setKitchenQuantity] = useState<string>('1');
  const [kitchenUnit, setKitchenUnit] = useState<string>('pcs');
  const [recipeInstructions, setRecipeInstructions] = useState<string>('');
  const [suggestedIngredients, setSuggestedIngredients] = useState<string[]>([]);

  const resetScanner = () => {
    setPreviewUri(null);
    setDetectedName(null);
    setDetectedPreviewUri(null);
    setModalVisible(false);
    setItemName('');
    setRecipeNotes('');
    setRecipeServings('');
    setSuggestedIngredients([]);
    setExpiryDate('');
    setSaveType('kitchen');
    setKitchenQuantity('1');
    setKitchenUnit('pcs');
    setRecipeInstructions('');
  };

  const isValidFutureDate = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return d instanceof Date && !isNaN(d.getTime()) && d > now;
  };

  const addToKitchen = async () => {
    if (!itemName) {
      Alert.alert('Missing name', 'Please enter a name for the kitchen item.');
      return;
    }
    // quantity is required for kitchen items
    const qty = Number(kitchenQuantity);
    if (!kitchenQuantity || isNaN(qty) || qty <= 0) {
      Alert.alert('Invalid quantity', 'Please enter a valid quantity (e.g. 0.5, 1, 2).');
      return;
    }
    if (!auth.currentUser) {
      Alert.alert('Not signed in', 'You must be signed in to save items.');
      return;
    }
    setLoading(true);
    try {
      // Convert expiryDate string to Date
      const expiry = expiryDate ? new Date(expiryDate) : null;
      await addItemForUser(auth.currentUser.uid, { name: itemName, photoUri: detectedPreviewUri, expiry, quantity: qty, unit: kitchenUnit });
      Alert.alert('Added', `${itemName} added to your kitchen.`);
      resetScanner();
    } catch (e: any) { // Type e as any for easier error handling, or create a custom error type
      console.error('Add to kitchen failed', e);
      const message = e instanceof Error ? e.message : String(e);
      // Check for specific duplicate name error
      if (message.includes('already exists')) {
        Alert.alert('Duplicate Name', message);
      } else {
        Alert.alert('Error', `Could not add item to kitchen: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const addAsRecipe = async () => {
    if (!itemName) {
      Alert.alert('Missing name', 'Please enter a name for the recipe.');
      return;
    }
    if (!auth.currentUser) {
      Alert.alert('Not signed in', 'You must be signed in to save recipes.');
      return;
    }
    setLoading(true);
    try {
      // parse ingredients from suggestedIngredients state (could be edited later)
      const ingredients = suggestedIngredients.map(i => ({ name: i }));
      const servings = recipeServings ? Number(recipeServings) : undefined;
      const steps = recipeInstructions ? recipeInstructions.split('\n').map(s => s.trim()).filter(Boolean) : [];
      const docId = await addRecipeForUser(auth.currentUser.uid, { name: itemName, photoUri: detectedPreviewUri, notes: recipeNotes, ingredients, servings, steps });
      Alert.alert('Saved', `${itemName} saved as a recipe.`);
      resetScanner();
      if (__DEV__) console.log('Recipe document id:', docId);
    } catch (e: any) { // Type e as any for easier error handling, or create a custom error type
      console.error('Add recipe failed', e);
      const message = e instanceof Error ? e.message : String(e);
      // Check for specific duplicate name error
      if (message.includes('already exists')) {
        Alert.alert('Duplicate Name', message);
      } else {
        Alert.alert('Error', `Could not save recipe: ${message}\n\nCheck device logs for details.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (!result.canceled && result.assets && result.assets[0].uri) {
        const uri = result.assets[0].uri;
        setPreviewUri(uri);
        await processImageUri(uri);
      }
    } catch (err) {
      console.error('Image pick error', err);
      Alert.alert('Error', 'Could not pick image.');
    }
  };

  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission required', 'Camera permission is required to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled && result.assets && result.assets[0].uri) {
        const uri = result.assets[0].uri;
        setPreviewUri(uri);
        await processImageUri(uri);
      }
    } catch (err) {
      console.error('Camera error', err);
      Alert.alert('Error', 'Could not take photo.');
    }
  };

  if (hasPermission === false) {
    return (
      <View style={[styles.centeredMissingPerm, { backgroundColor: colors.surface }]}>
        <Text style={[styles.missingPermText, { color: colors.buttonText }]}>Media library access is required.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[{ backgroundColor: colors.background, padding: 18 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>Scan Ingredient 🍽️</Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Snap a photo or choose from your library</Text>
        <Text style={[styles.cardSubtitle, { color: colors.placeholder }]}>We will identify the main ingredient and add it to your kitchen.</Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity onPress={takePhoto} style={[styles.buttonPrimary, styles.buttonLeft, { backgroundColor: colors.primary }]}>
          <Text style={[styles.buttonPrimaryText, { color: colors.buttonText }]}>Take Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={pickImage} style={[styles.buttonSecondary, styles.buttonRight, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.buttonSecondaryText, { color: colors.textPrimary }]}>Choose Photo</Text>
        </TouchableOpacity>
      </View>

      {previewUri && (
        <View style={styles.previewWrap}>
          <Text style={[styles.previewLabel, { color: colors.placeholder }]}>Preview</Text>
          <Image source={{ uri: previewUri }} style={styles.previewImage} />
        </View>
      )}

      {detectedName && (
        <View style={{ width: '100%', marginTop: 18 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>{detectedName}</Text>
            {previewUri ? <Image source={{ uri: previewUri }} style={{ width: 160, height: 160, borderRadius: 12, marginTop: 10 }} /> : null}
            <Text style={{ color: colors.textSecondary, marginTop: 8 }}>We detected this ingredient — edit details and save.</Text>
            <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
              <TouchableOpacity onPress={() => { setSaveType('kitchen'); setModalVisible(true); }} style={[styles.buttonPrimary, { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 }]}>
                <Text style={[styles.buttonPrimaryText, { color: colors.buttonText }]}>Save as Kitchen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setSaveType('recipe'); setModalVisible(true); }} style={[styles.buttonSecondary, { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 }]}>
                <Text style={[styles.buttonSecondaryText, { color: colors.textPrimary }]}>Save as Recipe</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={resetScanner} style={[styles.buttonSecondary, { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 }]}>
                <Text style={[styles.buttonSecondaryText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <Modal visible={modalVisible} animationType="slide" transparent>
        {/* Dark overlay behind modal for focus; keeps modal content readable */}
        <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 16, maxHeight: '90%' }}>
            <ScrollView>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 }}>Save {saveType === 'kitchen' ? 'Kitchen Item' : 'Recipe'}</Text>
              <TouchableOpacity
                style={{ flexDirection: 'row', marginBottom: 12, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignSelf: 'center' }}
                onPress={() => setSaveType(saveType === 'kitchen' ? 'recipe' : 'kitchen')}
              >
                <Text style={{ padding: 10, color: saveType === 'kitchen' ? colors.primary : colors.textSecondary, fontWeight: saveType === 'kitchen' ? '700' : '400' }}>Kitchen Item</Text>
                <Text style={{ padding: 10, color: saveType === 'recipe' ? colors.primary : colors.textSecondary, fontWeight: saveType === 'recipe' ? '700' : '400' }}>Recipe</Text>
              </TouchableOpacity>
              <View style={{ marginBottom: 8 }}>
                <Text style={{ marginBottom: 6, color: colors.textSecondary }}>Name</Text>
                <TextInput
                  value={itemName}
                  onChangeText={setItemName}
                  placeholder={saveType === 'kitchen' ? 'Item name' : 'Recipe name'}
                  placeholderTextColor={colors.placeholder}
                  style={{ backgroundColor: colors.surface, padding: 10, borderRadius: 8, marginBottom: 8 }}
                />

                {saveType === 'kitchen' ? (
                  <>
                    <Text style={{ marginBottom: 6, color: colors.textSecondary }}>Quantity (required)</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                      <TextInput value={kitchenQuantity} onChangeText={setKitchenQuantity} placeholder="e.g. 0.5" keyboardType="decimal-pad" placeholderTextColor={colors.placeholder} style={{ backgroundColor: colors.surface, padding: 10, borderRadius: 8, flex: 1 }} />
                      <TextInput value={kitchenUnit} onChangeText={setKitchenUnit} placeholder="Unit (kg, L, pcs)" placeholderTextColor={colors.placeholder} style={{ backgroundColor: colors.surface, padding: 10, borderRadius: 8, width: 100 }} />
                    </View>
                    <Text style={{ marginBottom: 6, color: colors.textSecondary }}>Expiry (optional)</Text>
                    <TextInput value={expiryDate} onChangeText={setExpiryDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.placeholder} style={{ backgroundColor: colors.surface, padding: 10, borderRadius: 8, marginBottom: 8 }} />
                  </>
                ) : (
                  <>
                    <Text style={{ marginBottom: 6, color: colors.textSecondary }}>Recipe instructions (optional)</Text>
                    <TextInput value={recipeInstructions} onChangeText={setRecipeInstructions} placeholder="Describe how to make this (optional)" placeholderTextColor={colors.placeholder} multiline style={{ backgroundColor: colors.surface, padding: 10, borderRadius: 8, minHeight: 80, marginBottom: 8 }} />
                    <TextInput value={recipeServings} onChangeText={setRecipeServings} placeholder="Servings (optional)" keyboardType="number-pad" placeholderTextColor={colors.placeholder} style={{ backgroundColor: colors.surface, padding: 10, borderRadius: 8, marginBottom: 8 }} />
                    <Text style={{ marginBottom: 6, color: colors.textSecondary }}>Ingredients (comma separated)</Text>
                    <TextInput value={suggestedIngredients.join(', ')} onChangeText={t => setSuggestedIngredients(t.split(',').map(s => s.trim()).filter(Boolean))} placeholder="e.g. tomato, basil, garlic" placeholderTextColor={colors.placeholder} style={{ backgroundColor: colors.surface, padding: 10, borderRadius: 8, marginBottom: 8 }} />
                    <TextInput value={recipeNotes} onChangeText={setRecipeNotes} placeholder="Notes (optional)" placeholderTextColor={colors.placeholder} style={{ backgroundColor: colors.surface, padding: 10, borderRadius: 8, marginBottom: 8 }} />
                  </>
                )}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <TouchableOpacity onPress={() => { setModalVisible(false); }} style={{ padding: 12 }}>
                  <Text style={{ color: colors.textSecondary }}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveType === 'kitchen' ? addToKitchen : addAsRecipe}
                  style={[styles.buttonPrimary, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.buttonPrimaryText, { color: colors.buttonText }]}>{saveType === 'kitchen' ? 'Save Kitchen Item' : 'Save Recipe'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {loading && <ActivityIndicator size="large" color={colors.success} style={styles.loading} />}
    </ScrollView>
  );
}

function makeStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 18 },
    centeredMissingPerm: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    missingPermText: { color: colors.buttonText, fontSize: 18 },
    title: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
    card: { backgroundColor: colors.card, padding: 14, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
    cardTitle: { fontSize: 16, marginBottom: 4 },
    cardSubtitle: { fontSize: 13 },
    buttonRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
    buttonPrimary: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    buttonSecondary: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    buttonLeft: { marginRight: 8 },
    buttonRight: { marginLeft: 8 },
    buttonPrimaryText: { fontSize: 16, fontWeight: '700' },
    buttonSecondaryText: { fontSize: 16, fontWeight: '600' },
    previewWrap: { width: '100%', marginTop: 18, alignItems: 'center' },
    previewLabel: { marginBottom: 8 },
    previewImage: { width: 220, height: 220, borderRadius: 16 },
    loading: { marginTop: 18 },
  });
}
