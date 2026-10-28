import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { libraryStyles as styles } from '../styles/library.styles';
import { formatAudioTime } from '../utils/formatTime';

type AudioPreviewProps = {
  compact?: boolean;
  title?: string;
  onOpen?: () => void;
  isPlaying?: boolean;
  isPaused?: boolean;
  isLoading?: boolean;
  currentTime?: number;
  duration?: number;
  onTogglePlayback?: () => void;
};

const waveform = [
  12, 20, 14, 28, 17, 36, 22, 14, 26, 40, 24, 16, 32, 20, 38, 27, 15, 31, 21,
  36, 17, 26, 13, 33, 20, 39, 24, 15, 29, 18, 35, 23, 14, 27, 19, 32, 15, 25,
  12, 30, 18, 35, 22, 14, 28, 19, 37, 24, 16, 31, 20, 34, 14, 26, 18, 38, 22,
  13, 29, 17, 33, 21, 15, 27,
];

export default function AudioPreview({
  compact = false,
  title,
  onOpen,
  isPlaying = false,
  isPaused = false,
  isLoading = false,
  currentTime = 0,
  duration = 0,
  onTogglePlayback,
}: AudioPreviewProps) {
  const { colors } = useAppTheme();
  const progress = duration > 0 ? Math.min(Math.max(currentTime / duration, 0), 1) : 0;
  const activeBarIndex = Math.floor(waveform.length * progress);

  return (
    <View
      style={[
        styles.audioCard,
        compact && styles.audioCardCompact,
        { backgroundColor: colors.surface },
      ]}
    >
      <View style={styles.audioTopRow}>
        <Pressable
          accessibilityLabel="Open audio preview"
          accessibilityRole="button"
          onPress={onOpen}
          style={compact && styles.audioTopCopyCompact}
        >
          <Text
            style={[
              styles.audioEyebrow,
              compact && styles.audioEyebrowCompact,
              { color: colors.mutedText },
            ]}
          >
            Kokoro · WARM TONE
          </Text>
          {title ? (
            <Text
              numberOfLines={1}
              style={[
                styles.audioTitle,
                compact && styles.audioTitleCompact,
                { color: colors.text },
              ]}
            >
              {title}
            </Text>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityLabel={
            isLoading
              ? 'Loading audio'
              : isPlaying && !isPaused
                ? 'Pause continuous reading aloud'
                : 'Start continuous reading aloud'
          }
          accessibilityRole="button"
          onPress={compact ? onTogglePlayback : onOpen}
          style={[
            styles.playButton,
            compact && styles.playButtonCompact,
            { backgroundColor: colors.accent },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.accentText} />
          ) : (
            <Text
              style={[
                styles.playButtonText,
                compact && styles.playButtonTextCompact,
                { color: colors.accentText },
              ]}
            >
              {compact && isPlaying && !isPaused ? '||' : compact ? '|>' : '->'}
            </Text>
          )}
        </Pressable>
      </View>
      <Pressable
        accessibilityLabel="Open audio preview"
        accessibilityRole="button"
        onPress={onOpen}
        style={[styles.waveform, compact && styles.waveformCompact]}
      >
        {waveform.map((height, index) => {
          const isBarPlayed =
            (isPlaying || currentTime > 0) && !isPaused && index <= activeBarIndex;

          return (
            <View
              key={`${height}-${index}`}
              style={[
                styles.waveBar,
                { backgroundColor: colors.waveform },
                { height: compact ? Math.round(height * 0.4) : height },
                isBarPlayed && { backgroundColor: colors.accent },
              ]}
            />
          );
        })}
      </Pressable>
      <Pressable
        accessibilityLabel="Open audio preview"
        accessibilityRole="button"
        onPress={onOpen}
        style={[styles.audioMeta, compact && styles.audioMetaCompact]}
      >
        <Text
          style={[
            styles.audioMetaText,
            compact && styles.audioMetaTextCompact,
            { color: colors.mutedText },
          ]}
        >
          {formatAudioTime(currentTime)}
        </Text>
        <Text
          style={[
            styles.audioMetaText,
            compact && styles.audioMetaTextCompact,
            { color: colors.mutedText },
          ]}
        >
          {isLoading
            ? 'Generating audio…'
            : Platform.OS === 'web'
              ? 'Browser speech · web preview'
              : compact
                ? 'Kokoro · on-device voice'
                : 'Kokoro · on-device audio'}
        </Text>
        <Text
          style={[
            styles.audioMetaText,
            compact && styles.audioMetaTextCompact,
            { color: colors.mutedText },
          ]}
        >
          {formatAudioTime(duration)}
        </Text>
      </Pressable>
    </View>
  );
}
