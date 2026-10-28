import { StatusBar } from 'expo-status-bar';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  View,
  Platform,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import AudioPreview from '../components/AudioPreview';
import AudioPreviewScreen from './AudioPreviewScreen';
import type {
  EpubDocument,
  ReaderChapter,
  ReaderImage,
  TableOfContentsEntry,
} from '../types/book';
import { paginateChapterText } from '../utils/paginateChapterText';
import { readerStyles as styles } from '../styles/reader.styles';
import {
  releaseKokoroResources,
  synthesizeChapterPageAudio,
} from '../services/kokoroTts';

type ReaderScreenProps = {
  bookId: string;
  title: string;
  author: string;
  coverColor: string;
  mark: string;
  epub: EpubDocument;
  tableOfContents: TableOfContentsEntry[];
  isPreview: boolean;
  initialReadingChapterIndex?: number;
  initialReadingTextOffset?: number;
  onClose: () => void;
  onReadingProgress: (
    chapterIndex: number,
    textOffset: number,
    readingProgress: number,
  ) => void;
};

type PageSize = {
  width: number;
  height: number;
};

type BookPage = {
  chapterIndex: number;
  chapterTitle: string;
  text: string;
  image?: ReaderImage;
  isChapterStart: boolean;
  textStartOffset: number;
  textEndOffset: number;
};

const AUDIO_PREFETCH_PAGE_COUNT = 5;

