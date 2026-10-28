import { StyleSheet } from 'react-native';

export const audioStyles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 12,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  backText: {
    fontSize: 29,
    lineHeight: 32,
    marginTop: -2,
  },
  headerTitle: {
    fontFamily: 'Georgia',
    fontSize: 16,
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
  },
  eyebrow: {
    alignSelf: 'stretch',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 16,
    marginTop: 7,
    textAlign: 'center',
  },
  cover: {
    borderRadius: 16,
    height: 220,
    justifyContent: 'flex-end',
    marginBottom: 22,
    overflow: 'hidden',
    padding: 18,
    width: 158,
  },
  coverMark: {
    color: 'rgba(255, 249, 237, 0.52)',
    fontFamily: 'Georgia',
    fontSize: 62,
    left: 18,
    position: 'absolute',
    top: 16,
  },
  coverTitle: {
    color: '#fffaf0',
    fontFamily: 'Georgia',
    fontSize: 19,
    lineHeight: 23,
  },
  coverAuthor: {
    color: 'rgba(255, 250, 240, 0.78)',
    fontSize: 9,
    marginTop: 8,
  },
  chapterTitle: {
    fontFamily: 'Georgia',
    fontSize: 22,
    textAlign: 'center',
  },
  bookTitle: {
    fontSize: 13,
    marginTop: 5,
    textAlign: 'center',
  },
  waveform: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    height: 72,
    justifyContent: 'center',
    marginTop: 25,
    overflow: 'hidden',
    width: '100%',
  },
  waveBar: {
    borderRadius: 3,
    maxHeight: 64,
    minHeight: 8,
    width: 3.5,
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    width: '100%',
  },
  timelineText: {
    fontSize: 11,
  },
  playbackNotice: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 14,
    marginTop: 24,
    padding: 16,
  },
  playIcon: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  playIconText: {
    fontSize: 15,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    fontFamily: 'Georgia',
    fontSize: 13,
  },
  noticeDescription: {
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  settingsCard: {
    alignSelf: 'stretch',
    borderRadius: 14,
    marginTop: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  settingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  settingCopy: {
    gap: 5,
  },
  settingLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  settingValue: {
    fontFamily: 'Georgia',
    fontSize: 14,
  },
  settingArrow: {
    fontSize: 22,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 13,
  },
  speedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  speedValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  speedOptions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  speedOption: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    paddingVertical: 8,
  },
  speedOptionText: {
    fontSize: 10,
    fontWeight: '600',
  },
  excerptSection: {
    alignSelf: 'stretch',
    marginTop: 20,
  },
  excerpt: {
    fontFamily: 'Georgia',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
});
