import { Pressable, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { libraryStyles as styles } from '../styles/library.styles';

type BookSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function BookSearch({ value, onChange }: BookSearchProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
      <Text accessibilityElementsHidden style={[styles.searchIcon, { color: colors.mutedText }]}>
        ⌕
      </Text>
      <TextInput
        accessibilityLabel="Search your library"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChange}
        placeholder="Search your library"
        placeholderTextColor={colors.mutedText}
        returnKeyType="search"
        style={[styles.searchInput, { color: colors.text }]}
        value={value}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityLabel="Clear search"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onChange('')}
          style={styles.clearSearch}
        >
          <Text style={[styles.clearSearchText, { color: colors.secondaryText }]}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
