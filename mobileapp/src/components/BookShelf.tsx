import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import type { Book } from '../types/book';
import BookCover from './BookCover';
import { libraryStyles as styles } from '../styles/library.styles';
import { formatBookTileTitle } from '../utils/bookTitle';
import ReadingProgress from './ReadingProgress';

type BookShelfProps = {
  books: Book[];
  disabled: boolean;
  onOpen: (book: Book) => void;
  onRemove: (book: Book) => void;
};

export default function BookShelf({
  books,
  disabled,
  onOpen,
  onRemove,
}: BookShelfProps) {
  const { colors } = useAppTheme();
  return (
    <ScrollView
      contentContainerStyle={styles.bookRow}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {books.map((book) => {
        return (
          <View key={book.id} style={styles.bookItem}>
            <View style={styles.bookCoverWrapper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${book.title}`}
                disabled={disabled}
                onPress={() => onOpen(book)}
              >
                <BookCover book={book} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`More options for ${book.title}`}
                disabled={disabled}
                hitSlop={6}
                onPress={() => onRemove(book)}
                style={[
                  styles.bookOptionsButton,
                  { backgroundColor: colors.elevated },
                ]}
              >
                <Image
                  source={require('../../assets/three-dots-svgrepo-com.png')}
                  style={[styles.bookOptionsIcon, { tintColor: colors.text }]}
                />
              </Pressable>
            </View>
            <ReadingProgress compact progress={book.readingProgress} />
          </View>
        );
      })}
    </ScrollView>
  );
}
