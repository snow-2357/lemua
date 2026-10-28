import { Text, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { libraryStyles as styles } from '../styles/library.styles';

export default function EmptyLibrary() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.emptyLibrary, { backgroundColor: colors.surface }]}>
      <View style={[styles.emptyLibraryIcon, { backgroundColor: colors.iconSurface }]}>
        <Text style={[styles.emptyLibraryGlyph, { color: colors.accent }]}>▤</Text>
      </View>
      <Text style={[styles.emptyLibraryTitle, { color: colors.text }]}>
        Your next story starts here
      </Text>
      <Text style={[styles.emptyLibraryDescription, { color: colors.secondaryText }]}>
        Add an EPUB to your library. Open a book to read and listen to its
        chapters.
      </Text>
    </View>
  );
}
