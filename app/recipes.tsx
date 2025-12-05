import { collection, Timestamp } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { auth, db } from '../firebase';
import { getUserProfile, updateRecipeForUser } from '../firebaseUtils';
import { X, Pencil, Sparkles, Star } from 'lucide-react-native'; // Import Star
import format from 'date-fns/format';
import { geminiTextPrompt } from '../gemini';

export default function Recipes() {
  const colors = {
    background: '#f7fafc',
    card: '#ffffff',
    border: '#e6edf3',
    textPrimary: '#0f1724',
    textSecondary: '#6b7280',
    placeholder: '#9ca3af',
    primary: '#0ea5e9',
    buttonText: '#ffffff',
    surface: '#f8fafc',
    accent: '#ff7a59',
    shadow: '#00000010',
  };
  const styles = makeStyles(colors);

  // safer userId handling (component can render before auth is ready)
  const userId = auth.currentUser?.uid;
  const [snapshot] = useCollection(userId ? collection(db, 'users', userId, 'recipes') : undefined);
  const recipes = useMemo(() => snapshot?.docs?.map(d => ({ id: d.id, ...(d.data() as any) })) ?? [], [snapshot]);

  const [profile, setProfile] = useState<{ username?: string; photoURL?: string; localPath?: string } | null>(null);

  // Modal states
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null);
  const [isEditingRecipe, setIsEditingRecipe] = useState(false);

  // Editable recipe states
  const [editedRecipeName, setEditedRecipeName] = useState('');
  const [editedRecipeNotes, setEditedRecipeNotes] = useState('');
  const [editedRecipeIngredients, setEditedRecipeIngredients] = useState<string[]>([]);
  const [editedRecipeSteps, setEditedRecipeSteps] = useState('');
  const [editedRecipeServings, setEditedRecipeServings] = useState('');
  const [isRewriting, setIsRewriting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!userId) return;
        const p = await getUserProfile(userId);
        if (mounted) setProfile(p as any);
      } catch (e) {
        console.warn('Failed to load profile', e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const openRecipeModal = (recipe: any) => {
    setSelectedRecipe(recipe);
    setEditedRecipeName(recipe?.name ?? '');
    setEditedRecipeNotes(recipe?.notes ?? '');
    setEditedRecipeIngredients(
      recipe?.ingredients?.map((ing: any) => `${ing.name} ${ing.qty ?? ''} ${ing.unit ?? ''}`).filter(Boolean) ?? []
    );
    setEditedRecipeSteps((recipe?.steps ?? []).join('\n') ?? '');
    setEditedRecipeServings(recipe?.servings ? String(recipe.servings) : '');
    setIsEditingRecipe(false);
    setShowRecipeModal(true);
  };

  const closeModal = () => {
    setShowRecipeModal(false);
    setSelectedRecipe(null);
    setIsEditingRecipe(false);
  };

  const handleSaveRecipe = async () => {
    if (!auth.currentUser) {
      Alert.alert('Not Signed In', 'You must be signed in to update recipes.');
      return;
    }
    if (!editedRecipeName.trim()) {
      Alert.alert('Missing Name', 'Recipe name cannot be empty.');
      return;
    }
    if (!selectedRecipe?.id) {
      Alert.alert('Error', 'Could not find recipe ID to update.');
      return;
    }

    try {
      const updatedIngredients = editedRecipeIngredients
        .map(ingStr => {
          const parts = ingStr.split(' ').filter(Boolean);
          let name = '';
          let qty: number | null = null;
          let unit: string | null = null;

          if (parts.length === 0) return null;
          if (!isNaN(Number(parts[0]))) {
            qty = Number(parts[0]);
            unit = parts[1] || null;
            name = parts.slice(2).join(' ') || '';
          } else if (parts.length >= 2 && !isNaN(Number(parts[1]))) {
            name = parts[0];
            qty = Number(parts[1]);
            unit = parts.slice(2).join(' ') || null;
          } else {
            name = parts.join(' ');
          }

          if (!name.trim()) return null;

          return { name: name.trim(), qty: qty, unit: unit };
        })
        .filter((ing): ing is { name: string; qty: number | null; unit: string | null } => !!ing && !!ing.name);

      const updatedRecipeData: any = {
        name: editedRecipeName.trim(),
        notes: editedRecipeNotes.trim(),
        ingredients: updatedIngredients,
        steps: editedRecipeSteps.split('\n').map((s: string) => s.trim()).filter(Boolean),
      };
      if (editedRecipeServings) {
        updatedRecipeData.servings = Number(editedRecipeServings);
      } else {
        updatedRecipeData.servings = null;
      }

      await updateRecipeForUser(auth.currentUser.uid, selectedRecipe.id, updatedRecipeData);
      Alert.alert('Success', 'Recipe updated successfully!');
      setIsEditingRecipe(false);

      const updatedLocalRecipe = recipes.find(r => r.id === selectedRecipe.id);
      if (updatedLocalRecipe) {
        setSelectedRecipe(updatedLocalRecipe);
      }
    } catch (e: any) {
      console.error('Failed to update recipe:', e);
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('already exists')) {
        Alert.alert('Duplicate Name', message);
      } else {
        Alert.alert('Update Failed', `Could not update recipe: ${message}`);
      }
    }
  };

  const handleRewriteRecipe = async () => {
    if (isRewriting) return;

    setIsRewriting(true);
    try {
      const prompt = `Rewrite the steps for the following recipe, making them clear, concise, and easy to follow. Only provide the steps, separated by newlines, nothing else. Focus on the core instructions.
Recipe Name: ${editedRecipeName}
Ingredients: ${editedRecipeIngredients.join(', ')}
Notes (optional context): ${editedRecipeNotes}
Current Steps (if any, use as a base or inspiration):
${editedRecipeSteps || 'No existing steps, generate new ones.'}`;

      const rewrittenSteps = await geminiTextPrompt(prompt);

      if (rewrittenSteps) {
        setEditedRecipeSteps(rewrittenSteps.replace(/\r\n/g, '\n').trim());
        Alert.alert('AI Rewritten', 'Recipe steps have been rewritten!');
      } else {
        Alert.alert('AI Failed', 'Could not get rewritten steps from AI.');
      }
    } catch (e) {
      console.error('AI Rewrite Failed:', e);
      Alert.alert('AI Error', `Failed to rewrite recipe steps: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsRewriting(false);
    }
  };

  const toggleFavorite = async (recipeId: string, currentStatus: boolean) => {
    if (!userId) {
      Alert.alert('Not Signed In', 'You must be signed in to favorite recipes.');
      return;
    }
    try {
      // Optimistic UI update
      const updatedRecipes = recipes.map(r =>
        r.id === recipeId ? { ...r, isFavorite: !currentStatus } : r
      );
      // Re-render the list immediately
      snapshot?.docs.splice(0, snapshot.docs.length, ...updatedRecipes.map(r => ({ ...r, data: () => r } as any))); // This is a hacky way to force re-render useCollection data

      // If the modal is open for this item, update its state too
      setSelectedRecipe(prev => {
        if (!prev || prev.id !== recipeId) return prev;
        return { ...prev, isFavorite: !currentStatus };
      });

      await updateRecipeForUser(userId, recipeId, { isFavorite: !currentStatus });
      // No alert on success for a quick action
    } catch (e) {
      console.error('Failed to toggle favorite status:', e);
      Alert.alert('Error', 'Could not update favorite status. Please try again.');
      // Revert optimistic update on failure
      const revertedRecipes = recipes.map(r =>
        r.id === recipeId ? { ...r, isFavorite: currentStatus } : r
      );
      snapshot?.docs.splice(0, snapshot.docs.length, ...revertedRecipes.map(r => ({ ...r, data: () => r } as any)));
      setSelectedRecipe(prev => {
        if (!prev || prev.id !== recipeId) return prev;
        return { ...prev, isFavorite: currentStatus };
      });
    }
  };


  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Recipe Ideas</Text>
            <Text style={styles.subtitle}>Save, edit and improve recipes with AI help</Text>
          </View>
          {(profile?.photoURL || profile?.localPath) ? (
            <Image source={{ uri: profile.photoURL ?? profile!.localPath! }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarEmoji}>👨‍🍳</Text>
            </View>
          )}
        </View>

        {/* If no recipes show a friendly card */}
        {recipes.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIcon}>🍝</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Tomato Pasta</Text>
              <Text style={styles.cardNote}>Simple & comforting — uses pantry staples</Text>
            </View>
            <TouchableOpacity style={styles.tryBtn} onPress={() => { /* could open a create modal */ }}>
              <Text style={styles.tryText}>Try</Text>
            </TouchableOpacity>
          </View>
        ) : (
          recipes.map(r => (
            <TouchableOpacity key={r.id} activeOpacity={0.9} style={styles.card} onPress={() => openRecipeModal(r)}>
              {(r.photoURL || r.localPath) ? (
                <Image source={{ uri: r.photoURL ?? r.localPath }} style={styles.cardImage} />
              ) : (
                <View style={styles.iconWrap}><Text style={styles.icon}>🍽️</Text></View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{r.name}</Text>
                <Text style={styles.cardNote} numberOfLines={2}>{r.notes ?? ''}</Text>
                <View style={styles.cardMetaRow}>
                  {r.servings ? <Text style={styles.cardMeta}>Serves {r.servings}</Text> : null}
                  {r.expiry instanceof Timestamp ? <Text style={styles.cardMeta}> • Expires {format(r.expiry.toDate(), 'MMM dd, yyyy')}</Text> : null}
                </View>
              </View>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation(); // Prevent opening modal when tapping star
                  toggleFavorite(r.id, r.isFavorite);
                }}
                style={styles.favoriteButton}
              >
                <Star
                  size={24}
                  color={r.isFavorite ? colors.accent : colors.textSecondary}
                  fill={r.isFavorite ? colors.accent : 'none'}
                />
              </TouchableOpacity>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.openText}>Open</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 28 }} />

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>Discover more recipes based on your pantry.</Text>
        </View>
      </ScrollView>

      {/* Modal: floating card, 80% height */}
      <Modal
        visible={showRecipeModal}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalWrapper}
          >
            <View style={styles.modalCard}>
              {/* Modal header */}
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>{isEditingRecipe ? 'Edit Recipe' : (selectedRecipe?.name ?? 'Recipe')}</Text>
                  {selectedRecipe?.name && !isEditingRecipe ? (
                    <Text style={styles.modalSmall}>{selectedRecipe?.notes ? selectedRecipe.notes : 'Tap Edit to modify this recipe'}</Text>
                  ) : null}
                </View>

                <View style={styles.modalActions}>
                  {/* Favorite button inside modal */}
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      if (selectedRecipe) {
                        toggleFavorite(selectedRecipe.id, selectedRecipe.isFavorite);
                      }
                    }}
                    style={[styles.iconBtn, { marginRight: 8 }]}
                  >
                    <Star
                      size={18}
                      color={selectedRecipe?.isFavorite ? colors.accent : colors.textSecondary}
                      fill={selectedRecipe?.isFavorite ? colors.accent : 'none'}
                    />
                    <Text style={[styles.iconBtnText, { color: selectedRecipe?.isFavorite ? colors.accent : colors.textSecondary }]}>
                      {selectedRecipe?.isFavorite ? 'Unfavorite' : 'Favorite'}
                    </Text>
                  </TouchableOpacity>

                  {isEditingRecipe && (
                    <TouchableOpacity
                      onPress={handleRewriteRecipe}
                      style={[styles.iconBtn, { marginRight: 8 }]}
                      disabled={isRewriting}
                    >
                      {isRewriting ? <ActivityIndicator size="small" color={colors.primary} /> : <Sparkles color={colors.primary} size={18} />}
                      <Text style={[styles.iconBtnText, { color: colors.primary }]}>AI</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity onPress={() => setIsEditingRecipe(prev => !prev)} style={styles.iconBtn}>
                    <Pencil color={isEditingRecipe ? colors.primary : colors.textSecondary} size={18} />
                    <Text style={[styles.iconBtnText, { color: isEditingRecipe ? colors.primary : colors.textSecondary }]}>{isEditingRecipe ? 'View' : 'Edit'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={closeModal} style={[styles.iconBtn, { marginLeft: 8 }]}>
                    <X color={colors.textSecondary} size={18} />
                    <Text style={styles.iconBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Modal content */}
              <ScrollView style={styles.modalContent} contentContainerStyle={{ paddingBottom: 28 }}>
                {/* image */}
                {(selectedRecipe?.photoURL || selectedRecipe?.localPath) ? (
                  <Image source={{ uri: selectedRecipe.photoURL ?? selectedRecipe.localPath }} style={styles.modalImage} />
                ) : (
                  <View style={styles.modalImagePlaceholder}>
                    <Text style={styles.modalImageEmoji}>🍽️</Text>
                  </View>
                )}

                {/* Editing form */}
                {isEditingRecipe ? (
                  <>
                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Basic</Text>

                      <Text style={styles.inputLabel}>Recipe Name</Text>
                      <TextInput
                        style={styles.input}
                        value={editedRecipeName}
                        onChangeText={setEditedRecipeName}
                        placeholder="Recipe Name"
                        placeholderTextColor={colors.placeholder}
                      />

                      <Text style={styles.inputLabel}>Notes</Text>
                      <TextInput
                        style={[styles.input, styles.inputMultiline]}
                        value={editedRecipeNotes}
                        onChangeText={setEditedRecipeNotes}
                        placeholder="Notes about the recipe"
                        placeholderTextColor={colors.placeholder}
                        multiline
                      />
                    </View>

                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Ingredients</Text>
                      <Text style={styles.sectionHelp}>One ingredient per line. Examples: {"\n"}- 1 cup flour {"\n"}- 2 eggs {"\n"}- sugar (no qty)</Text>

                      <TextInput
                        style={[styles.input, styles.inputMultiline]}
                        value={editedRecipeIngredients.join('\n')}
                        onChangeText={text => setEditedRecipeIngredients(text.split('\n').map(s => s.trim()).filter(Boolean))}
                        placeholder={`e.g. 1 cup flour\n2 eggs`}
                        placeholderTextColor={colors.placeholder}
                        multiline
                      />
                    </View>

                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Steps</Text>
                      <Text style={styles.sectionHelp}>Write each step on a new line.</Text>

                      <TextInput
                        style={[styles.input, styles.inputMultiline]}
                        value={editedRecipeSteps}
                        onChangeText={setEditedRecipeSteps}
                        placeholder={`Step 1...\nStep 2...`}
                        placeholderTextColor={colors.placeholder}
                        multiline
                      />
                    </View>

                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Meta</Text>

                      <Text style={styles.inputLabel}>Servings</Text>
                      <TextInput
                        style={styles.input}
                        value={editedRecipeServings}
                        onChangeText={setEditedRecipeServings}
                        placeholder="Servings"
                        placeholderTextColor={colors.placeholder}
                        keyboardType="numeric"
                      />
                    </View>
                  </>
                ) : (
                  // View-only layout
                  <View style={{ gap: 12 }}>
                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Notes</Text>
                      <Text style={styles.sectionText}>{selectedRecipe?.notes ?? 'No notes available.'}</Text>
                    </View>

                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Ingredients</Text>
                      {(selectedRecipe?.ingredients ?? []).length > 0 ? (
                        (selectedRecipe.ingredients ?? []).map((ing: any, i: number) => (
                          <Text key={i} style={styles.sectionText}>• {ing.name} {ing.qty ?? ''} {ing.unit ?? ''}</Text>
                        ))
                      ) : (
                        <Text style={styles.sectionText}>No ingredients listed.</Text>
                      )}
                    </View>

                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>How it's made</Text>
                      {(selectedRecipe?.steps ?? []).length > 0 ? (
                        (selectedRecipe.steps ?? []).map((s: string, i: number) => (
                          <Text key={i} style={styles.sectionText}>{i + 1}. {s}</Text>
                        ))
                      ) : (
                        <Text style={styles.sectionText}>No steps provided.</Text>
                      )}
                      {selectedRecipe?.servings ? <Text style={styles.muted}>Servings: {selectedRecipe.servings}</Text> : null}
                      {selectedRecipe?.expiry instanceof Timestamp && (
                        <Text style={styles.muted}>Expiry: {format(selectedRecipe.expiry.toDate(), 'MMM dd, yyyy')}</Text>
                      )}
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Sticky action row (visible when editing) */}
              {isEditingRecipe && (
                <View style={styles.stickyRow}>
                  <TouchableOpacity onPress={() => { setIsEditingRecipe(false); /* revert to view only, keep values */ }} style={[styles.btnOutline]}>
                    <Text style={styles.btnOutlineText}>Cancel</Text>
                  </TouchableOpacity>

                  <View style={{ width: 8 }} />

                  <TouchableOpacity onPress={handleSaveRecipe} style={[styles.btnPrimary]}>
                    <Text style={styles.btnPrimaryText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* Styles */
function makeStyles(colors: any) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
    subtitle: { color: colors.textSecondary, marginTop: 4 },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e6f4fb', alignItems: 'center', justifyContent: 'center' },
    avatarEmoji: { fontSize: 20 },
    emptyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 14, borderRadius: 14, marginBottom: 12, shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
    emptyIconWrap: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    emptyIcon: { fontSize: 22 },

    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 12, borderRadius: 14, marginBottom: 12, shadowColor: colors.shadow, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
    cardImage: { width: 72, height: 72, borderRadius: 8, marginRight: 12, backgroundColor: '#f1f5f9' },
    iconWrap: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#fff3e9', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    icon: { fontSize: 22 },
    cardBody: { flex: 1 },
    cardTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    cardNote: { color: colors.textSecondary, marginTop: 6 },
    cardMetaRow: { flexDirection: 'row', marginTop: 8 },
    cardMeta: { color: colors.textSecondary, fontSize: 12 },
    tryBtn: { backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
    tryText: { color: colors.buttonText, fontWeight: '700' },
    openText: { color: colors.primary, fontWeight: '700' },

    // New style for the favorite button on cards
    favoriteButton: {
      padding: 8,
      marginRight: -4, // Adjust spacing as needed
    },

    footerNote: { marginTop: 8, alignItems: 'center' },
    footerText: { color: colors.textSecondary },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.45)', justifyContent: 'flex-end' },
    modalWrapper: { width: '100%', alignItems: 'center' },
    modalCard: { width: '96%', height: '80%', backgroundColor: colors.card, borderRadius: 18, padding: 12, marginBottom: 12, shadowColor: colors.shadow, shadowOpacity: 0.18, shadowRadius: 12, elevation: 6 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
    modalSmall: { color: colors.textSecondary, fontSize: 13 },

    modalActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 12 },
    iconBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.surface, marginLeft: 6 },
    iconBtnText: { marginLeft: 6, fontSize: 13, fontWeight: '600', color: colors.textSecondary },

    modalContent: { flex: 1, marginTop: 8 },
    modalImage: { width: '100%', height: 180, borderRadius: 10, marginBottom: 12, backgroundColor: '#f1f5f9' },
    modalImagePlaceholder: { width: '100%', height: 180, borderRadius: 10, marginBottom: 12, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
    modalImageEmoji: { fontSize: 40, color: '#9ca3af' },

    sectionCard: { backgroundColor: '#fbfeff', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#eef6fb' },
    sectionTitle: { fontWeight: '800', marginBottom: 8, color: '#0f1724' },
    sectionHelp: { color: '#64748b', fontSize: 12, marginBottom: 8 },
    sectionText: { color: '#374151', marginBottom: 6 },

    inputLabel: { fontSize: 13, color: '#4b5563', marginBottom: 6 },
    input: { backgroundColor: colors.surface, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 8, fontSize: 15, color: colors.textPrimary },
    inputMultiline: { minHeight: 88, textAlignVertical: 'top' },

    muted: { color: '#6b7280', marginTop: 8, fontStyle: 'italic' },

    stickyRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderColor: '#eef6fb', backgroundColor: colors.card, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
    btnOutline: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#d1e9f6', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
    btnOutlineText: { color: '#0f1724', fontWeight: '700' },
    btnPrimary: { flex: 1.6, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    btnPrimaryText: { color: colors.buttonText, fontWeight: '800' },
  });
}