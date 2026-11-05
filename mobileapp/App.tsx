import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { ThemeProvider, useAppTheme } from './src/context/ThemeContext';
import LibraryScreen from './src/screens/LibraryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import { useLibraryController } from './src/hooks/useLibraryController';
import { loadProfileName, saveProfileName } from './src/services/profileStorage';
import { initializeKokoro } from './src/services/kokoroTts';

function AppContent() {
  const { toggleTheme } = useAppTheme();
  const [activePage, setActivePage] = useState<'library' | 'profile'>('library');
  const [profileName, setProfileName] = useState('');
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);
  const {
    books,
    isAddingBook,
    isOpeningBook,
    libraryStatus,
    reader,
    addBook,
    closeBook,
    confirmRemoveBook,
    openBook,
    setReaderProgress,
  } = useLibraryController();

  useEffect(() => {
    let isMounted = true;

    void loadProfileName()
      .then((name) => {
        if (isMounted) setProfileName(name);
      })
      .catch((error: unknown) => {
        Alert.alert(
          'Could not load profile',
          error instanceof Error ? error.message : 'The saved name could not be restored.',
        );
      })
      .finally(() => {
        if (isMounted) setIsProfileLoaded(true);
      });

    // Initialize Kokoro TTS in the background when app starts
    initializeKokoro().catch((error: unknown) => {
      console.warn(
        'Kokoro TTS initialization failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateProfileName = async (name: string) => {
    await saveProfileName(name);
    setProfileName(name);
  };

  if (reader) {
    return (
      <ReaderScreen
        author={reader.book.author}
        bookId={reader.book.id}
        coverColor={reader.book.color}
        epub={reader.epub}
        isPreview={reader.isPreview}
        initialReadingChapterIndex={reader.book.readingChapterIndex}
        initialReadingTextOffset={reader.book.readingTextOffset}
        mark={reader.book.mark}
        onReadingProgress={setReaderProgress}
        onClose={closeBook}
        tableOfContents={reader.tableOfContents}
        title={reader.book.title}
      />
    );
  }

  if (activePage === 'profile') {
    return (
      <ProfileScreen
        name={profileName}
        onBack={() => setActivePage('library')}
        onSaveName={updateProfileName}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return (
    <LibraryScreen
      books={books}
      isAddingBook={isAddingBook}
      isOpeningBook={isOpeningBook}
      libraryStatus={libraryStatus}
      onAddBook={addBook}
      onOpenBook={openBook}
      onRemoveBook={confirmRemoveBook}
      profileName={profileName}
      onOpenProfile={() => {
        if (isProfileLoaded) setActivePage('profile');
      }}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
