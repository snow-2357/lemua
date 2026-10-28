import * as FileSystem from 'expo-file-system/legacy';

const themeFileName = 'theme.json';

function getThemeFileUri(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('The app document directory is not available on this device.');
  }

  return `${FileSystem.documentDirectory}${themeFileName}`;
}

export async function loadDarkTheme(): Promise<boolean> {
  const uri = getThemeFileUri();
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) return false;

  let savedTheme: unknown;
  try {
    savedTheme = JSON.parse(await FileSystem.readAsStringAsync(uri));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Invalid JSON.';
    throw new Error(`The saved theme could not be read: ${detail}`);
  }

  if (
    typeof savedTheme !== 'object' ||
    savedTheme === null ||
    !('isDark' in savedTheme) ||
    typeof savedTheme.isDark !== 'boolean'
  ) {
    throw new Error('The saved theme has an unsupported or invalid format.');
  }

  return savedTheme.isDark;
}

export async function saveDarkTheme(isDark: boolean): Promise<void> {
  await FileSystem.writeAsStringAsync(
    getThemeFileUri(),
    JSON.stringify({ isDark }),
  );
}
