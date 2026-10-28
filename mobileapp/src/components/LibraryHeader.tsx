import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { getProfileAvatarColors } from '../services/bookColors';
import { libraryStyles as styles } from '../styles/library.styles';

type LibraryHeaderProps = {
  profileName: string;
  onOpenProfile: () => void;
};

export default function LibraryHeader({
  profileName,
  onOpenProfile,
}: LibraryHeaderProps) {
  const { colors } = useAppTheme();
  const initial = profileName.trim().charAt(0).toLocaleUpperCase() || 'J';
  const avatarColors = getProfileAvatarColors(profileName);

  return (
    <View style={styles.header}>
      <View>
        <Text style={[styles.heading, { color: colors.text }]}>Lemua</Text>
        <Text style={[styles.eyebrow, { color: colors.mutedText }]}>
          YOUR PERSONAL LIBRARY
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile"
        accessibilityHint="Opens your profile"
        android_ripple={{ color: '#d8d0c1', borderless: true }}
        hitSlop={8}
        onPress={onOpenProfile}
        style={({ pressed }) => [
          styles.profileAvatar,
          {
            backgroundColor: avatarColors.backgroundColor,
            borderColor: avatarColors.borderColor,
          },
          pressed && styles.profileAvatarPressed,
        ]}
      >
        <Text style={[styles.profileInitial, { color: avatarColors.textColor }]}>
          {initial}
        </Text>
      </Pressable>
    </View>
  );
}
