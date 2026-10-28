import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { libraryStyles as styles } from '../styles/library.styles';

type ImportBookCardProps = {
  isLoading: boolean;
  libraryStatus: 'loading' | 'ready' | 'error';
  onPress: () => void;
};

export default function ImportBookCard({
  isLoading,
  libraryStatus,
  onPress,
}: ImportBookCardProps) {
  const { colors } = useAppTheme();
  const isDisabled = isLoading || libraryStatus !== 'ready';
  const title =
    libraryStatus === 'error'
      ? 'Library unavailable'
      : libraryStatus === 'loading'
        ? 'Loading library…'
        : isLoading
          ? 'Opening Files…'
          : 'Add an EPUB from Files';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add an EPUB from Files"
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.importCard,
        { backgroundColor: colors.surface },
        isDisabled && styles.importCardDisabled,
      ]}
    >
      <View style={[styles.importIcon, { backgroundColor: colors.iconSurface }]}>
        <Text style={[styles.importIconText, { color: colors.accent }]}>
          {isDisabled ? '…' : '+'}
        </Text>
      </View>
      <View style={styles.importCopy}>
        <Text style={[styles.importTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.importDescription, { color: colors.secondaryText }]}>
          {libraryStatus === 'error'
            ? 'Saved books could not be restored. Restart the app to try again.'
            : 'Choose an EPUB from your device to add it to your library.'}
        </Text>
      </View>
      <Text style={[styles.importArrow, { color: colors.mutedText }]}>›</Text>
    </Pressable>
  );
}