export default function ReaderScreen({
  bookId,
  title,
  author,
  coverColor,
  mark,
  epub,
  tableOfContents,
  isPreview,
  initialReadingChapterIndex,
  initialReadingTextOffset,
  onClose,
  onReadingProgress,
}: ReaderScreenProps) {
  const { colors, isDark } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [pageSize, setPageSize] = useState<PageSize>({ width: windowWidth, height: 0 });
  const [pageIndex, setPageIndex] = useState(0);
  const [isReaderPositionReady, setIsReaderPositionReady] = useState(false);
  const [isContentsVisible, setIsContentsVisible] = useState(false);
  const [isAudioPreviewOpen, setIsAudioPreviewOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [speechRate, setSpeechRate] = useState(1);
  const isSpeechPausedRef = useRef(false);
  const continuousPlaybackRef = useRef(false);
  const autoPlayPageRef = useRef<number | null>(null);
  const autoPositionNextRef = useRef(false);
  const activeAudioPageRef = useRef<number | null>(null);
  const audioPrefetchRequestRef = useRef(0);
  const speechTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechElapsedRef = useRef(0);
  const [loadedChapters, setLoadedChapters] = useState<Record<number, ReaderChapter>>({});
  const [pendingPosition, setPendingPosition] = useState<{
    chapterIndex: number;
    textOffset: number;
  } | null>(null);
  const pageListRef = useRef<FlatList<BookPage>>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const playbackRequestRef = useRef(0);
  const hasAppliedInitialPosition = useRef(false);
  const loadedChaptersRef = useRef<Record<number, ReaderChapter>>({});
  const chapterLoads = useRef(new Map<number, Promise<ReaderChapter>>());
  const loadChapter = useCallback((chapterIndex: number) => {
    const loadedChapter = loadedChaptersRef.current[chapterIndex];
    if (loadedChapter) return Promise.resolve(loadedChapter);

    const existingLoad = chapterLoads.current.get(chapterIndex);
    if (existingLoad) return existingLoad;

    const load = epub.loadChapter(chapterIndex)
      .then((chapter) => {
        loadedChaptersRef.current[chapterIndex] = chapter;
        setLoadedChapters((current) => ({ ...current, [chapterIndex]: chapter }));
        return chapter;
      })
      .finally(() => chapterLoads.current.delete(chapterIndex));
    chapterLoads.current.set(chapterIndex, load);
    return load;
  }, [epub]);
  const availableChapters = useMemo(
    () =>
      Object.entries(loadedChapters)
        .map(([index, chapter]) => ({ chapterIndex: Number(index), chapter }))
        .sort((first, second) => first.chapterIndex - second.chapterIndex),
    [loadedChapters],
  );

  useEffect(() => {
    let isMounted = true;
    const initialChapter = Math.min(
      Math.max(initialReadingChapterIndex ?? 0, 0),
      epub.chapterCount - 1,
    );
    void loadChapter(initialChapter).catch((error: unknown) => {
      if (isMounted) {
        Alert.alert(
          'Could not open chapter',
          error instanceof Error ? error.message : 'The chapter could not be loaded.',
        );
      }
    });
    return () => {
      isMounted = false;
    };
  }, [epub.chapterCount, initialReadingChapterIndex, loadChapter]);

  const pages = useMemo(() => {
    if (pageSize.width <= 0 || pageSize.height <= 0) return [];

    const allPages: BookPage[] = [];
    for (const { chapterIndex, chapter } of availableChapters) {
      let textOffset = 0;
      let isChapterStart = true;
      const addTextPages = (text: string, segmentStart: number) => {
        if (!text.trim()) return;
        const textPages = paginateChapterText(
          text,
          isChapterStart ? chapter.title : '',
          pageSize.width,
          pageSize.height,
        );
        const totalPageTextLength = textPages.reduce(
          (total, pageText) => total + pageText.length,
          0,
        );
        let renderedTextOffset = 0;
        for (const pageText of textPages) {
          const pageTextStartOffset = Math.round(
            (renderedTextOffset / totalPageTextLength) * text.length,
          );
          renderedTextOffset += pageText.length;
          const pageTextEndOffset = Math.round(
            (renderedTextOffset / totalPageTextLength) * text.length,
          );
          allPages.push({
            chapterIndex,
            chapterTitle: chapter.title,
            text: pageText,
            isChapterStart,
            textStartOffset: segmentStart + pageTextStartOffset,
            textEndOffset: segmentStart + pageTextEndOffset,
          });
          isChapterStart = false;
        }
      };

      for (const image of chapter.images ?? []) {
        const imageOffset = Math.min(
          Math.max(image.textOffset, textOffset),
          chapter.text.length,
        );
        addTextPages(
          chapter.text.slice(textOffset, imageOffset),
          textOffset,
        );
        allPages.push({
          chapterIndex,
          chapterTitle: chapter.title,
          text: '',
          image,
          isChapterStart,
          textStartOffset: imageOffset,
          textEndOffset: imageOffset,
        });
        isChapterStart = false;
        textOffset = imageOffset;
      }

      addTextPages(chapter.text.slice(textOffset), textOffset);
      if (allPages.length === 0 || allPages[allPages.length - 1].chapterIndex !== chapterIndex) {
        allPages.push({
          chapterIndex,
          chapterTitle: chapter.title,
          text: '',
          isChapterStart: true,
          textStartOffset: 0,
          textEndOffset: 0,
        });
      }
    }
    return allPages;
  }, [availableChapters, pageSize.height, pageSize.width]);
  const chapterStartPages = useMemo(
    () =>
      Array.from({ length: epub.chapterCount }, (_, chapterIndex) =>
        pages.findIndex((page) => page.chapterIndex === chapterIndex),
      ),
    [epub.chapterCount, pages],
  );
  const safePageIndex = Math.min(pageIndex, Math.max(pages.length - 1, 0));
  const currentPage = pages[safePageIndex];
  const currentChapterPages = pages.filter(
    (page) => page.chapterIndex === currentPage?.chapterIndex,
  );
  const currentChapterPageIndex = currentChapterPages.findIndex(
    (page) => page === currentPage,
  );
  const findPageIndex = useCallback((chapterIndex: number, textOffset: number) => {
    const chapterStart = Math.max(chapterStartPages[chapterIndex] ?? 0, 0);
    if (textOffset === Number.MAX_SAFE_INTEGER) {
      let chapterEnd = -1;
      pages.forEach((page, pageIndex) => {
        if (page.chapterIndex === chapterIndex) chapterEnd = pageIndex;
      });
      return chapterEnd >= 0 ? chapterEnd : chapterStart;
    }
    let pageAtOffset = -1;
    pages.forEach((page, pageIndex) => {
      if (
        page.chapterIndex === chapterIndex &&
        page.textStartOffset === textOffset
      ) {
        pageAtOffset = pageIndex;
      }
    });
    if (pageAtOffset >= 0) return pageAtOffset;

    const matchingPage = pages.findIndex(
      (page) =>
        page.chapterIndex === chapterIndex &&
        textOffset >= page.textStartOffset &&
        textOffset <= page.textEndOffset,
    );
    return matchingPage >= 0 ? matchingPage : chapterStart;
  }, [chapterStartPages, pages]);
  const reportReadingProgress = useCallback((nextPageIndex: number) => {
    const page = pages[nextPageIndex];
    if (!page) return;

    const chapterPages = pages.filter(
      (candidate) => candidate.chapterIndex === page.chapterIndex,
    );
    const chapterPageIndex = chapterPages.findIndex(
      (candidate) => candidate === page,
    );
    const readingProgress =
      page.chapterIndex === epub.chapterCount - 1 &&
        chapterPageIndex === chapterPages.length - 1
        ? 100
        : Math.round(
          ((page.chapterIndex +
            (chapterPageIndex + 1) / Math.max(chapterPages.length, 1)) /
            epub.chapterCount) *
          100,
        );

    onReadingProgress(
      page.chapterIndex,
      page.textStartOffset,
      readingProgress,
    );
  }, [epub.chapterCount, onReadingProgress, pages]);
  const updateSpeechPaused = useCallback((paused: boolean) => {
    isSpeechPausedRef.current = paused;
    setIsSpeechPaused(paused);
  }, []);
  const stopSpeechPlayback = useCallback((resetState = true) => {
    playbackRequestRef.current += 1;
    audioPrefetchRequestRef.current += 1;
    continuousPlaybackRef.current = false;
    autoPlayPageRef.current = null;
    autoPositionNextRef.current = false;
    activeAudioPageRef.current = null;
    setIsAudioLoading(false);
    if (speechTimerRef.current) {
      clearInterval(speechTimerRef.current);
      speechTimerRef.current = null;
    }
    speechElapsedRef.current = 0;
    if (Platform.OS === 'web') {
      void Speech.stop().catch((error: unknown) => {
        console.warn('Could not stop browser speech playback.', error);
      });
    }
    audioPlayerRef.current?.remove();
    audioPlayerRef.current = null;

    if (resetState) {
      setIsSpeaking(false);
      updateSpeechPaused(false);
      setAudioCurrentTime(0);
      setAudioDuration(0);
    }
  }, [updateSpeechPaused]);
  useEffect(
    () => () => {
      stopSpeechPlayback(false);
      if (speechTimerRef.current) {
        clearInterval(speechTimerRef.current);
        speechTimerRef.current = null;
      }
      void releaseKokoroResources().catch((error: unknown) => {
        console.warn('Could not release Kokoro speech resources.', error);
      });
    },
    [stopSpeechPlayback],
  );

  const continueAfterPage = useCallback(async (
    finishedPageIndex: number,
    request: number,
  ) => {
    if (!continuousPlaybackRef.current || request !== playbackRequestRef.current) return;

    const current = pages[finishedPageIndex];
    if (!current) return;

    let nextPageIndex = -1;
    for (let index = finishedPageIndex + 1; index < pages.length; index += 1) {
      if (pages[index].text.trim()) {
        nextPageIndex = index;
        break;
      }
    }

    if (nextPageIndex >= 0) {
      autoPlayPageRef.current = nextPageIndex;
      setPageIndex(nextPageIndex);
      pageListRef.current?.scrollToOffset({
        offset: nextPageIndex * pageSize.width,
        animated: true,
      });
      reportReadingProgress(nextPageIndex);
      return;
    }

    for (
      let chapterIndex = current.chapterIndex + 1;
      chapterIndex < epub.chapterCount;
      chapterIndex += 1
    ) {
      try {
        await loadChapter(chapterIndex);
      } catch (error) {
        if (request !== playbackRequestRef.current) return;
        stopSpeechPlayback();
        Alert.alert(
          'Could not load next chapter',
          error instanceof Error ? error.message : 'The next chapter could not be loaded.',
        );
        return;
      }
      if (!continuousPlaybackRef.current || request !== playbackRequestRef.current) return;

      autoPositionNextRef.current = true;
      setPendingPosition({ chapterIndex, textOffset: 0 });
      return;
    }

    continuousPlaybackRef.current = false;
    setIsSpeaking(false);
    updateSpeechPaused(false);
  }, [
    epub.chapterCount,
    loadChapter,
    pageSize.width,
    pages,
    reportReadingProgress,
    stopSpeechPlayback,
    updateSpeechPaused,
  ]);

  const finishPagePlayback = useCallback((
    request: number,
    finishedPageIndex: number,
    error?: string,
  ) => {
    if (request !== playbackRequestRef.current) return;
    activeAudioPageRef.current = null;
    setIsAudioLoading(false);
    setAudioCurrentTime(0);
    if (error) {
      stopSpeechPlayback();
      Alert.alert('Audio playback failed', error);
      return;
    }
    void continueAfterPage(finishedPageIndex, request);
  }, [continueAfterPage, stopSpeechPlayback]);

  const prefetchAudioAhead = useCallback(async (activePageIndex: number) => {
    if (Platform.OS === 'web') return;

    const prefetchRequest = ++audioPrefetchRequestRef.current;
    let preparedPages = 0;
    for (
      let index = activePageIndex + 1;
      index < pages.length && preparedPages < AUDIO_PREFETCH_PAGE_COUNT;
      index += 1
    ) {
      const page = pages[index];
      if (!page.text.trim()) continue;
      if (
        prefetchRequest !== audioPrefetchRequestRef.current
      ) {
        return;
      }

      try {
        await synthesizeChapterPageAudio(
          bookId,
          page.chapterIndex,
          page.text,
          speechRate,
        );
      } catch (error) {
        if (prefetchRequest !== audioPrefetchRequestRef.current) return;
        console.warn('Could not pre-generate upcoming Kokoro audio.', error);
        Alert.alert(
          'Could not prepare upcoming audio',
          error instanceof Error ? error.message : 'Upcoming page audio could not be generated.',
        );
        return;
      }
      preparedPages += 1;
    }

    if (
      preparedPages < AUDIO_PREFETCH_PAGE_COUNT &&
      prefetchRequest === audioPrefetchRequestRef.current
    ) {
      const lastPage = pages[pages.length - 1];
      const nextChapter = (lastPage?.chapterIndex ?? -1) + 1;
      if (nextChapter < epub.chapterCount && !loadedChaptersRef.current[nextChapter]) {
        try {
          await loadChapter(nextChapter);
        } catch (error) {
          if (prefetchRequest !== audioPrefetchRequestRef.current) return;
          console.warn('Could not load a chapter for upcoming audio.', error);
          Alert.alert(
            'Could not prepare upcoming audio',
            error instanceof Error ? error.message : 'The next chapter could not be loaded.',
          );
        }
      }
    }
  }, [bookId, epub.chapterCount, loadChapter, pages, speechRate]);

  const playPage = useCallback(async (
    page: BookPage,
    pageIndexForAudio: number,
    request: number,
  ) => {
    try {
      if (request !== playbackRequestRef.current) return;
      setIsAudioLoading(true);
      setAudioCurrentTime(0);

      if (Platform.OS === 'web') {
        const words = page.text.trim().split(/\s+/).filter(Boolean).length;
        const estimatedSeconds = Math.max(Math.round((words / (150 * speechRate)) * 60), 2);
        setAudioDuration(estimatedSeconds);
        speechElapsedRef.current = 0;
        setIsAudioLoading(false);

        if (speechTimerRef.current) clearInterval(speechTimerRef.current);
        speechTimerRef.current = setInterval(() => {
          if (!isSpeechPausedRef.current) {
            speechElapsedRef.current += 0.25;
            setAudioCurrentTime(Math.min(speechElapsedRef.current, estimatedSeconds));
          }
        }, 250);

        Speech.speak(page.text, {
          rate: speechRate,
          onDone: () => {
            if (speechTimerRef.current) {
              clearInterval(speechTimerRef.current);
              speechTimerRef.current = null;
            }
            setAudioCurrentTime(estimatedSeconds);
            finishPagePlayback(request, pageIndexForAudio);
          },
          onStopped: () => {
            if (speechTimerRef.current) {
              clearInterval(speechTimerRef.current);
              speechTimerRef.current = null;
            }
            if (request !== playbackRequestRef.current) return;
            continuousPlaybackRef.current = false;
            setIsSpeaking(false);
            setIsAudioLoading(false);
            updateSpeechPaused(false);
          },
          onError: (error) => {
            if (speechTimerRef.current) {
              clearInterval(speechTimerRef.current);
              speechTimerRef.current = null;
            }
            if (request !== playbackRequestRef.current) return;
            continuousPlaybackRef.current = false;
            setIsSpeaking(false);
            setIsAudioLoading(false);
            updateSpeechPaused(false);
            Alert.alert('Speech playback failed', error.message);
          },
        });
        return;
      }

      await setAudioModeAsync({ playsInSilentMode: true });
      if (request !== playbackRequestRef.current) return;
      const audioUri = await synthesizeChapterPageAudio(
        bookId,
        page.chapterIndex,
        page.text,
        speechRate,
      );
      if (request !== playbackRequestRef.current) return;

      const player = createAudioPlayer({ uri: audioUri });
      audioPlayerRef.current = player;
      activeAudioPageRef.current = pageIndexForAudio;
      player.addListener('playbackStatusUpdate', (status) => {
        if (request !== playbackRequestRef.current) return;
        if (typeof status.currentTime === 'number') {
          setAudioCurrentTime(status.currentTime);
        }
        if (typeof status.duration === 'number' && status.duration > 0) {
          setAudioDuration(status.duration);
        }
        if (status.playing) {
          setIsAudioLoading(false);
        }

        if (!status.didJustFinish && !status.error) return;

        if (audioPlayerRef.current === player) audioPlayerRef.current = null;
        player.remove();
        finishPagePlayback(
          request,
          pageIndexForAudio,
          status.error ?? undefined,
        );
      });
      if (!isSpeechPausedRef.current) {
        player.play();
        setIsAudioLoading(false);
        if (continuousPlaybackRef.current) {
          void prefetchAudioAhead(pageIndexForAudio);
        }
      } else {
        setIsAudioLoading(false);
      }
    } catch (error) {
      if (request !== playbackRequestRef.current) return;
      setIsAudioLoading(false);
      stopSpeechPlayback();
      Alert.alert(
        Platform.OS === 'web'
          ? 'Speech playback failed'
          : 'Kokoro audio generation failed',
        error instanceof Error ? error.message : 'The page could not be synthesized.',
      );
    }
  }, [
    bookId,
    finishPagePlayback,
    prefetchAudioAhead,
    speechRate,
    stopSpeechPlayback,
    updateSpeechPaused,
  ]);

  useEffect(() => {
    const activePageIndex = activeAudioPageRef.current;
    if (
      Platform.OS === 'web' ||
      !isReaderPositionReady
    ) {
      return;
    }
    void prefetchAudioAhead(activePageIndex ?? safePageIndex);
  }, [isReaderPositionReady, pages, prefetchAudioAhead, safePageIndex]);

  const toggleSpeechPlayback = async () => {
    try {
      if (isAudioLoading) {
        stopSpeechPlayback();
        return;
      }

      if (isSpeaking && !isSpeechPaused) {
        if (Platform.OS === 'web') await Speech.pause();
        else audioPlayerRef.current?.pause();
        updateSpeechPaused(true);
        return;
      }

      if (isSpeechPaused) {
        if (Platform.OS === 'web') await Speech.resume();
        else audioPlayerRef.current?.play();
        updateSpeechPaused(false);
        return;
      }

      if (!currentPage?.text.trim()) {
        Alert.alert('No text to read', 'There is no readable text on this page.');
        return;
      }

      const request = ++playbackRequestRef.current;
      continuousPlaybackRef.current = true;
      autoPlayPageRef.current = null;
      autoPositionNextRef.current = false;
      setIsSpeaking(true);
      setIsAudioLoading(true);
      updateSpeechPaused(false);
      await playPage(currentPage, safePageIndex, request);
    } catch (error) {
      setIsAudioLoading(false);
      stopSpeechPlayback();
      Alert.alert(
        'Speech playback failed',
        error instanceof Error ? error.message : 'Speech playback could not be started.',
      );
    }
  };

  useEffect(() => {
    const targetPage = autoPlayPageRef.current;
    if (targetPage === null || targetPage !== safePageIndex) return;
    autoPlayPageRef.current = null;
    if (!continuousPlaybackRef.current) return;
    if (currentPage?.text.trim()) {
      void playPage(currentPage, safePageIndex, playbackRequestRef.current);
    } else {
      void continueAfterPage(targetPage, playbackRequestRef.current);
    }
  }, [continueAfterPage, currentPage, playPage, safePageIndex]);
  const contents = tableOfContents.length > 0
    ? tableOfContents
    : Array.from({ length: epub.chapterCount }, (_, chapterIndex) => ({
      title: loadedChapters[chapterIndex]?.title ?? `Chapter ${chapterIndex + 1}`,
      chapterIndex,
    }));
  const handlePagerLayout = (event: {
    nativeEvent: { layout: { width: number; height: number } };
  }) => {
    const { width: nextWidth, height } = event.nativeEvent.layout;
    setPageSize((current) =>
      current.width === nextWidth && current.height === height
        ? current
        : { width: nextWidth, height },
    );
  };

  const goToPage = (nextPageIndex: number, animated = true) => {
    const boundedIndex = Math.min(Math.max(nextPageIndex, 0), pages.length - 1);
    if (boundedIndex !== safePageIndex) stopSpeechPlayback();
    setPageIndex(boundedIndex);
    pageListRef.current?.scrollToOffset({
      offset: boundedIndex * pageSize.width,
      animated,
    });
    reportReadingProgress(boundedIndex);
  };

  const goToPreviousPage = async () => {
    if (currentChapterPageIndex > 0) {
      goToPage(safePageIndex - 1);
      return;
    }

    const previousChapter = (currentPage?.chapterIndex ?? 0) - 1;
    if (previousChapter < 0) return;

    try {
      stopSpeechPlayback();
      await loadChapter(previousChapter);
      setPendingPosition({
        chapterIndex: previousChapter,
        textOffset: Number.MAX_SAFE_INTEGER,
      });
    } catch (error) {
      Alert.alert(
        'Could not load previous chapter',
        error instanceof Error ? error.message : 'The previous chapter could not be loaded.',
      );
    }
  };

  const handlePageScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextPageIndex = Math.min(
      Math.max(
        Math.round(event.nativeEvent.contentOffset.x / Math.max(pageSize.width, 1)),
        0,
      ),
      pages.length - 1,
    );
    if (nextPageIndex !== safePageIndex) stopSpeechPlayback();
    setPageIndex(nextPageIndex);
    reportReadingProgress(nextPageIndex);
  };

  useEffect(() => {
    if (pageSize.height <= 0 || pages.length === 0) return;

    if (!hasAppliedInitialPosition.current) {
      const initialChapter = Math.min(
        Math.max(initialReadingChapterIndex ?? 0, 0),
        epub.chapterCount - 1,
      );
      if (!loadedChapters[initialChapter]) return;
      const initialPageIndex = findPageIndex(
        initialChapter,
        initialReadingTextOffset ?? 0,
      );
      if (chapterStartPages[initialChapter] < 0) return;
      hasAppliedInitialPosition.current = true;
      requestAnimationFrame(() => {
        setPageIndex(initialPageIndex);
        pageListRef.current?.scrollToOffset({
          offset: initialPageIndex * pageSize.width,
          animated: false,
        });
        reportReadingProgress(initialPageIndex);
        setIsReaderPositionReady(true);
      });
      return;
    }

    if (pendingPosition) {
      const chapter = loadedChapters[pendingPosition.chapterIndex];
      if (!chapter || chapterStartPages[pendingPosition.chapterIndex] < 0) return;
      const page = findPageIndex(
        pendingPosition.chapterIndex,
        pendingPosition.textOffset,
      );
      requestAnimationFrame(() => {
        if (autoPositionNextRef.current && continuousPlaybackRef.current) {
          autoPositionNextRef.current = false;
          autoPlayPageRef.current = page;
        }
        setPageIndex(page);
        pageListRef.current?.scrollToOffset({
          offset: page * pageSize.width,
          animated: false,
        });
        reportReadingProgress(page);
        setPendingPosition(null);
      });
      return;
    }

    const current = pages[safePageIndex];
    if (!current) return;
    const remainingChapterPages = pages.filter(
      (page) => page.chapterIndex === current.chapterIndex,
    );
    const currentChapterPage = remainingChapterPages.findIndex(
      (page) => page === current,
    );
    const nextChapter = current.chapterIndex + 1;
    if (
      nextChapter < epub.chapterCount &&
      currentChapterPage >= remainingChapterPages.length - 2 &&
      !loadedChapters[nextChapter]
    ) {
      void loadChapter(nextChapter).catch((error: unknown) => {
        Alert.alert(
          'Could not load next chapter',
          error instanceof Error ? error.message : 'The next chapter could not be loaded.',
        );
      });
    }
  }, [
    chapterStartPages,
    epub.chapterCount,
    findPageIndex,
    initialReadingChapterIndex,
    initialReadingTextOffset,
    loadChapter,
    loadedChapters,
    pageSize.height,
    pageSize.width,
    pages,
    pendingPosition,
    reportReadingProgress,
    safePageIndex,
  ]);

  const jumpToContentsEntry = async (entry: TableOfContentsEntry) => {
    setIsContentsVisible(false);
    stopSpeechPlayback();
    const chapter = loadedChapters[entry.chapterIndex] ??
      await loadChapter(entry.chapterIndex).catch((error: unknown) => {
        Alert.alert(
          'Could not load chapter',
          error instanceof Error ? error.message : 'The chapter could not be loaded.',
        );
        return undefined;
      });
    if (!chapter) return;

    const textOffset = entry.textOffset ??
      (entry.fragment ? chapter.anchors?.[entry.fragment] : undefined) ??
      0;
    setPendingPosition({ chapterIndex: entry.chapterIndex, textOffset });
  };

  if (isAudioPreviewOpen) {
    return (
      <AudioPreviewScreen
        author={author}
        chapterTitle={currentPage?.chapterTitle ?? 'Audio preview'}
        coverColor={coverColor}
        excerpt={currentPage?.text.replace(/\s+/g, ' ').slice(0, 240) ?? ''}
        isSpeaking={isSpeaking}
        isPaused={isSpeechPaused}
        isLoading={isAudioLoading}
        currentTime={audioCurrentTime}
        duration={audioDuration}
        isKokoroAvailable={Platform.OS !== 'web'}
        mark={mark}
        onBack={() => setIsAudioPreviewOpen(false)}
        onTogglePlayback={() => void toggleSpeechPlayback()}
        onSpeedChange={setSpeechRate}
        speed={speechRate}
        title={title}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to library"
          onPress={onClose}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.backText, { color: colors.accent }]}>‹</Text>
        </Pressable>
        <View style={styles.bookInfo}>
          <Text numberOfLines={1} style={[styles.bookTitle, { color: colors.text }]}>
            {title}
          </Text>
          <Text numberOfLines={1} style={[styles.bookAuthor, { color: colors.mutedText }]}>
            {isPreview ? 'Sample preview' : author}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Table of contents"
          onPress={() => setIsContentsVisible(true)}
          style={[styles.contentsButton, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.contentsButtonText, { color: colors.accent }]}>
            Contents
          </Text>
        </Pressable>
      </View>

      <View onLayout={handlePagerLayout} style={styles.pageViewport}>
        {pageSize.height > 0 && pages.length > 0 ? (
          <FlatList
            ref={pageListRef}
            data={pages}
            getItemLayout={(_, index) => ({
              length: pageSize.width,
              offset: pageSize.width * index,
              index,
            })}
            horizontal
            initialNumToRender={3}
            keyExtractor={(_, index) => `page-${index}`}
            onMomentumScrollEnd={handlePageScrollEnd}
            pagingEnabled
            renderItem={({ index, item }) => (
              <View
                style={[
                  styles.page,
                  { width: pageSize.width, height: pageSize.height },
                ]}
              >
                {item.image ? (
                  <View style={styles.illustrationContainer}>
                    {item.image.uri ? (
                      <Image
                        accessibilityLabel={item.image.alt || 'Book illustration'}
                        resizeMode="contain"
                        source={{ uri: item.image.uri }}
                        style={styles.illustration}
                      />
                    ) : (
                      <Text style={[styles.imageCaption, { color: colors.mutedText }]}>
                        {item.image.alt || 'Image unavailable'}
                      </Text>
                    )}
                    {item.image.uri && item.image.alt ? (
                      <Text style={[styles.imageCaption, { color: colors.mutedText }]}>
                        {item.image.alt}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={[styles.chapterText, { color: colors.secondaryText }]}>
                    {item.text}
                  </Text>
                )}
              </View>
            )}
            showsHorizontalScrollIndicator={false}
            style={styles.pager}
          />
        ) : (
          <View style={styles.pageLoading}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.pageLoadingText, { color: colors.mutedText }]}>
              Loading chapter…
            </Text>
          </View>
        )}
      </View>

      <View style={styles.audioPreview}>
        <AudioPreview
          compact
          currentTime={audioCurrentTime}
          duration={audioDuration}
          isLoading={isAudioLoading}
          isPaused={isSpeechPaused}
          isPlaying={isSpeaking}
          onOpen={() => setIsAudioPreviewOpen(true)}
          onTogglePlayback={() => void toggleSpeechPlayback()}
        />
      </View>

      <View style={styles.footer}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.accent,
                width: `${(
                  ((currentPage?.chapterIndex ?? 0) +
                    (currentChapterPageIndex + 1) /
                    Math.max(currentChapterPages.length, 1)) /
                  epub.chapterCount
                ) * 100}%`,
              },
            ]}
          />
        </View>
        <View style={styles.pageControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous page"
            disabled={
              !currentPage ||
              (currentPage.chapterIndex === 0 && currentChapterPageIndex === 0)
            }
            onPress={() => void goToPreviousPage()}
            style={styles.pageButton}
          >
            <Text
              style={[
                styles.pageButtonText,
                { color: colors.accent },
                (!currentPage ||
                  (currentPage.chapterIndex === 0 &&
                    currentChapterPageIndex === 0)) &&
                styles.disabledPageButton,
              ]}
            >
              ‹
            </Text>
          </Pressable>

          <Text style={[styles.pageCount, { color: colors.mutedText }]}>
            {currentPage?.chapterTitle ?? ''} · Page {currentChapterPageIndex + 1} of {currentChapterPages.length}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next page"
            disabled={safePageIndex >= pages.length - 1}
            onPress={() => goToPage(safePageIndex + 1)}
            style={styles.pageButton}
          >
            <Text
              style={[
                styles.pageButtonText,
                { color: colors.accent },
                safePageIndex >= pages.length - 1 && styles.disabledPageButton,
              ]}
            >
              ›
            </Text>
          </Pressable>
        </View>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsContentsVisible(false)}
        visible={isContentsVisible}
      >
        <View style={[styles.contentsScreen, { backgroundColor: colors.background }]}>
          <View style={[styles.contentsHeader, { borderBottomColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close table of contents"
              onPress={() => setIsContentsVisible(false)}
              style={[styles.contentsCloseButton, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.contentsCloseText, { color: colors.accent }]}>‹</Text>
            </Pressable>
            <Text style={[styles.contentsTitle, { color: colors.text }]}>
              Table of Contents
            </Text>
            <View style={styles.contentsCloseButton} />
          </View>
          <FlatList
            data={contents}
            keyExtractor={(item, index) => `${item.chapterIndex}-${index}`}
            renderItem={({ item, index }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => void jumpToContentsEntry(item)}
                style={({ pressed }) => [
                  styles.contentsRow,
                  { borderBottomColor: colors.border },
                  pressed && styles.contentsRowPressed,
                ]}
              >
                <Text style={[styles.contentsIndex, { color: colors.mutedText }]}>
                  {String(index + 1).padStart(2, '0')}
                </Text>
                <Text style={[styles.contentsRowTitle, { color: colors.text }]}>
                  {item.title}
                </Text>
                <Text style={[styles.contentsArrow, { color: colors.mutedText }]}>›</Text>
              </Pressable>
            )}
            style={styles.contentsList}
          />
        </View>
      </Modal>
    </View>
  );
}
