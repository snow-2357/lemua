import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { audioStyles as styles } from '../styles/audio.styles';
import { formatAudioTime } from '../utils/formatTime';

type AudioPreviewScreenProps = {
  title: string;
  author: string;
  chapterTitle: string;
  excerpt: string;
  coverColor: string;
  mark: string;
  isSpeaking: boolean;
  isPaused: boolean;
  isLoading?: boolean;
  currentTime?: number;
  duration?: number;
  isKokoroAvailable: boolean;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onTogglePlayback: () => void;
  onBack: () => void;
};

const waveform = [
  18, 28, 14, 34, 22, 42, 27, 16, 36, 24, 45, 19, 31, 15, 39, 26, 47, 21, 34,
  17, 29, 43, 23, 37, 19, 32, 14, 41, 25, 35, 18, 46, 27, 15, 33, 22, 40, 17,
  30, 44, 20, 36, 16, 28, 42, 24, 34, 19, 47, 26, 15, 38, 21, 32, 18, 43, 27,
];

export default function AudioPreviewScreen({
  title,
  author,
  chapterTitle,
  excerpt,
  coverColor,
  mark,
  isSpeaking,
  isPaused,
  isLoading = false,
  currentTime = 0,
  duration = 0,
  isKokoroAvailable,
  speed,
  onSpeedChange,
  onTogglePlayback,
  onBack,
}: AudioPreviewScreenProps) {
  const { colors, isDark } = useAppTheme();
  const speeds = [0.8, 1, 1.2, 1.5];
  const progress = duration > 0 ? Math.min(Math.max(currentTime / duration, 0), 1) : 0;
  const activeBarIndex = Math.floor(waveform.length * progress);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to reader"
          accessibilityRole="button"
          onPress={onBack}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.backText, { color: colors.accent }]}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Audio preview</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.eyebrow, { color: colors.mutedText }]}>
          A LISTENING COMPANION
        </Text>
        <View style={[styles.cover, { backgroundColor: coverColor }]}>
          <Text style={styles.coverMark}>{mark}</Text>
          <Text numberOfLines={3} style={styles.coverTitle}>{title}</Text>
          <Text numberOfLines={1} style={styles.coverAuthor}>{author}</Text>
        </View>

        <Text numberOfLines={1} style={[styles.chapterTitle, { color: colors.text }]}>
          {chapterTitle}
        </Text>
        <Text style={[styles.bookTitle, { color: colors.secondaryText }]} numberOfLines={1}>
          {title}
        </Text>

        <View
          style={styles.waveform}
          accessibilityLabel={
            isLoading
              ? 'Audio generating'
              : isSpeaking && !isPaused
                ? 'Speech playing'
                : 'Audio waveform'
          }
        >
          {waveform.map((height, index) => {
            const isBarPlayed =
              (isSpeaking || currentTime > 0) && !isPaused && index <= activeBarIndex;
            const barHeight = Math.min(Math.round(height * 1.35), 64);

            return (
              <View
                key={`${index}-${height}`}
                style={[
                  styles.waveBar,
                  {
                    height: barHeight,
                    backgroundColor: isBarPlayed ? colors.accent : colors.waveform,
                  },
                ]}
              />
            );
          })}
        </View>
        <View style={styles.timelineLabels}>
          <Text style={[styles.timelineText, { color: colors.mutedText }]}>
            {isLoading
              ? 'Generating audio…'
              : isPaused
                ? 'Paused'
                : isSpeaking
                  ? 'Speaking'
                  : 'Ready'}
          </Text>
          <Text style={[styles.timelineText, { color: colors.mutedText }]}>
            {duration > 0
              ? `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`
              : currentTime > 0
                ? formatAudioTime(currentTime)
                : '--:--'}
          </Text>
        </View>

        <View style={[styles.playbackNotice, { backgroundColor: colors.surface }]}>
          <Pressable
            accessibilityLabel={
              isLoading
                ? 'Generating audio'
                : isSpeaking && !isPaused
                  ? 'Pause reading aloud'
                  : isPaused
                    ? 'Resume reading aloud'
                    : 'Start continuous reading aloud'
            }
            accessibilityRole="button"
            onPress={onTogglePlayback}
            style={[styles.playIcon, { backgroundColor: colors.accent }]}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.accentText} />
            ) : (
              <Text style={[styles.playIconText, { color: colors.accentText }]}>
                {isSpeaking && !isPaused ? 'Ⅱ' : '▶'}
              </Text>
            )}
          </Pressable>
          <View style={styles.noticeCopy}>
            <Text style={[styles.noticeTitle, { color: colors.text }]}>
              {isLoading
                ? 'Generating audio…'
                : isSpeaking && !isPaused
                  ? 'Reading aloud'
                  : isPaused
                    ? 'Reading paused'
                    : 'Listen to this book'}
            </Text>
            <Text style={[styles.noticeDescription, { color: colors.secondaryText }]}>
              {isLoading
                ? 'Synthesizing voice on your device…'
                : isKokoroAvailable
                  ? 'Kokoro creates and saves each page audio on your device as you listen. Pages advance automatically.'
                  : 'Browser speech reads the page and advances automatically.'}
            </Text>
          </View>
        </View>

        <View style={[styles.settingsCard, { backgroundColor: colors.surface }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={[styles.settingLabel, { color: colors.mutedText }]}>VOICE</Text>
              <Text style={[styles.settingValue, { color: colors.text }]}>
                {isKokoroAvailable ? 'Kokoro · Warm (English)' : 'Browser voice'}
              </Text>
            </View>
            <Text style={[styles.settingArrow, { color: colors.mutedText }]}>›</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.speedHeader}>
            <Text style={[styles.settingLabel, { color: colors.mutedText }]}>
              READING SPEED
            </Text>
            <Text style={[styles.speedValue, { color: colors.text }]}>{speed.toFixed(1)}×</Text>
          </View>
          <View style={styles.speedOptions}>
            {speeds.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: speed === option }}
                onPress={() => onSpeedChange(option)}
                style={[
                  styles.speedOption,
                  { backgroundColor: speed === option ? colors.accent : colors.background },
                ]}
              >
                <Text
                  style={[
                    styles.speedOptionText,
                    { color: speed === option ? colors.accentText : colors.secondaryText },
                  ]}
                >
                  {option.toFixed(1)}×
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {excerpt ? (
          <View style={styles.excerptSection}>
            <Text style={[styles.settingLabel, { color: colors.mutedText }]}>
              FROM THIS PAGE
            </Text>
            <Text style={[styles.excerpt, { color: colors.secondaryText }]}>
              {excerpt}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
