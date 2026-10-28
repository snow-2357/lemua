import { Text, View } from 'react-native';
import type { Book } from '../types/book';
import { libraryStyles as styles } from '../styles/library.styles';
import { formatBookTileTitle } from '../utils/bookTitle';

type BookCoverProps = {
  book: Book;
  featured?: boolean;
  titleMaxLength?: number;
};

export default function BookCover({
  book,
  featured = false,
  titleMaxLength = 32,
}: BookCoverProps) {

  return (
    <View style={[styles.featureCover, { backgroundColor: book.color }]}>
      <View style={styles.spine} />
      <View style={styles.coverContent}>
        <View>
          <Text style={styles.coverMark}>{book.mark}</Text>
          <Text style={styles.coverTitle}>
            {formatBookTileTitle(book.title, titleMaxLength)}
          </Text>
        </View>
        {featured && <Text style={styles.coverAuthor}>{book.author}</Text>}
      </View>
      <View style={styles.glossOverlay} />
    </View>
  );
}