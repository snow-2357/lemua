import { Text, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { libraryStyles as styles } from '../styles/library.styles';

type ReadingProgressProps = {
  progress?: number;
  compact?: boolean;
};

export default function ReadingProgress({
  progress = 0,
  compact = false,
}: ReadingProgressProps) {
  const { colors } = useAppTheme();
  const percentage = Math.min(Math.max(progress, 0), 100);

  return (
    <View
      accessibilityLabel={`${percentage}% complete`}
      style={[styles.readingProgress, compact && styles.readingProgressCompact]}
    >
      <View style={styles.readingProgressHeader}>
        <Text
          style={[
            styles.readingProgressLabel,
            compact && styles.readingProgressLabelCompact,
            { color: colors.mutedText },
          ]}
        >
          {percentage}% complete
        </Text>
      </View>
      <View
        style={[
          styles.readingProgressTrack,
          compact && styles.readingProgressTrackCompact,
          { backgroundColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.readingProgressFill,
            compact && styles.readingProgressFillCompact,
            { backgroundColor: colors.accent, width: `${percentage}%` },
          ]}
        />
      </View>
    </View>
  );
}
