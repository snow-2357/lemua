import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { getProfileAvatarColors } from '../services/bookColors';
import { profileStyles as styles } from '../styles/profile.styles';

type ProfileScreenProps = {
  name: string;
  onSaveName: (name: string) => Promise<void>;
  onBack: () => void;
  onToggleTheme: () => Promise<void>;
};

export default function ProfileScreen({
  name,
  onSaveName,
  onBack,
  onToggleTheme,
}: ProfileScreenProps) {
  const { colors, isDark, isThemeLoaded } = useAppTheme();
  const [draftName, setDraftName] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const initial = draftName.trim().charAt(0).toLocaleUpperCase() || 'J';
  const avatarColors = getProfileAvatarColors(draftName);

  const saveName = async () => {
    setIsSaving(true);
    try {
      await onSaveName(draftName.trim());
    } catch (error) {
      Alert.alert(
        'Could not save name',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.navigation}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to library"
          onPress={onBack}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.backText, { color: colors.accent }]}>‹</Text>
        </Pressable>
        <Text style={[styles.navigationTitle, { color: colors.text }]}>
          Profile
        </Text>
        <View style={styles.navigationSpacer} />
      </View>
      <View style={styles.profile}>
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: avatarColors.backgroundColor,
              borderColor: avatarColors.borderColor,
            },
          ]}
        >
          <Text style={[styles.initial, { color: avatarColors.textColor }]}>
            {initial}
          </Text>
        </View>
        <Text style={[styles.name, { color: colors.text }]}>
          {draftName.trim() || 'Your name'}
        </Text>
      </View>
      <View style={[styles.form, { backgroundColor: colors.surface }]}>
        <Text style={[styles.fieldLabel, { color: colors.mutedText }]}>NAME</Text>
        <TextInput
          accessibilityLabel="Your name"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={40}
          onChangeText={setDraftName}
          onSubmitEditing={() => void saveName()}
          placeholder="Enter your name"
          placeholderTextColor={colors.mutedText}
          returnKeyType="done"
          style={[
            styles.nameInput,
            { color: colors.text, borderBottomColor: colors.border },
          ]}
          value={draftName}
        />
      </View>
      <View style={[styles.appearanceRow, { backgroundColor: colors.surface }]}>
        <View style={styles.appearanceCopy}>
          <Text style={[styles.appearanceTitle, { color: colors.text }]}>
            Dark appearance
          </Text>
          <Text style={[styles.appearanceDescription, { color: colors.mutedText }]}>
            Try Lemua with a darker palette.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Dark appearance"
          disabled={!isThemeLoaded}
          onValueChange={() => void onToggleTheme()}
          style={styles.appearanceSwitch}
          thumbColor="#fffefa"
          trackColor={{ false: colors.border, true: colors.accent }}
          value={isDark}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={isSaving}
        onPress={() => void saveName()}
        style={({ pressed }) => [
          styles.saveButton,
          { backgroundColor: colors.accent },
          (pressed || isSaving) && styles.saveButtonPressed,
        ]}
      >
        <Text style={[styles.saveButtonText, { color: colors.accentText }]}>
          {isSaving ? 'Saving…' : 'Save name'}
        </Text>
      </Pressable>
    </View>
  );
}
