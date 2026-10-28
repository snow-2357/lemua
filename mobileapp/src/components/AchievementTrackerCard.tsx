import { Text, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { libraryStyles as styles } from '../styles/library.styles';

export default function AchievementTrackerCard() {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.achievementCard, { backgroundColor: colors.surface }]}>
      <View style={[styles.achievementIcon, { backgroundColor: colors.iconSurface }]}>
        <Text style={[styles.achievementIconText, { color: colors.accent }]}>✦</Text>
      </View>
      <View style={styles.achievementCopy}>
        <View style={styles.achievementTopRow}>
          <Text style={[styles.achievementEyebrow, { color: colors.mutedText }]}>
            READING MILESTONES
          </Text>
        </View>
        <Text style={[styles.achievementDescription, { color: colors.secondaryText }]}>
          Track milestones, streaks, and books completed.
        </Text>
        <Text style={[styles.achievementTitle, { color: colors.text }]}>
          Your reading journey
        </Text>
      </View>
    </View>
  );
}
