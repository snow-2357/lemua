import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import type { Book } from '../types/book';
import { libraryStyles as styles } from '../styles/library.styles';
import BookCover from './BookCover';
import { formatBookTileTitle } from '../utils/bookTitle';
import ReadingProgress from './ReadingProgress';

type CurrentlyReadingCardProps = {
  book: Book;
  isOpening: boolean;
  onOpen: (book: Book) => void;
};

export default function CurrentlyReadingCard({
  book,
  isOpening,
  onOpen,
}: CurrentlyReadingCardProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.currentBookCard, { backgroundColor: colors.surface }]}>
      <BookCover book={book} featured titleMaxLength={36} />
      <View style={styles.currentBookDetails}>
        <Text style={[styles.currentBookEyebrow, { color: colors.mutedText }]}>
          CURRENTLY READING
        </Text>
        <Text numberOfLines={2} style={[styles.currentBookTitle, { color: colors.text }]}>
          {formatBookTileTitle(book.title, 42)}
        </Text>
        <Text numberOfLines={1} style={[styles.currentBookAuthor, { color: colors.secondaryText }]}>
          {book.author}
        </Text>
        <ReadingProgress progress={book.readingProgress} />
        <Pressable
          accessibilityRole="button"
          disabled={isOpening}
          onPress={() => onOpen(book)}
          style={[
            styles.currentBookButton,
            { backgroundColor: colors.accent },
            isOpening && styles.importCardDisabled,
          ]}
        >
          <Text style={[styles.currentBookButtonText, { color: colors.accentText }]}>
            {isOpening ? 'Opening…' : 'Open book'}
          </Text>
          <Text style={[styles.currentBookArrow, { color: colors.accentText }]}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}
