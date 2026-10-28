import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import BookSearch from '../components/BookSearch';
import BookShelf from '../components/BookShelf';
import CurrentlyReadingCard from '../components/CurrentlyReadingCard';
import AchievementTrackerCard from '../components/AchievementTrackerCard';
import EmptyLibrary from '../components/EmptyLibrary';
import ImportBookCard from '../components/ImportBookCard';
import LibraryHeader from '../components/LibraryHeader';
import SectionHeading from '../components/SectionHeading';
import type { Book } from '../types/book';
import { libraryStyles as styles } from '../styles/library.styles';

type LibraryScreenProps = {
  books: Book[];
  isAddingBook: boolean;
  isOpeningBook: boolean;
  libraryStatus: 'loading' | 'ready' | 'error';
  profileName: string;
  onAddBook: () => void;
  onOpenBook: (book: Book) => void;
  onRemoveBook: (book: Book) => void;
  onOpenProfile: () => void;
};

export default function LibraryScreen({
  books,
  isAddingBook,
  isOpeningBook,
  libraryStatus,
  profileName,
  onAddBook,
  onOpenBook,
  onRemoveBook,
  onOpenProfile,
}: LibraryScreenProps) {
  const { colors, isDark } = useAppTheme();
  const [search, setSearch] = useState('');
  const [headerHeight, setHeaderHeight] = useState(141);
  const [hasScrolled, setHasScrolled] = useState(false);
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextHasScrolled = event.nativeEvent.contentOffset.y > 2;
    setHasScrolled((current) => (current === nextHasScrolled ? current : nextHasScrolled));
  };
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleBooks = books.filter(
    (book) =>
      book.title.toLocaleLowerCase().includes(normalizedSearch) ||
      book.author.toLocaleLowerCase().includes(normalizedSearch),
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight }]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <BookSearch value={search} onChange={setSearch} />
        {libraryStatus === 'loading' ? null : books.length === 0 ? (
          <EmptyLibrary />
        ) : (
          <>
            <SectionHeading title="Currently reading" />
            <CurrentlyReadingCard
              book={books[0]}
              isOpening={isOpeningBook}
              onOpen={onOpenBook}
            />
            <SectionHeading
              title="Your books"
              count={`${visibleBooks.length} ${visibleBooks.length === 1 ? 'book' : 'books'}`}
            />
            {visibleBooks.length > 0 ? (
              <BookShelf
                books={visibleBooks}
                disabled={isOpeningBook}
                onOpen={onOpenBook}
                onRemove={onRemoveBook}
              />
            ) : (
              <View style={styles.emptySearch}>
                <Text style={[styles.emptySearchText, { color: colors.mutedText }]}>
                  No books match “{search}”
                </Text>
              </View>
            )}
          </>
        )}
        <ImportBookCard
          isLoading={isAddingBook}
          libraryStatus={libraryStatus}
          onPress={onAddBook}
        />
        <AchievementTrackerCard />
      </ScrollView>
      <View
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={[
          styles.fixedHeader,
          { backgroundColor: colors.background },
          hasScrolled && styles.fixedHeaderShadow,
        ]}
      >
        <LibraryHeader
          profileName={profileName}
          onOpenProfile={onOpenProfile}
        />
      </View>
    </View>
  );
}
