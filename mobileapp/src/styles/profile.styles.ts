import { StyleSheet } from 'react-native';

export const profileStyles = StyleSheet.create({
  screen: {
    backgroundColor: '#f8f6f1',
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 58,
  },
  navigation: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 44,
    justifyContent: 'space-between',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#eeece6',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backText: {
    color: '#776b59',
    fontSize: 30,
    lineHeight: 34,
    marginTop: -2,
    textAlign: 'center',
  },
  navigationTitle: {
    color: '#2d2a24',
    fontSize: 17,
    fontWeight: '600',
  },
  navigationSpacer: {
    minWidth: 80,
  },
  profile: {
    alignItems: 'center',
    marginTop: 64,
  },
  avatar: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 42,
    height: 84,
    justifyContent: 'center',
    width: 84,
  },
  initial: {
    color: '#62594d',
    fontFamily: 'Georgia',
    fontSize: 34,
  },
  name: {
    color: '#2d2a24',
    fontSize: 22,
    fontWeight: '600',
    marginTop: 16,
  },
  form: {
    backgroundColor: '#fffefa',
    borderRadius: 14,
    marginTop: 44,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  fieldLabel: {
    color: '#8b867d',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  nameInput: {
    borderBottomColor: '#e9e5dd',
    borderBottomWidth: StyleSheet.hairlineWidth,
    color: '#2d2a24',
    fontSize: 16,
    height: 48,
    paddingHorizontal: 0,
  },
  appearanceRow: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    minHeight: 68,
    paddingHorizontal: 16,
  },
  appearanceCopy: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingRight: 12,
  },
  appearanceTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  appearanceDescription: {
    fontSize: 12,
    marginTop: 4,
  },
  appearanceSwitch: {
    alignSelf: 'center',
    margin: 0,
    transform: [{ scale: 0.9 }],
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#3e4a40',
    borderRadius: 13,
    height: 50,
    justifyContent: 'center',
    marginTop: 18,
  },
  saveButtonPressed: {
    opacity: 0.75,
  },
  saveButtonText: {
    color: '#fffefa',
    fontSize: 15,
    fontWeight: '600',
  },
});
