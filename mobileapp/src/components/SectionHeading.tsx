import { Text, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { libraryStyles as styles } from '../styles/library.styles';

type SectionHeadingProps = {
  title: string;
  count?: string;
};

export default function SectionHeading({ title, count }: SectionHeadingProps) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {count ? (
        <Text
          style={[
            styles.countText,
            { backgroundColor: colors.surface, color: colors.secondaryText },
          ]}
        >
          {count}
        </Text>
      ) : null}
    </View>
  );
}
