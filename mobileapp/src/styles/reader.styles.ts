import { StyleSheet } from 'react-native';

export const readerStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8f6f1',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 10,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginRight: 12,
    width: 36,
  },
  backText: {
    fontSize: 29,
    lineHeight: 32,
    marginTop: -2,
  },
  bookInfo: {
    flex: 1,
    minWidth: 0,
  },
  bookTitle: {
    fontFamily: 'Georgia',
    fontSize: 14,
  },
  bookAuthor: {
    fontSize: 12,
    marginTop: 2,
  },
  contentsButton: {
    borderRadius: 16,
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  contentsButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pageViewport: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  pageLoading: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
  },
  pageLoadingText: {
    fontSize: 12,
  },
  audioPreview: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 20,
  },
  page: {
    flex: 1,
    paddingHorizontal: 26,
    paddingTop: 12,
    paddingBottom: 10,
  },
  chapterHeading: {
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
    marginBottom: 8,
  },
  chapterTitle: {
    fontFamily: 'Georgia',
    fontSize: 24,
    lineHeight: 31,
  },
  chapterText: {
    fontFamily: 'Georgia',
    fontSize: 19,
    lineHeight: 28,
    paddingBottom: 24,
  },
  illustrationContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  illustration: {
    flex: 1,
    width: '100%',
  },
  imageCaption: {
    fontFamily: 'Georgia',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  progressTrack: {
    marginTop: 2,
    backgroundColor: 'rgba(137, 130, 119, 0.18)',
    borderRadius: 2,
    height: 2,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 2,
    height: '100%',
  },
  pageControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  pageButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 42,
  },
  pageButtonText: {
    fontFamily: 'Georgia',
    fontSize: 29,
    lineHeight: 32,
  },
  disabledPageButton: {
    opacity: 0.3,
  },
  pageCount: {
    flex: 1,
    fontSize: 11,
    textAlign: 'center',
  },
  contentsScreen: {
    flex: 1,
    paddingTop: 52,
  },
  contentsHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  contentsCloseButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  contentsCloseText: {
    fontSize: 29,
    lineHeight: 32,
    marginTop: -2,
  },
  contentsTitle: {
    fontFamily: 'Georgia',
    fontSize: 19,
  },
  contentsList: {
    paddingHorizontal: 22,
  },
  contentsRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 4,
  },
  contentsRowPressed: {
    opacity: 0.55,
  },
  contentsIndex: {
    fontSize: 10,
    marginRight: 15,
    width: 24,
  },
  contentsRowTitle: {
    flex: 1,
    fontFamily: 'Georgia',
    fontSize: 15,
    paddingVertical: 12,
  },
  contentsArrow: {
    fontSize: 24,
    marginLeft: 10,
  },
});
