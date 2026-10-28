import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { strFromU8, unzipSync } from 'fflate';
import type {
  EpubDocument,
  ReaderImage,
  TableOfContentsEntry,
} from '../types/book';

type EpubImport = {
  title?: string;
  author?: string;
  uri: string;
};

function getAttribute(tag: string, attribute: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2];
}

function normalizeArchivePath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join('/');
}

function resolveArchiveHref(basePath: string, href: string): string {
  const path = decodeURIComponent(href.split(/[?#]/, 1)[0]);
  const directory = basePath.includes('/')
    ? basePath.slice(0, basePath.lastIndexOf('/') + 1)
    : '';
  return normalizeArchivePath(`${directory}${path}`);
}

function getHrefFragment(href: string): string | undefined {
  const fragment = href.split('#', 2)[1]?.split('?', 1)[0];
  return fragment ? decodeURIComponent(fragment) : undefined;
}

function decodeHtml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([\da-f]+);/gi, (_, value: string) =>
      String.fromCodePoint(parseInt(value, 16)),
    )
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

function extractText(xhtml: string): {
  title: string;
  text: string;
  anchors: Map<string, number>;
  images: (Omit<ReaderImage, 'uri'> & { src: string })[];
} {
  const heading = xhtml.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1];
  const title = heading
    ? decodeHtml(heading.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
    : '';
  const body = xhtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? xhtml;
  const toPlainText = (html: string) =>
    decodeHtml(
      html
        .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(
          /<\/?(?:p|div|section|article|h[1-6]|li|blockquote|br|hr)\b[^>]*>/gi,
          '\n',
        )
        .replace(/<[^>]*>/g, ' '),
    )
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  const text = toPlainText(body);
  const anchors = new Map<string, number>();
  const images: (Omit<ReaderImage, 'uri'> & { src: string })[] = [];

  for (const match of body.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)) {
    const id = getAttribute(match[0], 'id') ?? getAttribute(match[0], 'name');
    if (id) anchors.set(id, toPlainText(body.slice(0, match.index ?? 0)).length);
    if (match[1].toLowerCase() === 'img' || match[1].toLowerCase() === 'image') {
      const src =
        getAttribute(match[0], 'src') ??
        getAttribute(match[0], 'href') ??
        getAttribute(match[0], 'xlink:href');
      if (src && !/^(?:data:|https?:|\/\/)/i.test(src)) {
        images.push({
          src: decodeHtml(src),
          textOffset: toPlainText(body.slice(0, match.index ?? 0)).length,
          alt: decodeHtml(getAttribute(match[0], 'alt') ?? '').trim(),
        });
      }
    }
  }

  return { title, text, anchors, images };
}

function getNavigationEntries(
  navigationDocument: string,
  navigationPath: string,
  chapterTargets: Map<string, { chapterIndex: number; anchors: Map<string, number> }>,
): TableOfContentsEntry[] {
  const navTags = [...navigationDocument.matchAll(/<nav\b[^>]*>/gi)];
  const tocTag = navTags.find((match) =>
    /\b(?:epub:)?type\s*=\s*(["'])[^"']*\btoc\b/i.test(match[0]) ||
    /\brole\s*=\s*(["'])doc-toc\1/i.test(match[0]),
  );

  if (!tocTag || tocTag.index === undefined) return [];
  const contentStart = tocTag.index + tocTag[0].length;
  const contentEnd = navigationDocument.indexOf('</nav', contentStart);
  if (contentEnd < 0) return [];

  const entries: TableOfContentsEntry[] = [];
  for (const match of navigationDocument
    .slice(contentStart, contentEnd)
    .matchAll(/<a\b[^>]*>/gi)) {
    const href = getAttribute(match[0], 'href');
    if (!href) continue;

    const titleStart = contentStart + (match.index ?? 0) + match[0].length;
    const closingTag = navigationDocument.indexOf('</a', titleStart);
    if (closingTag < 0 || closingTag > contentEnd) continue;
    const title = decodeHtml(
      navigationDocument.slice(titleStart, closingTag).replace(/<[^>]*>/g, ' '),
    )
      .replace(/\s+/g, ' ')
      .trim();
    const chapter = chapterTargets.get(resolveArchiveHref(navigationPath, href));
    if (title && chapter) {
      const fragment = getHrefFragment(href);
      entries.push({
        title,
        chapterIndex: chapter.chapterIndex,
        textOffset: fragment ? chapter.anchors.get(fragment) : undefined,
        fragment,
      });
    }
  }

  return entries;
}

function getNcxEntries(
  ncxDocument: string,
  ncxPath: string,
  chapterTargets: Map<string, { chapterIndex: number; anchors: Map<string, number> }>,
): TableOfContentsEntry[] {
  const entries: TableOfContentsEntry[] = [];
  const tags = /<\/?navPoint\b[^>]*>/gi;
  let depth = 0;
  let start = -1;

  for (const match of ncxDocument.matchAll(tags)) {
    const isClosing = /^<\/\s*navPoint/i.test(match[0]);
    if (!isClosing) {
      if (depth === 0) start = match.index ?? -1;
      depth += 1;
      continue;
    }

    depth -= 1;
    if (depth !== 0 || start < 0) continue;

    const block = ncxDocument.slice(start, (match.index ?? 0) + match[0].length);
    const label = block.match(/<navLabel\b[^>]*>[\s\S]*?<text\b[^>]*>([\s\S]*?)<\/text>/i)?.[1];
    const href = block.match(/<content\b[^>]*>/i)?.[0];
    const source = href ? getAttribute(href, 'src') : undefined;
    const title = label
      ? decodeHtml(label.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
      : '';
    const chapter = source
      ? chapterTargets.get(resolveArchiveHref(ncxPath, source))
      : undefined;
    if (title && chapter) {
      const fragment = source ? getHrefFragment(source) : undefined;
      entries.push({
        title,
        chapterIndex: chapter.chapterIndex,
        textOffset: fragment ? chapter.anchors.get(fragment) : undefined,
        fragment,
      });
    }
    start = -1;
  }

  return entries;
}

async function readEpubArchive(uri: string): Promise<EpubDocument> {
  const archiveBytes = await new File(uri).bytes();
  const readEntry = (path: string): Uint8Array => {
    const archive = unzipSync(archiveBytes, {
      filter: (file) => file.name === path,
    });
    const entry = archive[path];
    if (!entry) throw new Error(`The EPUB is missing ${path}.`);
    return entry;
  };

  const container = strFromU8(readEntry('META-INF/container.xml'));
  const packagePath = container.match(/<rootfile\b[^>]*\bfull-path\s*=\s*(["'])(.*?)\1/i)?.[2];
  if (!packagePath) {
    throw new Error('Could not find the EPUB package document.');
  }

  const packageDocument = strFromU8(readEntry(packagePath));
  const packageDirectory = packagePath.includes('/')
    ? packagePath.slice(0, packagePath.lastIndexOf('/') + 1)
    : '';
  const manifest = new Map<string, string>();
  const imageManifest = new Map<string, string>();
  let navigationPath: string | undefined;
  let ncxPath: string | undefined;
  for (const match of packageDocument.matchAll(/<item\b[^>]*>/gi)) {
    const id = getAttribute(match[0], 'id');
    const href = getAttribute(match[0], 'href');
    const mediaType = getAttribute(match[0], 'media-type');
    if (id && href && mediaType && /^image\//i.test(mediaType)) {
      imageManifest.set(
        normalizeArchivePath(
          `${packageDirectory}${decodeURIComponent(href.split(/[?#]/, 1)[0])}`,
        ),
        mediaType,
      );
    } else if (id && href && (!mediaType || /html|xhtml/i.test(mediaType))) {
      const path = normalizeArchivePath(
        `${packageDirectory}${decodeURIComponent(href.split(/[?#]/, 1)[0])}`,
      );
      manifest.set(id, path);
      if (/\bnav\b/i.test(getAttribute(match[0], 'properties') ?? '')) {
        navigationPath = path;
      }
    } else if (id && href && /application\/x-dtbncx\+xml/i.test(mediaType ?? '')) {
      ncxPath = normalizeArchivePath(
        `${packageDirectory}${decodeURIComponent(href.split(/[?#]/, 1)[0])}`,
      );
    }
  }

  const spine = packageDocument.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i)?.[1];
  if (!spine) throw new Error('Could not find the EPUB reading order.');

  const chapterPaths: string[] = [];
  for (const match of spine.matchAll(/<itemref\b[^>]*>/gi)) {
    const id = getAttribute(match[0], 'idref');
    const path = id ? manifest.get(id) : undefined;
    if (
      path &&
      path !== navigationPath &&
      !/^(?:table[-_ ]of[-_ ]contents|contents|toc)(?:[._-]|\b)/i.test(
        path.split('/').pop() ?? '',
      )
    ) {
      chapterPaths.push(path);
    }
  }
  if (chapterPaths.length === 0) {
    throw new Error('No readable chapters were found in this EPUB.');
  }

  const chapterTargets = new Map<
    string,
    { chapterIndex: number; anchors: Map<string, number> }
  >(
    chapterPaths.map((path, chapterIndex) => [
      path,
      { chapterIndex, anchors: new Map<string, number>() },
    ]),
  );
  const decodeOptionalEntry = (path: string | undefined) =>
    path ? strFromU8(readEntry(path)) : '';
  const navigationDocument = decodeOptionalEntry(navigationPath);
  const navigationEntries = navigationPath
    ? getNavigationEntries(navigationDocument, navigationPath, chapterTargets)
    : [];
  const toc = navigationEntries.length > 0
    ? navigationEntries
    : ncxPath
      ? getNcxEntries(decodeOptionalEntry(ncxPath), ncxPath, chapterTargets)
      : [];
  const metadata = packageDocument.match(/<metadata\b[^>]*>([\s\S]*?)<\/metadata>/i)?.[1] ?? '';
  const title = metadata.match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1];
  const author = metadata.match(/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i)?.[1];
  const bookKey =
    decodeURIComponent(uri.split(/[?#]/, 1)[0])
      .split(/[\\/]/)
      .pop()
      ?.replace(/[^a-z\d_-]/gi, '_') || 'book';
  const assetDirectory = new Directory(Paths.cache, 'lemua-reader-assets', bookKey);
  assetDirectory.create({ idempotent: true, intermediates: true });

  return {
    title: title ? decodeHtml(title.replace(/<[^>]*>/g, '')).trim() : undefined,
    author: author ? decodeHtml(author.replace(/<[^>]*>/g, '')).trim() : undefined,
    chapterCount: chapterPaths.length,
    tableOfContents:
      toc.length > 0
        ? toc
        : chapterPaths.map((_, chapterIndex) => ({
            title: `Chapter ${chapterIndex + 1}`,
            chapterIndex,
          })),
    loadChapter: async (chapterIndex) => {
      const chapterPath = chapterPaths[chapterIndex];
      if (!chapterPath) throw new Error(`Chapter ${chapterIndex + 1} does not exist.`);

      const xhtml = strFromU8(readEntry(chapterPath));
      const extracted = extractText(xhtml);
      const imagePaths = extracted.images
        .map((image) => resolveArchiveHref(chapterPath, image.src))
        .filter((path) => imageManifest.has(path));
      const imageArchive = imagePaths.length > 0
        ? unzipSync(archiveBytes, {
            filter: (file) => imagePaths.includes(file.name),
          })
        : {};
      const images: ReaderImage[] = extracted.images.map((image, imageIndex) => {
        const imagePath = resolveArchiveHref(chapterPath, image.src);
        const imageBytes = imageArchive[imagePath];
        const mediaType = imageManifest.get(imagePath);
        if (!imageBytes || !mediaType || /svg\+xml/i.test(mediaType)) {
          return { ...image };
        }

        const extension =
          imagePath.match(/\.([a-z\d]+)$/i)?.[1]?.toLowerCase() ??
          mediaType.split('/')[1]?.replace(/[^a-z\d]/gi, '') ??
          'img';
        const assetFile = new File(
          assetDirectory,
          `chapter-${chapterIndex}-image-${imageIndex}.${extension}`,
        );
        assetFile.create({ overwrite: true });
        assetFile.write(imageBytes);
        return { ...image, uri: assetFile.uri };
      });

      return {
        title: extracted.title || `Chapter ${chapterIndex + 1}`,
        text: extracted.text,
        images,
        anchors: Object.fromEntries(extracted.anchors),
      };
    },
  };
}

export async function readEpub(uri: string): Promise<EpubDocument> {
  return readEpubArchive(uri);
}

export async function importEpub(uri: string): Promise<EpubImport> {
  const directory = new Directory(Paths.document, 'books');
  directory.create({ idempotent: true, intermediates: true });

  const source = new File(uri);
  let destination: File;
  let attempt = 0;
  do {
    destination = new File(directory, `book-${Date.now()}-${attempt++}.epub`);
  } while (destination.exists);

  await source.copy(destination);
  try {
    const epub = await readEpub(destination.uri);
    await epub.loadChapter(0);
    return { title: epub.title, author: epub.author, uri: destination.uri };
  } catch (error) {
    destination.delete();
    throw error;
  }
}

export async function getEpubFingerprint(uri: string): Promise<string> {
  const fileInfo = await LegacyFileSystem.getInfoAsync(uri, { md5: true });
  if (!fileInfo.exists || !fileInfo.md5) {
    throw new Error('Could not verify whether this EPUB is already in the library.');
  }

  return fileInfo.md5;
}
